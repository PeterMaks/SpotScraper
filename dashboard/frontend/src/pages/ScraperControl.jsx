import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import Icons from '../components/Icons';

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

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scraperOutput]);

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
  );
}
