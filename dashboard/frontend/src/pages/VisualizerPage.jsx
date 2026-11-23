import { useState } from 'react';
import { useAppContext } from '../AppContext';
import JoyDivisionVisualizer from '../components/JoyDivisionVisualizer';

export default function VisualizerPage() {
  const { downloads, currentTrack, handlePlayTrack } = useAppContext();
  const [error, setError] = useState('');
  const tracks = downloads.filter(d => /\.(mp3|m4a|flac|wav|ogg|aac|opus)$/i.test(d.name));
  const openFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|flac|wav|ogg|aac|opus)$/i.test(file.name)) {
      setError('Choose a supported audio file.'); return;
    }
    setError('');
    handlePlayTrack({ name: file.name, title: file.name.replace(/\.[^.]+$/, ''), artist: 'Local audio', url: URL.createObjectURL(file), local: true });
    e.target.value = '';
  };
  return <div className="w-full max-w-[1440px] mx-auto space-y-5 pb-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Listening room</p><h2 className="text-2xl font-medium tracking-tight">Visualizer</h2></div>
      <div className="flex flex-wrap gap-3 items-center">
        <select aria-label="Library track" value={currentTrack?.local ? '' : currentTrack?.name || ''} onChange={e => { const track = tracks.find(t => t.name === e.target.value); if (track) handlePlayTrack(track); }} className="bg-background border border-border rounded-lg px-3 py-2 text-sm max-w-[240px]">
          <option value="">Choose from library</option>{tracks.map(t => <option key={t.name} value={t.name}>{t.title || t.name}</option>)}
        </select>
        <label className="relative cursor-pointer bg-foreground text-background rounded-lg px-4 py-2 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">Open audio file<input aria-label="Open audio file" type="file" accept="audio/*,.flac,.opus" onChange={openFile} className="absolute inset-0 opacity-0 w-full cursor-pointer" /></label>
      </div>
    </header>
    {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
    <JoyDivisionVisualizer />
    <p className="text-xs text-muted-foreground">Any track played in SpotScraper follows you here. Local files play on this device only; nothing is uploaded.</p>
  </div>;
}
