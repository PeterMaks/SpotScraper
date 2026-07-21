
import React, { useState, useDeferredValue, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import Icons from '../components/Icons';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"

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

  const deferredSearch = useDeferredValue(downloadsSearch);
  const [isPending, startTransition] = useTransition();

  const filteredDownloads = downloads.filter(file => file.name.toLowerCase().includes(deferredSearch.toLowerCase()));

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
          script: 'selenium', 
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
    startTransition(() => {
      setSelectedFiles(newSelected);
    });
  };

  const handleSelectAll = (e) => {
    const isChecked = e.target.checked;
    startTransition(() => {
      if (isChecked) {
        setSelectedFiles(new Set(filteredDownloads.map(f => f.name)));
      } else {
        setSelectedFiles(new Set());
      }
    });
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
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-32">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-extrabold tracking-tight">Downloads Manager</h2>
          <p className="text-muted-foreground mt-2 text-lg">Manage and play audio files in your local downloads folder</p>
        </div>
        <Button variant="secondary" onClick={fetchDownloads} disabled={loadingDownloads} size="lg">
          <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Sync Files
        </Button>
      </div>

      <Card className="backdrop-blur-xl bg-card/40 border border-white/10 shadow-sm p-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Download a Specific Song</CardTitle>
          <CardDescription>Fetch a track immediately by name</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSingleDownload} className="flex gap-3 max-w-xl">
            <Input
              type="text"
              placeholder="Enter song name and artist (e.g. 'Blinding Lights The Weeknd')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={scraperStatus === 'running'}
              required
              className="flex-1 h-11"
            />
            <Button type="submit" disabled={scraperStatus === 'running'} size="lg">
              <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Song
            </Button>
          </form>
          {queryStatus && (
            <p className="text-sm text-primary mt-3 font-medium">
              {queryStatus}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="relative w-full max-w-md">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search downloaded files..."
            value={downloadsSearch}
            onChange={(e) => setDownloadsSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
      </div>

      <Card className="border border-white/10 shadow-sm overflow-hidden rounded-2xl backdrop-blur-xl">
        <div className="rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="w-[50px] text-center">
                  <input
                    type="checkbox"
                    className="accent-primary w-4 h-4 cursor-pointer"
                    checked={filteredDownloads.length > 0 && selectedFiles.size === filteredDownloads.length}
                    onChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-[50px] text-center text-muted-foreground">#</TableHead>
                <TableHead className="text-muted-foreground">Title</TableHead>
                <TableHead className="text-muted-foreground">Album</TableHead>
                <TableHead className="text-muted-foreground">Date added</TableHead>
                <TableHead className="text-right text-muted-foreground">
                  <Icons.Clock className="inline-block size-4" />
                </TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingDownloads ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    Scanning downloads folder...
                  </TableCell>
                </TableRow>
              ) : filteredDownloads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No downloaded audio files found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredDownloads.map((file, index) => {
                  let title = file.title || file.name.replace('.mp3', '');
                  let artist = file.artist || 'Unknown Artist';
                  let album = file.album || '-';

                  if (!file.title) {
                    const parts = title.split(' - ');
                    if (parts.length >= 2) {
                      artist = parts[0];
                      title = parts.slice(1).join(' - ');
                    }
                  }

                  const duration = file.duration && file.duration !== "-" ? file.duration : formatBytes(file.size);
                  const isRowPlaying = currentTrack?.name === file.name;
                  const isSelected = selectedFiles.has(file.name);

                  return (
                    <TableRow 
                      key={file.name}
                      data-state={isSelected ? "selected" : undefined}
                      className={`cursor-pointer group border-white/5 transition-colors ${isRowPlaying ? 'bg-primary/5' : isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                      onDoubleClick={() => handlePlayTrack(file)}
                      onClick={(e) => {
                        if (e.target.type === 'checkbox') return;
                        if (!isRowPlaying) handlePlayTrack(file);
                      }}
                    >
                      <TableCell className="text-center py-3" onClick={(e) => handleCheckboxClick(e, file, index)}>
                        <input
                          type="checkbox"
                          className="accent-primary w-4 h-4 pointer-events-none cursor-pointer"
                          checked={isSelected}
                          readOnly
                        />
                      </TableCell>
                      <TableCell className="text-center font-medium py-3" onClick={(e) => { e.stopPropagation(); handlePlayTrack(file); }}>
                        {isRowPlaying && isPlaying ? (
                          <div className="flex items-end justify-center gap-0.5 h-4">
                            <div className="w-1 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite] h-2"></div>
                            <div className="w-1 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_200ms] h-4"></div>
                            <div className="w-1 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_400ms] h-3"></div>
                          </div>
                        ) : (
                          <div className="relative flex items-center justify-center h-full">
                            <span className="group-hover:hidden text-muted-foreground">{index + 1}</span>
                            <Icons.Play className="size-4 hidden group-hover:block text-primary" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground overflow-hidden relative border border-white/5">
                            <img 
                              src={`${backendUrl}/api/downloads/art/${encodeURIComponent(file.name)}`} 
                              className="w-full h-full object-cover absolute inset-0 z-10" 
                              loading="lazy"
                              onError={(e) => { e.target.style.display = 'none'; }}
                              alt=""
                            />
                            <Icons.Music className="size-5 absolute z-0 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col">
                            <span className={`font-semibold truncate ${isRowPlaying ? 'text-primary' : ''}`}>{title}</span>
                            <span className="text-xs text-muted-foreground mt-1">{artist}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm py-3">{album}</TableCell>
                      <TableCell className="text-muted-foreground text-sm py-3">{new Date(file.mtime).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm py-3 tabular-nums">{duration}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" asChild onClick={(e) => e.stopPropagation()} className="rounded-lg hover:bg-primary/10 hover:text-primary">
                            <a href={`${backendUrl}${file.url}`} download={file.name} title="Save to disk">
                              <Icons.Download className="size-4" />
                            </a>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.name); }} title="Delete" className="rounded-lg text-red-500 hover:text-red-400 hover:bg-red-500/10">
                            <Icons.Trash className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {selectedFiles.size > 0 && createPortal(
        <div className={`fixed ${currentTrack ? 'bottom-32' : 'bottom-6'} left-1/2 -translate-x-1/2 w-[90%] max-w-2xl rounded-2xl bg-background/90 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] px-6 py-4 flex items-center justify-between gap-4 z-[110] animate-in slide-in-from-bottom-10 fade-in duration-300 transition-[bottom] duration-300`}>
          <span className="text-primary font-bold text-lg">{selectedFiles.size} items selected</span>
          <div className="flex items-center gap-2">
            <Button onClick={handleBatchDownload} className="rounded-xl h-10">
              <Icons.Download className="size-4 mr-2" /> Save as ZIP
            </Button>
            <Button variant="destructive" onClick={handleBatchDelete} className="rounded-xl h-10">
              <Icons.Trash className="size-4 mr-2" /> Delete
            </Button>
            <Button variant="ghost" onClick={() => setSelectedFiles(new Set())} className="rounded-xl h-10">
              Cancel
            </Button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

