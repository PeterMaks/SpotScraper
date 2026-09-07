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
  /** AnalyserNode smoothing time constant (default: 0.70 for snappy transient attacks) */
  smoothingTimeConstant?: number;
  /** Number of stacked ridgeline slices (dense TouchDesigner benchmark: 140 pulses) */
  linesCount?: number;
  /** Number of horizontal sample points along each ridgeline (default: 280) */
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
 * Raised cosine taper on boundaries of width wTaper
 * Flat 1.0 in the center active plateau
 */
function tukeyWindow(u: number, uMin = 0.15, uMax = 0.85, wTaper = 0.07): number {
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
 * Apply 5-point spatial Gaussian smoothing filter [0.06, 0.24, 0.40, 0.24, 0.06]
 * across the points array to eliminate single-bin noise while preserving sharp
 * musical transient peaks and valleys.
 */
function applySpatialSmoothing(data: Float32Array): Float32Array {
  const n = data.length;
  const smoothed = new Float32Array(n);
  const k0 = 0.40, k1 = 0.24, k2 = 0.06;

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
 * Synthesize a single horizontal ridgeline slice:
 * - When audio is active: maps continuous logarithmic FFT bins across the active window [0.15, 0.85]
 *   with smooth bass entry shaping, frequency pre-emphasis, and power sharpening.
 * - When idle: creates authentic CP 1919 pulsar terrain with drifting sub-pulse microstructure.
 * - Outside [0.15, 0.85]: strictly flat baseline displacement with subtle radio static.
 */
function generateRidgelineSlice(
  numPoints: number,
  phase: number,
  rawData: Uint8Array | null,
  binCount: number,
  isAudioActive: boolean
): Float32Array {
  const slice = new Float32Array(numPoints);
  const uMin = 0.15;
  const uMax = 0.85;
  const wTaper = 0.07;

  const binMin = 1;
  const binMax = Math.max(binMin + 1, Math.floor(binCount * 0.90));

  for (let j = 0; j < numPoints; j++) {
    const u = j / (numPoints - 1);
    const W = tukeyWindow(u, uMin, uMax, wTaper);

    // Baseline silence outside active pulse window with subtle radio static
    if (W <= 0.0001) {
      slice[j] = (Math.random() - 0.5) * 0.0015;
      continue;
    }

    const r = (u - uMin) / (uMax - uMin); // [0, 1] relative active position

    if (isAudioActive && rawData) {
      // 1. Continuous Logarithmic Frequency Bin Interpolation
      const logBin = binMin * Math.pow(binMax / binMin, r);
      const lowIndex = Math.floor(logBin);
      const highIndex = Math.min(lowIndex + 1, binCount - 1);
      const interp = logBin - lowIndex;

      const rawVal = ((1 - interp) * rawData[lowIndex] + interp * rawData[highIndex]) / 255.0;

      // Subtract ambient noise floor for high dynamic contrast
      const normalized = Math.max(0, (rawVal - 0.08) / 0.92);

      // Bass entry shaping: smooth roll-in for sub-bass below 80 Hz so it forms an organic mountain ridge
      const bassRollIn = Math.min(1.0, Math.pow(Math.max(0.01, r / 0.10), 1.4));

      // Frequency Pre-Emphasis: equalizes high frequencies against bass energy
      const preEmphasisGain = 0.70 + 2.60 * Math.pow(r, 0.90);
      const boosted = normalized * preEmphasisGain * bassRollIn;

      // Dynamic Power Sharpening: A_sharp = A^2.2 to enforce acute summits and prevent monolithic blocks
      const sharpened = Math.pow(Math.min(1.0, boosted), 2.2);

      // Microstructure wavelets matching pulsar radio dispersion and scintillation
      const microSerration =
        (Math.sin(r * 95 + phase) * 0.5 + 0.5) * 0.08 * (0.25 + 0.75 * r) +
        (Math.sin(r * 190 - phase * 1.3) * 0.5 + 0.5) * 0.05 * r;

      // Subtle resting floor so mountains retain organic pulsar body during quiet sections
      const ambientFloor =
        (Math.exp(-Math.pow((r - 0.28) / 0.14, 2)) * 0.05 +
         Math.exp(-Math.pow((r - 0.52) / 0.12, 2)) * 0.05 +
         Math.exp(-Math.pow((r - 0.75) / 0.08, 2)) * 0.06);

      const staticNoise = (Math.random() - 0.5) * 0.002;

      slice[j] = Math.max(0, (sharpened + microSerration + ambientFloor) * W + staticNoise);
    } else {
      // Authentic resting CP 1919 pulsar terrain when paused / idle
      const p1 = Math.exp(-Math.pow((r - 0.26) / 0.13, 2)) * 0.44 * (0.85 + 0.15 * Math.sin(phase * 0.65));
      const p2 = Math.exp(-Math.pow((r - 0.48) / 0.11, 2)) * 0.48 * (0.85 + 0.15 * Math.cos(phase * 0.85));
      const p3 = Math.exp(-Math.pow((r - 0.72) / 0.08, 2)) * 0.60 * (0.85 + 0.15 * Math.sin(phase * 1.15));
      const needle = Math.exp(-Math.pow((r - 0.78) / 0.022, 2)) * 0.50 * (0.85 + 0.15 * Math.cos(phase * 1.35));

      const serration =
        (Math.sin(r * 85 + phase * 1.1) * 0.5 + 0.5) * 0.09 +
        (Math.sin(r * 160 - phase * 1.5) * 0.5 + 0.5) * 0.05 +
        (Math.sin(r * 240 + phase * 2.0) * 0.5 + 0.5) * 0.03;

      const idleStatic = (Math.random() - 0.5) * 0.002;

      slice[j] = Math.max(0, (p1 + p2 + p3 + needle + serration) * W + idleStatic);
    }
  }

  // Apply spatial Gaussian smoothing to eliminate single-bin noise spikes
  return applySpatialSmoothing(slice);
}

/**
 * JoyDivisionVisualizer
 *
 * Responsive, full-bleed Web Audio & Canvas visualizer recreating the authentic
 * Unknown Pleasures (CP 1919) topographical terrain:
 * - Fluid full-viewport scaling (adapts dynamically to any parent container).
 * - Continuous logarithmic FFT frequency mapping across terrain (replaces hardcoded columns).
 * - Spatial 5-point Gaussian smoothing for organic ridgeline contours.
 * - 140 dense isometric pulses with continuous sub-pixel vertical waterfall flow.
 * - Soft-knee compression preventing typography collision without flat plateau artifacts.
 * - Pure pitch-black occlusion skirt (#000000) and crisp hairline white contours.
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
  smoothingTimeConstant = 0.70,
  linesCount = 140,
  pointsPerLine = 280,
}) => {
  let appContext: ReturnType<typeof useAppContext> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    appContext = useAppContext();
  } catch {
    appContext = null;
  }

  // --- Active track metadata (synced with global player when present) ---
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

  // --- Standalone Web Audio References (only used if outside AppContext) ---
  const localAudioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // --- Animation, Timing & Data Buffers ---
  const animationFrameIdRef = useRef<number | null>(null);
  const rawFreqDataRef = useRef<Uint8Array | null>(null);
  const lineQueueRef = useRef<Float32Array[]>([]);
  const lastPushTimeRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);

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
  // 1. Initialize FIFO Ridgeline Queue with Authentic Pulsar Topography
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const queue: Float32Array[] = [];
    for (let i = 0; i < linesCount; i++) {
      const initialPhase = (linesCount - 1 - i) * 0.08;
      const slice = generateRidgelineSlice(pointsPerLine, initialPhase, null, 256, false);
      queue.push(slice);
    }
    lineQueueRef.current = queue;
    lastPushTimeRef.current = 0;
  }, [linesCount, pointsPerLine]);

  // ---------------------------------------------------------------------------
  // 2. Synchronize with Active Audio Element (time, duration, ended)
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
  // 4. Playback Controls (Connected to Global Player or Local Element)
  // ---------------------------------------------------------------------------
  const togglePlayPause = async () => {
    if (appContext && activeAudioRef?.current) {
      const el = activeAudioRef.current;
      appContext.getAnalyserNode(); // ensure active
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
  // 5. Canvas Render Loop: Continuous Logarithmic FFT Topography & Full-Bleed Scaling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let isRunning = true;
    const PUSH_INTERVAL_MS = 36.0; // ~27.7 Hz update cadence (decoupled from render FPS)

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

      // Pure pitch-black background wipe (#000000)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const numLines = linesCount;
      const numPoints = pointsPerLine;
      const queue = lineQueueRef.current;

      const analyser = getActiveAnalyser();
      const isAudioPlaying = appContext ? appContext.isPlaying : isPlaying;

      // Read real-time frequency data if active
      let rawData: Uint8Array | null = null;
      let binCount = 256;
      if (analyser && isAudioPlaying) {
        if (!rawFreqDataRef.current || rawFreqDataRef.current.length !== analyser.frequencyBinCount) {
          rawFreqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(rawFreqDataRef.current);
        rawData = rawFreqDataRef.current;
        binCount = analyser.frequencyBinCount;
      }

      // Decoupled FIFO Queue Cadence: push slices at fixed ~28 Hz
      if (lastPushTimeRef.current === 0) {
        lastPushTimeRef.current = timestamp;
      }
      const elapsed = timestamp - lastPushTimeRef.current;

      if (elapsed >= PUSH_INTERVAL_MS) {
        const pushes = Math.min(3, Math.floor(elapsed / PUSH_INTERVAL_MS));
        for (let p = 0; p < pushes; p++) {
          phaseRef.current += 0.08;
          const newSlice = generateRidgelineSlice(numPoints, phaseRef.current, rawData, binCount, isAudioPlaying);
          if (queue.length > 0) {
            queue.pop();
            queue.unshift(newSlice);
          }
        }
        lastPushTimeRef.current = timestamp - (elapsed % PUSH_INTERVAL_MS);
      }

      // Continuous sub-pixel vertical scroll offset [0, 1] for 60/120 FPS fluid motion
      const scrollOffset = Math.max(0, Math.min(1.0, (timestamp - lastPushTimeRef.current) / PUSH_INTERVAL_MS));

      // Coordinate Budgets: Top 27% reserved for header typography, bottom 16% for player bar
      const yHorizon = height * 0.27;
      const yForeground = height * 0.84;
      const deltaY = (yForeground - yHorizon) / numLines;
      const maxPeakHeight = height * 0.18;
      const minPeakY = height * 0.14; // Soft headroom threshold (guarantees zero header collision)

      // Expansive horizontal active terrain span: 74% of canvas width (13% quiet margins)
      const xMargin = width * 0.13;
      const xSpan = width - 2 * xMargin;

      const strokeLineWidth = Math.max(0.75, 0.9 * dpr);

      // Render lines from back to front (i = 0 is horizon, i = numLines - 1 is foreground)
      for (let i = 0; i < queue.length; i++) {
        const slice = queue[i];
        if (!slice) continue;

        // Sub-pixel vertical continuous baseline translation
        const yBase = yHorizon + (i + scrollOffset) * deltaY;

        // Depth perspective envelope:
        // Far horizon lines (t < 0.22) scale gracefully so they never bunch up at top
        // Mid-ground lines (t ≈ 0.22 - 0.85) have full towering peak height
        // Foreground lines (t > 0.85) settle into calm parallel baselines
        const t = i / (numLines - 1);
        let depthFactor = 1.0;
        if (t < 0.22) {
          depthFactor = 0.50 + 0.50 * Math.sin((t / 0.22) * (Math.PI * 0.5));
        } else if (t > 0.85) {
          depthFactor = Math.cos(((t - 0.85) / 0.15) * (Math.PI * 0.5));
        }
        const peakScale = maxPeakHeight * depthFactor;

        // Available headroom above baseline
        const availableHeadroom = Math.max(10, yBase - minPeakY);

        const points: { x: number; y: number }[] = [];
        for (let j = 0; j < numPoints; j++) {
          const u = j / (numPoints - 1);
          const px = xMargin + u * xSpan;

          // Soft-knee asymptotic compression:
          // Instead of hard-clamping (which produces an ugly flat horizontal line),
          // compress smoothly with tanh so peaks remain pointy and acute without ever crossing minPeakY
          const rawDisplacement = slice[j] * peakScale;
          const compressedDisplacement = availableHeadroom * Math.tanh(rawDisplacement / availableHeadroom);
          const py = yBase - compressedDisplacement;

          points.push({ x: px, y: py });
        }

        if (points.length < 2) continue;

        const firstX = points[0].x;
        const lastX = points[points.length - 1].x;
        const skirtBottom = height + 20 * dpr;

        // ---------------------------------------------------------------------
        // Painter's Occlusion Skirt: Solid Black Fill (#000000)
        // Extends straight down past canvas baseline to completely hide lines behind
        // ---------------------------------------------------------------------
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < numPoints; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }
        ctx.lineTo(lastX, skirtBottom);
        ctx.lineTo(firstX, skirtBottom);
        ctx.closePath();

        ctx.fillStyle = '#000000';
        ctx.fill();

        // ---------------------------------------------------------------------
        // Crisp Hairline White Contour Stroke
        // Depth-graded alpha from 0.55 (horizon) to 1.0 (foreground)
        // ---------------------------------------------------------------------
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < numPoints; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }

        const strokeAlpha = Math.min(1.0, 0.55 + 0.45 * (i / numLines));
        ctx.strokeStyle = `rgba(255, 255, 255, ${strokeAlpha.toFixed(3)})`;
        ctx.lineWidth = strokeLineWidth;
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 2;
        ctx.lineCap = 'butt';
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
