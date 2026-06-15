import React, { useState, useEffect, useRef } from 'react';
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

  useEffect(() => { fetchLogs(); }, []);

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
    if (!window.confirm(`Are you sure you want to delete ${selectedLogs.size} logs? They will be archived.`)) return;
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
    } catch (err) {}
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear ALL logs? They will be archived.')) return;
    try {
      const res = await fetch(`${backendUrl}/api/logs/clear`, { method: 'POST' });
      if (res.ok) {
        setSelectedLogs(new Set());
        fetchLogs();
      }
    } catch (err) {}
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-32">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Execution & Scrape Logs</h2>
          <p className="text-muted-foreground mt-1">Detailed report of all searched queries and their resolve status</p>
        </div>
        <div className="flex gap-3">
          <Button variant="destructive" onClick={handleClearAll} disabled={loadingLogs || getLogsList().length === 0}>
            Clear All
          </Button>
          <Button variant="secondary" onClick={fetchLogs} disabled={loadingLogs}>
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
        <div className="w-72">
          <Input type="text" placeholder="Search logs..." value={logsSearch} onChange={(e) => setLogsSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <input type="checkbox" className="accent-primary w-4 h-4" checked={filteredLogs.length > 0 && selectedLogs.size === filteredLogs.length} onChange={handleSelectAll} />
                </TableHead>
                <TableHead>Query / Song Name</TableHead>
                <TableHead>Resolved Match</TableHead>
                <TableHead>Album / Artist</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLogs ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center">Loading log files...</TableCell></TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No log files parsed.</TableCell></TableRow>
              ) : (
                filteredLogs.map((item, idx) => {
                  const isSelected = selectedLogs.has(item.query);
                  const statusColors = { downloaded: "bg-green-500/10 text-green-500 border-green-500/20", ready_to_download: "bg-blue-500/10 text-blue-500 border-blue-500/20", not_found: "bg-red-500/10 text-red-500 border-red-500/20", error: "bg-red-500/10 text-red-500 border-red-500/20", api_error: "bg-red-500/10 text-red-500 border-red-500/20", timeout: "bg-red-500/10 text-red-500 border-red-500/20" };
                  const colorClass = statusColors[item.status] || "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
                  return (
                    <TableRow key={idx} data-state={isSelected ? "selected" : undefined} className="cursor-pointer" onClick={(e) => { if (e.target.type !== 'checkbox') handleCheckboxClick(e, item.query, idx); }}>
                      <TableCell className="text-center" onClick={(e) => handleCheckboxClick(e, item.query, idx)}>
                        <input type="checkbox" className="accent-primary w-4 h-4 pointer-events-none" checked={isSelected} readOnly />
                      </TableCell>
                      <TableCell className="font-medium">{item.query}</TableCell>
                      <TableCell>{item.title !== item.query ? item.title : '-'}</TableCell>
                      <TableCell>
                        {item.artist !== '-' ? (
                          <div className="flex flex-col"><span>{item.artist}</span><span className="text-xs text-muted-foreground">{item.album}</span></div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.source}</TableCell>
                      <TableCell>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>{item.status.replace(/_/g, ' ').toUpperCase()}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{item.time}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {selectedLogs.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-background border shadow-xl rounded-full px-6 py-3 flex items-center gap-6 z-40 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <span className="text-primary font-medium">{selectedLogs.size} logs selected</span>
          <div className="flex items-center gap-2">
            <Button variant="destructive" onClick={handleBatchDelete} className="rounded-full h-9"><Icons.Trash className="size-4 mr-2" /> Archive Selected</Button>
            <Button variant="ghost" onClick={() => setSelectedLogs(new Set())} className="rounded-full h-9">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
