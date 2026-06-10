import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import Icons from '../components/Icons';

// Helper to parse the raw text output into structured progress
const parseProgress = (output) => {
  let current = 0;
  let total = 0;
  let currentTrack = '';
  let currentAction = 'Idle';
  let percent = 0;
  let eta = '--:--';
  let hasError = false;

  if (!output) return { current, total, currentTrack, currentAction, percent, eta, hasError };

  const lines = output.split('\n');
  for (let line of lines) {
    const progMatch = line.match(/Processing \[(\d+)\/(\d+)\]/);
    if (progMatch) {
      current = parseInt(progMatch[1], 10);
      total = parseInt(progMatch[2], 10);
    }
    if (line.includes('🔍 Searching for:')) {
      currentTrack = line.split('🔍 Searching for:')[1].trim();
      currentAction = 'Searching...';
      percent = 0;
    }
    if (line.includes('⬇️ Starting download')) {
      currentAction = 'Downloading...';
    }
    if (line.includes('✅ Download complete')) {
      currentAction = 'Completed';
      percent = 100;
    }
    if (line.includes('✗ Error') || line.includes('✗ Skipped') || line.includes('Failed')) {
      currentAction = 'Failed / Skipped';
      hasError = true;
    }
    if (line.includes('[download]') && line.includes('%')) {
      const match = line.match(/(\d+\.?\d*)%/);
      if (match) percent = parseFloat(match[1]);
      
      const etaMatch = line.match(/ETA (\d+:\d+)/);
      if (etaMatch) eta = etaMatch[1];
    }
  }

  return { current, total, currentTrack, currentAction, percent, eta, hasError };
};

export default function ScraperControl() {
  const {
    scraperStatus, setScraperStatus,
    scraperType, setScraperType,
    scraperOutput, setScraperOutput,
    scraperLimit, setScraperLimit,
    scraperMode, setScraperMode,
    scraperUrl,
    selectedSource, setSelectedSource,
    sourceFiles,
    backendUrl,
    checkScraperStatus
  } = useAppContext();

  const terminalEndRef = useRef(null);
  const [showRawLogs, setShowRawLogs] = useState(false);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scraperOutput, showRawLogs]);

  const handleStartScrape = async (e) => {
    e.preventDefault();
    if (scraperStatus === 'running') return;

    setScraperStatus('running');
    setScraperOutput('Initializing scraper...\n');

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

  const { current, total, currentTrack, currentAction, percent, eta, hasError } = useMemo(() => parseProgress(scraperOutput), [scraperOutput]);
  
  // Calculate total overall percentage
  const itemWeight = total > 0 ? 1 / total : 0;
  let overallProgress = total > 0 ? ((Math.max(0, current - 1) / total) + (percent / 100 * itemWeight)) * 100 : 0;
  if (overallProgress > 100) overallProgress = 100;
  if (current === 0) overallProgress = 0;
  
  let headerTitle = 'Downloading Media...';
  let displayAction = currentAction;
  
  if (scraperStatus === 'error' || hasError) {
    headerTitle = 'Scraper Error';
    displayAction = 'Failed / Error';
  } else if (scraperStatus === 'success') {
    headerTitle = 'Batch Download Complete';
    overallProgress = 100;
    displayAction = 'Completed';
  } else if (scraperStatus !== 'running') {
    if (scraperOutput) {
      headerTitle = 'Scraper Stopped / Idle';
      displayAction = 'Aborted / Idle';
    }
  }

  return (
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
                <option value="api">Fast MP3 - Tracks (192kbps)</option>
                <option value="selenium">High Quality - Albums (320kbps)</option>
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

        {/* Progress Panel */}
        <div className="progress-panel">
          {scraperStatus === 'running' || scraperOutput ? (
            <div className="progress-card animate-fade-in">
              <div className="progress-header">
                <h3>{headerTitle}</h3>
                <span className="progress-badge">{total > 0 ? `Track ${current} of ${total}` : 'Initializing...'}</span>
              </div>
              
              <div className="progress-track-info">
                <div className="track-name">{currentTrack || 'Preparing connection...'}</div>
                <div className="track-status" style={{ color: (scraperStatus === 'error' || hasError) ? 'var(--danger-color)' : 'var(--text-muted)' }}>
                  {displayAction} {eta !== '--:--' && scraperStatus === 'running' && displayAction === 'Downloading...' ? `(ETA: ${eta})` : ''}
                </div>
              </div>

              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${overallProgress}%` }}>
                  <div className="progress-bar-glow"></div>
                </div>
              </div>
              
              <div className="progress-footer">
                <span>{overallProgress.toFixed(1)}% Completed</span>
                <span>{percent > 0 && percent < 100 ? `Current Track: ${percent.toFixed(1)}%` : ''}</span>
              </div>
            </div>
          ) : (
            <div className="progress-empty">
               <Icons.Download className="empty-icon" />
               <p>Ready to Download</p>
               <span>Configure settings and click start to begin the batch process.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
