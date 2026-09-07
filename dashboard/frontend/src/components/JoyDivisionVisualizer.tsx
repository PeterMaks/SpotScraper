import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppContext } from '../AppContext';

/**
 * Props for the JoyDivisionVisualizer component.
 */
export interface JoyDivisionVisualizerProps {
  /** Title of the current track */
  trackTitle?: string;
  /** Name of the performing artist */
  artistName?: string;
  /** Direct audio stream URL or path to media file */
  audioSrc?: string;
  /** Optional album artwork URL */
  albumArtUrl?: string;
  /** Optional callback invoked when the track finishes playing */
  onTrackEnd?: () => void;
  /** Optional CSS class overrides for the container */
  className?: string;
  /** Whether to attempt autoplay upon mounting (subject to browser policy) */
  autoPlay?: boolean;
  /** FFT Size for Web Audio AnalyserNode (default: 512) */
  fftSize?: number;
  /** AnalyserNode smoothing time constant (default: 0.65 for fast hardware response) */
  smoothingTimeConstant?: number;
  /** Number of stacked ridgeline slices (authentic CP 1919 benchmark: 72 lines) */
  linesCount?: number;
  /** Number of horizontal sample points along each ridgeline (default: 220) */
  pointsPerLine?: number;
}

/**
 * Format raw seconds into a clean mm:ss string.
 */
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Modified Tukey (tapered cosine) envelope:
 * W(u) = 0 for u < uMin or u > uMax
 * Cosine taper on boundaries of width wTaper
 * Flat 1.0 in the center active plateau
 */
function tukeyWindow(u: number, uMin = 0.22, uMax = 0.78, wTaper = 0.06): number {
  if (u < uMin || u > uMax) return 0;
  if (u < uMin + wTaper) {
    return 0.5 * (1 - Math.cos((Math.PI * (u - uMin)) / wTaper));
  }
  if (u > uMax - wTaper) {
    return 0.5 * (1 - Math.cos((Math.PI * (uMax - u)) / wTaper));
  }
  return 1.0;
}

/**
 * Apply 5-point spatial Gaussian smoothing filter [0.08, 0.24, 0.36, 0.24, 0.08]
 * to eliminate single-bin spikes and jagged pixel noise while preserving clean,
 * continuous mountain crests and valleys.
 */
function applySpatialSmoothing(data: Float32Array): Float32Array {
  const n = data.length;
  const smoothed = new Float32Array(n);
  const k0 = 0.36, k1 = 0.24, k2 = 0.08;

  for (let i = 0; i < n; i++) {
    const im2 = Math.max(0, i - 2);
    const im1 = Math.max(0, i - 1);
    const ip1 = Math.min(n - 1, i + 1);
    const ip2 = Math.min(n - 1, i + 2);

    smoothed[i] =
      k2 * data[im2] +
      k1 * data[im1] +
      k0 * data[i] +
      k1 * data[ip1] +
      k2 * data[ip2];
  }
  return smoothed;
}

/**
 * Generate a single ridgeline slice:
 * - When audio is active: maps smoothed FFT bins across active window [0.22, 0.78]
 *   with perceptual frequency distribution and multi-crested CP 1919 morphology.
 * - Outside [0.22, 0.78]: strictly 0.0 displacement (laser-flat horizontal baselines).
 * - Zero procedural sine waves or random static for pure, authentic topographical contours.
 */
function generateRidgelineSlice(
  numPoints: number,
  phase: number,
  smoothedBins: Float32Array | null,
  binCount: number,
  sampleRate: number,
  isAudioActive: boolean
): Float32Array {
  const slice = new Float32Array(numPoints);
  const uMin = 0.22;
  const uMax = 0.78;
  const wTaper = 0.06;
  const binHz = (sampleRate / 2) / binCount;

  for (let j = 0; j < numPoints; j++) {
    const u = j / (numPoints - 1);
    const W = tukeyWindow(u, uMin, uMax, wTaper);

    // Flank zones outside [0.22, 0.78] are strictly flat 0.0
    if (W <= 0.0001) {
      slice[j] = 0.0;
      continue;
    }

    const r = (u - uMin) / (uMax - uMin); // [0, 1] relative active position

    if (isAudioActive && smoothedBins) {
      // 1. Perceptual Frequency Mapping (50 Hz to 12 kHz)
      // Uses power curve r^2.0 so sub-bass, bass, mids, and treble each occupy equal visual width
      const targetFreq = 50 + (12000 - 50) * Math.pow(r, 2.0);
      const binIndex = Math.min(binCount - 1, Math.max(1, Math.floor(targetFreq / binHz)));
      const rawBin = smoothedBins[binIndex];

      // Dynamic contrast expansion: subtract ambient room/mastering noise floor
      const dynamicVal = Math.max(0, (rawBin - 0.10) / 0.90);

      // 2. Authentic CP 1919 Pulsar Crest Morphology:
      // Left mountain body (sub-bass / kick: r ~ 0.28)
      const c1 = Math.exp(-Math.pow((r - 0.28) / 0.12, 2));
      // Center pyramid towers (mids / rhythm guitar / vocals: r ~ 0.50)
      const c2 = Math.exp(-Math.pow((r - 0.50) / 0.10, 2));
      // Right needle spires (high-mids / cymbals: r ~ 0.73)
      const c3 = Math.exp(-Math.pow((r - 0.73) / 0.08, 2));

      // Modulate audio energy with authentic multi-crested morphology to prevent flat block plateaus
      const structuralEnvelope = c1 * 1.15 + c2 * 1.05 + c3 * 1.30;

      // 3. High-Frequency Pre-Emphasis
      const preEmphasis = 0.80 + 1.90 * Math.pow(r, 1.15);
      const audioDisplacement = dynamicVal * preEmphasis * structuralEnvelope;

      // 4. Power Sharpening: acute summits without jagged pixel noise
      const sharpened = Math.pow(Math.min(1.0, audioDisplacement), 1.55);

      slice[j] = sharpened * W;
    } else {
      // Authentic serene CP 1919 contour state when paused or idle
      const p1 = Math.exp(-Math.pow((r - 0.28) / 0.12, 2)) * 0.44 * (0.85 + 0.15 * Math.sin(phase * 0.80));
      const p2 = Math.exp(-Math.pow((r - 0.50) / 0.10, 2)) * 0.48 * (0.85 + 0.15 * Math.cos(phase * 1.00));
      const p3 = Math.exp(-Math.pow((r - 0.73) / 0.08, 2)) * 0.58 * (0.85 + 0.15 * Math.sin(phase * 1.20));

      slice[j] = (p1 + p2 + p3) * W;
    }
  }

  // 5-point spatial Gaussian smoothing to ensure smooth continuous ridgelines
  return applySpatialSmoothing(slice);
}

/**
 * JoyDivisionVisualizer
 *
 * Authentic 3D Topographical CP 1919 / Unknown Pleasures Audio Visualizer:
 * - 72 lines with controlled peak amplitude (maxPeakHeight = deltaY * 8.5) eliminating comb artifacts.
 * - Oblique 3D perspective projection with trapezoidal width and vertical baseline compression.
 * - Persistent temporal attack/decay envelope follower for smooth, rolling mountain ridges.
 * - Laser-flat quiet horizontal flanks outside [0.22, 0.78] with zero procedural noise contamination.
 * - Dedicated headroom budget preventing typography overlap.
 */
export const JoyDivisionVisualizer: React.FC<JoyDivisionVisualizerProps> = ({
  trackTitle = 'Disorder',
  artistName = 'Joy Division',
  audioSrc = '',
  albumArtUrl,
  onTrackEnd,
  className = '',
  autoPlay = false,
  fftSize = 512,
  smoothingTimeConstant = 0.65,
  linesCount = 72,
  pointsPerLine = 220,
}) => {
  let appContext: ReturnType<typeof useAppContext> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    appContext = useAppContext();
  } catch {
    appContext = null;
  }

  // --- Active track metadata ---
  const activeTitle =
    appContext?.currentTrack?.title ||
    (appContext?.currentTrack?.name ? appContext.currentTrack.name.replace(/\.[^/.]+$/, '') : trackTitle) ||
    'Disorder';
  const activeArtist =
    appContext?.currentTrack?.artist &&
    appContext.currentTrack.artist !== 'Unknown Artist' &&
    appContext.currentTrack.artist !== 'Unknown (Local Cache)'
      ? appContext.currentTrack.artist
      : activeTitle.toLowerCase().includes('disorder')
      ? 'Joy Division'
      : artistName || 'Joy Division';
  const activeAlbumArt = appContext?.currentTrack?.name
    ? `${appContext.backendUrl}/api/downloads/art/${encodeURIComponent(appContext.currentTrack.name)}`
    : albumArtUrl;

  // --- DOM & Audio References ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioRef = appContext ? appContext.audioRef : localAudioRef;
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  // --- Standalone Web Audio References ---
  const localAudioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // --- Animation, Timing, & Temporal Envelope Buffer ---
  const animationFrameIdRef = useRef<number | null>(null);
  const rawFreqDataRef = useRef<Uint8Array | null>(null);
  const smoothedBinsRef = useRef<Float32Array | null>(null);
  const lineQueueRef = useRef<Float32Array[]>([]);
  const lastPushTimeRef = useRef<number>(0);
  const idlePhaseRef = useRef<number>(0);

  // --- Player State ---
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isHoveringProgress, setIsHoveringProgress] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  const activeIsPlaying = appContext ? appContext.isPlaying : isPlaying;

  // ---------------------------------------------------------------------------
  // 1. Initialize FIFO Ridgeline Queue with Authentic Serene CP 1919 Terrain
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const queue: Float32Array[] = [];
    for (let i = 0; i < linesCount; i++) {
      const initialPhase = (linesCount - 1 - i) * 0.08;
      const slice = generateRidgelineSlice(pointsPerLine, initialPhase, null, 256, 44100, false);
      queue.push(slice);
    }
    lineQueueRef.current = queue;
    lastPushTimeRef.current = 0;
  }, [linesCount, pointsPerLine]);

  // ---------------------------------------------------------------------------
  // 2. Synchronize with Active Audio Element
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = activeAudioRef?.current;
    if (!el) return;

    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => {
      if (onTrackEnd) onTrackEnd();
      else if (appContext?.handlePlayNext) appContext.handlePlayNext();
    };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    if (el.duration) setDuration(el.duration);
    if (el.currentTime) setCurrentTime(el.currentTime);

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, [activeAudioRef, onTrackEnd, appContext]);

  // ---------------------------------------------------------------------------
  // 3. Web Audio Analyser Access
  // ---------------------------------------------------------------------------
  const getActiveAnalyser = useCallback((): AnalyserNode | null => {
    if (appContext?.getAnalyserNode) {
      return appContext.getAnalyserNode();
    }
    if (!localAudioRef.current) return null;
    if (!localAudioCtxRef.current) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      localAudioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      localAnalyserRef.current = analyser;

      if (!localSourceRef.current) {
        const source = ctx.createMediaElementSource(localAudioRef.current);
        localSourceRef.current = source;
        source.connect(analyser);
        analyser.connect(ctx.destination);
      }
    }
    if (localAudioCtxRef.current.state === 'suspended') {
      localAudioCtxRef.current.resume().catch(() => {});
    }
    return localAnalyserRef.current;
  }, [appContext, fftSize, smoothingTimeConstant]);

  // ---------------------------------------------------------------------------
  // 4. Playback Controls
  // ---------------------------------------------------------------------------
  const togglePlayPause = async () => {
    if (appContext && activeAudioRef?.current) {
      const el = activeAudioRef.current;
      appContext.getAnalyserNode();
      if (appContext.isPlaying) {
        el.pause();
        appContext.setIsPlaying(false);
      } else {
        if (!appContext.currentTrack && appContext.downloads && appContext.downloads.length > 0) {
          appContext.handlePlayTrack(appContext.downloads[0]);
        } else {
          try {
            await el.play();
            appContext.setIsPlaying(true);
          } catch (err) {
            console.warn('Playback error:', err);
          }
        }
      }
      return;
    }

    if (!localAudioRef.current) return;
    getActiveAnalyser();
    if (localAudioCtxRef.current && localAudioCtxRef.current.state === 'suspended') {
      await localAudioCtxRef.current.resume();
    }
    if (isPlaying) {
      localAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await localAudioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('Local playback error:', err);
      }
    }
  };

  const handleScrubberSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = activeAudioRef?.current;
    if (!el || !progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetPercent = clickX / rect.width;
    const targetTime = targetPercent * duration;
    el.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetPercent = hoverX / rect.width;
    setHoverPosition(hoverX);
    setHoverTime(targetPercent * duration);
    setIsHoveringProgress(true);
  };

  const handleProgressMouseLeave = () => {
    setIsHoveringProgress(false);
  };

  // ---------------------------------------------------------------------------
  // 5. Canvas Render Loop: Oblique 3D Perspective Projection & Temporal Smoothing
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let isRunning = true;
    const PUSH_INTERVAL_MS = 38.0; // ~26.3 Hz update cadence

    const updateCanvasDimensions = () => {
      if (!canvas || !containerRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = containerRef.current.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    updateCanvasDimensions();

    const renderFrame = (timestamp: number) => {
      if (!isRunning) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const height = canvas.height;

      // Pure pitch-black wipe (#000000)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const numLines = linesCount;
      const numPoints = pointsPerLine;
      const queue = lineQueueRef.current;

      const analyser = getActiveAnalyser();
      const isAudioPlaying = appContext ? appContext.isPlaying : isPlaying;

      let binCount = 256;
      let sampleRate = 44100;

      // -----------------------------------------------------------------------
      // Persistent Temporal Envelope Follower (Fast Attack: 0.55, Smooth Decay: 0.14)
      // -----------------------------------------------------------------------
      if (analyser && isAudioPlaying) {
        binCount = analyser.frequencyBinCount;
        sampleRate = analyser.context?.sampleRate || 44100;

        if (!rawFreqDataRef.current || rawFreqDataRef.current.length !== binCount) {
          rawFreqDataRef.current = new Uint8Array(binCount);
        }
        analyser.getByteFrequencyData(rawFreqDataRef.current);

        if (!smoothedBinsRef.current || smoothedBinsRef.current.length !== binCount) {
          smoothedBinsRef.current = new Float32Array(binCount);
        }

        const raw = rawFreqDataRef.current;
        const smoothed = smoothedBinsRef.current;

        for (let k = 0; k < binCount; k++) {
          const rawNorm = raw[k] / 255.0;
          if (rawNorm > smoothed[k]) {
            smoothed[k] += (rawNorm - smoothed[k]) * 0.55; // Fast Attack
          } else {
            smoothed[k] += (rawNorm - smoothed[k]) * 0.14; // Smooth Exponential Decay
          }
        }
      }

      // Decoupled FIFO Queue Cadence
      if (lastPushTimeRef.current === 0) {
        lastPushTimeRef.current = timestamp;
      }
      const elapsed = timestamp - lastPushTimeRef.current;

      if (elapsed >= PUSH_INTERVAL_MS) {
        const pushes = Math.min(3, Math.floor(elapsed / PUSH_INTERVAL_MS));
        for (let p = 0; p < pushes; p++) {
          idlePhaseRef.current += 0.015;
          const newSlice = generateRidgelineSlice(
            numPoints,
            idlePhaseRef.current,
            smoothedBinsRef.current,
            binCount,
            sampleRate,
            isAudioPlaying
          );
          if (queue.length > 0) {
            queue.pop();
            queue.unshift(newSlice);
          }
        }
        lastPushTimeRef.current = timestamp - (elapsed % PUSH_INTERVAL_MS);
      }

      // Continuous sub-pixel vertical scroll offset [0, 1]
      const scrollOffset = Math.max(0, Math.min(1.0, (timestamp - lastPushTimeRef.current) / PUSH_INTERVAL_MS));

      // -----------------------------------------------------------------------
      // Oblique 3D Perspective Projection & Line Pitch Budgets
      // -----------------------------------------------------------------------
      const yHorizon = height * 0.27; // Clean clearance below header typography
      const yForeground = height * 0.83; // Above bottom player controls
      const ySpan = yForeground - yHorizon;
      const deltaY = ySpan / numLines;

      // Controlled peak amplitude: strictly proportional to line pitch (never pierce >8.5 lines)
      const maxPeakHeight = deltaY * 8.5;
      const yCeiling = height * 0.15; // Soft-knee headroom ceiling

      // Trapezoidal horizontal perspective: narrower at horizon, wider in foreground
      const wForeground = width * 0.80;
      const xCenter = width / 2;

      // Render lines from back to front (i = 0 is horizon, i = numLines - 1 is foreground)
      for (let i = 0; i < queue.length; i++) {
        const slice = queue[i];
        if (!slice) continue;

        const t = i / (numLines - 1); // Depth: 0 (horizon) -> 1 (foreground)

        // 1. Vertical baseline with perspective compression toward vanishing point
        const continuousI = (i + scrollOffset) / numLines;
        const yBase = yHorizon + ySpan * Math.pow(continuousI, 1.12);

        // 2. Trapezoidal width foreshortening
        const wT = wForeground * (0.76 + 0.24 * t);
        const xStartT = xCenter - wT / 2;

        // 3. Depth amplitude scaling
        const peakScale = maxPeakHeight * (0.60 + 0.40 * t);

        // Soft-knee headroom compression
        const availableHeadroom = Math.max(10, yBase - yCeiling);

        const points: { x: number; y: number }[] = [];
        for (let j = 0; j < numPoints; j++) {
          const u = j / (numPoints - 1);
          const px = xStartT + u * wT;

          // Asymptotically compress high peaks so they never collide with typography
          const rawDisplacement = slice[j] * peakScale;
          const compressedDisplacement = availableHeadroom * Math.tanh(rawDisplacement / availableHeadroom);
          const py = yBase - compressedDisplacement;

          points.push({ x: px, y: py });
        }

        if (points.length < 2) continue;

        // ---------------------------------------------------------------------
        // 1. Occlusion Skirt: Solid Black Fill (#000000)
        // Extends down by 2.2x deltaY to cleanly occlude background lines
        // ---------------------------------------------------------------------
        const skirtDepth = yBase + deltaY * 2.2;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < numPoints; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }
        ctx.lineTo(points[numPoints - 1].x, skirtDepth);
        ctx.lineTo(points[0].x, skirtDepth);
        ctx.closePath();

        ctx.fillStyle = '#000000';
        ctx.fill();

        // ---------------------------------------------------------------------
        // 2. Crisp White Contour Stroke
        // ---------------------------------------------------------------------
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < numPoints; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(0.85, 1.0 * dpr);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      animationFrameIdRef.current = requestAnimationFrame(renderFrame);
    };

    animationFrameIdRef.current = requestAnimationFrame(renderFrame);

    return () => {
      isRunning = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [activeIsPlaying, linesCount, pointsPerLine, getActiveAnalyser]);

  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (localAudioCtxRef.current && localAudioCtxRef.current.state !== 'closed') {
        localAudioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`w-full h-full min-h-[680px] flex flex-col justify-between relative bg-black overflow-hidden font-sans select-none border border-neutral-900 rounded-2xl shadow-2xl ${className}`}
      style={{ backgroundColor: '#000000' }}
    >
      {/* Hidden Native Audio Element (used only if standalone outside AppContext) */}
      {!appContext && (
        <audio
          ref={localAudioRef}
          src={audioSrc}
          crossOrigin="anonymous"
          preload="metadata"
          autoPlay={autoPlay}
          onTimeUpdate={() => localAudioRef.current && setCurrentTime(localAudioRef.current.currentTime)}
          onLoadedMetadata={() => localAudioRef.current && setDuration(localAudioRef.current.duration)}
          onEnded={onTrackEnd}
        />
      )}

      {/* --- Top Overlay Header: Authentic Joy Division Minimalist Poster Typography --- */}
      <div className="z-10 pt-8 pb-2 flex flex-col items-center text-center pointer-events-none select-none">
        <h1 className="text-lg md:text-xl font-medium tracking-[0.25em] uppercase text-white/95">
          {activeTitle}
        </h1>
        <span className="text-xs font-light tracking-[0.2em] uppercase text-neutral-400 mt-1">
          {activeArtist}
        </span>
      </div>

      {/* --- High Performance 2D Web Audio Canvas --- */}
      <div className="absolute inset-0 z-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-pointer"
          onClick={togglePlayPause}
          title="Click to toggle playback"
        />
      </div>

      {/* --- Bottom Ergonomic Player Control Bar --- */}
      <div className="z-10 w-full px-8 pb-6 pt-2 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-3">
        {/* Interactive Progress / Time Scrubber */}
        <div className="relative flex flex-col gap-1">
          <div
            ref={progressBarRef}
            onClick={handleScrubberSeek}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={handleProgressMouseLeave}
            className="group relative w-full h-2 bg-neutral-900 hover:h-2.5 rounded-full cursor-pointer transition-all duration-150 flex items-center"
          >
            {/* Played Progress Bar */}
            <div
              className="h-full bg-neutral-100 rounded-full relative transition-[width] duration-75"
              style={{ width: `${progressPercent}%` }}
            >
              {/* Scrub Handle */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform duration-150" />
            </div>

            {/* Hover Tooltip Timestamp */}
            {isHoveringProgress && (
              <div
                className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 bg-neutral-800 text-[10px] font-mono text-neutral-200 rounded border border-neutral-700 pointer-events-none"
                style={{ left: `${hoverPosition}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          {/* Time Labels */}
          <div className="flex justify-between text-[11px] font-mono text-neutral-500 px-0.5">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Player Action Toolbar */}
        <div className="flex items-center justify-between gap-4">
          {/* Left: Album Art Thumbnail + Metadata */}
          <div className="flex items-center gap-3 min-w-0 w-1/3">
            {activeAlbumArt ? (
              <img
                src={activeAlbumArt}
                alt={activeTitle}
                className="w-10 h-10 rounded bg-neutral-900 border border-neutral-800 object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-600 shrink-0 font-mono text-[9px]">
                CP1919
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-neutral-200 truncate" title={activeTitle}>
                {activeTitle}
              </span>
              <span className="text-[11px] text-neutral-500 truncate font-mono" title={activeArtist}>
                {activeArtist}
              </span>
            </div>
          </div>

          {/* Center: Primary Play / Pause Transport Button */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={togglePlayPause}
              disabled={
                appContext
                  ? !appContext.currentTrack && (!appContext.downloads || appContext.downloads.length === 0)
                  : !audioSrc
              }
              aria-label={activeIsPlaying ? 'Pause' : 'Play'}
              className="w-12 h-12 rounded-full bg-white text-black hover:bg-neutral-200 active:scale-95 transition-all duration-150 flex items-center justify-center shadow-lg disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              style={{
                transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 160ms ease',
              }}
            >
              {activeIsPlaying ? (
                /* Pause Icon (Double vertical bars) */
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1.5" />
                  <rect x="14" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                /* Play Icon (Right-pointing triangle) */
                <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>

          {/* Right: Volume & Audio Status */}
          <div className="flex items-center justify-end gap-2 w-1/3">
            <button
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="p-2 text-neutral-400 hover:text-neutral-100 transition-colors active:scale-95 cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                /* Volume Mute Icon */
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              ) : (
                /* Volume High Icon */
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const newVol = parseFloat(e.target.value);
                setVolume(newVol);
                if (activeAudioRef?.current) activeAudioRef.current.volume = isMuted ? 0 : newVol;
                if (appContext?.setVolume) appContext.setVolume(newVol);
                if (isMuted && newVol > 0) setIsMuted(false);
              }}
              className="w-20 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white hover:accent-neutral-200"
              aria-label="Volume Slider"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoyDivisionVisualizer;
