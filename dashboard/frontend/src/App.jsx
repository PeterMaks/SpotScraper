import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [logs, setLogs] = useState({ downloadLinks: {}, scrapeLog: {} });
  
  // Scraper status & control
  const [scraperStatus, setScraperStatus] = useState('idle'); // idle, running, success, error
  const [scraperType, setScraperType] = useState('api'); // api, selenium
  const [scraperOutput, setScraperOutput] = useState('');
  const [scraperLimit, setScraperLimit] = useState(5);
  const [scraperMode, setScraperMode] = useState('albums'); // albums, tracks
  const [scraperUrl, setScraperUrl] = useState('https://qobuz.squid.wtf');
  
  // Custom single download query
  const [searchQuery, setSearchQuery] = useState('');
  const [queryStatus, setQueryStatus] = useState('');

  // File Upload State
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  
  // Data Sources
  const [sourceFiles, setSourceFiles] = useState([]);
  const [selectedSource, setSelectedSource] = useState('');

  // Global Audio Player State
  const [currentTrack, setCurrentTrack] = useState(null);
  const [hoveredTrackIndex, setHoveredTrackIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef(null);

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadStatus('Uploading files...');
    
    let successCount = 0;
    
    try {
      for (const file of files) {
        // Read file as Base64 Data URL
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result;
            // Extract only the base64 part after the comma
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        
        // POST to backend
        const res = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            content: base64Data
          })
        });
        
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Server returned ${res.status}: ${errText.slice(0, 100) || res.statusText}`);
        }
        
        const data = await res.json();
        if (data.success) {
          successCount++;
        }
      }
      
      setUploadStatus(`Successfully uploaded ${successCount} file(s).`);
      fetchStats(); // Refresh stats
    } catch (err) {
      console.error(err);
      setUploadStatus(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadStatus(''), 5000);
    }
  };

  // Search/Filters
  const [dashSearch, setDashSearch] = useState('');
  const [downloadsSearch, setDownloadsSearch] = useState('');
  const [logsSearch, setLogsSearch] = useState('');
  const [logsFilter, setLogsFilter] = useState('ALL'); // ALL, DOWNLOADED, NOT_FOUND, ERROR

  // Loading states
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingDownloads, setLoadingDownloads] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const terminalEndRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const backendUrl = 'http://localhost:3001';

  // --- Audio Player Handlers ---
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  const handlePlayTrack = (trackFile) => {
    if (currentTrack?.name === trackFile.name) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentTrack(trackFile);
      setIsPlaying(true);
      setCurrentTime(0);
    }
  };

  const handlePlayNext = () => {
    if (downloads.length === 0) return;
    const list = downloads.filter(file => file.name.toLowerCase().includes(downloadsSearch.toLowerCase()));
    const activeList = list.length > 0 ? list : downloads;
    
    let nextIndex = 0;
    if (currentTrack) {
      const currentIndex = activeList.findIndex(file => file.name === currentTrack.name);
      if (currentIndex !== -1) {
        nextIndex = (currentIndex + 1) % activeList.length;
      }
    }
    const nextTrack = activeList[nextIndex];
    setCurrentTrack(nextTrack);
    setIsPlaying(true);
    setCurrentTime(0);
  };

  const handlePlayPrev = () => {
    if (downloads.length === 0) return;
    const list = downloads.filter(file => file.name.toLowerCase().includes(downloadsSearch.toLowerCase()));
    const activeList = list.length > 0 ? list : downloads;
    
    let prevIndex = activeList.length - 1;
    if (currentTrack) {
      const currentIndex = activeList.findIndex(file => file.name === currentTrack.name);
      if (currentIndex !== -1) {
        prevIndex = (currentIndex - 1 + activeList.length) % activeList.length;
      }
    }
    const prevTrack = activeList[prevIndex];
    setCurrentTrack(prevTrack);
    setIsPlaying(true);
    setCurrentTime(0);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e) => {
    const vol = Number(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };
  
  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds)) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Fetch all initial data
  useEffect(() => {
    fetchStats();
    fetchDownloads();
    fetchLogs();
    fetchSources();
    checkScraperStatus();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Scroll terminal to bottom on output change
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scraperOutput]);

  // Polling for scraper status when running
  useEffect(() => {
    if (scraperStatus === 'running') {
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(pollScraperStatus, 1500);
      }
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [scraperStatus]);

  const fetchSources = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sources`);
      const data = await res.json();
      setSourceFiles(data.sources || []);
    } catch (err) {
      console.error('Error fetching sources:', err);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`${backendUrl}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchDownloads = async () => {
    setLoadingDownloads(true);
    try {
      const res = await fetch(`${backendUrl}/api/downloads`);
      const data = await res.json();
      setDownloads(data.files || []);
    } catch (err) {
      console.error('Error fetching downloads:', err);
    } finally {
      setLoadingDownloads(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`${backendUrl}/api/logs`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const checkScraperStatus = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/scrape/status`);
      const data = await res.json();
      setScraperStatus(data.status);
      setScraperType(data.type);
      setScraperOutput(data.output);
    } catch (err) {
      console.error('Error checking scraper status:', err);
    }
  };

  const pollScraperStatus = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/scrape/status`);
      const data = await res.json();
      setScraperStatus(data.status);
      setScraperOutput(data.output);
      
      // If process just finished, reload data
      if (data.status === 'success' || data.status === 'error') {
        fetchStats();
        fetchDownloads();
        fetchLogs();
      }
    } catch (err) {
      console.error('Error polling status:', err);
    }
  };

  const handleStartScrape = async (e) => {
    e.preventDefault();
    if (scraperStatus === 'running') return;

    setScraperStatus('running');
    setScraperOutput('Initializing scraper...\n');
    setActiveTab('scraper'); // Switch to scraper tab to see logs

    try {
      const res = await fetch(`${backendUrl}/api/scrape/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: scraperType,
          limit: scraperLimit,
          website: scraperUrl,
          mode: scraperMode,
          sourceFile: selectedSource || undefined
        })
      });
      const data = await res.json();
      if (!data.success) {
        setScraperStatus('error');
        setScraperOutput(prev => prev + `Error starting scraper: ${data.error}\n`);
      }
    } catch (err) {
      setScraperStatus('error');
      setScraperOutput(prev => prev + `Connection error: ${err.message}\n`);
    }
  };

  const handleStopScrape = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/scrape/stop`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        checkScraperStatus();
      }
    } catch (err) {
      console.error('Error stopping scrape:', err);
    }
  };

  const handleSingleDownload = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || scraperStatus === 'running') return;

    setQueryStatus('Starting download...');
    setScraperStatus('running');
    setScraperOutput(`Starting single download for query: "${searchQuery}"...\n`);
    setActiveTab('scraper'); // Switch to terminal to watch download

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
      const data = await res.json();
      if (data.success) {
        fetchDownloads();
      } else {
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString();
  };

  // Compile detailed logs list from backend data
  const getLogsList = () => {
    const list = [];
    
    // Add items from download_links.json (API Scraper)
    Object.entries(logs.downloadLinks).forEach(([query, info]) => {
      list.push({
        query,
        title: info.title || query,
        artist: info.artist || 'Unknown Artist',
        album: info.album || 'Unknown Album',
        duration: info.duration || '-',
        source: 'API Scraper',
        status: info.status || 'unknown',
        time: info.download_completed || info.search_time || '-',
        error: info.error || null
      });
    });

    // Add items from scrape_log.json (Selenium Scraper)
    Object.entries(logs.scrapeLog).forEach(([query, status]) => {
      let resolvedStatus = 'unknown';
      if (status.includes('Success')) resolvedStatus = 'downloaded';
      else if (status.includes('Failed')) resolvedStatus = 'not_found';

      // Avoid duplicates if already in API logs
      if (!list.some(item => item.query === query)) {
        list.push({
          query,
          title: query,
          artist: '-',
          album: '-',
          duration: '-',
          source: 'Selenium Scraper',
          status: resolvedStatus,
          time: '-',
          error: status.includes('Failed') ? status : null
        });
      }
    });

    return list;
  };

  // SVG Icons
  const Icons = {
    Clock: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    ),
    MoreHorizontal: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
    ),
    Download: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    ),
    Play: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translateX(2px)' }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
    ),
    Pause: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
    ),
    SkipBack: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
    ),
    SkipForward: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
    ),
    Volume: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    ),
    Dashboard: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
    ),
    Scraper: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
    ),
    Downloads: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    ),
    Logs: () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    ),
    Music: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
    ),
    Search: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    ),
    Trash: () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
    ),
    Cancel: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
    )
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
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Icons.Dashboard /> Dashboard
          </button>
          <button 
            className={`nav-item ${activeTab === 'scraper' ? 'active' : ''}`}
            onClick={() => setActiveTab('scraper')}
          >
            <Icons.Scraper /> Scraper Control
          </button>
          <button 
            className={`nav-item ${activeTab === 'downloads' ? 'active' : ''}`}
            onClick={() => setActiveTab('downloads')}
          >
            <Icons.Downloads /> Downloads ({downloads.length})
          </button>
          <button 
            className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Icons.Logs /> Detailed Logs
          </button>
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

      {/* Main Content */}
      <main className="main-content">
        
        {/* Tab: Dashboard */}
        {activeTab === 'dashboard' && (
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
        )}

        {/* Tab: Scraper Controller */}
        {activeTab === 'scraper' && (
          <div className="tab-content animate-fade-in">
            <div>
              <h2>Downloader Control Panel</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Configure and trigger batch MP3 downloads from YouTube</p>
            </div>

            <div className="scraper-layout">
              {/* Configuration panel */}
              <div className="panel">
                <span className="panel-title" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                  Configuration
                </span>

                <form onSubmit={handleStartScrape}>
                  <div className="form-group">
                    <label>Download Quality</label>
                    <select 
                      className="select"
                      value={scraperType}
                      onChange={(e) => setScraperType(e.target.value)}
                      disabled={scraperStatus === 'running'}
                    >
                      <option value="api">YouTube-DL Fast MP3 (192kbps)</option>
                      <option value="selenium">YouTube-DL High Quality (320kbps)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Data Source (Optional)</label>
                    <select 
                      className="select"
                      value={selectedSource}
                      onChange={(e) => setSelectedSource(e.target.value)}
                      disabled={scraperStatus === 'running'}
                    >
                      <option value="">-- All Files in spotify_data --</option>
                      {sourceFiles.map(file => (
                        <option key={file} value={file}>{file}</option>
                      ))}
                    </select>
                  </div>

                  {scraperType === 'selenium' && (
                    <div className="form-group">
                      <label>Search Mode</label>
                      <select 
                        className="select"
                        value={scraperMode}
                        onChange={(e) => setScraperMode(e.target.value)}
                        disabled={scraperStatus === 'running'}
                      >
                        <option value="albums">Group into Albums</option>
                        <option value="tracks">Individual Tracks</option>
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Items Limit</label>
                    <input 
                      type="number"
                      className="input"
                      value={scraperLimit}
                      onChange={(e) => setScraperLimit(parseInt(e.target.value) || 0)}
                      disabled={scraperStatus === 'running'}
                      min="1"
                      required
                    />
                  </div>

                  <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {scraperStatus === 'running' ? (
                      <button 
                        type="button" 
                        className="btn btn-danger"
                        onClick={handleStopScrape}
                        style={{ width: '100%' }}
                      >
                        <Icons.Cancel /> Stop Scraper
                      </button>
                    ) : (
                      <button 
                        type="submit" 
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                      >
                        Start Batch Scrape
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Terminal Panel */}
              <div className="terminal-panel">
                <div className="terminal-header">
                  <div className="terminal-controls">
                    <div className="terminal-dot red"></div>
                    <div className="terminal-dot yellow"></div>
                    <div className="terminal-dot green"></div>
                  </div>
                  <span className="terminal-title">console_output.log</span>
                  <div style={{ width: '52px' }}></div>
                </div>
                <div className="terminal-screen">
                  {scraperOutput ? (
                    scraperOutput.split('\n').map((line, idx) => (
                      <div key={idx} style={{ 
                        color: line.includes('[ERROR]') ? '#f75c6c' : line.includes('✅') || line.includes('✓') ? '#24d262' : '#9fa4b8',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}>
                        {line}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#555', fontStyle: 'italic' }}>Terminal idle. Start a scrape process to view real-time log outputs...</div>
                  )}
                  <div ref={terminalEndRef}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Downloads */}
        {activeTab === 'downloads' && (
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
                  <div className="track-col-index">#</div>
                  <div className="track-col-title">Title</div>
                  <div className="track-col-album">Album</div>
                  <div className="track-col-date">Date added</div>
                  <div className="track-col-duration"><Icons.Clock /></div>
                </div>

                <div className="downloads-list">
                  {downloads
                    .filter(file => file.name.toLowerCase().includes(downloadsSearch.toLowerCase()))
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
                          className={`track-row ${isRowPlaying ? 'playing' : ''}`} 
                          key={file.name}
                          onDoubleClick={() => handlePlayTrack(file)}
                          onClick={() => {
                            // Single click selects/plays if not playing
                            if (!isRowPlaying) handlePlayTrack(file);
                          }}
                        >
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
          </div>
        )}

        {/* Tab: Detailed Logs */}
        {activeTab === 'logs' && (
          <div className="tab-content animate-fade-in">
            <div className="header-summary">
              <div>
                <h2>Execution & Scrape Logs</h2>
                <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Detailed report of all searched queries and their resolve status</p>
              </div>
              <button className="btn btn-secondary" onClick={fetchLogs} disabled={loadingLogs}>
                Refresh Logs
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
              <div className="filter-bar">
                {['ALL', 'DOWNLOADED', 'NOT_FOUND', 'ERROR'].map(status => (
                  <button 
                    key={status}
                    className={`filter-chip ${logsFilter === status ? 'active' : ''}`}
                    onClick={() => setLogsFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div style={{ width: '280px' }}>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Search logs..." 
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                />
              </div>
            </div>

            {loadingLogs ? (
              <div style={{ textAlign: 'center', padding: '40px' }} className="pulse">
                <p>Loading log files...</p>
              </div>
            ) : (
              <div className="panel" style={{ padding: '0px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tracks-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: '24px' }}>Query / Song Name</th>
                        <th>Resolved Match</th>
                        <th>Album / Artist</th>
                        <th>Engine</th>
                        <th>Status</th>
                        <th style={{ paddingRight: '24px', textAlign: 'right' }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getLogsList()
                        .filter(item => {
                          if (logsFilter === 'DOWNLOADED' && item.status !== 'downloaded') return false;
                          if (logsFilter === 'NOT_FOUND' && item.status !== 'not_found') return false;
                          if (logsFilter === 'ERROR' && item.status !== 'error' && item.status !== 'api_error' && item.status !== 'timeout') return false;
                          
                          const term = logsSearch.toLowerCase();
                          return (
                            item.query.toLowerCase().includes(term) ||
                            item.title.toLowerCase().includes(term) ||
                            item.artist.toLowerCase().includes(term) ||
                            item.album.toLowerCase().includes(term)
                          );
                        })
                        .map((item, idx) => {
                          const statusClass = 
                            item.status === 'downloaded' ? 'badge-success' :
                            item.status === 'ready_to_download' ? 'badge-info' :
                            item.status === 'not_found' ? 'badge-danger' : 'badge-warning';
                          
                          return (
                            <tr key={idx}>
                              <td style={{ paddingLeft: '24px', fontWeight: 600 }}>{item.query}</td>
                              <td>{item.title !== item.query ? item.title : '-'}</td>
                              <td>
                                {item.artist !== '-' ? (
                                  <div>
                                    <div>{item.artist}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.album}</div>
                                  </div>
                                ) : '-'}
                              </td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.source}</td>
                              <td>
                                <span className={`badge ${statusClass}`}>
                                  {item.status.replace('_', ' ')}
                                </span>
                              </td>
                              <td style={{ paddingRight: '24px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {item.time}
                              </td>
                            </tr>
                          );
                        })}
                      {getLogsList().length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            No log files parsed. Make sure <code>download_links.json</code> or <code>scrape_log.json</code> exist in the root of the project.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Audio Player */}
      <audio 
        ref={audioRef}
        src={currentTrack ? `${backendUrl}${currentTrack.url}` : ''}
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

export default App;
