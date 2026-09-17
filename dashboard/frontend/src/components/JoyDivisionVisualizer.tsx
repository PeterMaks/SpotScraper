import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import Icons from './Icons';
import { useAppContext } from '../AppContext';
import { projectPoint, spectrumSlice, interpolateContour, pushHistorySlice, waveContour, referenceContour, blendHistory, referenceSpectrum } from '../visualizer-engine.mjs';

const DEFAULTS = { theme: 'monochrome', gain: 1.2, boost: 2.2, lines: 100, speed: 32, mode: 'slices', reverse: false, shape: 'reference', cycles: 5, settling: 2.4, softness: 0.85 };
const COLORS: Record<string, string> = { monochrome: '240,243,246', cyan: '30,225,255', amber: '255,175,40', emerald: '40,240,120' };
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('spotscraper.visualizer.v2') || '{}');
    return { ...DEFAULTS, ...saved, theme: COLORS[saved.theme] ? saved.theme : 'monochrome',
      gain: Math.max(0.4, Math.min(2.5, Number(saved.gain) || 1.2)),
      boost: Math.max(0.5, Math.min(5, Number(saved.boost) || 2.2)),
      lines: Math.max(40, Math.min(160, Number(saved.lines) || 100)),
      speed: Math.max(15, Math.min(60, Number(saved.speed) || 32)),
      shape: saved.shape === 'spectrum' ? 'spectrum' : saved.shape === 'waves' ? 'waves' : 'reference',
      softness: Math.max(0.35, Math.min(2, Number(saved.softness) || 0.85)),
      cycles: Math.max(2, Math.min(10, Number(saved.cycles) || 5)),
      settling: Math.max(1, Math.min(6, Number(saved.settling) || 2.4)),
      mode: ['slices', 'ribbons', 'wireframe'].includes(saved.mode) ? saved.mode : 'slices' };
  } catch { return DEFAULTS; }
}
const time = (n: number) => Number.isFinite(n) ? `${Math.floor(n / 60)}:${Math.floor(n % 60).toString().padStart(2, '0')}` : '0:00';

export default function JoyDivisionVisualizer() {
  const { currentTrack, downloads, audioRef, isPlaying, setIsPlaying, volume, handleVolumeChange,
    handlePlayTrack, handlePlayNext, handlePlayPrev, getAnalyserNode } = useAppContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(true);
  const [frozen, setFrozen] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const historyRef = useRef<Float32Array[]>([]);
  const settingsRef = useRef(settings);
  const frozenRef = useRef(frozen);
  const analyserGetter = useRef(getAnalyserNode);
  useEffect(() => { settingsRef.current = settings; try { localStorage.setItem('spotscraper.visualizer.v2', JSON.stringify(settings)); } catch { /* private mode */ } }, [settings]);
  useEffect(() => { frozenRef.current = frozen; }, [frozen]);
  useEffect(() => { analyserGetter.current = getAnalyserNode; }, [getAnalyserNode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => { setPosition(audio.currentTime); setDuration(Number.isFinite(audio.duration) ? audio.duration : 0); setMuted(audio.muted); };
    const failed = () => setError('This audio format could not be played. Try MP3, WAV, OGG or a browser-supported file.');
    const loaded = () => { setError(''); sync(); };
    sync();
    audio.addEventListener('timeupdate', sync);
    audio.addEventListener('loadedmetadata', loaded);
    audio.addEventListener('volumechange', sync);
    audio.addEventListener('error', failed);
    return () => { audio.removeEventListener('timeupdate', sync); audio.removeEventListener('loadedmetadata', loaded); audio.removeEventListener('volumechange', sync); audio.removeEventListener('error', failed); };
  }, [audioRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let width = 1, height = 1, dpr = 1, raf = 0, lastPush = 0, blend = 0;
    let raw = new Uint8Array(0);
    const smooth = new Float32Array(50);
    const resize = () => {
      width = stage.clientWidth; height = stage.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    };
    const observer = new ResizeObserver(resize); observer.observe(stage); resize();
    const draw = (now: number) => {
      const s = settingsRef.current;
      const history = historyRef.current;
      while (history.length < s.lines) history.push(new Float32Array(50));
      history.length = s.lines;
      const cadence = 1000 / s.speed;
      if (!frozenRef.current && now - lastPush >= cadence) {
        const audio = audioRef.current;
        // Never construct a second audio element or capture another app's audio.
        const analyser = audio && !audio.paused ? analyserGetter.current() : null;
        let next = new Float32Array(50);
        if (analyser) {
          if (raw.length !== analyser.frequencyBinCount) raw = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(raw);
          next = (s.shape === 'reference' ? referenceSpectrum : spectrumSlice)(raw, analyser.context.sampleRate, 50, s.boost, s.gain);
        }
        for (let i = 0; i < 50; i++) smooth[i] += (next[i] - smooth[i]) * (next[i] > smooth[i] ? 0.85 : 0.12);
        pushHistorySlice(history, smooth, 1, 1.2);
        lastPush = now;
      }
      if (!frozenRef.current) blend = Math.min(1, (now - lastPush) / cadence);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
      const color = COLORS[s.theme] || COLORS.monochrome;
      const rows = history.map((_, row) => {
        const slice = blendHistory(history, s.reverse ? history.length - 1 - row : row, blend);
        const age = (s.reverse ? history.length - 1 - row : row) / Math.max(1, history.length - 1);
        const contour = s.shape === 'reference' ? referenceContour(slice, age, 1.6, s.softness, s.settling)
          : s.shape === 'waves' ? waveContour(slice, age, 2, s.cycles, s.settling)
          : interpolateContour(slice).map(v => v * Math.exp(-age * s.settling));
        return Array.from(contour, (v, c) => projectPoint(c / (contour.length - 1), row / Math.max(1, history.length - 1), v, width, height));
      });
      if (s.mode !== 'ribbons') {
        rows.forEach((points, row) => {
          ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
          // Fine contours without opaque skirts: layered traces like the reference.
          ctx.strokeStyle = `rgba(${color},${0.28 + row / rows.length * 0.48})`;
          ctx.lineWidth = 0.65; ctx.stroke();
        });
      }
      if (s.mode !== 'slices') {
        for (let c = 0; c < 50; c++) {
          ctx.beginPath(); rows.forEach((row, i) => i ? ctx.lineTo(row[c * 4].x, row[c * 4].y) : ctx.moveTo(row[c * 4].x, row[c * 4].y));
          ctx.strokeStyle = `rgba(${color},${s.mode === 'ribbons' ? 0.7 : 0.22})`; ctx.lineWidth = 0.6; ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    const visibility = () => { cancelAnimationFrame(raf); if (!document.hidden) { lastPush = performance.now(); raf = requestAnimationFrame(draw); } };
    document.addEventListener('visibilitychange', visibility); visibility();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [audioRef]);

  const toggle = async () => {
    if (!currentTrack) { const first = downloads.find((d: {name: string}) => /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(d.name)); if (first) handlePlayTrack(first); return; }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); setIsPlaying(false); }
    else { try { getAnalyserNode(); await audio.play(); setIsPlaying(true); setError(''); } catch { setError('Playback could not start. Choose a supported audio file and try again.'); } }
  };
  const title = currentTrack?.title || currentTrack?.name?.replace(/\.[^.]+$/, '') || 'Your music, in motion';
  const artist = currentTrack?.artist || (currentTrack ? 'Local audio' : 'Choose a song to begin');
  const button = 'press-scale rounded-lg text-xs';

  return <section className="overflow-hidden rounded-2xl border border-border bg-background text-foreground" aria-label="Audio visualizer">
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Signal / spectrum history</span>
      <div className="flex gap-2"><Button variant="outline" className={button} onClick={() => setFrozen(!frozen)} aria-pressed={frozen}>{frozen ? 'Resume motion' : 'Freeze motion'}</Button><Button variant="outline" className={button} aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>Settings</Button></div>
    </div>
    <div ref={stageRef} className="relative h-[clamp(380px,62vh,720px)] overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label="Fixed-view audio-reactive spectrum contours" />
      <div className="absolute top-[12%] left-[6%] right-[6%] text-center pointer-events-none">
        <h1 className="text-2xl sm:text-4xl font-light tracking-[0.025em] break-words">{title}</h1>
        <p className="mt-2 text-lg sm:text-2xl font-light text-white/65">{artist}</p>
      </div>
    </div>
    <div className="px-5 py-4 border-t border-border bg-background/80">
      <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums"><span>{time(position)}</span><input aria-label="Seek" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(position, duration)} disabled={!duration} onChange={e => { audioRef.current.currentTime = Number(e.target.value); setPosition(Number(e.target.value)); }} className="flex-1 min-w-0 accent-primary" /><span>{time(duration)}</span></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Universal player · {isPlaying ? 'Playing' : 'Paused'}</span>
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="press-scale rounded-full" aria-label="Previous track" onClick={handlePlayPrev}><Icons.SkipBack className="size-5" /></Button><Button size="icon" className="press-scale size-11 rounded-full bg-primary text-primary-foreground shadow-lg" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={toggle}>{isPlaying ? <Icons.Pause className="size-5" /> : <Icons.Play className="size-5 translate-x-0.5" />}</Button><Button variant="ghost" size="icon" className="press-scale rounded-full" aria-label="Next track" onClick={handlePlayNext}><Icons.SkipForward className="size-5" /></Button></div>
        <div className="flex gap-2 items-center"><Button variant="outline" className={button} onClick={() => { const el = audioRef.current; if (el) { el.muted = !el.muted; setMuted(el.muted); } }}>{muted ? 'Unmute' : 'Mute'}</Button><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} className="w-20 accent-primary" /></div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    </div>
    {showSettings && <div className="p-5 border-t border-border grid grid-cols-2 lg:grid-cols-4 gap-5 text-xs bg-card">
      <label className="flex flex-col gap-2">Theme<select className="bg-background text-foreground border border-input rounded-lg p-2" value={settings.theme} onChange={e => setSettings({ ...settings, theme: e.target.value })}>{Object.keys(COLORS).map(k => <option key={k}>{k}</option>)}</select></label>
      <label className="flex flex-col gap-2">Wave shape<select className="bg-background text-foreground border border-input rounded-lg p-2" value={settings.shape} onChange={e => setSettings({ ...settings, shape: e.target.value })}><option value="reference">Reference / organic waves</option><option value="waves">Damped sine waves</option><option value="spectrum">Spectrum ridges</option></select></label>
      <label className="flex flex-col gap-2">Contour mode<select className="bg-background text-foreground border border-input rounded-lg p-2" value={settings.mode} onChange={e => setSettings({ ...settings, mode: e.target.value })}><option value="slices">Reference / slices</option><option value="ribbons">Ribbons</option><option value="wireframe">Wireframe</option></select></label>
      {([{ key: 'boost', label: 'HF boost', min: 0.5, max: 5, step: 0.1 }, { key: 'gain', label: 'Peak gain', min: 0.4, max: 2.5, step: 0.1 }, { key: 'lines', label: 'History lines', min: 40, max: 160, step: 1 }, { key: 'speed', label: 'Flow speed', min: 15, max: 60, step: 1 }, { key: 'softness', label: 'Wave roundness', min: 0.35, max: 2, step: 0.05 }, { key: 'cycles', label: 'Sine frequency', min: 2, max: 10, step: 0.5 }, { key: 'settling', label: 'Wave settling', min: 1, max: 6, step: 0.1 }] as const).filter(p => p.key === 'cycles' ? settings.shape === 'waves' : p.key === 'softness' ? settings.shape === 'reference' : true).map(p => <label key={p.key} className="flex flex-col gap-3">{p.label} · {settings[p.key]}<input type="range" min={p.min} max={p.max} step={p.step} value={settings[p.key]} onChange={e => setSettings({ ...settings, [p.key]: Number(e.target.value) })} className="w-full accent-primary" /></label>)}
      <Button variant="outline" className={button} onClick={() => setSettings({ ...settings, reverse: !settings.reverse })}>Flow: {settings.reverse ? 'Away' : 'Forward'}</Button>
      <Button variant="outline" className={button} onClick={() => setSettings(DEFAULTS)}>Reset settings</Button>
      <p className="col-span-2 lg:col-span-4 text-muted-foreground">Fixed camera · settings saved on this device · visualizes the same audio playing throughout SpotScraper</p>
    </div>}
  </section>;
}
