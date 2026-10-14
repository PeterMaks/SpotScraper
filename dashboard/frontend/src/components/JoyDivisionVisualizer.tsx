import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import Icons from './Icons';
import { useAppContext } from '../AppContext';

/* ---- self-contained waterfall engine ---- */
const POINTS = 280;          // high horizontal resolution for sharp right-side needles + smooth left hills
const MAX_LINES = 210;       // full stack depth once grown to the bottom
const INITIAL_LINES = 28;    // initial horizon band before growing downward
const PUSH_HZ = 45;          // new slices per second
const TOP = 0.56;            // baseline of the newest slice (fraction of stage height)
const AMP = 0.185;           // peak height as fraction of stage height
const SETTLE = 0.0055;       // global per-row amplitude decay with depth
const INK = '242,245,248';

const fmt = (n) =>
  Number.isFinite(n)
    ? `${Math.floor(n / 60)}:${Math.floor(n % 60).toString().padStart(2, '0')}`
    : '0:00';

// Catmull-Rom spline interpolation for smooth low-frequency hills across sparse FFT bins
function sampleCubic(arr, binIndex, maxBin) {
  const i1 = Math.max(1, Math.min(maxBin - 1, Math.floor(binIndex)));
  const t = binIndex - i1;
  const i0 = Math.max(1, i1 - 1);
  const i2 = Math.min(maxBin - 1, i1 + 1);
  const i3 = Math.min(maxBin - 1, i1 + 2);
  const y0 = arr[i0], y1 = arr[i1], y2 = arr[i2], y3 = arr[i3];
  const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const a2 = -0.5 * y0 + 0.5 * y2;
  const a3 = y1;
  return Math.max(0, ((a0 * t + a1) * t + a2) * t + a3);
}

function buildFrequencyMap(sampleRate, bins) {
  const nyquist = sampleRate / 2;
  const fMin = 32;
  const fMax = Math.min(14500, nyquist * 0.92);
  const exactBins = new Float32Array(POINTS);
  const binStart = new Int32Array(POINTS);
  const binEnd = new Int32Array(POINTS);

  for (let i = 0; i < POINTS; i++) {
    const u = i / (POINTS - 1);
    // Slight warp gives bass & low-mids generous horizontal room on the left
    const f = fMin * Math.pow(fMax / fMin, Math.pow(u, 1.06));
    exactBins[i] = Math.max(1, Math.min(bins - 2, (f / nyquist) * bins));
  }

  for (let i = 0; i < POINTS; i++) {
    const b0 = exactBins[i];
    const b1 = i < POINTS - 1 ? exactBins[i + 1] : b0 + 1;
    binStart[i] = Math.max(1, Math.floor(b0));
    binEnd[i] = Math.min(bins - 1, Math.max(binStart[i] + 1, Math.ceil(b1)));
  }

  return { exactBins, binStart, binEnd };
}

function createInitialStack() {
  const stack = [];
  for (let i = 0; i < INITIAL_LINES; i++) {
    stack.push(new Float32Array(POINTS));
  }
  return stack;
}

export default function JoyDivisionVisualizer() {
  const {
    currentTrack,
    downloads,
    audioRef,
    isPlaying,
    setIsPlaying,
    volume,
    handleVolumeChange,
    handlePlayTrack,
    handlePlayNext,
    handlePlayPrev,
    getAnalyserNode,
  } = useAppContext();

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [frozen, setFrozen] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const frozenRef = useRef(frozen);
  const slicesRef = useRef(createInitialStack());
  const analyserGetter = useRef(getAnalyserNode);

  useEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);

  useEffect(() => {
    analyserGetter.current = getAnalyserNode;
  }, [getAnalyserNode]);

  useEffect(() => {
    slicesRef.current = createInitialStack();
  }, [currentTrack]); // regrow the stack from the initial horizon band per track

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => {
      setPosition(audio.currentTime);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setMuted(audio.muted);
    };
    const failed = () =>
      setError('This audio format could not be played. Try MP3, WAV, OGG or a browser-supported file.');
    const loaded = () => {
      setError('');
      sync();
    };
    sync();
    audio.addEventListener('timeupdate', sync);
    audio.addEventListener('loadedmetadata', loaded);
    audio.addEventListener('volumechange', sync);
    audio.addEventListener('error', failed);
    return () => {
      audio.removeEventListener('timeupdate', sync);
      audio.removeEventListener('loadedmetadata', loaded);
      audio.removeEventListener('volumechange', sync);
      audio.removeEventListener('error', failed);
    };
  }, [audioRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = 1,
      height = 1,
      dpr = 1,
      raf = 0,
      lastPush = 0,
      frac = 0;
    let raw = new Uint8Array(0);
    let fmap = null;

    const sm = new Float32Array(POINTS);      // temporally smoothed spectrum
    const target = new Float32Array(POINTS);  // current frame's shaped spectrum
    const rawMag = new Float32Array(POINTS);  // pre-contrast magnitude
    const scratch = new Float32Array(POINTS); // diffusion scratch buffer
    const ys = new Float32Array(POINTS);
    const xs = new Float32Array(POINTS);

    // Precompute frequency-dependent parameters across the horizontal axis
    const uNorm = new Float32Array(POINTS);
    const edgeWindow = new Float32Array(POINTS);
    const attackRate = new Float32Array(POINTS);
    const releaseRate = new Float32Array(POINTS);
    const diffAlpha = new Float32Array(POINTS);
    const stepDecay = new Float32Array(POINTS);

    for (let i = 0; i < POINTS; i++) {
      const u = i / (POINTS - 1);
      uNorm[i] = u;

      // Keep the very left and right borders anchored near the baseline
      let win = 1;
      if (u < 0.045) win = Math.sin((u / 0.045) * (Math.PI / 2));
      else if (u > 0.96) win = 0.35 + 0.65 * Math.cos(((u - 0.96) / 0.04) * (Math.PI / 2));
      edgeWindow[i] = win;

      // Bass has smooth multi-row sustain (creating caustic ribbons); highs have snappy transients
      attackRate[i] = 0.65 + 0.25 * u;
      releaseRate[i] = 0.15 + 0.14 * u;

      // High frequencies diffuse and decay rapidly with depth; low frequencies travel deep down
      diffAlpha[i] = 0.16 + 0.52 * Math.pow(u, 1.3);
      stepDecay[i] = 0.993 - 0.024 * Math.pow(u, 1.5);
    }

    const resize = () => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      for (let i = 0; i < POINTS; i++) xs[i] = (i / (POINTS - 1)) * width;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    // Evolve existing slices by one step of frequency-weighted diffusion + decay
    const ageSlices = (slices) => {
      for (let r = 0; r < slices.length; r++) {
        const row = slices[r];
        for (let i = 0; i < POINTS; i++) {
          const prev = row[i > 0 ? i - 1 : 0];
          const curr = row[i];
          const next = row[i < POINTS - 1 ? i + 1 : POINTS - 1];
          const a = diffAlpha[i];
          scratch[i] = ((1 - a) * curr + 0.5 * a * (prev + next)) * stepDecay[i];
        }
        // Extra low-frequency smoothing pass on deeper rows so the bottom half settles cleanly
        if (r > 35) {
          for (let i = 0; i < POINTS; i++) {
            const prev = scratch[i > 0 ? i - 1 : 0];
            const curr = scratch[i];
            const next = scratch[i < POINTS - 1 ? i + 1 : POINTS - 1];
            row[i] = 0.25 * prev + 0.5 * curr + 0.25 * next;
          }
        } else {
          row.set(scratch);
        }
      }
    };

    const draw = (now) => {
      const slices = slicesRef.current;
      const cadence = 1000 / PUSH_HZ;
      const audio = audioRef.current;
      const live = !frozenRef.current && !!audio && !audio.paused;

      if (live && now - lastPush >= cadence) {
        const analyser = analyserGetter.current();
        if (analyser) {
          if (analyser.fftSize < 2048) {
            try {
              analyser.fftSize = 2048;
              analyser.smoothingTimeConstant = 0.25;
            } catch {
              // ignore if analyser is locked
            }
          }
          if (raw.length !== analyser.frequencyBinCount) {
            raw = new Uint8Array(analyser.frequencyBinCount);
            fmap = buildFrequencyMap(analyser.context.sampleRate, analyser.frequencyBinCount);
          }

          analyser.getByteFrequencyData(raw);
          const { exactBins, binStart, binEnd } = fmap;
          const maxBin = raw.length - 1;

          // 1. Sample spectrum: cubic spline on low bins (left), peak picking on dense high bins (right)
          for (let i = 0; i < POINTS; i++) {
            const u = uNorm[i];
            const span = binEnd[i] - binStart[i];
            let v = 0;

            if (span <= 1 && u < 0.55) {
              v = sampleCubic(raw, exactBins[i], maxBin) / 255;
            } else {
              let peak = 0;
              let sum = 0;
              for (let b = binStart[i]; b <= binEnd[i]; b++) {
                const val = raw[b];
                if (val > peak) peak = val;
                sum += val;
              }
              const mean = sum / (span + 1);
              v = (peak * 0.85 + mean * 0.15) / 255;
            }

            // Gate ambient dB floor and convert logarithmic dB toward linear energy
            const gated = Math.max(0, (v - 0.12) / 0.88);
            const tilt = 0.62 + 0.85 * Math.pow(u, 0.8);
            rawMag[i] = Math.pow(gated, 2.35) * tilt;
          }

          // 2. Enhance high-frequency needle prominence by subtracting a portion of the local floor
          for (let i = 0; i < POINTS; i++) {
            const u = uNorm[i];
            let sum = 0,
              count = 0;
            const radius = 8;
            for (let k = Math.max(0, i - radius); k <= Math.min(POINTS - 1, i + radius); k++) {
              sum += rawMag[k];
              count++;
            }
            const localFloor = sum / count;
            // Left keeps full broad wave body; right emphasizes sharp spikes above the horizon
            const floorWeight = 0.72 * Math.pow(u, 1.15);
            const prominent = Math.max(0, rawMag[i] - localFloor * floorWeight);
            const gain = 1.35 + 0.95 * Math.pow(u, 1.2);
            target[i] = Math.min(1, prominent * gain * edgeWindow[i]);
          }

          // 3. Smooth only the low/mid frequencies horizontally so the right-side needles stay razor-sharp
          for (let pass = 0; pass < 2; pass++) {
            for (let i = 1; i < POINTS - 1; i++) {
              const lowWeight = Math.max(0, 1 - uNorm[i] * 1.85);
              if (lowWeight > 0) {
                const smoothed = 0.25 * target[i - 1] + 0.5 * target[i] + 0.25 * target[i + 1];
                target[i] = target[i] * (1 - lowWeight) + smoothed * lowWeight;
              }
            }
          }

          // 4. Temporal envelope + age existing stack + push newest slice at the horizon
          for (let i = 0; i < POINTS; i++) {
            const rate = target[i] > sm[i] ? attackRate[i] : releaseRate[i];
            sm[i] += (target[i] - sm[i]) * rate;
          }

          ageSlices(slices);
          slices.unshift(Float32Array.from(sm));
          if (slices.length > MAX_LINES) slices.length = MAX_LINES;
          lastPush = now;
        }
      }
      if (live) frac = Math.min(1, (now - lastPush) / cadence);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      const spacing = (height * (1 - TOP)) / (MAX_LINES - 1);
      const baseY = height * TOP + frac * spacing;
      const scale = height * AMP;
      ctx.lineWidth = 0.68;
      ctx.lineJoin = 'round';

      for (let r = 0; r < slices.length; r++) {
        const vals = slices[r];
        const depthNorm = r / MAX_LINES;
        // Settle amplitude with depth and guarantee flat horizontal lines at the very bottom
        const amp = Math.exp(-r * SETTLE) * Math.max(0, 1 - Math.pow(depthNorm, 2.2));
        const y0 = baseY + r * spacing;

        for (let i = 0; i < POINTS; i++) {
          ys[i] = y0 - vals[i] * scale * amp;
        }

        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < POINTS; i++) {
          ctx.lineTo(xs[i], ys[i]);
        }
        const alpha = (0.92 - 0.36 * depthNorm).toFixed(3);
        ctx.strokeStyle = `rgba(${INK},${alpha})`;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    const visibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        lastPush = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [audioRef]);

  const toggle = async () => {
    if (!currentTrack) {
      const first = downloads.find((d) => /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(d.name));
      if (first) handlePlayTrack(first);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        getAnalyserNode();
        await audio.play();
        setIsPlaying(true);
        setError('');
      } catch {
        setError('Playback could not start. Choose a supported audio file and try again.');
      }
    }
  };

  const title =
    currentTrack?.title || currentTrack?.name?.replace(/\.[^.]+$/, '') || 'Your music, in motion';
  const artist = currentTrack?.artist || (currentTrack ? 'Local audio' : 'Choose a song to begin');

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-background text-foreground"
      aria-label="Audio visualizer"
    >
      <div
        ref={stageRef}
        className="relative h-[clamp(380px,62vh,720px)] overflow-hidden bg-black text-white"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          aria-label="Waterfall spectrum contours"
        />
        <div className="absolute top-[20%] left-[6%] right-[6%] text-center pointer-events-none">
          <h1 className="text-2xl sm:text-4xl font-light tracking-[0.025em] break-words">
            {title}
          </h1>
          <p className="mt-2 text-lg sm:text-2xl font-light text-white/90">{artist}</p>
        </div>
      </div>
      <div className="px-5 py-4 bg-background/80">
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span>{fmt(position)}</span>
          <input
            aria-label="Seek"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(position, duration)}
            disabled={!duration}
            onChange={(e) => {
              audioRef.current.currentTime = Number(e.target.value);
              setPosition(Number(e.target.value));
            }}
            className="flex-1 min-w-0 accent-primary"
          />
          <span>{fmt(duration)}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Universal player · {isPlaying ? 'Playing' : 'Paused'}
          </span>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="press-scale rounded-full"
              aria-label="Previous track"
              onClick={handlePlayPrev}
            >
              <Icons.SkipBack className="size-5" />
            </Button>
            <Button
              size="icon"
              className="press-scale size-11 rounded-full bg-primary text-primary-foreground shadow-lg"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={toggle}
            >
              {isPlaying ? (
                <Icons.Pause className="size-5" />
              ) : (
                <Icons.Play className="size-5 translate-x-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="press-scale rounded-full"
              aria-label="Next track"
              onClick={handlePlayNext}
            >
              <Icons.SkipForward className="size-5" />
            </Button>
          </div>
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              className="press-scale rounded-lg text-xs"
              onClick={() => setFrozen(!frozen)}
              aria-pressed={frozen}
            >
              {frozen ? 'Resume motion' : 'Freeze motion'}
            </Button>
            <Button
              variant="outline"
              className="press-scale rounded-lg text-xs"
              onClick={() => {
                const el = audioRef.current;
                if (el) {
                  el.muted = !el.muted;
                  setMuted(el.muted);
                }
              }}
            >
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 accent-primary"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}