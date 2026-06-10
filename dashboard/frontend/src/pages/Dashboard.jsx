import React from 'react';
import { useAppContext } from '../AppContext';

export default function Dashboard() {
  const {
    stats,
    fetchStats,
    loadingStats,
    uploadStatus,
    uploading,
    handleFileUpload
  } = useAppContext();

  return (
    <div className="tab-content animate-fade-in">
      <div className="header-summary">
        <div>
          <h2>Spotify Recaps & Insights</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Overview gathered from Spotify Extended Streaming History</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchStats} disabled={loadingStats}>
          Refresh Stats
        </button>
      </div>

      {/* Upload Zone */}
      <div className="panel" style={{ marginBottom: '24px', padding: '20px' }}>
        <span className="panel-title" style={{ fontSize: '1.1rem', fontWeight: 600 }}>Load Your Own Data</span>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
          Upload Spotify data files (e.g., <code>StreamingHistory*.json</code>, <code>Playlist*.json</code>) or custom <code>.csv</code> / Excel (<code>.xlsx</code>, <code>.xls</code>) files (with <code>Track, Artist, Playlist</code> headers or simple format).
        </p>
        
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Choose Files to Upload
            <input 
              type="file" 
              multiple 
              accept=".json,.csv,.xlsx,.xls" 
              onChange={handleFileUpload} 
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>
          
          {uploadStatus && (
            <span style={{ fontSize: '0.9rem', color: uploading ? 'var(--accent-blue)' : 'var(--text-color)', fontWeight: 500 }}>
              {uploadStatus}
            </span>
          )}
        </div>
      </div>

      {loadingStats ? (
        <div style={{ textAlign: 'center', padding: '40px' }} className="pulse">
          <p>Aggregating Spotify stats from history...</p>
        </div>
      ) : stats ? (
        <>
          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Total Listening Time</span>
              <span className="stat-value music">{stats.totalHours} <span style={{ fontSize: '1rem', fontWeight: 500 }}>Hrs</span></span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Music Playtime</span>
              <span className="stat-value purple">{stats.totalMusicHours} <span style={{ fontSize: '1rem', fontWeight: 500 }}>Hrs</span></span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Podcast Playtime</span>
              <span className="stat-value blue">{stats.totalPodcastHours} <span style={{ fontSize: '1rem', fontWeight: 500 }}>Hrs</span></span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Unique Artists</span>
              <span className="stat-value">{stats.uniqueArtists}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Unique Tracks</span>
              <span className="stat-value">{stats.uniqueTracks}</span>
            </div>
          </div>

          {/* Dashboard Lists */}
          <div className="dashboard-grid">
            {/* Top Artists Panel */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Top Artists</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Top 20</span>
              </div>
              <div className="ranking-list">
                {stats.topArtists.slice(0, 10).map((artist, idx) => {
                  const maxHours = stats.topArtists[0]?.hours || 1;
                  const percentage = (artist.hours / maxHours) * 100;
                  return (
                    <div className="ranking-item" key={artist.name}>
                      <div className="ranking-meta">
                        <span className="ranking-name">{idx + 1}. {artist.name}</span>
                        <span className="ranking-value">{artist.hours} hrs</span>
                      </div>
                      <div className="ranking-bar-bg">
                        <div 
                          className="ranking-bar-fill primary" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
                {stats.topArtists.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No artist data found.</p>
                )}
              </div>
            </div>

            {/* Top Tracks Panel */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Top Tracks</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Top 20</span>
              </div>
              <div className="tracks-table-wrapper">
                <table className="tracks-table">
                  <thead>
                    <tr>
                      <th>Track Info</th>
                      <th style={{ textAlign: 'right' }}>Playtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topTracks.slice(0, 10).map((track, idx) => (
                      <tr key={`${track.name}-${track.artist}`}>
                        <td>
                          <div className="ranking-name" style={{ fontWeight: 600 }}>{idx + 1}. {track.name}</div>
                          <div className="track-artist">{track.artist} • <span style={{ fontSize: '0.8rem' }}>{track.album}</span></div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                          {track.hours} hrs
                        </td>
                      </tr>
                    ))}
                    {stats.topTracks.length === 0 && (
                      <tr>
                        <td colSpan="2" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No track data found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Podcasts Panel if exists */}
          {stats.topPodcasts && stats.topPodcasts.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Top Podcasts</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>By Playtime</span>
              </div>
              <div className="ranking-list">
                {stats.topPodcasts.map((podcast, idx) => {
                  const maxHours = stats.topPodcasts[0]?.hours || 1;
                  const percentage = (podcast.hours / maxHours) * 100;
                  return (
                    <div className="ranking-item" key={podcast.name}>
                      <div className="ranking-meta">
                        <span className="ranking-name">{idx + 1}. {podcast.name}</span>
                        <span className="ranking-value">{podcast.hours} hrs</span>
                      </div>
                      <div className="ranking-bar-bg">
                        <div 
                          className="ranking-bar-fill purple" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="panel" style={{ textAlign: 'center', padding: '40px' }}>
          <h3>No Spotify Data Found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            Please place your Spotify JSON files in the <code>spotify_data/</code> folder at the root of the project.
          </p>
        </div>
      )}
    </div>
  );
}
