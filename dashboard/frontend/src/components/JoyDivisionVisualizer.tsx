import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

export interface TouchDesignerAudioHistogramProps {
  /** Optional audio file URL (supports MP3, WAV, OGG, etc.) */
  audioSrc?: string;
  /** Number of parallel frequency channels across the X-axis (default: 50 from tutorial) */
  channelsCount?: number;
  /** Depth history buffer points along the Z-axis (default: 160 from tutorial) */
  trailPoints?: number;
  /** High frequency boost multiplier to balance treble vs bass (default: 2.2) */
  highFreqBoost?: number;
  /** Flow direction: true = away into depth (-Z), false = cascading forward (+Z) */
  reverseFlow?: boolean;
  /** Enable continuous orbital camera spin */
  autoSpin?: boolean;
  /** Visual theme */
  theme?: 'monochrome' | 'laser-cyan' | 'amber-phosphor' | 'matrix-emerald';
  /** Extra CSS classes */
  className?: string;
}

interface ThemeConfig {
  name: string;
  background: string;
  gridFloor: string;
  strokeBase: (alpha: number) => string;
  peakGlow: string;
  accent: string;
}

const THEMES: Record<string, ThemeConfig> = {
  monochrome: {
    name: 'TouchDesigner Mono',
    background: '#070709',
    gridFloor: 'rgba(255, 255, 255, 0.04)',
    strokeBase: (a) => `rgba(240, 243, 246, ${a})`,
    peakGlow: 'rgba(255, 255, 255, 0.85)',
    accent: '#ffffff',
  },
  'laser-cyan': {
    name: 'Laser Cyan',
    background: '#04090d',
    gridFloor: 'rgba(0, 220, 255, 0.05)',
    strokeBase: (a) => `rgba(30, 225, 255, ${a})`,
    peakGlow: 'rgba(120, 245, 255, 0.95)',
    accent: '#00e5ff',
  },
  'amber-phosphor': {
    name: 'Amber Phosphor',
    background: '#0a0804',
    gridFloor: 'rgba(255, 170, 0, 0.05)',
    strokeBase: (a) => `rgba(255, 175, 40, ${a})`,
    peakGlow: 'rgba(255, 210, 120, 0.95)',
    accent: '#ffaa00',
  },
  'matrix-emerald': {
    name: 'Matrix Emerald',
    background: '#030a05',
    gridFloor: 'rgba(0, 255, 110, 0.05)',
    strokeBase: (a) => `rgba(40, 240, 120, ${a})`,
    peakGlow: 'rgba(140, 255, 180, 0.95)',
    accent: '#00ff73',
  },
};

export const TouchDesignerAudioHistogram: React.FC<TouchDesignerAudioHistogramProps> = ({
  audioSrc,
  channelsCount = 50,
  trailPoints = 160,
  highFreqBoost = 2.2,
  reverseFlow = true,
  autoSpin = true,
  theme = 'monochrome',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Audio nodes
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const synthIntervalRef = useRef<number | null>(null);

  // Animation & Data State
  const animationFrameIdRef = useRef<number | null>(null);
  const rawByteFreqRef = useRef<Uint8Array | null>(null);
  const smoothedBandPeaksRef = useRef<Float32Array>(new Float32Array(channelsCount));

  // 2D Ring Buffer: [timeStep][channelIndex]
  const historyBufferRef = useRef<Float32Array[]>([]);

  // Interactive Parameters
  const [activeTheme, setActiveTheme] = useState<string>(theme);
  const [isSpinning, setIsSpinning] = useState<boolean>(autoSpin);
  const [isReversed, setIsReversed] = useState<boolean>(reverseFlow);
  const [boost, setBoost] = useState<number>(highFreqBoost);
  const [amplitudeGain, setAmplitudeGain] = useState<number>(1.2);
  const [renderMode, setRenderMode] = useState<'ribbons' | 'slices' | 'wireframe'>('wireframe');
  const [audioSourceType, setAudioSourceType] = useState<'file' | 'synth' | 'mic'>('synth');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showInspector, setShowInspector] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(60);

  // Camera State (3D Orbit Viewport)
  const cameraRef = useRef({
    pitch: 0.52, // Angle looking downward (~30 degrees)
    yaw: 0.44,   // Azimuth angle (~25 degrees isometric)
    distance: 720,
    targetX: 0,
    targetY: 60,
    targetZ: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
  });

  // ---------------------------------------------------------------------------
  // 1. Initialize History Buffer (Trail CHOP)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const buffer: Float32Array[] = [];
    for (let t = 0; t < trailPoints; t++) {
      buffer.push(new Float32Array(channelsCount));
    }
    historyBufferRef.current = buffer;
    smoothedBandPeaksRef.current = new Float32Array(channelsCount);
  }, [channelsCount, trailPoints]);

  // ---------------------------------------------------------------------------
  // 2. Audio Engine Setup & Synthesizer Option
  // ---------------------------------------------------------------------------
  const initAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      rawByteFreqRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return { ctx: audioCtxRef.current, analyser: analyserRef.current! };
  }, []);

  // Built-in Synthesizer to test immediately without external audio files
  const startSynthGenerator = useCallback(() => {
    const { ctx, analyser } = initAudioContext();
    if (synthIntervalRef.current) clearInterval(synthIntervalRef.current);

    const synthMaster = ctx.createGain();
    synthMaster.gain.value = 0.18;
    synthMaster.connect(analyser);
    analyser.connect(ctx.destination);

    // Procedural rhythmic chords & sub bass generator
    const chords = [
      [130.81, 196.00, 246.94, 329.63], // C minor 7
      [116.54, 174.61, 220.00, 293.66], // Bb
      [98.00, 146.83, 196.00, 246.94],  // G
      [110.00, 164.81, 220.00, 261.63], // A minor
    ];

    let chordStep = 0;
    const playChordStep = () => {
      if (audioCtxRef.current?.state !== 'running') return;
      const now = ctx.currentTime;
      const currentNotes = chords[chordStep % chords.length];

      // Bass punch
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.frequency.setValueAtTime(140, now);
      kickOsc.frequency.exponentialRampToValueAtTime(32, now + 0.12);
      kickGain.gain.setValueAtTime(0.7, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      kickOsc.connect(kickGain);
      kickGain.connect(synthMaster);
      kickOsc.start(now);
      kickOsc.stop(now + 0.36);

      // Pad tones
      currentNotes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        noteGain.gain.setValueAtTime(0.02, now);
        noteGain.gain.linearRampToValueAtTime(0.12, now + 0.15);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc.connect(noteGain);
        noteGain.connect(synthMaster);
        osc.start(now);
        osc.stop(now + 0.9);
      });

      // Treble rhythmic arp
      for (let a = 0; a < 3; a++) {
        const arpOsc = ctx.createOscillator();
        const arpGain = ctx.createGain();
        const arpTime = now + 0.2 + a * 0.15;
        arpOsc.type = 'sine';
        arpOsc.frequency.setValueAtTime(currentNotes[(a + 1) % currentNotes.length] * 4, arpTime);
        arpGain.gain.setValueAtTime(0.08, arpTime);
        arpGain.gain.exponentialRampToValueAtTime(0.001, arpTime + 0.12);
        arpOsc.connect(arpGain);
        arpGain.connect(synthMaster);
        arpOsc.start(arpTime);
        arpOsc.stop(arpTime + 0.13);
      }

      chordStep++;
    };

    playChordStep();
    synthIntervalRef.current = window.setInterval(playChordStep, 750);
  }, [initAudioContext]);

  const stopSynthGenerator = useCallback(() => {
    if (synthIntervalRef.current) {
      clearInterval(synthIntervalRef.current);
      synthIntervalRef.current = null;
    }
  }, []);

  // Microphone Input
  const activateMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const { ctx, analyser } = initAudioContext();
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect();

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceNodeRef.current = source;
      setIsPlaying(true);
    } catch (err) {
      console.error('Microphone access rejected or unavailable:', err);
    }
  }, [initAudioContext]);

  // Connect Local Audio Element
  const connectAudioElement = useCallback(() => {
    if (!audioElRef.current) return;
    const { ctx, analyser } = initAudioContext();
    if (!sourceNodeRef.current) {
      const source = ctx.createMediaElementSource(audioElRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceNodeRef.current = source;
    }
  }, [initAudioContext]);

  // Master Playback Switch
  const togglePlayback = async () => {
    const { ctx } = initAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    if (audioSourceType === 'synth') {
      if (isPlaying) {
        stopSynthGenerator();
        setIsPlaying(false);
      } else {
        startSynthGenerator();
        setIsPlaying(true);
      }
    } else if (audioSourceType === 'mic') {
      if (isPlaying) {
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        setIsPlaying(false);
      } else {
        await activateMicrophone();
      }
    } else if (audioSourceType === 'file') {
      if (!audioElRef.current) return;
      connectAudioElement();
      if (audioElRef.current.paused) {
        await audioElRef.current.play();
        setIsPlaying(true);
      } else {
        audioElRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 3. TouchDesigner-Style Spectrum Extraction & Peak Analysis [00:10:44]
  // ---------------------------------------------------------------------------
  const processFrequencyBands = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !rawByteFreqRef.current) return;

    analyser.getByteFrequencyData(rawByteFreqRef.current);
    const raw = rawByteFreqRef.current;
    const binCount = raw.length;
    const smoothedPeaks = smoothedBandPeaksRef.current;

    const minHz = 24;
    const maxHz = 16000;
    const nyquist = (audioCtxRef.current?.sampleRate || 44100) / 2;

    for (let c = 0; c < channelsCount; c++) {
      // Logarithmic distribution across spectrum
      const startHz = minHz * Math.pow(maxHz / minHz, c / channelsCount);
      const endHz = minHz * Math.pow(maxHz / minHz, (c + 1) / channelsCount);

      const startBin = Math.max(1, Math.floor((startHz / nyquist) * binCount));
      const endBin = Math.min(binCount - 1, Math.ceil((endHz / nyquist) * binCount));

      // Analyze CHOP: Find peak maximum within each frequency channel [00:10:44]
      let maxVal = 0;
      for (let b = startBin; b <= endBin; b++) {
        if (raw[b] > maxVal) maxVal = raw[b];
      }

      const normalized = maxVal / 255.0;

      // High-Frequency Boost (compensate for 1/f falloff) [00:07:50]
      const tiltMultiplier = 0.8 + Math.pow(c / (channelsCount - 1), 1.25) * boost;
      const targetVal = Math.min(2.5, normalized * tiltMultiplier * amplitudeGain);

      // Fast attack & musical decay filter
      if (targetVal > smoothedPeaks[c]) {
        smoothedPeaks[c] += (targetVal - smoothedPeaks[c]) * 0.85; // snappy attack
      } else {
        smoothedPeaks[c] += (targetVal - smoothedPeaks[c]) * 0.12; // smooth decay
      }
    }

    // Push new time-slice into historical trail queue (Trail CHOP) [00:11:12]
    const buffer = historyBufferRef.current;
    if (buffer.length > 0) {
      const newSlice = new Float32Array(smoothedPeaks);
      buffer.pop();
      buffer.unshift(newSlice);
    }
  }, [channelsCount, boost, amplitudeGain]);

  // ---------------------------------------------------------------------------
  // 4. Full 3D Camera Math & Perspective Projection [00:15:34]
  // ---------------------------------------------------------------------------
  const project3D = useCallback(
    (
      worldX: number,
      worldY: number,
      worldZ: number,
      centerX: number,
      centerY: number
    ): { screenX: number; screenY: number; depth: number } | null => {
      const cam = cameraRef.current;

      // Translate relative to look-at target
      const dx = worldX - cam.targetX;
      const dy = worldY - cam.targetY;
      const dz = worldZ - cam.targetZ;

      // Yaw rotation (horizontal azimuth around Y axis)
      const cosY = Math.cos(cam.yaw);
      const sinY = Math.sin(cam.yaw);
      const x1 = dx * cosY + dz * sinY;
      const z1 = -dx * sinY + dz * cosY;

      // Pitch rotation (tilt angle around X axis)
      const cosP = Math.cos(cam.pitch);
      const sinP = Math.sin(cam.pitch);
      const y2 = dy * cosP - z1 * sinP;
      const z2 = dy * sinP + z1 * cosP;

      // Translate along camera distance
      const camZ = z2 + cam.distance;
      if (camZ <= 40) return null; // Near-plane clipping

      const fov = 750;
      const screenX = centerX + (x1 * fov) / camZ;
      const screenY = centerY - (y2 * fov) / camZ; // Invert Y for canvas space

      return { screenX, screenY, depth: camZ };
    },
    []
  );

  // ---------------------------------------------------------------------------
  // 5. 3D Render Loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let isRunning = true;
    let lastTime = performance.now();
    let frameCounter = 0;

    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    handleResize();

    const render = (now: number) => {
      if (!isRunning) return;

      // Compute FPS telemetry
      frameCounter++;
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCounter * 1000) / (now - lastTime)));
        frameCounter = 0;
        lastTime = now;
      }

      // Update Audio Frequency Trails
      processFrequencyBands();

      // Camera auto-orbit rotation [00:17:29]
      if (isSpinning && !cameraRef.current.isDragging) {
        cameraRef.current.yaw += 0.004;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;

      const activeThemeConfig = THEMES[activeTheme] || THEMES.monochrome;

      // Clear Canvas to Void Background
      ctx.fillStyle = activeThemeConfig.background;
      ctx.fillRect(0, 0, width, height);

      // World Dimensions
      const totalWidth = 620 * dpr; // X span
      const totalDepth = 750 * dpr; // Z span
      const peakMaxHeight = 160 * dpr; // Y amplitude

      const history = historyBufferRef.current;
      const numT = history.length;
      const numC = channelsCount;

      // -------------------------------------------------------------------------
      // Render 3D Ground Plane Reference Grid
      // -------------------------------------------------------------------------
      ctx.strokeStyle = activeThemeConfig.gridFloor;
      ctx.lineWidth = 1 * dpr;

      const gridSpacingX = totalWidth / 10;
      const gridSpacingZ = totalDepth / 10;

      for (let gx = -totalWidth / 2; gx <= totalWidth / 2; gx += gridSpacingX) {
        const pStart = project3D(gx, 0, -totalDepth / 2, cx, cy);
        const pEnd = project3D(gx, 0, totalDepth / 2, cx, cy);
        if (pStart && pEnd) {
          ctx.beginPath();
          ctx.moveTo(pStart.screenX, pStart.screenY);
          ctx.lineTo(pEnd.screenX, pEnd.screenY);
          ctx.stroke();
        }
      }

      for (let gz = -totalDepth / 2; gz <= totalDepth / 2; gz += gridSpacingZ) {
        const pStart = project3D(-totalWidth / 2, 0, gz, cx, cy);
        const pEnd = project3D(totalWidth / 2, 0, gz, cx, cy);
        if (pStart && pEnd) {
          ctx.beginPath();
          ctx.moveTo(pStart.screenX, pStart.screenY);
          ctx.lineTo(pEnd.screenX, pEnd.screenY);
          ctx.stroke();
        }
      }

      // Pre-calculate 3D Grid Coordinates
      // gridPoints[t][c] = screen coordinate & depth
      const gridPoints: Array<Array<{ screenX: number; screenY: number; depth: number } | null>> = [];

      for (let t = 0; t < numT; t++) {
        gridPoints[t] = [];
        const timeFraction = t / (numT - 1);

        // Reverse direction switch (Stretch CHOP) [00:11:59]
        const zNorm = isReversed ? 0.5 - timeFraction : timeFraction - 0.5;
        const worldZ = zNorm * totalDepth;

        const slice = history[t];

        for (let c = 0; c < numC; c++) {
          const cNorm = c / (numC - 1) - 0.5;
          const worldX = cNorm * totalWidth;
          const val = slice ? slice[c] : 0;
          const worldY = val * peakMaxHeight;

          const proj = project3D(worldX, worldY, worldZ, cx, cy);
          gridPoints[t][c] = proj;
        }
      }

      // -------------------------------------------------------------------------
      // Render Z-Ribbons: 50 Parallel Frequency Channels Along Depth [00:02:56]
      // -------------------------------------------------------------------------
      if (renderMode === 'ribbons' || renderMode === 'wireframe') {
        for (let c = 0; c < numC; c++) {
          ctx.beginPath();
          let started = false;

          for (let t = 0; t < numT; t++) {
            const pt = gridPoints[t][c];
            if (!pt) {
              started = false;
              continue;
            }

            if (!started) {
              ctx.moveTo(pt.screenX, pt.screenY);
              started = true;
            } else {
              ctx.lineTo(pt.screenX, pt.screenY);
            }
          }

          // Depth fog attenuation [00:23:45]
          const centerPt = gridPoints[Math.floor(numT / 2)][c];
          const depthVal = centerPt ? centerPt.depth : 700;
          const alphaNorm = Math.max(0.08, Math.min(0.95, 1.25 - depthVal / 1100));

          ctx.strokeStyle = activeThemeConfig.strokeBase(alphaNorm);
          ctx.lineWidth = Math.max(0.75, 1.2 * dpr);
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      // -------------------------------------------------------------------------
      // Render X-Slices: Instantaneous Spectrum Profiles Across Depth
      // -------------------------------------------------------------------------
      if (renderMode === 'slices' || renderMode === 'wireframe') {
        const step = renderMode === 'wireframe' ? 3 : 1; // density balance
        for (let t = 0; t < numT; t += step) {
          ctx.beginPath();
          let started = false;

          for (let c = 0; c < numC; c++) {
            const pt = gridPoints[t][c];
            if (!pt) {
              started = false;
              continue;
            }

            if (!started) {
              ctx.moveTo(pt.screenX, pt.screenY);
              started = true;
            } else {
              ctx.lineTo(pt.screenX, pt.screenY);
            }
          }

          const refPt = gridPoints[t][Math.floor(numC / 2)];
          const depthVal = refPt ? refPt.depth : 700;
          const alphaNorm = Math.max(0.06, Math.min(0.85, 1.15 - depthVal / 1150));

          // Give front edge extra luminescence
          const isFrontSlice = t === 0;
          ctx.strokeStyle = isFrontSlice
            ? activeThemeConfig.peakGlow
            : activeThemeConfig.strokeBase(renderMode === 'wireframe' ? alphaNorm * 0.6 : alphaNorm);
          ctx.lineWidth = isFrontSlice ? 2 * dpr : Math.max(0.65, 0.9 * dpr);
          ctx.stroke();
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(render);
    };

    animationFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      resizeObserver.disconnect();
    };
  }, [
    activeTheme,
    isSpinning,
    isReversed,
    channelsCount,
    renderMode,
    processFrequencyBands,
    project3D,
  ]);

  // ---------------------------------------------------------------------------
  // 6. Interactive 3D Camera Controls (Mouse / Touch Orbit & Zoom)
  // ---------------------------------------------------------------------------
  const handleMouseDown = (e: React.MouseEvent) => {
    cameraRef.current.isDragging = true;
    cameraRef.current.lastMouseX = e.clientX;
    cameraRef.current.lastMouseY = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cameraRef.current.isDragging) return;
    const deltaX = e.clientX - cameraRef.current.lastMouseX;
    const deltaY = e.clientY - cameraRef.current.lastMouseY;

    cameraRef.current.yaw += deltaX * 0.007;
    // Constrain pitch to avoid flipping over pole
    cameraRef.current.pitch = Math.max(0.08, Math.min(Math.PI / 2.1, cameraRef.current.pitch + deltaY * 0.006));

    cameraRef.current.lastMouseX = e.clientX;
    cameraRef.current.lastMouseY = e.clientY;
  };

  const handleMouseUp = () => {
    cameraRef.current.isDragging = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    cameraRef.current.distance = Math.max(380, Math.min(1300, cameraRef.current.distance + e.deltaY * 0.65));
  };

  // Reset Camera to default isometric angle
  const resetCamera = () => {
    cameraRef.current.pitch = 0.52;
    cameraRef.current.yaw = 0.44;
    cameraRef.current.distance = 720;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSynthGenerator();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => { });
      }
    };
  }, [stopSynthGenerator]);

  const themeKeys = useMemo(() => Object.keys(THEMES), []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[650px] md:h-[720px] rounded-2xl overflow-hidden select-none bg-[#070709] border border-neutral-800 text-neutral-200 font-mono shadow-2xl ${className}`}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Hidden Audio Element for Custom Files */}
      {audioSrc && (
        <audio
          ref={audioElRef}
          src={audioSrc}
          crossOrigin="anonymous"
          preload="metadata"
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* 3D WebGL / Canvas Viewport */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        title="Click and drag to orbit camera. Scroll to zoom."
      />

      {/* TouchDesigner HUD: Top Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-neutral-800/80 pointer-events-auto">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: THEMES[activeTheme]?.accent || '#fff' }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-100">
            Audio Histogram <span className="text-neutral-500 font-normal">| 3D Chop Matrix</span>
          </span>
          <span className="text-[10px] text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
            {channelsCount} ch × {trailPoints} z
          </span>
        </div>

        {/* Telemetry Badge */}
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-800/80 text-[11px] text-neutral-400 pointer-events-auto">
          <span>{fps} FPS</span>
          <span className="text-neutral-700">•</span>
          <button
            onClick={() => setShowInspector(!showInspector)}
            className="hover:text-white transition-colors cursor-pointer text-xs"
          >
            {showInspector ? 'Hide UI [-]' : 'Show UI [+]'}
          </button>
        </div>
      </div>

      {/* Floating TouchDesigner Parameter Inspector */}
      {showInspector && (
        <div className="absolute left-4 bottom-20 md:bottom-4 w-72 bg-neutral-950/85 backdrop-blur-md border border-neutral-800/80 rounded-xl p-3.5 text-xs flex flex-col gap-3 shadow-xl transition-all">
          <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400">Parameter CHOP</span>
            <button
              onClick={resetCamera}
              className="text-[10px] text-neutral-400 hover:text-white hover:underline cursor-pointer"
            >
              Reset View
            </button>
          </div>

          {/* Audio Source Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-neutral-400 uppercase">Input Source</label>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => {
                  stopSynthGenerator();
                  setIsPlaying(false);
                  setAudioSourceType('synth');
                }}
                className={`py-1 px-1.5 text-center rounded text-[11px] transition-all cursor-pointer ${audioSourceType === 'synth'
                    ? 'bg-neutral-200 text-black font-semibold'
                    : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                  }`}
              >
                Synth
              </button>
              <button
                onClick={() => {
                  stopSynthGenerator();
                  setIsPlaying(false);
                  setAudioSourceType('mic');
                }}
                className={`py-1 px-1.5 text-center rounded text-[11px] transition-all cursor-pointer ${audioSourceType === 'mic'
                    ? 'bg-neutral-200 text-black font-semibold'
                    : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                  }`}
              >
                Mic
              </button>
              <button
                onClick={() => {
                  stopSynthGenerator();
                  setIsPlaying(false);
                  setAudioSourceType('file');
                }}
                className={`py-1 px-1.5 text-center rounded text-[11px] transition-all cursor-pointer ${audioSourceType === 'file'
                    ? 'bg-neutral-200 text-black font-semibold'
                    : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                  }`}
              >
                File
              </button>
            </div>
          </div>

          {/* Render Mode & Flow Toggles */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-neutral-400 uppercase">Mesh Type</label>
              <select
                value={renderMode}
                onChange={(e) => setRenderMode(e.target.value as 'ribbons' | 'slices' | 'wireframe')}
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-200 outline-none cursor-pointer"
              >
                <option value="wireframe">Full Grid</option>
                <option value="ribbons">Z-Ribbons</option>
                <option value="slices">X-Slices</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-neutral-400 uppercase">Theme</label>
              <select
                value={activeTheme}
                onChange={(e) => setActiveTheme(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-200 outline-none cursor-pointer"
              >
                {themeKeys.map((k) => (
                  <option key={k} value={k}>
                    {THEMES[k].name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sliders: HF Boost & Gain */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-400">HF Boost [00:07:50]</span>
              <span className="text-[10px] text-neutral-300">{boost.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              value={boost}
              onChange={(e) => setBoost(parseFloat(e.target.value))}
              className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-white"
            />

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-400">Peak Gain</span>
              <span className="text-[10px] text-neutral-300">{amplitudeGain.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="2.5"
              step="0.05"
              value={amplitudeGain}
              onChange={(e) => setAmplitudeGain(parseFloat(e.target.value))}
              className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-white"
            />
          </div>

          {/* Toggles: Reverse Flow & Continuous Orbit */}
          <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-neutral-800/80">
            <button
              onClick={() => setIsReversed(!isReversed)}
              className={`py-1 px-2 rounded text-[10px] text-center border transition-all cursor-pointer ${isReversed
                  ? 'bg-neutral-800 text-white border-neutral-600'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              title="Reverse trail direction along Z [00:11:59]"
            >
              Flow: {isReversed ? 'Away (-Z)' : 'Near (+Z)'}
            </button>

            <button
              onClick={() => setIsSpinning(!isSpinning)}
              className={`py-1 px-2 rounded text-[10px] text-center border transition-all cursor-pointer ${isSpinning
                  ? 'bg-neutral-800 text-white border-neutral-600'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              title="Continuous camera spin [00:17:29]"
            >
              Spin: {isSpinning ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}

      {/* Floating Center-Bottom Master Transport Button */}
      <div className="absolute bottom-5 right-5 flex items-center gap-3">
        <button
          onClick={togglePlayback}
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white text-black font-semibold text-xs hover:bg-neutral-200 active:scale-95 transition-all shadow-xl cursor-pointer"
        >
          {isPlaying ? (
            <>
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              <span>Stop Audio</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Start {audioSourceType === 'synth' ? 'Synth' : audioSourceType === 'mic' ? 'Mic' : 'Audio'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default TouchDesignerAudioHistogram;