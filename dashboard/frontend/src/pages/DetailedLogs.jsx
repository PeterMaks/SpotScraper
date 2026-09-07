
import { useState, useEffect, useRef } from "react";
import { useAppContext } from '../AppContext';
import * as Icons from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';

export default function DetailedLogs() {
  const { logs, fetchLogs, loadingLogs, logsFilter, setLogsFilter, logsSearch, setLogsSearch, backendUrl } = useAppContext();
  const [selectedLogs, setSelectedLogs] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);

  const [activeRect, setActiveRect] = useState({ left: 0, width: 0, isInitial: true });
  const containerRef = useRef(null);
  const tabRefs = useRef({});

  useEffect(() => {
    const activeTab = tabRefs.current[logsFilter];
    const container = containerRef.current;
    if (activeTab && container) {
      const update = () => {
        const parentRect = container.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        setActiveRect({
          left: tabRect.left - parentRect.left,
          width: tabRect.width,
          isInitial: false
        });
      };
      const raf = requestAnimationFrame(update);
      return () => cancelAnimationFrame(raf);
    }
  }, [logsFilter, logs]);

  useEffect(() => {
    const handleResize = () => {
      const activeTab = tabRefs.current[logsFilter];
      const container = containerRef.current;
      if (activeTab && container) {
        const parentRect = container.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        setActiveRect(prev => ({
          left: tabRect.left - parentRect.left,
          width: tabRect.width,
          isInitial: prev.isInitial
        }));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [logsFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const getLogsList = () => {
    const list = [];
    if (logs?.downloadLinks) {
      Object.entries(logs.downloadLinks).forEach(([query, info]) => {
        let title = info.title || query;
        let artist = info.artist || 'Unknown Artist';
        if ((artist === 'Unknown Artist' || artist === 'Local Cache') && query.includes(' - ')) {
          const parts = query.split(' - ');
          artist = parts[0].trim();
        }
        let rawTime = 0;
        const timeStr = info.download_completed || info.search_time;
        if (timeStr && timeStr !== '-') {
          const parsed = new Date(timeStr.replace(' ', 'T')).getTime();
          if (!isNaN(parsed)) rawTime = parsed;
        }
        list.push({ query, title, artist, album: info.album || 'Unknown Album', duration: info.duration || '-', source: info.source === 'selenium' ? 'Selenium Scraper' : 'API Scraper', status: info.status || 'unknown', time: timeStr || '-', error: info.error || null, rawTime });
      });
    }
    if (logs?.scrapeLog) {
      Object.entries(logs.scrapeLog).forEach(([query, status]) => {
        let resolvedStatus = 'unknown';
        const lowerStatus = status.toLowerCase();
        if (lowerStatus.includes('success')) resolvedStatus = 'downloaded';
        else if (lowerStatus.includes('failed')) resolvedStatus = 'not_found';
        else if (lowerStatus.includes('skipped mismatch')) resolvedStatus = 'skipped mismatch';
        else if (lowerStatus.includes('skipped')) resolvedStatus = 'skipped';
        
        if (!list.some(item => item.query === query)) {
          let title = query;
          let artist = '-';
          if (query.includes(' - ')) {
            const parts = query.split(' - ');
            artist = parts[0].trim();
          }
          list.push({ query, title, artist, album: '-', duration: '-', source: 'Selenium Scraper', status: resolvedStatus, time: '-', error: status.includes('Failed') ? status : null, rawTime: 0 });
        }
      });
    }
    list.sort((a, b) => b.rawTime - a.rawTime);
    return list;
  };

  const filteredLogs = getLogsList().filter(item => {
    if (logsFilter === 'DOWNLOADED' && item.status !== 'downloaded') return false;
    if (logsFilter === 'NOT_FOUND' && item.status !== 'not_found') return false;
    if (logsFilter === 'ERROR' && item.status !== 'error' && item.status !== 'api_error' && item.status !== 'timeout') return false;
    if (logsFilter === 'SKIPPED/MISMATCH/UNKNOWN' && !['skipped', 'mismatch', 'skipped_mismatch', 'unknown'].includes(item.status)) return false;
    const term = logsSearch.toLowerCase();
    return item.query.toLowerCase().includes(term) || item.title.toLowerCase().includes(term) || item.artist.toLowerCase().includes(term) || item.album.toLowerCase().includes(term);
  });

  const handleCheckboxClick = (e, query, index) => {
    e.stopPropagation();
    const newSelected = new Set(selectedLogs);
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const isSelected = newSelected.has(query);
      for (let i = start; i <= end; i++) {
        if (isSelected) newSelected.delete(filteredLogs[i].query);
        else newSelected.add(filteredLogs[i].query);
      }
    } else {
      if (newSelected.has(query)) newSelected.delete(query);
      else newSelected.add(query);
    }
    setSelectedLogs(newSelected);
    setLastSelectedIndex(index);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedLogs(new Set(filteredLogs.map(item => item.query)));
    else setSelectedLogs(new Set());
    setLastSelectedIndex(null);
  };

  const handleBatchDelete = async () => {
    if (!window.confirm(`Are you sure you want to archive ${selectedLogs.size} logs?`)) return;
    try {
      const res = await fetch(`${backendUrl}/api/logs/delete-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: Array.from(selectedLogs) })
      });
      if (res.ok) {
        setSelectedLogs(new Set());
        fetchLogs();
      }
    } catch (err) { console.error(err); }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear ALL logs? They will be archived.')) return;
    try {
      const res = await fetch(`${backendUrl}/api/logs/clear`, { method: 'POST' });
      if (res.ok) {
        setSelectedLogs(new Set());
        fetchLogs();
      }
    } catch (err) { console.error(err); }
  };

  const statusConfig = {
    downloaded: { label: "Downloaded", className: "bg-[#1ed760]/15 text-[#1ed760] border-[#1ed760]/30" },
    ready_to_download: { label: "Ready", className: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
    not_found: { label: "Not Found", className: "bg-[#f3727f]/15 text-[#f3727f] border-[#f3727f]/30" },
    error: { label: "Error", className: "bg-[#f3727f]/15 text-[#f3727f] border-[#f3727f]/30" },
    api_error: { label: "API Error", className: "bg-[#f3727f]/15 text-[#f3727f] border-[#f3727f]/30" },
    timeout: { label: "Timeout", className: "bg-[#f3727f]/15 text-[#f3727f] border-[#f3727f]/30" },
    skipped: { label: "Skipped", className: "bg-[#ffa42b]/15 text-[#ffa42b] border-[#ffa42b]/30" },
    mismatch: { label: "Mismatch", className: "bg-[#ffa42b]/15 text-[#ffa42b] border-[#ffa42b]/30" },
    skipped_mismatch: { label: "Mismatch", className: "bg-[#ffa42b]/15 text-[#ffa42b] border-[#ffa42b]/30" },
    unknown: { label: "Unknown", className: "bg-muted text-muted-foreground border-border" }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-32">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-extrabold tracking-tight">Execution & Scrape Logs</h2>
          <p className="text-muted-foreground mt-2 text-lg">Detailed report of all searched queries and their resolve status</p>
        </div>
        <div className="flex gap-3">
          <Button variant="destructive" onClick={handleClearAll} disabled={loadingLogs || getLogsList().length === 0} size="lg">
            <Icons.Trash2 className="mr-2 size-4" /> Clear All
          </Button>
          <Button variant="secondary" onClick={fetchLogs} disabled={loadingLogs} size="lg">
            <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh Logs
          </Button>
        </div>
      </div>

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div ref={containerRef} className="t-tabs" role="tablist">
          <span 
            className="t-tabs-pill" 
            style={{ 
              transform: `translateX(${activeRect.left}px)`, 
              width: `${activeRect.width}px`,
              transition: activeRect.isInitial ? 'none' : undefined 
            }} 
            aria-hidden="true" 
          />
          {['ALL', 'DOWNLOADED', 'NOT_FOUND', 'ERROR', 'SKIPPED/MISMATCH/UNKNOWN'].map(status => (
            <button 
              key={status}
              ref={el => tabRefs.current[status] = el}
              role="tab"
              aria-selected={logsFilter === status}
              className="t-tab" 
              onClick={() => setLogsFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="relative w-72 max-w-full">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input type="text" placeholder="Search logs..." value={logsSearch} onChange={(e) => setLogsSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <Card className="border border-border shadow-sm overflow-hidden rounded-2xl backdrop-blur-xl">
        <div className="rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[50px] text-center">
                  <input type="checkbox" className="accent-primary w-4 h-4 cursor-pointer" checked={filteredLogs.length > 0 && selectedLogs.size === filteredLogs.length} onChange={handleSelectAll} />
                </TableHead>
                <TableHead className="text-muted-foreground">Query / Song Name</TableHead>
                <TableHead className="text-muted-foreground">Resolved Match</TableHead>
                <TableHead className="text-muted-foreground">Album / Artist</TableHead>
                <TableHead className="text-muted-foreground">Engine</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLogs ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Loading log files...</TableCell></TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No log files parsed.</TableCell></TableRow>
              ) : (
                filteredLogs.map((item, idx) => {
                  const isSelected = selectedLogs.has(item.query);
                  const sConfig = statusConfig[item.status] || statusConfig.unknown;
                  return (
                    <TableRow key={idx} data-state={isSelected ? "selected" : undefined} className={`cursor-pointer border-border transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted'}`} onClick={(e) => { if (e.target.type !== 'checkbox') handleCheckboxClick(e, item.query, idx); }}>
                      <TableCell className="text-center py-3" onClick={(e) => handleCheckboxClick(e, item.query, idx)}>
                        <input type="checkbox" className="accent-primary w-4 h-4 pointer-events-none cursor-pointer" checked={isSelected} readOnly />
                      </TableCell>
                      <TableCell className="font-medium py-3">{item.query}</TableCell>
                      <TableCell className="py-3">{item.title !== item.query ? item.title : '-'}</TableCell>
                      <TableCell className="py-3">
                        {item.artist !== '-' ? (
                          <div className="flex flex-col"><span>{item.artist}</span><span className="text-xs text-muted-foreground mt-1">{item.album}</span></div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground py-3">{item.source}</TableCell>
                      <TableCell className="py-3">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${sConfig.className}`}>{sConfig.label}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground py-3">{item.time}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {selectedLogs.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl px-6 py-4 flex items-center gap-6 z-40 animate-in slide-in-from-bottom-10 fade-in duration-300 border border-border">
          <span className="text-primary font-bold text-lg">{selectedLogs.size} logs selected</span>
          <div className="flex items-center gap-2">
            <Button variant="destructive" onClick={handleBatchDelete} className="rounded-xl h-10"><Icons.Trash className="size-4 mr-2" /> Archive Selected</Button>
            <Button variant="ghost" onClick={() => setSelectedLogs(new Set())} className="rounded-xl h-10">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

