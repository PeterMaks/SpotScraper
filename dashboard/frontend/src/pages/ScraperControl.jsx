
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import Icons from '../components/Icons';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"

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

function ProgressRing({ progress, size = 96, stroke = 6, active, isError }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const strokeColor = isError ? '#f3727f' : 'var(--primary)';

  return (
    <svg width={size} height={size} className={active ? 'animate-[spin_4s_linear_infinite]' : ''}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="currentColor" className="text-muted/20" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={strokeColor} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="currentColor" className="text-xl font-bold font-sans">
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

  const itemWeight = total > 0 ? 1 / total : 0;
  let overallProgress = total > 0 ? ((Math.max(0, current - 1) / total) + (percent / 100 * itemWeight)) * 100 : 0;
  if (overallProgress > 100) overallProgress = 100;
  if (current === 0) overallProgress = 0;

  const isRunning = scraperStatus === 'running';
  const isDone = scraperStatus === 'success';
  const isError = scraperStatus === 'error' || (hasError && !isDone);
  const hasOutput = !!scraperOutput;

  if (isDone) overallProgress = 100;

  let statusLabel = 'Ready';
  let badgeVariant = 'outline';
  if (isRunning) { statusLabel = 'Running'; badgeVariant = 'default'; }
  else if (isDone) { statusLabel = 'Complete'; badgeVariant = 'secondary'; }
  else if (isError) { statusLabel = 'Error'; badgeVariant = 'destructive'; }
  else if (hasOutput) { statusLabel = 'Idle'; badgeVariant = 'outline'; }

  let actionIcon = '●';
  if (currentAction === 'Searching') actionIcon = '◌';
  else if (currentAction === 'Downloading') actionIcon = '↓';
  else if (currentAction === 'Completed' || currentAction === 'Cached') actionIcon = '✓';
  else if (currentAction === 'Skipped') actionIcon = '⊘';

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-32">
      <div>
        <h2 className="text-4xl font-extrabold tracking-tight">Downloader</h2>
        <p className="text-muted-foreground mt-2 text-lg">Configure and run batch MP3 downloads from YouTube</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Configuration Panel */}
        <Card className="lg:col-span-5 flex flex-col border border-white/10 shadow-sm backdrop-blur-xl p-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
            <div>
              <CardTitle className="text-xl">Configuration</CardTitle>
              <CardDescription className="mt-1">Set your download parameters</CardDescription>
            </div>
            <Badge variant={badgeVariant} className="text-sm px-3 py-1">{statusLabel}</Badge>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-8">
            <form onSubmit={handleStartScrape} className="flex flex-col gap-8 flex-1">
              
              <div className="space-y-3">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Download Quality</label>
                <ToggleGroup type="single" value={scraperType} onValueChange={(val) => val && setScraperType(val)} disabled={isRunning} className="justify-start flex-col sm:flex-row w-full">
                  <ToggleGroupItem value="api" aria-label="Fast · 192kbps" className="flex-1 py-6 h-auto flex flex-col gap-1 items-start rounded-xl bg-card/20 backdrop-blur-sm transition-all duration-300 data-[state=on]:bg-[#1ed760]/15 data-[state=on]:border-[#1ed760]/50 data-[state=on]:shadow-[0_0_20px_rgba(30,215,96,0.2)] data-[state=on]:scale-[1.02] data-[state=off]:opacity-60 data-[state=off]:hover:opacity-90 data-[state=off]:hover:bg-card/30 border border-white/10">
                    <div className="flex items-center gap-2 font-bold text-base"><span className="text-xl">⚡</span> Fast · 192kbps</div>
                    <div className="text-xs text-muted-foreground font-normal">Quick track downloads</div>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="selenium" aria-label="HQ · 320kbps" className="flex-1 py-6 h-auto flex flex-col gap-1 items-start rounded-xl bg-card/20 backdrop-blur-sm transition-all duration-300 data-[state=on]:bg-[#1ed760]/15 data-[state=on]:border-[#1ed760]/50 data-[state=on]:shadow-[0_0_20px_rgba(30,215,96,0.2)] data-[state=on]:scale-[1.02] data-[state=off]:opacity-60 data-[state=off]:hover:opacity-90 data-[state=off]:hover:bg-card/30 border border-white/10">
                    <div className="flex items-center gap-2 font-bold text-base"><span className="text-xl">◆</span> HQ · 320kbps</div>
                    <div className="text-xs text-muted-foreground font-normal">Album-quality audio</div>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Data Source</label>
                <Select disabled={isRunning} value={selectedSource || 'all'} onValueChange={(v) => setSelectedSource(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-full h-11 text-base">
                    <SelectValue placeholder="Select data source..." />
                  </SelectTrigger>
                  <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                    <SelectItem value="all">All files in spotify_data</SelectItem>
                    {sourceFiles.map(file => (
                      <SelectItem key={file} value={file}>{file}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Batch Limit</label>
                <div className="flex items-center gap-2 max-w-40">
                  <Button type="button" variant="outline" size="icon" disabled={isRunning || scraperLimit <= 1} onClick={() => setScraperLimit(Math.max(1, scraperLimit - 1))} className="h-11 w-11">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
                  </Button>
                  <Input 
                    type="number" 
                    value={scraperLimit} 
                    onChange={(e) => setScraperLimit(parseInt(e.target.value) || 1)} 
                    disabled={isRunning} 
                    min="1" 
                    required 
                    className="text-center text-base font-bold h-11 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  />
                  <Button type="button" variant="outline" size="icon" disabled={isRunning} onClick={() => setScraperLimit(scraperLimit + 1)} className="h-11 w-11">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                  </Button>
                </div>
              </div>

              <div className="mt-auto pt-4 flex">
                {isRunning ? (
                  <Button type="button" variant="destructive" className="w-full h-12 text-base" onClick={handleStopScrape}>
                    <svg className="mr-2 size-4" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="10" height="10" rx="2"/></svg>
                    Stop Download
                  </Button>
                ) : (
                  <Button type="submit" className="w-full h-12 text-base bg-primary hover:bg-primary/90 text-primary-foreground">
                    <svg className="mr-2 size-4" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>
                    Start Download
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Progress Panel */}
        <Card className={`lg:col-span-7 flex flex-col overflow-hidden transition-colors border shadow-sm backdrop-blur-xl ${isRunning ? 'ring-2 ring-primary/50' : isDone ? 'ring-2 ring-green-500/50' : isError ? 'ring-2 ring-red-500/50' : 'border-white/10'}`}>
          <CardContent className="p-0 flex-1 flex flex-col">
            {(isRunning || hasOutput) ? (
              <div className="flex flex-col h-full">
                {/* Top row: ring + track info */}
                <div className="p-8 flex items-center gap-8">
                  <ProgressRing progress={overallProgress} active={isRunning} isError={isError} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold truncate mb-2" title={currentTrack}>
                      {currentTrack || (isRunning ? 'Initializing...' : isDone ? 'All tracks processed' : 'Scraper idle')}
                    </h3>
                    <div className="flex items-center gap-3 text-sm flex-wrap">
                      <span className={`font-bold ${isError ? 'text-destructive' : currentAction === 'Completed' || currentAction === 'Cached' ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {actionIcon} {currentAction}
                      </span>
                      {total > 0 && <span className="text-muted-foreground bg-muted px-3 py-1 rounded-full text-xs font-bold">{current} / {total} tracks</span>}
                      {eta !== '--:--' && isRunning && currentAction === 'Downloading' && (
                        <span className="text-muted-foreground text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-bold">ETA {eta}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-muted relative overflow-hidden">
                  <div 
                    className={`absolute inset-y-0 left-0 transition-all duration-300 ease-out ${isError ? 'bg-destructive' : isDone ? 'bg-green-500' : 'bg-primary'}`} 
                    style={{ width: `${overallProgress}%` }}
                  >
                    {isRunning && <div className="absolute inset-0 bg-white/20 animate-[pulse_2s_ease-in-out_infinite]" />}
                  </div>
                </div>

                {/* Footer / Terminal Toggle */}
                <div className="p-4 bg-muted/30 flex items-center justify-between">
                  <span className="text-sm font-bold">{overallProgress.toFixed(1)}% complete</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowTerminal(!showTerminal)} className="h-9">
                    {showTerminal ? 'Hide' : 'Show'} Raw Logs
                    <svg className={`ml-2 size-3 transition-transform ${showTerminal ? 'rotate-180' : ''}`} viewBox="0 0 10 10" fill="none">
                      <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Button>
                </div>

                {/* Terminal */}
                <div className={`bg-black/80 backdrop-blur-xl text-zinc-50 font-mono text-xs flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.5)] t-resize-height overflow-y-auto custom-scrollbar ${showTerminal ? 'max-h-[300px] p-4' : 'max-h-0 p-0 border-transparent'}`}>
                  <div className="flex items-center gap-1.5 mb-3 sticky top-0 bg-black/80 backdrop-blur-md pb-2 z-10 rounded-b-lg -mx-2 px-2 -mt-2 pt-2">
                    <span className="size-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                    <span className="size-3 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
                    <span className="size-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                    <span className="ml-2 text-zinc-400 drop-shadow-sm font-bold">scraper output</span>
                  </div>
                  <pre className="whitespace-pre-wrap flex-1">
                    {scraperOutput}
                    <span ref={terminalEndRef} />
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 p-12 text-center text-muted-foreground">
                <div className="size-24 mb-6 rounded-full flex items-center justify-center bg-muted/20">
                  <Icons.Scraper className="size-12 opacity-50" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Ready to download</h3>
                <p className="max-w-[250px] text-base">Configure your settings and hit start to begin the batch process.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

