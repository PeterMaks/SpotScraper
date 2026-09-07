import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import JoyDivisionVisualizer from '../components/JoyDivisionVisualizer';
import Icons from '../components/Icons';

export default function VisualizerPage() {
  const { downloads, currentTrack, handlePlayTrack, handlePlayNext, backendUrl } = useAppContext();
  const [selectedTrack, setSelectedTrack] = useState(null);

  const audioTracks = (downloads || []).filter(d => /\.(mp3|m4a|flac|wav|ogg|aac)$/i.test(d.name));

  useEffect(() => {
    if (currentTrack) {
      setSelectedTrack(currentTrack);
    } else if (audioTracks.length > 0 && !selectedTrack) {
      const disorder = audioTracks.find(d => d.name.toLowerCase().includes('disorder'));
      const blueMonday = audioTracks.find(d => d.name.toLowerCase().includes('blue monday'));
      setSelectedTrack(disorder || blueMonday || audioTracks[0]);
    }
  }, [currentTrack, downloads]);

  const cleanName = (currentTrack || selectedTrack)?.name ? (currentTrack || selectedTrack).name.replace(/\.[^/.]+$/, '') : 'Disorder';
  const trackTitle = (currentTrack || selectedTrack)?.title || cleanName;
  const artistName = (currentTrack || selectedTrack)?.artist && (currentTrack || selectedTrack).artist !== 'Unknown Artist' && (currentTrack || selectedTrack).artist !== 'Unknown (Local Cache)'
    ? (currentTrack || selectedTrack).artist
    : (cleanName.toLowerCase().includes('disorder') ? 'Joy Division' : ((currentTrack || selectedTrack)?.artist || 'Joy Division'));
  const activeTrackName = (currentTrack || selectedTrack)?.name || '';
  const audioSrc = activeTrackName ? `${backendUrl}/api/downloads/file/${encodeURIComponent(activeTrackName)}` : '';
  const albumArtUrl = activeTrackName ? `${backendUrl}/api/downloads/art/${encodeURIComponent(activeTrackName)}` : '';

  return (
    <div className="min-h-screen py-4 flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* Top Track Selection Pill */}
      {audioTracks.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <div className="flex items-center gap-2 bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-full px-3 py-1.5 shadow-lg">
            <Icons.Music className="size-3.5 text-neutral-400" />
            <select
              value={activeTrackName}
              onChange={(e) => {
                const found = audioTracks.find(d => d.name === e.target.value);
                if (found) {
                  setSelectedTrack(found);
                  handlePlayTrack(found);
                }
              }}
              aria-label="Select Track"
              className="bg-transparent border-0 text-neutral-300 text-xs font-mono focus:outline-none cursor-pointer max-w-[260px] truncate"
            >
              {audioTracks.map((track) => (
                <option key={track.name} value={track.name} className="bg-neutral-900 text-white">
                  {track.title ? `${track.title} • ${track.artist}` : track.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Main Visualizer Poster Frame */}
      <div className="w-full flex items-center justify-center px-4">
        <JoyDivisionVisualizer
          trackTitle={trackTitle}
          artistName={artistName}
          audioSrc={audioSrc}
          albumArtUrl={albumArtUrl}
          onTrackEnd={handlePlayNext}
        />
      </div>
    </div>
  );
}
