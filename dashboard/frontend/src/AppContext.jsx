// @refresh reset
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

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

  // Web Audio Shared Analyser Node
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);

  const getAnalyserNode = useCallback(() => {
    if (!audioRef.current) return null;
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.78;
      analyserRef.current = analyser;

      try {
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;
        source.connect(analyser);
        analyser.connect(ctx.destination);
      } catch (e) {
        console.warn('Could not connect audio to Web Audio analyser:', e);
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return analyserRef.current;
  }, []);

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

  const pollCounterRef = useRef(0);

  const backendUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (!/\.(csv|json)$/i.test(file.name)) {
        setUploadStatus('Upload CSV or JSON files only.');
        setTimeout(() => setUploadStatus(''), 5000);
        return;
      }
    }


    setUploading(true);
    setUploadStatus('Uploading files...');
    
    let successCount = 0;
    
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          body: formData
        });
        // Let the browser include the multipart boundary in Content-Type.
        
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Server returned ${res.status}: ${errText.slice(0, 100) || res.statusText}`);
        }
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Server did not accept the file.');
        successCount++;
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
    if (audioRef.current.src?.startsWith('blob:') && audioRef.current.src !== trackFile.url) URL.revokeObjectURL(audioRef.current.src);
    audioRef.current.src = trackFile.url.startsWith('blob:') ? trackFile.url : `${backendUrl}${trackFile.url}`;
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
    if (currentTrack?.url === trackFile.url && currentTrack?.name === trackFile.name) {
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
    const activeList = getActiveList();
    if (activeList.length === 0) return;
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
    const activeList = getActiveList();
    if (activeList.length === 0) return;
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

  const fetchSources = useCallback(async (signal) => {
    try {
      const res = await fetch(`${backendUrl}/api/sources`, { signal });
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setSourceFiles(data.sources || []); // keep previous sources visible while a refresh is in flight
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error fetching sources:', err);
    }
  }, [backendUrl]);

  const fetchAppleStats = useCallback(async (signal) => {
    try {
      const res = await fetch(`${backendUrl}/api/apple/stats`, { signal });
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setAppleStats(data); // keep previous stats visible while a refresh is in flight
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error fetching Apple stats:', err);
    } finally {
      setLoadingAppleStats(false);
    }
  }, [backendUrl]);

  const fetchStats = useCallback(async (signal) => {
    try {
      const res = await fetch(`${backendUrl}/api/stats`, { signal });
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setStats(data); // keep previous stats visible while a refresh is in flight
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error fetching stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [backendUrl]);

  const fetchDownloads = useCallback(async (signal) => {
    try {
      const res = await fetch(`${backendUrl}/api/downloads?_t=${Date.now()}`, { signal });
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setDownloads(data.files || []); // keep previous list visible while a refresh is in flight
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error fetching downloads:', err);
    } finally {
      setLoadingDownloads(false);
    }
  }, [backendUrl]);

  // ponytail: memoized fetchLogs avoids recreating function identity on every render
  const fetchLogs = useCallback(async (signal) => {
    try {
      const res = await fetch(`${backendUrl}/api/logs?_t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        signal
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setLogs(data); // keep previous logs visible while a refresh is in flight
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error fetching logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [backendUrl]);

  const checkScraperStatus = useCallback(async (signal) => {
    try {
      const res = await fetch(`${backendUrl}/api/scrape/status`, { signal });
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setScraperStatus(data.status); // keep previous status visible while a refresh is in flight
      setScraperType(data.type);
      setScraperOutput(data.output);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error checking scraper status:', err);
    }
  }, [backendUrl]);

  const pollScraperStatus = useCallback(async (signal) => {
    try {
      const res = await fetch(`${backendUrl}/api/scrape/status`, { signal });
      if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (signal.aborted) return;
      setScraperOutput(data.output);
      pollCounterRef.current += 1;

      if (data.status === 'success' || data.status === 'error') {
        await Promise.all([fetchStats(signal), fetchDownloads(signal), fetchLogs(signal)]);
      } else if (data.status === 'running' && pollCounterRef.current % 2 === 0) {
        await Promise.all([fetchDownloads(signal), fetchLogs(signal)]);
      }
      // Publish terminal status after the final refresh so effect cleanup cannot abort it.
      if (!signal.aborted) setScraperStatus(data.status);
      return data.status;
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error polling status:', err);
    }
  }, [backendUrl, fetchStats, fetchDownloads, fetchLogs]);

  useEffect(() => {
    // Each loader sets state only after its network request settles.
    fetchStats();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAppleStats();
    fetchDownloads();
    fetchLogs();
    fetchSources();
    checkScraperStatus();

  }, [fetchStats, fetchAppleStats, fetchDownloads, fetchLogs, fetchSources, checkScraperStatus]);

  useEffect(() => {
    if (scraperStatus !== 'running') return;
    let stopped = false;
    let timer = null;
    let controller = null;
    pollCounterRef.current = 0;

    const schedule = (delay = 1500) => {
      if (!stopped && !document.hidden && !controller && timer === null) {
        timer = setTimeout(tick, delay);
      }
    };
    const tick = async () => {
      timer = null;
      if (stopped || document.hidden || controller) return;
      const request = new AbortController();
      controller = request;
      try {
        const status = await pollScraperStatus(request.signal);
        if (!request.signal.aborted && status && status !== 'running') stopped = true;
      } finally {
        controller = null;
        schedule(); // wait for status AND its dependent refreshes before the next tick
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimeout(timer);
        timer = null;
        controller?.abort();
      } else {
        schedule(0); // an aborted in-flight request must settle before scheduling
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [scraperStatus, pollScraperStatus]);

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
    getAnalyserNode,
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
