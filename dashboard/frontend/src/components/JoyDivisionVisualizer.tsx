import React, { useEffect, useRef, useState, useCallback } from 'react';

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
  /** AnalyserNode smoothing time constant (default: 0.78 for sharp transient response) */
  smoothingTimeConstant?: number;
  /** Number of dense ridgeline slices stacked in the waterfall queue (default: 140) */
  linesCount?: number;
  /** Number of horizontal sample points along each ridgeline (default: 260) */
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
 * JoyDivisionVisualizer
 *
 * Production-grade Web Audio & Canvas visualizer combining:
 * 1. Full ergonomic player layout (rich controls, scrubber, album art, volume).
 * 2. Authentic CP 1919 Pulsar ridgeline curve synthesis matching the Unknown Pleasures artwork:
 *    - 140 dense horizontal contour bands.
 *    - Acute, sharp mountain spikes on the left and mid-left.
 *    - Distinct tall needle peak on the right.
 *    - Tight dense foreground bands with subtle rolling baseline undulations.
 *    - Painter's algorithm (#000000 occlusion skirt fill) and crisp hairline white contour strokes.
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
  smoothingTimeConstant = 0.78,
  linesCount = 140,
  pointsPerLine = 260,
}) => {
  // --- DOM & Audio Node References ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  // --- Web Audio Graph References ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // --- Animation & Data Buffers ---
  const animationFrameIdRef = useRef<number | null>(null);
  const rawFreqDataRef = useRef<Uint8Array | null>(null);
  const lineQueueRef = useRef<Float32Array[]>([]);
  const idlePhaseRef = useRef<number>(0);

  // --- Player State (UI only) ---
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isHoveringProgress, setIsHoveringProgress] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // ---------------------------------------------------------------------------
  // 1. Initialize FIFO Ridgeline Queue
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const queue: Float32Array[] = [];
    for (let i = 0; i < linesCount; i++) {
      queue.push(new Float32Array(pointsPerLine));
    }
    lineQueueRef.current = queue;
  }, [linesCount, pointsPerLine]);

  // ---------------------------------------------------------------------------
  // 2. Initialize Web Audio API Graph
  // ---------------------------------------------------------------------------
  const initAudioGraph = useCallback(() => {
    if (!audioRef.current) return;

    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      analyserRef.current = analyser;

      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : volume;
      gainNodeRef.current = gain;

      if (!sourceNodeRef.current) {
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;
        source.connect(analyser);
        analyser.connect(gain);
        gain.connect(ctx.destination);
      }

      rawFreqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, [fftSize, smoothingTimeConstant, volume, isMuted]);

  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(isMuted ? 0 : volume, audioCtxRef.current.currentTime, 0.03);
    }
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // ---------------------------------------------------------------------------
  // 3. Audio Element Playback Controls
  // ---------------------------------------------------------------------------
  const togglePlayPause = async () => {
    if (!audioRef.current) return;

    initAudioGraph();

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('Playback initiation prevented by browser policy:', err);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    if (onTrackEnd) onTrackEnd();
  };

  const handleScrubberSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetPercent = clickX / rect.width;
    const targetTime = targetPercent * duration;
    audioRef.current.currentTime = targetTime;
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
  // 4. Canvas Render Loop: Authentic Unknown Pleasures Curves
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let isRunning = true;

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

    const renderFrame = () => {
      if (!isRunning) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const height = canvas.height;

      // Pure pitch-black background wipe (#000000)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const numLines = linesCount;
      const numPoints = pointsPerLine;
      const currentSlice = new Float32Array(numPoints);

      const analyser = analyserRef.current;
      const rawData = rawFreqDataRef.current;

      if (analyser && rawData && isPlaying) {
        analyser.getByteFrequencyData(rawData);

        const binCount = analyser.frequencyBinCount;
        const minBin = 1;
        const maxBin = Math.floor(binCount * 0.92);

        for (let j = 0; j < numPoints; j++) {
          const u = j / (numPoints - 1);

          // Logarithmic bin interpolation across spectrum
          const logBin = minBin * Math.pow(maxBin / minBin, u);
          const lowIndex = Math.floor(logBin);
          const highIndex = Math.min(lowIndex + 1, binCount - 1);
          const interp = logBin - lowIndex;

          const rawVal = (1 - interp) * rawData[lowIndex] + interp * rawData[highIndex];
          let normalizedAmp = rawVal / 255.0;

          // Non-linear power sharpening for acute pointy peaks
          normalizedAmp = Math.pow(normalizedAmp, 1.85);

          // Smooth edge tapering so lines anchor cleanly to left/right baselines
          const taperWidth = 0.05;
          let envelope = 1.0;
          if (u < taperWidth) {
            envelope = 0.5 * (1 - Math.cos((u / taperWidth) * Math.PI));
          } else if (u > 1.0 - taperWidth) {
            envelope = 0.5 * (1 - Math.cos(((1.0 - u) / taperWidth) * Math.PI));
          }

          // CP 1919 Regional weighting:
          // Left: resonant bass mountain range
          // Center: mid-range pyramid peaks
          // Right: sharp treble needle spikes and serrations
          let regionalWeight = 1.0;
          if (u < 0.35) {
            regionalWeight = 1.15 + 0.3 * Math.sin((u / 0.35) * Math.PI);
          } else if (u < 0.60) {
            regionalWeight = 0.95 + 0.35 * Math.sin(((u - 0.35) / 0.25) * Math.PI * 2);
          } else {
            // Accentuate the signature tall spike on the right
            const needleBoost = Math.exp(-Math.pow((u - 0.86) / 0.02, 2)) * 1.5;
            regionalWeight = 0.75 + 0.45 * Math.sin(u * 110) + needleBoost;
          }

          currentSlice[j] = normalizedAmp * envelope * regionalWeight;
        }

        // Spatial peak accentuation on localized maxima
        for (let j = 1; j < numPoints - 1; j++) {
          if (currentSlice[j] > currentSlice[j - 1] && currentSlice[j] > currentSlice[j + 1]) {
            currentSlice[j] = Math.min(1.0, currentSlice[j] * 1.4);
          }
        }
      } else {
        // Ambient Idle State: Exact CP 1919 Pulsar Waterfall Harmonics matching the reference image
        idlePhaseRef.current += 0.022;
        const phase = idlePhaseRef.current;

        for (let j = 0; j < numPoints; j++) {
          const u = j / (numPoints - 1);
          const taperWidth = 0.05;
          let envelope = 1.0;
          if (u < taperWidth) {
            envelope = 0.5 * (1 - Math.cos((u / taperWidth) * Math.PI));
          } else if (u > 1.0 - taperWidth) {
            envelope = 0.5 * (1 - Math.cos(((1.0 - u) / taperWidth) * Math.PI));
          }

          // 1. Left-side mountain ridge (u in [0.04, 0.36])
          let leftMountain = 0;
          if (u < 0.38) {
            const bell = Math.exp(-Math.pow((u - 0.18) / 0.13, 2));
            const h1 = Math.pow(Math.max(0, Math.sin(u * 20 + phase * 0.7)), 3.5);
            const h2 = Math.pow(Math.max(0, Math.sin(u * 38 - phase * 1.0)), 4.0);
            const h3 = Math.pow(Math.max(0, Math.cos(u * 54 + phase * 0.5)), 3.0);
            leftMountain = (0.28 * h1 + 0.22 * h2 + 0.14 * h3) * bell;
          }

          // 2. Center sharp pyramid peaks (u in [0.32, 0.62])
          let centerSpikes = 0;
          if (u > 0.30 && u < 0.64) {
            const bell = Math.exp(-Math.pow((u - 0.46) / 0.12, 2));
            const c1 = Math.pow(Math.max(0, Math.sin(u * 38 + phase * 1.1)), 5.0);
            const c2 = Math.pow(Math.max(0, Math.sin(u * 58 - phase * 0.9)), 5.5);
            const c3 = Math.pow(Math.max(0, Math.cos(u * 76 + phase * 0.6)), 4.0);
            centerSpikes = (0.24 * c1 + 0.26 * c2 + 0.12 * c3) * bell;
          }

          // 3. Right-side signature tall needle & dense serrations (u in [0.58, 0.96])
          let rightCluster = 0;
          if (u > 0.56) {
            // Signature tall needle spike at u = 0.86 matching the artwork
            const tallNeedle = Math.exp(-Math.pow((u - 0.86) / 0.012, 2)) * 0.72 * (0.85 + 0.15 * Math.sin(phase * 1.3));
            // Secondary needle at u = 0.73
            const midNeedle = Math.exp(-Math.pow((u - 0.73) / 0.016, 2)) * 0.40 * (0.85 + 0.15 * Math.cos(phase * 1.1));
            // Tertiary needle at u = 0.65
            const smallNeedle = Math.exp(-Math.pow((u - 0.65) / 0.02, 2)) * 0.28 * (0.85 + 0.15 * Math.sin(phase * 0.9));
            // High-frequency serrated micro-ripples
            const serrations = (Math.pow(Math.max(0, Math.sin(u * 96 + phase * 1.5)), 2.6) * 0.12 +
                                Math.pow(Math.max(0, Math.cos(u * 165 - phase * 0.8)), 3.0) * 0.06);
            const fade = Math.min(1.0, (u - 0.56) / 0.08);
            rightCluster = (tallNeedle + midNeedle + smallNeedle + serrations) * fade;
          }

          currentSlice[j] = Math.max(0, (leftMountain + centerSpikes + rightCluster) * envelope);
        }
      }

      // -----------------------------------------------------------------------
      // Top-Down FIFO Queue Shift:
      // New slices enter at TOP (index 0, horizon) and cascade DOWNWARDS to bottom
      // -----------------------------------------------------------------------
      const queue = lineQueueRef.current;
      if (queue.length > 0) {
        queue.pop();
        queue.unshift(currentSlice);
      }

      // -----------------------------------------------------------------------
      // Perspective & Occlusion Rendering: Painter's Algorithm (Top to Bottom)
      // -----------------------------------------------------------------------
      const yHorizon = height * 0.42;     // Horizon starts at 42% height
      const yForeground = height * 0.88;  // Foreground terminates cleanly above player bar at 88% height
      const maxPeakHeight = height * 0.35;// Base peak amplitude ceiling for dramatic needle peaks

      for (let i = 0; i < queue.length; i++) {
        const t = i / (queue.length - 1); // Depth: 0 (horizon) -> 1 (foreground baseline)
        const slice = queue[i];

        // 1. Perspective Spacing Math: tight uniform spacing in foreground (y ∝ t^1.22)
        const yBase = yHorizon + (yForeground - yHorizon) * Math.pow(t, 1.22);

        // 2. Depth Peak Envelope matching Joy Division artwork:
        //    Horizon (t=0) has modest background ridges (~0.45)
        //    Peaks tower to MAXIMUM height in mid-ground (t ≈ 0.22 to 0.40)
        //    Foreground (t > 0.68) settles into flat, dense parallel baseline lines
        let depthEnvelope: number;
        if (t < 0.28) {
          depthEnvelope = 0.45 + 0.55 * Math.sin((t / 0.28) * (Math.PI * 0.5));
        } else {
          const decay = Math.min(1.0, (t - 0.28) / 0.42);
          depthEnvelope = Math.pow(Math.cos(decay * (Math.PI * 0.5)), 2.2);
        }
        const peakScale = maxPeakHeight * depthEnvelope;

        // 3. Margin with subtle perspective flare
        const xMargin = width * (0.04 - 0.01 * t);
        const xSpan = width - 2 * xMargin;

        // 4. Subtle rolling undulation in foreground lines
        const foregroundWaviness = Math.sin(t * Math.PI * 6 + idlePhaseRef.current * 0.4) * (0.6 * dpr) * Math.sin(t * Math.PI);

        const points: { x: number; y: number }[] = [];
        for (let j = 0; j < numPoints; j++) {
          const u = j / (numPoints - 1);
          const px = xMargin + u * xSpan;
          const py = yBase - slice[j] * peakScale + foregroundWaviness;
          points.push({ x: px, y: py });
        }

        if (points.length < 2) continue;

        // ---------------------------------------------------------------------
        // Painter's Occlusion: Solid Black Skirt Fill (#000000)
        // ---------------------------------------------------------------------
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < points.length; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }
        const lastPoint = points[points.length - 1];

        // Extend path down past bottom of canvas to occlude lines beneath/behind
        ctx.lineTo(lastPoint.x, height + 25 * dpr);
        ctx.lineTo(points[0].x, height + 25 * dpr);
        ctx.closePath();

        ctx.fillStyle = '#000000';
        ctx.fill();

        // ---------------------------------------------------------------------
        // High-Contrast Crisp Hairline White Contour Stroke
        // ---------------------------------------------------------------------
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < points.length; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }

        const strokeAlpha = 0.45 + 0.55 * (1 - t * 0.30);
        ctx.strokeStyle = `rgba(255, 255, 255, ${strokeAlpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.60, (0.75 - 0.15 * t) * dpr);
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 4;
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
  }, [isPlaying, linesCount, pointsPerLine]);

  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-xl mx-auto h-[740px] bg-black text-white flex flex-col justify-between select-none overflow-hidden font-sans border border-neutral-900 rounded-2xl shadow-2xl ${className}`}
      style={{ backgroundColor: '#000000' }}
    >
      {/* Hidden Native Audio Element */}
      <audio
        ref={audioRef}
        src={audioSrc}
        crossOrigin="anonymous"
        preload="metadata"
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
      />

      {/* --- Top Overlay Header: Authentic Joy Division Minimalist Poster Typography --- */}
      <div className="z-10 pt-12 px-8 flex flex-col items-center text-center pointer-events-none select-none">
        <h2 className="text-xl md:text-2xl font-normal text-white tracking-[0.16em] drop-shadow-sm max-w-md truncate">
          {trackTitle || 'Disorder'}
        </h2>
        <span className="text-sm md:text-base text-neutral-300 font-light tracking-[0.14em] mt-1.5 max-w-md truncate">
          {artistName || 'Joy Division'}
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
      <div className="z-10 w-full px-6 pb-6 pt-2 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-3">
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
          {/* Left: Optional Album Art Thumbnail + Metadata */}
          <div className="flex items-center gap-3 min-w-0 w-1/3">
            {albumArtUrl ? (
              <img
                src={albumArtUrl}
                alt={trackTitle}
                className="w-10 h-10 rounded bg-neutral-900 border border-neutral-800 object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-600 shrink-0 font-mono text-[9px]">
                CP1919
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-neutral-200 truncate" title={trackTitle}>
                {trackTitle || 'No Track Selected'}
              </span>
              <span className="text-[11px] text-neutral-500 truncate font-mono" title={artistName}>
                {artistName || 'SpotScraper Player'}
              </span>
            </div>
          </div>

          {/* Center: Primary Play / Pause Transport Button */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={togglePlayPause}
              disabled={!audioSrc}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-12 h-12 rounded-full bg-white text-black hover:bg-neutral-200 active:scale-95 transition-all duration-150 flex items-center justify-center shadow-lg disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              style={{
                transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 160ms ease',
              }}
            >
              {isPlaying ? (
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                /* Volume High Icon */
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
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
