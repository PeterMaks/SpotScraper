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
  /** AnalyserNode smoothing time constant (default: 0.75 for crisp transient attacks) */
  smoothingTimeConstant?: number;
  /** Number of stacked ridgeline slices (authentic CP 1919 default: 80 pulses) */
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
 * Raised cosine taper on boundaries
 * Flat 1.0 in the center plateau
 */
function tukeyWindow(u: number, uMin = 0.20, uMax = 0.80, wTaper = 0.08): number {
  if (u < uMin || u > uMax) return 0;
  if (u < uMin + wTaper) {
    return 0.5 * (1 - Math.cos((Math.PI * (u - uMin)) / wTaper));
  }
  if (u > uMax - wTaper) {
    return 0.5 * (1 - Math.cos((Math.PI * (uMax - u)) / wTaper));
  }
  return 1.0;
}

interface AudioBands {
  subBass: number;
  bass: number;
  mid: number;
  high: number;
}

/**
 * Process raw frequency bins with pre-emphasis G(k) = (k/kMax)^0.65 to equalize
 * treble needles against bass dominance, extract 4 distinct spectral bands,
 * and apply non-linear power sharpening A^2.2 to enforce sharp, acute summits.
 */
function extractAudioBands(rawData: Uint8Array, binCount: number, sampleRate = 44100): AudioBands {
  const binHz = (sampleRate / 2) / binCount;
  const kMax = Math.min(binCount - 1, Math.max(10, Math.floor(12000 / binHz)));

  let subBassSum = 0, subBassCount = 0;
  let bassSum = 0, bassCount = 0;
  let midSum = 0, midCount = 0;
  let highSum = 0, highCount = 0;

  for (let k = 0; k < binCount; k++) {
    const freq = k * binHz;
    if (freq > 14000) break;

    // Frequency-dependent pre-emphasis gain scaling G(k) = (k / kMax)^0.65
    const preEmphasis = Math.pow(Math.min(1.0, Math.max(0.01, k / kMax)), 0.65);
    const normalized = rawData[k] / 255.0;
    // Scale normalized byte value: low frequencies get ~0.65x, highs get up to ~3.8x
    const weightedVal = normalized * (0.65 + 3.15 * preEmphasis);

    if (freq <= 120) {
      subBassSum += weightedVal;
      subBassCount++;
    } else if (freq <= 500) {
      bassSum += weightedVal;
      bassCount++;
    } else if (freq <= 3000) {
      midSum += weightedVal;
      midCount++;
    } else if (freq <= 12000) {
      highSum += weightedVal;
      highCount++;
    }
  }

  const subBassAvg = subBassCount > 0 ? subBassSum / subBassCount : 0;
  const bassAvg = bassCount > 0 ? bassSum / bassCount : 0;
  const midAvg = midCount > 0 ? midSum / midCount : 0;
  const highAvg = highCount > 0 ? highSum / highCount : 0;

  // Power sharpening A_sharp = A^2.2 on normalized amplitudes to enforce acute summits
  return {
    subBass: Math.min(1.0, Math.pow(Math.min(1.0, subBassAvg * 1.35), 2.2)),
    bass: Math.min(1.0, Math.pow(Math.min(1.0, bassAvg * 1.35), 2.2)),
    mid: Math.min(1.0, Math.pow(Math.min(1.0, midAvg * 1.40), 2.2)),
    high: Math.min(1.0, Math.pow(Math.min(1.0, highAvg * 1.45), 2.2)),
  };
}

/**
 * Synthesize a single CP 1919 horizontal slice matching the authentic Unknown Pleasures artwork:
 * - Quiet flat baselines on flanks outside [uMin, uMax]
 * - Resonant mountain peaks across left-center (driven by sub-bass & bass)
 * - Central pyramid towers (driven by low-mid & mid)
 * - Sharp serrated needle spikes across right-center (driven by presence & high-end)
 * - High-frequency procedural craggy serrations (sub-pulse drifting)
 */
function synthesizeSlice(
  numPoints: number,
  phase: number,
  bands: AudioBands | null,
  isAudioActive: boolean
): Float32Array {
  const slice = new Float32Array(numPoints);
  const uMin = 0.20;
  const uMax = 0.80;
  const wTaper = 0.08;

  for (let j = 0; j < numPoints; j++) {
    const u = j / (numPoints - 1);
    const W = tukeyWindow(u, uMin, uMax, wTaper);

    // Outside active region: strictly flat baseline displacement with subtle radio static <= 0.0015
    if (W <= 0.0001) {
      slice[j] = (Math.random() - 0.5) * 0.0015;
      continue;
    }

    const relU = (u - uMin) / (uMax - uMin); // [0, 1] within pulse window

    if (isAudioActive && bands) {
      // 1. Sub-pulse carrier centers matching CP 1919 morphology
      const p1 = Math.exp(-Math.pow((relU - 0.26) / 0.12, 2)) * (bands.subBass * 0.85 + bands.bass * 0.45) * 1.35;
      const p2 = Math.exp(-Math.pow((relU - 0.48) / 0.10, 2)) * (bands.bass * 0.45 + bands.mid * 0.85) * 1.15;
      const p3 = Math.exp(-Math.pow((relU - 0.72) / 0.08, 2)) * (bands.mid * 0.40 + bands.high * 0.90) * 1.40;

      // Signature CP 1919 razor needle spike at relU ~ 0.78
      const pNeedle = Math.exp(-Math.pow((relU - 0.78) / 0.022, 2)) * bands.high * 0.85;

      // High-frequency craggy serrations (jagged needle teeth matching radio scintillation and dispersion)
      const serration =
        (Math.sin(relU * 85 + phase) * 0.5 + 0.5) * (bands.mid * 0.25 + bands.high * 0.35) * 0.38 +
        (Math.sin(relU * 160 - phase * 1.4) * 0.5 + 0.5) * bands.high * 0.24 +
        (Math.sin(relU * 240 + phase * 2.1) * 0.5 + 0.5) * bands.high * 0.12;

      // Subtle resting floor so mountains stay organic during quiet breaks
      const subtleFloor = 
        Math.exp(-Math.pow((relU - 0.26) / 0.12, 2)) * 0.06 +
        Math.exp(-Math.pow((relU - 0.48) / 0.10, 2)) * 0.06 +
        Math.exp(-Math.pow((relU - 0.72) / 0.08, 2)) * 0.08;

      const staticNoise = (Math.random() - 0.5) * 0.002;

      slice[j] = Math.max(0, (p1 + p2 + p3 + pNeedle + serration + subtleFloor) * W + staticNoise);
    } else {
      // Authentic resting CP 1919 pulsar signal with subtle micro-drifts
      const idleP1 = Math.exp(-Math.pow((relU - 0.26) / 0.12, 2)) * 0.42 * (0.85 + 0.15 * Math.sin(phase * 0.65));
      const idleP2 = Math.exp(-Math.pow((relU - 0.48) / 0.10, 2)) * 0.46 * (0.85 + 0.15 * Math.cos(phase * 0.85));
      const idleP3 = Math.exp(-Math.pow((relU - 0.72) / 0.08, 2)) * 0.58 * (0.85 + 0.15 * Math.sin(phase * 1.15));
      const idleNeedle = Math.exp(-Math.pow((relU - 0.78) / 0.022, 2)) * 0.48 * (0.85 + 0.15 * Math.cos(phase * 1.35));

      const idleSerration =
        (Math.sin(relU * 85 + phase * 1.1) * 0.5 + 0.5) * 0.10 +
        (Math.sin(relU * 160 - phase * 1.5) * 0.5 + 0.5) * 0.06 +
        (Math.sin(relU * 240 + phase * 2.0) * 0.5 + 0.5) * 0.03;

      const idleStatic = (Math.random() - 0.5) * 0.002;

      slice[j] = Math.max(0, (idleP1 + idleP2 + idleP3 + idleNeedle + idleSerration) * W + idleStatic);
    }
  }

  return slice;
}

/**
 * JoyDivisionVisualizer
 *
 * Production-grade Web Audio & Canvas visualizer recreating the authentic PSR B1919 / CP 1919
 * pulsar radio data plot from Unknown Pleasures:
 * - 80 dense isometric ridgeline pulses (Harold Craft Jr., 1970 Cornell thesis).
 * - Central Tukey pulse windowing (u in [0.20, 0.80]) with flat quiet baseline flanks.
 * - Decoupled queue cadence (26 Hz) with sub-pixel vertical interpolation for continuous 60/120 FPS waterfall.
 * - Audio spectral pre-emphasis G(k) = (k/kMax)^0.65 and 4-band acute peak sharpening.
 * - Procedural jagged needle harmonics replicating pulsar sub-pulse drifting.
 * - Authentic idle state undulations and painter's algorithm occlusion skirt.
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
  smoothingTimeConstant = 0.75,
  linesCount = 80,
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
  // 1. Initialize FIFO Ridgeline Queue with Authentic Baseline Pulsar Terrain
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const queue: Float32Array[] = [];
    for (let i = 0; i < linesCount; i++) {
      // Pre-populate with cascading idle slices so the plot is immediately full
      const initialPhase = (linesCount - 1 - i) * 0.12;
      const slice = synthesizeSlice(pointsPerLine, initialPhase, null, false);
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
  // 5. Canvas Render Loop: Decoupled Queue Cadence & Sub-Pixel Interpolation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let isRunning = true;
    const PUSH_INTERVAL_MS = 38.5; // ~26 Hz update cadence (within 24-28 Hz specification)

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

      // Extract real-time frequency bands if audio is actively playing
      let audioBands: AudioBands | null = null;
      if (analyser && isAudioPlaying) {
        if (!rawFreqDataRef.current || rawFreqDataRef.current.length !== analyser.frequencyBinCount) {
          rawFreqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(rawFreqDataRef.current);
        const sampleRate = analyser.context?.sampleRate || 44100;
        audioBands = extractAudioBands(rawFreqDataRef.current, analyser.frequencyBinCount, sampleRate);
      }

      // Decoupled FIFO Queue Cadence: push slices at fixed 26 Hz
      if (lastPushTimeRef.current === 0) {
        lastPushTimeRef.current = timestamp;
      }
      const elapsed = timestamp - lastPushTimeRef.current;

      if (elapsed >= PUSH_INTERVAL_MS) {
        const pushes = Math.min(3, Math.floor(elapsed / PUSH_INTERVAL_MS));
        for (let p = 0; p < pushes; p++) {
          phaseRef.current += 0.085;
          const newSlice = synthesizeSlice(numPoints, phaseRef.current, audioBands, isAudioPlaying);
          if (queue.length > 0) {
            queue.pop();
            queue.unshift(newSlice);
          }
        }
        lastPushTimeRef.current = timestamp - (elapsed % PUSH_INTERVAL_MS);
      }

      // Continuous sub-pixel vertical scroll offset [0, 1] for 60/120 FPS fluid motion
      const scrollOffset = Math.max(0, Math.min(1.0, (timestamp - lastPushTimeRef.current) / PUSH_INTERVAL_MS));

      // Isometric Vertical Baseline Pitch: uniform spacing from horizon (top) to foreground (bottom)
      const yTop = height * 0.235;
      const yBottom = height * 0.775;
      const deltaY = (yBottom - yTop) / numLines;
      const maxPeakHeight = height * 0.092; // Maximum peak height towering over adjacent ridges

      // Centered horizontal composition with symmetric 14% margins (uMin=0.20, uMax=0.80)
      const xMargin = width * 0.14;
      const xSpan = width - 2 * xMargin;

      // Sub-pixel snapping offset for razor-sharp 1px hairline rendering
      const lineWidthPx = Math.max(1, Math.round(1.0 * dpr));
      const pixelOffset = lineWidthPx % 2 === 1 ? 0.5 : 0.0;

      // Render lines from back to front (i = 0 is horizon, i = numLines - 1 is foreground)
      for (let i = 0; i < queue.length; i++) {
        const slice = queue[i];
        if (!slice) continue;

        // Sub-pixel continuous vertical translation: yBase(i) = yTop + (i + scrollOffset) * deltaY
        const yBase = yTop + (i + scrollOffset) * deltaY;

        // Foreground baseline settling taper: settle lines into calm baselines near bottom player bar
        const t = i / (numLines - 1);
        const depthFactor = t > 0.86 ? Math.cos(((t - 0.86) / 0.14) * (Math.PI * 0.5)) : 1.0;
        const peakScale = maxPeakHeight * depthFactor;

        const points: { x: number; y: number }[] = [];
        for (let j = 0; j < numPoints; j++) {
          const u = j / (numPoints - 1);
          const px = Math.round(xMargin + u * xSpan) + pixelOffset;
          const py = Math.round(yBase - slice[j] * peakScale) + pixelOffset;
          points.push({ x: px, y: py });
        }

        if (points.length < 2) continue;

        // ---------------------------------------------------------------------
        // Painter's Occlusion Skirt: Solid Black Fill (#000000)
        // Drops deltaY * 1.6 below baseline to occlude all lines behind it
        // ---------------------------------------------------------------------
        const skirtDropY = Math.round(yBase + deltaY * 1.6) + pixelOffset;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < numPoints; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }
        ctx.lineTo(points[numPoints - 1].x, skirtDropY);
        ctx.lineTo(points[0].x, skirtDropY);
        ctx.closePath();

        ctx.fillStyle = '#000000';
        ctx.fill();

        // ---------------------------------------------------------------------
        // Crisp Hairline White Contour Stroke (#ffffff)
        // ---------------------------------------------------------------------
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < numPoints; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = lineWidthPx;
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
      className={`relative w-full max-w-xl mx-auto h-[740px] bg-black text-white flex flex-col justify-between select-none overflow-hidden font-sans border border-neutral-900 rounded-2xl shadow-2xl ${className}`}
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
      <div className="z-10 pt-12 px-8 flex flex-col items-center text-center pointer-events-none select-none">
        <h2 className="text-xl md:text-2xl font-normal text-white tracking-[0.16em] drop-shadow-sm max-w-md truncate">
          {activeTitle}
        </h2>
        <span className="text-sm md:text-base text-neutral-300 font-light tracking-[0.14em] mt-1.5 max-w-md truncate">
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
