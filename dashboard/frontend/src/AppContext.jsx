// @refresh reset
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [stats, setStats] = useState(null);
  const [appleStats, setAppleStats] = useState(null);
  const [platformView, setPlatformView] = useState('all'); // 'all' | 'spotify' | 'apple'
  const [downloads, setDownloads] = useState([]);
  const [logs, setLogs] = useState({ downloadLinks: {}, scrapeLog: {} });
  
  // Scraper status & control
  const [scraperStatus, setScraperStatus] = useState('idle');
  const [scraperType, setScraperType] = useState('api');
  const [scraperOutput, setScraperOutput] = useState('');
  const [scraperLimit, setScraperLimit] = useState(5);
  const [scraperMode, setScraperMode] = useState('albums');
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef(null);
  const pendingPlayRef = useRef(false);
  // timeUpdateRAF removed for direct DOM updates

  // Search/Filters
  const [dashSearch, setDashSearch] = useState('');
  const [downloadsSearch, setDownloadsSearch] = useState('');
  const [logsSearch, setLogsSearch] = useState('');
  const [logsFilter, setLogsFilter] = useState('ALL');

  // Loading states
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingAppleStats, setLoadingAppleStats] = useState(true);
  const [loadingDownloads, setLoadingDownloads] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const pollIntervalRef = useRef(null);
  const pollCounterRef = useRef(0);

  const backendUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadStatus('Uploading files...');
    
    let successCount = 0;
    
    try {
      for (const file of files) {
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        
        const res = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, content: base64Data })
        });
        
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Server returned ${res.status}: ${errText.slice(0, 100) || res.statusText}`);
        }
        
        const data = await res.json();
        if (data.success) successCount++;
      }
      
      setUploadStatus(`Successfully uploaded ${successCount} file(s).`);
      fetchStats();
    } catch (err) {
      console.error(err);
      setUploadStatus(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadStatus(''), 5000);
    }
  };

  const loadAndPlay = (trackFile) => {
    if (!audioRef.current) return;
    audioRef.current.src = `${backendUrl}${trackFile.url}`;
    audioRef.current.load();
    pendingPlayRef.current = true;
  };

  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      if (audioRef.current.readyState >= 2) {
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      } else {
        pendingPlayRef.current = true;
      }
    } else {
      audioRef.current.pause();
      pendingPlayRef.current = false;
    }
  }, [isPlaying, currentTrack]);

  const handlePlayTrack = (trackFile) => {
    if (currentTrack?.name === trackFile.name) {
      setIsPlaying(!isPlaying);
    } else {
      loadAndPlay(trackFile);
      setCurrentTrack(trackFile);
      setDuration(0);
      setIsPlaying(true);
    }
  };

  const getActiveList = () => {
    return downloads.filter(file => file.name.toLowerCase().includes(downloadsSearch.toLowerCase()));
  };

  const handlePlayNext = () => {
    if (downloads.length === 0) return;
    const activeList = getActiveList();
    let nextIndex = 0;
    if (currentTrack) {
      const currentIndex = activeList.findIndex(file => file.name === currentTrack.name);
      if (currentIndex !== -1) nextIndex = (currentIndex + 1) % activeList.length;
    }
    const nextTrack = activeList[nextIndex];
    loadAndPlay(nextTrack);
    setCurrentTrack(nextTrack);
    setDuration(0);
    setIsPlaying(true);
  };

  const handlePlayPrev = () => {
    if (downloads.length === 0) return;
    const activeList = getActiveList();
    let prevIndex = activeList.length - 1;
    if (currentTrack) {
      const currentIndex = activeList.findIndex(file => file.name === currentTrack.name);
      if (currentIndex !== -1) prevIndex = (currentIndex - 1 + activeList.length) % activeList.length;
    }
    const prevTrack = activeList[prevIndex];
    loadAndPlay(prevTrack);
    setCurrentTrack(prevTrack);
    setDuration(0);
    setIsPlaying(true);
  };

  // handleTimeUpdate removed for direct DOM updates

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const handleVolumeChange = (e) => {
    const vol = Number(e.target.value);
    setVolume(vol);
    if (audioRef.current) audioRef.current.volume = vol;
  };

  const fetchSources = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sources`);
      const data = await res.json();
      setSourceFiles(data.sources || []);
    } catch (err) {
      console.error('Error fetching sources:', err);
    }
  };

  const fetchAppleStats = async () => {
    setLoadingAppleStats(true);
    try {
      const res = await fetch(`${backendUrl}/api/apple/stats`);
      const data = await res.json();
      setAppleStats(data);
    } catch (err) {
      console.error('Error fetching Apple stats:', err);
    } finally {
      setLoadingAppleStats(false);
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
      const res = await fetch(`${backendUrl}/api/downloads?_t=${Date.now()}`);
      const data = await res.json();
      setDownloads(data.files || []);
    } catch (err) {
      console.error('Error fetching downloads:', err);
    } finally {
      setLoadingDownloads(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await fetch(`${backendUrl}/api/logs?_t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
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
      
      pollCounterRef.current += 1;
      
      if (data.status === 'success' || data.status === 'error') {
        fetchStats();
        fetchDownloads();
        fetchLogs();
      } else if (data.status === 'running') {
        if (pollCounterRef.current % 2 === 0) {
          fetchDownloads();
          fetchLogs();
        }
      }
    } catch (err) {
      console.error('Error polling status:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchAppleStats();
    fetchDownloads();
    fetchLogs();
    fetchSources();
    checkScraperStatus();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

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

  const value = {
    stats, setStats, loadingStats, fetchStats,
    appleStats, setAppleStats, loadingAppleStats, fetchAppleStats,
    platformView, setPlatformView,
    downloads, setDownloads, loadingDownloads, fetchDownloads,
    logs, setLogs, loadingLogs, fetchLogs,
    scraperStatus, setScraperStatus, checkScraperStatus,
    scraperType, setScraperType,
    scraperOutput, setScraperOutput,
    scraperLimit, setScraperLimit,
    scraperMode, setScraperMode,
    scraperUrl, setScraperUrl,
    searchQuery, setSearchQuery,
    queryStatus, setQueryStatus,
    uploadStatus, setUploadStatus,
    uploading, setUploading, handleFileUpload,
    sourceFiles, setSourceFiles, fetchSources,
    selectedSource, setSelectedSource,
    dashSearch, setDashSearch,
    downloadsSearch, setDownloadsSearch,
    logsSearch, setLogsSearch,
    logsFilter, setLogsFilter,
    currentTrack, setCurrentTrack,
    isPlaying, setIsPlaying,
    duration, setDuration,
    volume, setVolume,
    audioRef, pendingPlayRef,
    handlePlayTrack, handlePlayNext, handlePlayPrev,
    handleLoadedMetadata, handleSeek, handleVolumeChange,
    backendUrl
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
