import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import Icons from './Icons';

export default function Layout() {
  const {
    scraperStatus,
    downloads,
    currentTrack,
    isPlaying,
    setIsPlaying,
    currentTime,
    duration,
    volume,
    audioRef,
    pendingPlayRef,
    handlePlayNext,
    handlePlayPrev,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleSeek,
    handleVolumeChange,
  } = useAppContext();

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds)) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app-container">
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="ambient-glow glow-3"></div>
      
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon">S</div>
          <span className="app-title">SpotScraper</span>
        </div>

        <nav className="nav-links">
          <NavLink 
            to="/dashboard" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icons.Dashboard /> Dashboard
          </NavLink>
          <NavLink 
            to="/scraper" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icons.Scraper /> Scraper Control
          </NavLink>
          <NavLink 
            to="/downloads" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icons.Downloads /> Downloads ({downloads.length})
          </NavLink>
          <NavLink 
            to="/logs" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icons.Logs /> Detailed Logs
          </NavLink>
          <NavLink 
            to="/acquire" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icons.Acquire /> Data Guide
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <span className={`status-dot ${scraperStatus === 'running' ? 'running' : scraperStatus === 'success' ? 'active' : ''}`}></span>
            <span>
              {scraperStatus === 'running' 
                ? 'Scraper Running' 
                : scraperStatus === 'success' 
                ? 'Idle (Last OK)' 
                : scraperStatus === 'error'
                ? 'Idle (Error)'
                : 'Scraper Idle'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* Global Audio Player */}
      <audio 
        ref={audioRef}
        preload="auto"
        onCanPlay={() => {
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            audioRef.current.play().catch(e => console.error("Playback failed", e));
          }
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handlePlayNext}
      />

      {currentTrack && (
        <div className={`global-player ${isPlaying ? 'playing' : ''}`}>
          <div className="player-info">
            <div className="player-art">
              <Icons.Music />
            </div>
            <div className="player-track-details">
              <div className="player-title" title={currentTrack.title || currentTrack.name.replace('.mp3', '')}>
                {currentTrack.title || currentTrack.name.replace('.mp3', '')}
              </div>
              <div className="player-artist" title={currentTrack.artist || 'Unknown Artist'}>
                {currentTrack.artist || 'Unknown Artist'}
              </div>
            </div>
          </div>
          
          <div className="player-center">
            <div className="player-controls">
              <button className="player-btn" onClick={handlePlayPrev} disabled={downloads.length === 0} title="Previous"><Icons.SkipBack /></button>
              <button className="player-btn primary" onClick={() => currentTrack && setIsPlaying(!isPlaying)} disabled={!currentTrack}>
                {isPlaying ? <Icons.Pause /> : <Icons.Play />}
              </button>
              <button className="player-btn" onClick={handlePlayNext} disabled={downloads.length === 0} title="Next"><Icons.SkipForward /></button>
            </div>
            <div className="player-progress-container">
              <span className="player-time">{formatTime(currentTime)}</span>
              <input 
                type="range" 
                className="player-slider" 
                min="0" 
                max={duration || 0} 
                value={currentTime} 
                onChange={handleSeek}
                style={{ '--progress': duration ? `${(currentTime / duration) * 100}%` : '0%' }}
              />
              <span className="player-time">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="player-right">
            <div style={{ color: 'var(--text-muted)' }}><Icons.Volume /></div>
            <input 
              type="range" 
              className="player-slider volume" 
              min="0" 
              max="1" 
              step="0.01" 
              value={volume} 
              onChange={handleVolumeChange}
              style={{ '--progress': `${volume * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
