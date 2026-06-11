import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import Icons from '../components/Icons';

export default function Downloads() {
  const navigate = useNavigate();
  const {
    downloads,
    fetchDownloads,
    loadingDownloads,
    searchQuery, setSearchQuery,
    queryStatus, setQueryStatus,
    scraperStatus, setScraperStatus,
    setScraperOutput,
    downloadsSearch, setDownloadsSearch,
    handlePlayTrack,
    currentTrack,
    isPlaying,
    backendUrl
  } = useAppContext();

  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);

  const filteredDownloads = downloads.filter(file => file.name.toLowerCase().includes(downloadsSearch.toLowerCase()));

  const handleSingleDownload = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || scraperStatus === 'running') return;

    setQueryStatus('Starting download...');
    setScraperStatus('running');
    setScraperOutput(`Starting single download for query: "${searchQuery}"...\n`);
    navigate('/scraper'); // Switch to terminal to watch download

    try {
      const res = await fetch(`${backendUrl}/api/scrape/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: 'selenium', // Selenium actually performs file downloads
          query: searchQuery
        })
      });
      const data = await res.json();
      if (data.success) {
        setQueryStatus('Download process started');
        setSearchQuery('');
      } else {
        setQueryStatus(`Error: ${data.error}`);
        setScraperStatus('error');
      }
    } catch (err) {
      setQueryStatus(`Connection error: ${err.message}`);
      setScraperStatus('error');
    }
  };

  const handleDeleteFile = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) return;

    try {
      const res = await fetch(`${backendUrl}/api/downloads/file/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchDownloads();
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const handleCheckboxClick = (e, file, index) => {
    e.stopPropagation();
    const newSelected = new Set(selectedFiles);

    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        newSelected.add(filteredDownloads[i].name);
      }
    } else {
      if (newSelected.has(file.name)) {
        newSelected.delete(file.name);
      } else {
        newSelected.add(file.name);
      }
      setLastSelectedIndex(index);
    }
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedFiles(new Set(filteredDownloads.map(f => f.name)));
    } else {
      setSelectedFiles(new Set());
    }
  };

  const handleBatchDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedFiles.size} files?`)) return;

    try {
      for (const filename of selectedFiles) {
        await fetch(`${backendUrl}/api/downloads/file/${encodeURIComponent(filename)}`, {
          method: 'DELETE'
        });
      }
      setSelectedFiles(new Set());
      fetchDownloads();
    } catch (err) {
      console.error('Error batch deleting files:', err);
    }
  };

  const handleBatchDownload = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/downloads/zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: Array.from(selectedFiles) })
      });

      if (!res.ok) throw new Error('Failed to create zip');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'spotscraper_batch.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSelectedFiles(new Set());
    } catch (err) {
      console.error('Error downloading zip:', err);
      alert('Failed to download batch zip');
    }
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  return (
    <div className="tab-content animate-fade-in">
      <div className="header-summary">
        <div>
          <h2>Downloads Manager</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Manage and play audio files in your local downloads folder</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchDownloads} disabled={loadingDownloads}>
          Sync Files
        </button>
      </div>

      {/* Direct Song Search Bar */}
      <div className="panel" style={{ padding: '20px' }}>
        <span className="panel-title" style={{ fontSize: '1rem', fontWeight: 600 }}>Download a Specific Song</span>
        <form onSubmit={handleSingleDownload} className="download-search" style={{ marginTop: '12px' }}>
          <input
            type="text"
            className="input"
            placeholder="Enter song name and artist (e.g. 'Blinding Lights The Weeknd')..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={scraperStatus === 'running'}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={scraperStatus === 'running'}>
            Download Song
          </button>
        </form>
        {queryStatus && (
          <p style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', marginTop: '8px' }}>
            {queryStatus}
          </p>
        )}
      </div>

      <div className="form-group" style={{ maxWidth: '300px' }}>
        <input
          type="text"
          className="input"
          placeholder="Search downloaded files..."
          value={downloadsSearch}
          onChange={(e) => setDownloadsSearch(e.target.value)}
        />
      </div>

      {loadingDownloads ? (
        <div style={{ textAlign: 'center', padding: '40px' }} className="pulse">
          <p>Scanning downloads folder...</p>
        </div>
      ) : (
        <div className="downloads-list-container">
          <div className="track-header">
            <div className="track-col-checkbox">
              <input
                type="checkbox"
                checked={filteredDownloads.length > 0 && selectedFiles.size === filteredDownloads.length}
                onChange={handleSelectAll}
              />
            </div>
            <div className="track-col-index">#</div>
            <div className="track-col-title">Title</div>
            <div className="track-col-album">Album</div>
            <div className="track-col-date">Date added</div>
            <div className="track-col-duration"><Icons.Clock /></div>
          </div>

          <div className="downloads-list">
            {filteredDownloads
              .map((file, index) => {
                // Fallback metadata parsing
                let title = file.title || file.name.replace('.mp3', '');
                let artist = file.artist || 'Unknown Artist';
                let album = file.album || '';

                if (!file.title) {
                  const parts = title.split(' - ');
                  if (parts.length >= 2) {
                    artist = parts[0];
                    title = parts.slice(1).join(' - ');
                  }
                }

                const duration = file.duration && file.duration !== "-" ? file.duration : formatBytes(file.size);
                const isRowPlaying = currentTrack?.name === file.name;

                return (
                  <div
                    className={`track-row ${isRowPlaying ? 'playing' : ''} ${selectedFiles.has(file.name) ? 'selected' : ''}`}
                    key={file.name}
                    onDoubleClick={() => handlePlayTrack(file)}
                    onClick={(e) => {
                      if (e.target.type === 'checkbox' || e.target.closest('.track-col-checkbox')) return;
                      // Single click selects/plays if not playing
                      if (!isRowPlaying) handlePlayTrack(file);
                    }}
                  >
                    <div className="track-col-checkbox" onClick={(e) => handleCheckboxClick(e, file, index)}>
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.name)}
                        readOnly
                        style={{ pointerEvents: 'none' }}
                      />
                    </div>
                    <div className="track-col-index" onClick={(e) => { e.stopPropagation(); handlePlayTrack(file); }}>
                      {isRowPlaying && isPlaying ? (
                        <div className="playing-eq"><Icons.Music /></div>
                      ) : (
                        <span className="track-number">{index + 1}</span>
                      )}
                      <button className="track-play-btn">
                        {isRowPlaying && isPlaying ? <Icons.Pause /> : <Icons.Play />}
                      </button>
                    </div>

                    <div className="track-col-title">
                      <div className="track-art">
                        <Icons.Music />
                      </div>
                      <div className="track-info-stack">
                        <span className={`track-name ${isRowPlaying ? 'active-text' : ''}`} title={title}>{title}</span>
                        <span className="track-artist-name" title={artist}>{artist}</span>
                      </div>
                    </div>

                    <div className="track-col-album" title={album}>
                      {album || '-'}
                    </div>

                    <div className="track-col-date">
                      {new Date(file.mtime).toLocaleDateString()}
                    </div>

                    <div className="track-col-duration">
                      <div className="track-info-stack" style={{ alignItems: 'flex-end', marginRight: '16px' }}>
                        <span className="track-time" style={{ marginRight: 0 }}>{duration}</span>
                        <span className="track-artist-name" style={{ marginTop: '4px' }}>{formatBytes(file.size)}</span>
                      </div>

                      <div className="track-actions">
                        <a href={`${backendUrl}${file.url}`} download={file.name} title="Save to disk" onClick={(e) => e.stopPropagation()}>
                          <Icons.Download />
                        </a>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.name); }} className="btn-icon danger" title="Delete">
                          <Icons.Trash />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {downloads.length === 0 && (
              <div className="empty-state" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No downloaded audio files found. Start the downloader to download files!
              </div>
            )}
          </div>
        </div>
      )}

      {selectedFiles.size > 0 && (
        <div className="batch-action-bar animate-slide-up">
          <span className="batch-count">{selectedFiles.size} items selected</span>
          <div className="batch-actions">
            <button className="btn btn-primary" onClick={handleBatchDownload}>
              <Icons.Download /> Save as ZIP
            </button>
            <button className="btn btn-secondary danger" onClick={handleBatchDelete}>
              <Icons.Trash /> Delete
            </button>
            <button className="btn btn-secondary" onClick={() => setSelectedFiles(new Set())}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
