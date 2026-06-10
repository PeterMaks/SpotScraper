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
      currentAction = 'Searching';
      percent = 0;
    }
    if (line.includes('Searching for:') && !line.includes('🔍')) {
      currentTrack = line.split('Searching for:')[1].trim();
      currentAction = 'Searching';
      percent = 0;
    }
    if (line.includes('⬇️ Starting download') || line.includes('Downloading at')) {
      currentAction = 'Downloading';
    }
    if (line.includes('✅ Download complete') || line.includes('Download Triggered')) {
      currentAction = 'Completed';
      percent = 100;
    }
    if (line.includes('✗ Error') || line.includes('✗ Skipped') || line.includes('Failed') || line.includes('❌')) {
      currentAction = 'Skipped';
      hasError = true;
    }
    if (line.includes('✓ Already downloaded')) {
      currentAction = 'Cached';
      percent = 100;
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

// Custom option selector component (replaces <select>)
function OptionSelector({ options, value, onChange, disabled, label }) {
  return (
    <div className="sc-field">
      <span className="sc-field-label">{label}</span>
      <div className="sc-options">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`sc-option ${value === opt.value ? 'active' : ''}`}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
          >
            <span className="sc-option-icon">{opt.icon}</span>
            <span className="sc-option-body">
              <span className="sc-option-title">{opt.label}</span>
              <span className="sc-option-desc">{opt.desc}</span>
            </span>
            {value === opt.value && (
              <span className="sc-option-check">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="var(--primary)"/><path d="M5 8.5L7 10.5L11 6" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Source file selector
function SourceSelector({ sources, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayValue = value || 'All files in spotify_data';

  return (
    <div className="sc-field">
      <span className="sc-field-label">Data Source</span>
      <div className="sc-dropdown" ref={ref}>
        <button
          type="button"
          className={`sc-dropdown-trigger ${open ? 'open' : ''}`}
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
        >
          <span className="sc-dropdown-value">
            <Icons.FileText style={{ width: 14, height: 14, opacity: 0.5 }} />
            {displayValue}
          </span>
          <svg className={`sc-dropdown-chevron ${open ? 'rotated' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {open && (
          <div className="sc-dropdown-menu">
            <button
              className={`sc-dropdown-item ${!value ? 'active' : ''}`}
              onClick={() => { onChange(''); setOpen(false); }}
            >
              <span>All files in spotify_data</span>
              {!value && <span className="sc-dropdown-item-check">✓</span>}
            </button>
            {sources.map(file => (
              <button
                key={file}
                className={`sc-dropdown-item ${value === file ? 'active' : ''}`}
                onClick={() => { onChange(file); setOpen(false); }}
              >
                <span>{file}</span>
                {value === file && <span className="sc-dropdown-item-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Circular progress ring
function ProgressRing({ progress, size = 72, stroke = 5, active }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className={`sc-ring ${active ? 'active' : ''}`}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="var(--primary)" strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="var(--text-main)" fontSize="14" fontWeight="700" fontFamily="var(--font-sans)">
        {Math.round(progress)}%
      </text>
    </svg>
  );
}

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
  const [showTerminal, setShowTerminal] = useState(false);

  useEffect(() => {
    if (terminalEndRef.current && showTerminal) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scraperOutput, showTerminal]);

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

  // Overall progress
  const itemWeight = total > 0 ? 1 / total : 0;
  let overallProgress = total > 0 ? ((Math.max(0, current - 1) / total) + (percent / 100 * itemWeight)) * 100 : 0;
  if (overallProgress > 100) overallProgress = 100;
  if (current === 0) overallProgress = 0;

  const isRunning = scraperStatus === 'running';
  const isDone = scraperStatus === 'success';
  const isError = scraperStatus === 'error' || (hasError && !isDone);
  const hasOutput = !!scraperOutput;

  if (isDone) overallProgress = 100;

  // Status badge
  let statusLabel = 'Ready';
  let statusColor = 'var(--text-muted)';
  if (isRunning) { statusLabel = 'Running'; statusColor = 'var(--accent-blue)'; }
  else if (isDone) { statusLabel = 'Complete'; statusColor = 'var(--primary)'; }
  else if (isError) { statusLabel = 'Error'; statusColor = '#f15e6c'; }
  else if (hasOutput) { statusLabel = 'Idle'; statusColor = 'var(--text-muted)'; }

  // Action status text
  let actionIcon = '●';
  if (currentAction === 'Searching') actionIcon = '◌';
  else if (currentAction === 'Downloading') actionIcon = '↓';
  else if (currentAction === 'Completed' || currentAction === 'Cached') actionIcon = '✓';
  else if (currentAction === 'Skipped') actionIcon = '⊘';

  const qualityOptions = [
    { value: 'api', label: 'Fast · 192kbps', desc: 'Quick track downloads', icon: '⚡' },
    { value: 'selenium', label: 'HQ · 320kbps', desc: 'Album-quality audio', icon: '◆' }
  ];

  return (
    <div className="tab-content animate-fade-in">
      <div>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.04em' }}>Downloader</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Configure and run batch MP3 downloads from YouTube</p>
      </div>

      <div className="sc-grid">
        {/* Configuration Panel */}
        <form className="sc-config" onSubmit={handleStartScrape}>
          <div className="sc-config-header">
            <span className="sc-config-title">Configuration</span>
            <span className="sc-status-pill" style={{ color: statusColor, borderColor: statusColor }}>
              {statusLabel}
            </span>
          </div>

          <OptionSelector
            label="Download Quality"
            options={qualityOptions}
            value={scraperType}
            onChange={setScraperType}
            disabled={isRunning}
          />

          <SourceSelector
            sources={sourceFiles}
            value={selectedSource}
            onChange={setSelectedSource}
            disabled={isRunning}
          />

          <div className="sc-field">
            <span className="sc-field-label">Batch Limit</span>
            <div className="sc-limit-row">
              <button type="button" className="sc-limit-btn" disabled={isRunning || scraperLimit <= 1}
                onClick={() => setScraperLimit(Math.max(1, scraperLimit - 1))}>−</button>
              <input
                type="number"
                className="sc-limit-input"
                value={scraperLimit}
                onChange={(e) => setScraperLimit(parseInt(e.target.value) || 1)}
                disabled={isRunning}
                min="1"
                required
              />
              <button type="button" className="sc-limit-btn" disabled={isRunning}
                onClick={() => setScraperLimit(scraperLimit + 1)}>+</button>
            </div>
          </div>

          <div className="sc-actions">
            {isRunning ? (
              <button type="button" className="sc-btn-stop" onClick={handleStopScrape}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="10" height="10" rx="2"/></svg>
                Stop
              </button>
            ) : (
              <button type="submit" className="sc-btn-start">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>
                Start Download
              </button>
            )}
          </div>
        </form>

        {/* Progress Panel */}
        <div className="sc-progress-area">
          {(isRunning || hasOutput) ? (
            <div className={`sc-progress-card ${isRunning ? 'running' : ''} ${isDone ? 'done' : ''} ${isError ? 'error' : ''}`}>
              {/* Top row: ring + track info */}
              <div className="sc-progress-top">
                <ProgressRing progress={overallProgress} active={isRunning} />
                <div className="sc-progress-info">
                  <div className="sc-progress-track-name">
                    {currentTrack || (isRunning ? 'Initializing...' : isDone ? 'All tracks processed' : 'Scraper idle')}
                  </div>
                  <div className="sc-progress-meta">
                    <span className="sc-progress-action" style={{ color: isError ? '#f15e6c' : currentAction === 'Completed' || currentAction === 'Cached' ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {actionIcon} {currentAction}
                    </span>
                    {total > 0 && <span className="sc-progress-counter">{current} / {total} tracks</span>}
                    {eta !== '--:--' && isRunning && currentAction === 'Downloading' && (
                      <span className="sc-progress-eta">ETA {eta}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="sc-bar-track">
                <div className="sc-bar-fill" style={{ width: `${overallProgress}%`, background: isError ? '#f15e6c' : isDone ? 'var(--primary)' : 'linear-gradient(90deg, var(--accent-blue), var(--primary))' }}>
                  {isRunning && <div className="sc-bar-shimmer" />}
                </div>
              </div>

              {/* Footer */}
              <div className="sc-progress-footer">
                <span>{overallProgress.toFixed(1)}% complete</span>
                <button
                  type="button"
                  className="sc-terminal-toggle"
                  onClick={() => setShowTerminal(!showTerminal)}
                >
                  {showTerminal ? 'Hide' : 'Show'} Raw Logs
                  <svg className={`sc-toggle-chevron ${showTerminal ? 'open' : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* Terminal */}
              {showTerminal && (
                <div className="sc-terminal">
                  <div className="sc-terminal-header">
                    <div className="sc-terminal-dots">
                      <span style={{ background: '#FF5F56' }} /><span style={{ background: '#FFBD2E' }} /><span style={{ background: '#27C93F' }} />
                    </div>
                    <span className="sc-terminal-title">scraper output</span>
                  </div>
                  <pre className="sc-terminal-body">
                    {scraperOutput}
                    <span ref={terminalEndRef} />
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="sc-empty-state">
              <div className="sc-empty-ring">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                  <circle cx="40" cy="40" r="34" stroke="rgba(255,255,255,0.06)" strokeWidth="4" strokeDasharray="6 6"/>
                  <path d="M33 28v24l20-12z" fill="rgba(255,255,255,0.12)"/>
                </svg>
              </div>
              <p className="sc-empty-title">Ready to download</p>
              <span className="sc-empty-desc">Configure your settings and hit start to begin the batch process.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
