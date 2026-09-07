import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppContext } from '../AppContext';

export interface JoyDivisionVisualizerProps {
  trackTitle?: string;
  artistName?: string;
  audioSrc?: string;
  albumArtUrl?: string;
  onTrackEnd?: () => void;
  onTrackNext?: () => void;
  onTrackPrev?: () => void;
  className?: string;
  autoPlay?: boolean;
  fftSize?: number;
  smoothingTimeConstant?: number;
  linesCount?: number;
  pointsPerLine?: number;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Authentic CP 1919 Smooth Raised-Cosine Window:
 * Spans the full available line width with subtle smooth edge tapering
 * to prevent abrupt cliff drops or unnatural clipping.
 */
function terrainWindow(u: number, uMin = 0.02, uMax = 0.98, taperWidth = 0.03): number {
  if (u < uMin || u > uMax) return 0;
  if (u < uMin + taperWidth) {
    return 0.5 * (1 - Math.cos((Math.PI * (u - uMin)) / taperWidth));
  }
  if (u > uMax - taperWidth) {
    return 0.5 * (1 - Math.cos((Math.PI * (uMax - u)) / taperWidth));
  }
  return 1.0;
}

/**
 * 5-point spatial Gaussian smoothing to remove single-bin FFT noise spikes
 * while keeping transient peaks sharp and acute.
 */
function applySpatialFilter(data: Float32Array): Float32Array {
  const n = data.length;
  const out = new Float32Array(n);
  const k0 = 0.38, k1 = 0.24, k2 = 0.07;

  for (let i = 0; i < n; i++) {
    const im2 = Math.max(0, i - 2);
    const im1 = Math.max(0, i - 1);
    const ip1 = Math.min(n - 1, i + 1);
    const ip2 = Math.min(n - 1, i + 2);

    out[i] =
      k2 * data[im2] +
      k1 * data[im1] +
      k0 * data[i] +
      k1 * data[ip1] +
      k2 * data[ip2];
  }
  return out;
}

export const JoyDivisionVisualizer: React.FC<JoyDivisionVisualizerProps> = ({
  trackTitle = 'Disorder',
  artistName = 'Joy Division',
  audioSrc = '',
  albumArtUrl,
  onTrackEnd,
  onTrackNext,
  onTrackPrev,
  className = '',
  autoPlay = false,
  fftSize = 1024,
  smoothingTimeConstant = 0.68,
  linesCount = 110,
  pointsPerLine = 260,
}) => {
  let appContext: ReturnType<typeof useAppContext> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    appContext = useAppContext();
  } catch {
    appContext = null;
  }

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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioRef = appContext ? appContext.audioRef : localAudioRef;
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const localAudioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const animationFrameIdRef = useRef<number | null>(null);
  const rawFreqDataRef = useRef<Uint8Array | null>(null);
  const smoothedAudioFreqRef = useRef<Float32Array | null>(null);
  const lineQueueRef = useRef<Float32Array[]>([]);
  const lastPushTimeRef = useRef<number>(0);
  const idlePhaseRef = useRef<number>(0);
  const dynamicGainRef = useRef<number>(1.0);

  // 10-Second Idle Timer & Cooldown Tracking
  const wasAudioActiveRef = useRef<boolean>(false);
  const pausedAtTimeRef = useRef<number | null>(null);
  const hasPlayedTrackRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isHoveringProgress, setIsHoveringProgress] = useState<boolean>(false);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  const activeIsPlaying = appContext ? appContext.isPlaying : isPlaying;

  const handlePrevious = useCallback(() => {
    if (onTrackPrev) {
      onTrackPrev();
    } else if (appContext?.handlePlayPrev) {
      appContext.handlePlayPrev();
    } else if (localAudioRef.current) {
      localAudioRef.current.currentTime = 0;
    }
  }, [onTrackPrev, appContext]);

  const handleNext = useCallback(() => {
    if (onTrackNext) {
      onTrackNext();
    } else if (appContext?.handlePlayNext) {
      appContext.handlePlayNext();
    } else if (onTrackEnd) {
      onTrackEnd();
    }
  }, [onTrackNext, appContext, onTrackEnd]);

  // ---------------------------------------------------------------------------
  // 1. Initialize FIFO Queue with Full-Width Authentic Idle Resting Curves
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const queue: Float32Array[] = [];
    const uMin = 0.02;
    const uMax = 0.98;

    for (let i = 0; i < linesCount; i++) {
      const slice = new Float32Array(pointsPerLine);
      const phase = (linesCount - 1 - i) * 0.055;

      for (let j = 0; j < pointsPerLine; j++) {
        const u = j / (pointsPerLine - 1);
        const env = terrainWindow(u, uMin, uMax, 0.03);
        if (env <= 0.0001) {
          slice[j] = 0;
          continue;
        }

        const r = (u - uMin) / (uMax - uMin);
        const p1 = Math.exp(-Math.pow((r - 0.22) / 0.12, 2)) * 0.38 * (0.85 + 0.15 * Math.sin(phase * 0.7));
        const p2 = Math.exp(-Math.pow((r - 0.42) / 0.10, 2)) * 0.45 * (0.85 + 0.15 * Math.cos(phase * 0.9));
        const p3 = Math.exp(-Math.pow((r - 0.62) / 0.11, 2)) * 0.52 * (0.85 + 0.15 * Math.sin(phase * 1.1));
        const p4 = Math.exp(-Math.pow((r - 0.82) / 0.08, 2)) * 0.48 * (0.85 + 0.15 * Math.cos(phase * 1.3));
        const needle1 = Math.exp(-Math.pow((r - 0.36) / 0.022, 2)) * 0.36 * (0.85 + 0.15 * Math.sin(phase * 1.5));
        const needle2 = Math.exp(-Math.pow((r - 0.76) / 0.018, 2)) * 0.48 * (0.85 + 0.15 * Math.cos(phase * 1.4));
        const serrations = (Math.sin(r * 95 + phase) * 0.5 + 0.5) * 0.05;

        slice[j] = (p1 + p2 + p3 + p4 + needle1 + needle2 + serrations) * env;
      }
      queue.push(applySpatialFilter(slice));
    }
    lineQueueRef.current = queue;
    lastPushTimeRef.current = 0;
  }, [linesCount, pointsPerLine]);

  // ---------------------------------------------------------------------------
  // 2. Audio Event Synchronization
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
  // 3. Web Audio Context Access
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
      localAudioCtxRef.current.resume().catch(() => { });
    }
    return localAnalyserRef.current;
  }, [appContext, fftSize, smoothingTimeConstant]);

  const togglePlayPause = useCallback(async () => {
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
  }, [appContext, activeAudioRef, isPlaying, getActiveAnalyser]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowRight' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        e.preventDefault();
        handlePrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, handleNext, handlePrevious]);

  const handleScrubberSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = activeAudioRef?.current;
    if (!el || !progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetTime = (clickX / rect.width) * duration;
    el.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverPosition(hoverX);
    setHoverTime((hoverX / rect.width) * duration);
    setIsHoveringProgress(true);
  };

  // ---------------------------------------------------------------------------
  // 4. Canvas Render Loop: Authentic TouchDesigner-Style Ridgeline Waterfall
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let isRunning = true;
    const PUSH_INTERVAL_MS = 33.3; // 30 Hz steady slice generation

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

      // Pure pitch-black background clear
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const numLines = linesCount;
      const numPoints = pointsPerLine;
      const queue = lineQueueRef.current;

      const analyser = getActiveAnalyser();
      const isAudioActive = appContext ? appContext.isPlaying : isPlaying;

      if (isAudioActive) {
        hasPlayedTrackRef.current = true;
        wasAudioActiveRef.current = true;
        pausedAtTimeRef.current = null;
      } else {
        if (wasAudioActiveRef.current) {
          wasAudioActiveRef.current = false;
          pausedAtTimeRef.current = timestamp;
        }
      }

      // 1. Audio Spectral Filtering & Transient Tracking
      if (analyser && isAudioActive) {
        const binCount = analyser.frequencyBinCount;
        if (!rawFreqDataRef.current || rawFreqDataRef.current.length !== binCount) {
          rawFreqDataRef.current = new Uint8Array(binCount);
          smoothedAudioFreqRef.current = new Float32Array(binCount);
        }
        analyser.getByteFrequencyData(rawFreqDataRef.current as any);

        const raw = rawFreqDataRef.current;
        const smoothed = smoothedAudioFreqRef.current!;

        // Asymmetric attack/decay integration (fast transient attack, gentle musical decay)
        for (let b = 0; b < binCount; b++) {
          const target = raw[b] / 255.0;
          if (target > smoothed[b]) {
            smoothed[b] += (target - smoothed[b]) * 0.85;
          } else {
            smoothed[b] += (target - smoothed[b]) * 0.18;
          }
        }
      }

      // 2. Queue Generation Cadence
      if (lastPushTimeRef.current === 0) {
        lastPushTimeRef.current = timestamp;
      }
      const elapsed = timestamp - lastPushTimeRef.current;

      if (elapsed >= PUSH_INTERVAL_MS) {
        const pushes = Math.min(3, Math.floor(elapsed / PUSH_INTERVAL_MS));

        for (let p = 0; p < pushes; p++) {
          const newSlice = new Float32Array(numPoints);
          const uMin = 0.02;
          const uMax = 0.98;

          if (isAudioActive && smoothedAudioFreqRef.current) {
            const smoothed = smoothedAudioFreqRef.current;
            const binCount = smoothed.length;
            const binMin = 2; // ~86 Hz low-end cutoff
            const binMax = Math.floor(binCount * 0.85);

            let maxSliceEnergy = 0.001;

            for (let j = 0; j < numPoints; j++) {
              const u = j / (numPoints - 1);
              const env = terrainWindow(u, uMin, uMax, 0.03);
              if (env <= 0.0001) {
                newSlice[j] = 0;
                continue;
              }

              const r = (u - uMin) / (uMax - uMin);

              // Continuous Logarithmic Bin Mapping across full line width
              const logBin = binMin * Math.pow(binMax / binMin, r);
              const low = Math.floor(logBin);
              const high = Math.min(low + 1, binCount - 1);
              const frac = logBin - low;
              const rawAmp = (1 - frac) * smoothed[low] + frac * smoothed[high];

              // Noise-floor gate
              const gated = Math.max(0, (rawAmp - 0.05) / 0.95);

              // Balanced pre-emphasis across the full frequency spectrum
              const preEmphasis = 0.70 + 2.2 * Math.pow(r, 0.85);
              const subBassShaping = Math.min(1.0, Math.pow(Math.max(0.01, r / 0.08), 1.1));

              // Power sharpening: deep valleys and acute summits
              const val = Math.pow(gated * preEmphasis * subBassShaping, 1.75);

              newSlice[j] = val * env;
              if (newSlice[j] > maxSliceEnergy) {
                maxSliceEnergy = newSlice[j];
              }
            }

            // Dynamic AGC Peak Tracking: prevents ceiling plateaus while keeping transients tall
            const targetGain = maxSliceEnergy > 0.05 ? Math.min(1.4, 0.85 / maxSliceEnergy) : 1.0;
            dynamicGainRef.current += (targetGain - dynamicGainRef.current) * 0.12;

            for (let j = 0; j < numPoints; j++) {
              newSlice[j] *= dynamicGainRef.current;
            }
          } else {
            // Check 10-second timer before idle wave activates after an active song is paused
            const isPausedCooldown = hasPlayedTrackRef.current && pausedAtTimeRef.current !== null;
            const pauseElapsed = isPausedCooldown ? timestamp - pausedAtTimeRef.current! : Infinity;
            const IDLE_COOLDOWN_MS = 10000;

            if (isPausedCooldown && pauseElapsed < IDLE_COOLDOWN_MS) {
              // During the 10-second cooldown after pause: keep incoming lines flat
              for (let j = 0; j < numPoints; j++) {
                newSlice[j] = 0;
              }
            } else {
              // Idle wave activated (either fresh launch or after 10s cooldown)
              const idleFade = isPausedCooldown ? Math.min(1.0, (pauseElapsed - IDLE_COOLDOWN_MS) / 1500) : 1.0;
              idlePhaseRef.current += 0.035;
              const phase = idlePhaseRef.current;

              for (let j = 0; j < numPoints; j++) {
                const u = j / (numPoints - 1);
                const env = terrainWindow(u, uMin, uMax, 0.03);
                if (env <= 0.0001) {
                  newSlice[j] = 0;
                  continue;
                }

                const r = (u - uMin) / (uMax - uMin);
                const p1 = Math.exp(-Math.pow((r - 0.22) / 0.12, 2)) * 0.38 * (0.85 + 0.15 * Math.sin(phase * 0.7));
                const p2 = Math.exp(-Math.pow((r - 0.42) / 0.10, 2)) * 0.45 * (0.85 + 0.15 * Math.cos(phase * 0.9));
                const p3 = Math.exp(-Math.pow((r - 0.62) / 0.11, 2)) * 0.52 * (0.85 + 0.15 * Math.sin(phase * 1.1));
                const p4 = Math.exp(-Math.pow((r - 0.82) / 0.08, 2)) * 0.48 * (0.85 + 0.15 * Math.cos(phase * 1.3));
                const needle1 = Math.exp(-Math.pow((r - 0.36) / 0.022, 2)) * 0.36 * (0.85 + 0.15 * Math.sin(phase * 1.5));
                const needle2 = Math.exp(-Math.pow((r - 0.76) / 0.018, 2)) * 0.48 * (0.85 + 0.15 * Math.cos(phase * 1.4));
                const serrations = (Math.sin(r * 95 + phase) * 0.5 + 0.5) * 0.05;

                newSlice[j] = (p1 + p2 + p3 + p4 + needle1 + needle2 + serrations) * env * idleFade;
              }
            }
          }

          const smoothedSlice = applySpatialFilter(newSlice);
          if (queue.length > 0) {
            queue.pop();
            queue.unshift(smoothedSlice);
          }
        }
        lastPushTimeRef.current = timestamp - (elapsed % PUSH_INTERVAL_MS);
      }

      // Continuous sub-pixel vertical translation [0, 1]
      const scrollOffset = Math.max(0, Math.min(1.0, (timestamp - lastPushTimeRef.current) / PUSH_INTERVAL_MS));

      // 3. Parallel Baseline Coordinates (Spanning full available width)
      const yHorizon = height * 0.22;
      const yForeground = height * 0.86;
      const maxPeakHeight = height * 0.26;

      // Full-width horizontal baselines without artificial truncation
      const xMargin = width * 0.04;
      const xSpan = width - 2 * xMargin;

      for (let i = 0; i < queue.length; i++) {
        const slice = queue[i];
        if (!slice) continue;

        const t = Math.min(1.0, (i + scrollOffset) / numLines);

        // Uniform vertical spacing with subtle perspective foreshortening
        const yBase = yHorizon + (yForeground - yHorizon) * Math.pow(t, 1.15);

        // Waveform degradation / tapering:
        // At t = 0 (top/point of origin): full amplitude peak
        // As t -> 1 (bottom): smoothly decays down to 0.0 (normal flat line)
        const decayFactor = Math.max(0, Math.pow(Math.cos(t * (Math.PI * 0.5)), 1.35));
        const peakScale = maxPeakHeight * decayFactor;

        const points: { x: number; y: number }[] = [];
        for (let j = 0; j < numPoints; j++) {
          const u = j / (numPoints - 1);
          const px = xMargin + u * xSpan;
          const py = yBase - slice[j] * peakScale;
          points.push({ x: px, y: py });
        }

        if (points.length < 2) continue;

        const firstX = points[0].x;
        const lastX = points[points.length - 1].x;
        const skirtBottom = height + 40 * dpr;

        // Painter's Algorithm: Pure Black Occlusion Mask (#000000)
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

        // Crisp Hairline White Contour Stroke
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < numPoints; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }

        // Luminous active peaks at top, delicate minimalist baselines at bottom
        const strokeAlpha = Math.min(1.0, 0.92 - 0.22 * Math.pow(t, 1.2));
        ctx.strokeStyle = `rgba(255, 255, 255, ${strokeAlpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.7, (0.95 - 0.15 * t) * dpr);
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
        localAudioCtxRef.current.close().catch(() => { });
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

      {/* Top Typography Header */}
      <div className="z-10 pt-8 pb-2 flex flex-col items-center text-center pointer-events-none select-none">
        <h1 className="text-lg md:text-xl font-medium tracking-[0.25em] uppercase text-white/95">{activeTitle}</h1>
        <span className="text-xs font-light tracking-[0.2em] uppercase text-neutral-400 mt-1">{activeArtist}</span>
      </div>

      {/* Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-pointer"
          onClick={togglePlayPause}
          title="Click to toggle playback"
        />
      </div>

      {/* Bottom Transport Controls */}
      <div className="z-10 w-full px-8 pb-6 pt-2 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-3">
        <div className="relative flex flex-col gap-1">
          <div
            ref={progressBarRef}
            onClick={handleScrubberSeek}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={() => setIsHoveringProgress(false)}
            className="group relative w-full h-2 bg-neutral-900 hover:h-2.5 rounded-full cursor-pointer transition-all duration-150 flex items-center"
          >
            <div
              className="h-full bg-neutral-100 rounded-full relative transition-[width] duration-75"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform duration-150" />
            </div>

            {isHoveringProgress && (
              <div
                className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 bg-neutral-800 text-[10px] font-mono text-neutral-200 rounded border border-neutral-700 pointer-events-none"
                style={{ left: `${hoverPosition}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          <div className="flex justify-between text-[11px] font-mono text-neutral-500 px-0.5">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
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

          <div className="flex items-center justify-center gap-3 md:gap-4">
            {/* Previous Track Button */}
            <button
              onClick={handlePrevious}
              disabled={appContext ? (!appContext.downloads || appContext.downloads.length <= 1) : false}
              title="Previous Track"
              aria-label="Previous Track"
              className="w-9 h-9 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white active:scale-90 transition-all duration-150 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-sm"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* Play / Pause Primary Button */}
            <button
              onClick={togglePlayPause}
              disabled={
                appContext
                  ? !appContext.currentTrack && (!appContext.downloads || appContext.downloads.length === 0)
                  : !audioSrc
              }
              aria-label={activeIsPlaying ? 'Pause' : 'Play'}
              title={activeIsPlaying ? 'Pause' : 'Play'}
              className="w-12 h-12 rounded-full bg-white text-black hover:bg-neutral-200 active:scale-95 transition-all duration-150 flex items-center justify-center shadow-lg disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              {activeIsPlaying ? (
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1.5" />
                  <rect x="14" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Next Track Button */}
            <button
              onClick={handleNext}
              disabled={appContext ? (!appContext.downloads || appContext.downloads.length <= 1) : false}
              title="Next Track"
              aria-label="Next Track"
              className="w-9 h-9 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white active:scale-90 transition-all duration-150 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-sm"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 w-1/3">
            <button
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="p-2 text-neutral-400 hover:text-neutral-100 transition-colors active:scale-95 cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <svg className="w-4 h-4 fill-none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-none" stroke="currentColor" viewBox="0 0 24 24">
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