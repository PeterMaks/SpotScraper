import React, { useState } from 'react';
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

  const filteredDownloads = downloads.filter(file => file.name.toLowerCase().includes(downloadsSearch.toLowerCase()));

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
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedFiles(new Set(filteredDownloads.map(f => f.name)));
    } else {
      setSelectedFiles(new Set());
    }
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
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-32">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Downloads Manager</h2>
          <p className="text-muted-foreground mt-1">Manage and play audio files in your local downloads folder</p>
        </div>
        <Button variant="secondary" onClick={fetchDownloads} disabled={loadingDownloads}>
          Sync Files
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Download a Specific Song</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSingleDownload} className="flex gap-4 max-w-xl">
            <Input
              type="text"
              placeholder="Enter song name and artist (e.g. 'Blinding Lights The Weeknd')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={scraperStatus === 'running'}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={scraperStatus === 'running'}>
              Download Song
            </Button>
          </form>
          {queryStatus && (
            <p className="text-sm text-blue-500 mt-2 font-medium">
              {queryStatus}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="max-w-xs">
        <Input
          type="text"
          placeholder="Search downloaded files..."
          value={downloadsSearch}
          onChange={(e) => setDownloadsSearch(e.target.value)}
        />
      </div>

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <input
                    type="checkbox"
                    className="accent-primary w-4 h-4"
                    checked={filteredDownloads.length > 0 && selectedFiles.size === filteredDownloads.length}
                    onChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-[50px] text-center">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Album</TableHead>
                <TableHead>Date added</TableHead>
                <TableHead className="text-right">
                  <Icons.Clock className="inline-block size-4" />
                </TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingDownloads ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Scanning downloads folder...
                  </TableCell>
                </TableRow>
              ) : filteredDownloads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
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
                      className={`cursor-pointer group ${isRowPlaying ? 'bg-primary/5' : ''}`}
                      onDoubleClick={() => handlePlayTrack(file)}
                      onClick={(e) => {
                        if (e.target.type === 'checkbox') return;
                        if (!isRowPlaying) handlePlayTrack(file);
                      }}
                    >
                      <TableCell className="text-center" onClick={(e) => handleCheckboxClick(e, file, index)}>
                        <input
                          type="checkbox"
                          className="accent-primary w-4 h-4 pointer-events-none"
                          checked={isSelected}
                          readOnly
                        />
                      </TableCell>
                      <TableCell className="text-center font-medium" onClick={(e) => { e.stopPropagation(); handlePlayTrack(file); }}>
                        {isRowPlaying && isPlaying ? (
                          <Icons.Music className="size-4 animate-pulse text-primary mx-auto" />
                        ) : (
                          <div className="relative flex items-center justify-center h-full">
                            <span className="group-hover:hidden">{index + 1}</span>
                            <Icons.Play className="size-4 hidden group-hover:block" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                            <Icons.Music className="size-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className={`font-medium ${isRowPlaying ? 'text-primary' : ''}`}>{title}</span>
                            <span className="text-sm text-muted-foreground">{artist}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{album}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{new Date(file.mtime).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">{duration}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" asChild onClick={(e) => e.stopPropagation()}>
                            <a href={`${backendUrl}${file.url}`} download={file.name} title="Save to disk">
                              <Icons.Download className="size-4" />
                            </a>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.name); }} title="Delete" className="text-red-500 hover:text-red-600 hover:bg-red-500/10">
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

      {selectedFiles.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-background border shadow-xl rounded-full px-6 py-3 flex items-center gap-6 z-40 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <span className="text-primary font-medium">{selectedFiles.size} items selected</span>
          <div className="flex items-center gap-2">
            <Button onClick={handleBatchDownload} className="rounded-full h-9">
              <Icons.Download className="size-4 mr-2" /> Save as ZIP
            </Button>
            <Button variant="destructive" onClick={handleBatchDelete} className="rounded-full h-9">
              <Icons.Trash className="size-4 mr-2" /> Delete
            </Button>
            <Button variant="ghost" onClick={() => setSelectedFiles(new Set())} className="rounded-full h-9">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
