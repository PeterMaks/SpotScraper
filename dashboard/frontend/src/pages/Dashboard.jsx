
import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react";
import { useAppContext } from '../AppContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import ListeningTrendChart from '../components/ListeningTrendChart';
import TimeOfDayChart from '../components/TimeOfDayChart';
import DayOfWeekChart from '../components/DayOfWeekChart';

// ── Merge two stats objects for the "All Platforms" view ──────────────────────
function mergeStats(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  const mergeTop = (listA, listB, isTrack = false) => {
    const map = {};
    for (const item of [...(listA || []), ...(listB || [])]) {
      const k = isTrack ? `${item.name}|${item.artist}` : item.name;
      map[k] = map[k]
        ? { ...map[k], hours: Math.round((map[k].hours + item.hours) * 10) / 10 }
        : { ...item };
    }
    return Object.values(map).sort((x, y) => y.hours - x.hours);
  };

  const mergeTrend = (tA, tB) => {
    const map = {};
    for (const d of (tA || [])) {
      map[d.date] = { ...map[d.date], date: d.date, spotifyHours: d.hours };
    }
    for (const d of (tB || [])) {
      map[d.date] = { ...map[d.date], date: d.date, appleHours: d.hours };
    }
    return Object.values(map)
      .map(d => ({
        date: d.date,
        hours: Math.round(((d.spotifyHours || 0) + (d.appleHours || 0)) * 10) / 10,
        spotifyHours: d.spotifyHours || 0,
        appleHours: d.appleHours || 0
      }))
      .sort((x, y) => x.date.localeCompare(y.date));
  };

  const mergeByTime = (tA, tB) =>
    (tA || []).map((item, i) => ({
      ...item,
      hours: Math.round((item.hours + (tB?.[i]?.hours || 0)) * 10) / 10,
    }));

  const mergeByDay = (dA, dB) =>
    (dA || []).map((item, i) => ({
      ...item,
      hours: Math.round((item.hours + (dB?.[i]?.hours || 0)) * 10) / 10,
    }));

  return {
    totalHours:        Math.round((a.totalHours + b.totalHours) * 10) / 10,
    totalMusicHours:   Math.round((a.totalMusicHours + b.totalMusicHours) * 10) / 10,
    totalPodcastHours: Math.round((a.totalPodcastHours + b.totalPodcastHours) * 10) / 10,
    uniqueArtists:     a.uniqueArtists + b.uniqueArtists,
    uniqueTracks:      a.uniqueTracks + b.uniqueTracks,
    uniquePodcasts:    a.uniquePodcasts + b.uniquePodcasts,
    totalPlays:        a.totalPlays + b.totalPlays,
    skippedCount:      a.skippedCount + b.skippedCount,
    maxStreak:         Math.max(a.maxStreak, b.maxStreak),
    avgDailyHours:     Math.round(((a.avgDailyHours + b.avgDailyHours) / 2) * 10) / 10,
    topArtists:        mergeTop(a.topArtists, b.topArtists).slice(0, 20),
    topTracks:         mergeTop(a.topTracks, b.topTracks, true).slice(0, 20),
    topPodcasts:       mergeTop(a.topPodcasts, b.topPodcasts).slice(0, 10),
    topAlbums:         mergeTop(a.topAlbums, b.topAlbums).slice(0, 10),
    topGenres:         mergeTop(a.topGenres, b.topGenres).slice(0, 15),
    listeningByDay:    mergeByDay(a.listeningByDay, b.listeningByDay),
    listeningByTime:   mergeByTime(a.listeningByTime, b.listeningByTime),
    dailyTrend:        mergeTrend(a.dailyTrend, b.dailyTrend),
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function NumberPopIn({ value }) {
  
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      
      const raf = requestAnimationFrame(() => {});
      return () => cancelAnimationFrame(raf);
    }
  }, [value]);

  

  const str = String(value ?? '');
  return (
    <span className="inline-flex flex-nowrap whitespace-nowrap t-number-pop">
      {str.split('').map((ch, i) => {
        const stagger = i === str.length - 2 ? "1" : i === str.length - 1 ? "2" : undefined;
        return <span key={i} className="t-digit" data-stagger={stagger}>{ch}</span>;
      })}
    </span>
  );
}

function StatCard({ label, value, unit, accent, footnote }) {
  return (
    <Card
      className="bg-card border border-border shadow-sm p-6 cursor-default"
      style={{
        transition:
          'transform 200ms cubic-bezier(0.23,1,0.32,1), box-shadow 200ms cubic-bezier(0.23,1,0.32,1)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(30,215,96,0.12), 0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
    >
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`font-extrabold text-3xl tabular-nums ${accent || ''}`}>
          <NumberPopIn value={value} /> {unit && <span className="text-base font-medium text-muted-foreground">{unit}</span>}
        </p>
        {footnote && <span className="text-xs text-muted-foreground mt-2 block font-medium">{footnote}</span>}
      </CardContent>
    </Card>
  );
}

const TOGGLE_VIEWS = [
  { key: 'all',     label: 'All Platforms' },
  { key: 'spotify', label: 'Spotify' },
  { key: 'apple',   label: 'Apple Music' },
];

/**
 * Sliding-pill tab strip — uses the .t-tabs / .t-tabs-pill CSS already defined
 * in index.css. The indicator physically moves between options.
 */
function PlatformToggle({ view, setView }) {
  const tabRefs = useRef([]);
  const pillRef = useRef(null);

  const movePill = useCallback((idx) => {
    const tab = tabRefs.current[idx];
    const pill = pillRef.current;
    if (!tab || !pill) return;
    pill.style.width = `${tab.offsetWidth}px`;
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
  }, []);

  useLayoutEffect(() => {
    const idx = TOGGLE_VIEWS.findIndex(v => v.key === view);
    movePill(idx >= 0 ? idx : 0);
  }, [view, movePill]);

  return (
    <div className="t-tabs" role="tablist">
      <div ref={pillRef} className="t-tabs-pill" />
      {TOGGLE_VIEWS.map(({ key, label }, idx) => (
        <button
          key={key}
          id={`platform-toggle-${key}`}
          ref={el => { tabRefs.current[idx] = el; }}
          role="tab"
          aria-selected={view === key}
          onClick={() => setView(key)}
          className="t-tab"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const {
    stats,
    appleStats,
    fetchStats,
    fetchAppleStats,
    loadingStats,
    loadingAppleStats,
    platformView,
    setPlatformView,
    uploadStatus,
    uploading,
    handleFileUpload,
    backendUrl,
  } = useAppContext();

  const [appleUploading, setAppleUploading] = useState(false);
  const [appleUploadStatus, setAppleUploadStatus] = useState('');

  const handleAppleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setAppleUploading(true);
    setAppleUploadStatus('Uploading...');
    let ok = 0;
    try {
      for (const file of files) {
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(',')[1]);
          r.onerror = () => rej(r.error);
          r.readAsDataURL(file);
        });
        const resp = await fetch(`${backendUrl}/api/apple/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, content: base64 }),
        });
        if (resp.ok) ok++;
      }
      setAppleUploadStatus(`Uploaded ${ok} file(s). Refreshing...`);
      fetchAppleStats();
    } catch (err) {
      setAppleUploadStatus(`Upload failed: ${err.message}`);
    } finally {
      setAppleUploading(false);
      setTimeout(() => setAppleUploadStatus(''), 5000);
    }
  };

  const selectedStats = useMemo(() => {
    if (platformView === 'spotify') return stats;
    if (platformView === 'apple')   return appleStats;
    return mergeStats(stats, appleStats);
  }, [platformView, stats, appleStats]);

  const isLoading = platformView === 'spotify' ? loadingStats
    : platformView === 'apple' ? loadingAppleStats
    : loadingStats || loadingAppleStats;

  const platformLabel = platformView === 'spotify' ? 'Spotify'
    : platformView === 'apple' ? 'Apple Music'
    : 'All Platforms';

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-extrabold tracking-tight">Recaps &amp; Insights</h2>
          <p className="text-muted-foreground mt-2 text-lg">Listening stats · {platformLabel}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <PlatformToggle view={platformView} setView={setPlatformView} />
          <Button variant="secondary" size="lg" onClick={() => { fetchStats(); fetchAppleStats(); }} disabled={isLoading}>
            <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </Button>
        </div>
      </div>

      {/* Upload Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card border border-dashed border-border shadow-sm transition-colors hover:border-primary/50 p-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Spotify Data</CardTitle>
            <CardDescription>StreamingHistory*.json, Playlist*.json, .csv / .xlsx</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button asChild disabled={uploading} size="lg">
                <label className="cursor-pointer">
                  <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Choose Files
                  <input type="file" multiple accept=".json,.csv" onChange={handleFileUpload} className="hidden" disabled={uploading} />
                </label>
              </Button>
              {uploadStatus && (
                <span className={`text-sm font-medium ${uploading ? 'text-primary' : 'text-foreground'}`}>{uploadStatus}</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-dashed border-border shadow-sm transition-colors hover:border-primary/50 p-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Apple Music Data</CardTitle>
            <CardDescription>Apple Music - Play History Daily Tracks .csv</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button asChild disabled={appleUploading} size="lg">
                <label className="cursor-pointer">
                  <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Choose Files
                  <input type="file" multiple accept=".csv,.json" onChange={handleAppleUpload} className="hidden" disabled={appleUploading} />
                </label>
              </Button>
              {appleUploadStatus && (
                <span className={`text-sm font-medium ${appleUploading ? 'text-primary' : 'text-foreground'}`}>{appleUploadStatus}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        /* Shimmer skeleton that matches the real layout */
        <div className="flex flex-col gap-8">
          {/* Stat cards skeleton */}
          <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-6 flex flex-col gap-3">
                <div className="skeleton-shimmer h-3 w-20 rounded" />
                <div className="skeleton-shimmer h-8 w-16 rounded" />
                <div className="skeleton-shimmer h-3 w-12 rounded" />
              </div>
            ))}
          </div>
          {/* Chart area skeleton */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-4">
            <div className="skeleton-shimmer h-64 rounded-xl col-span-1 lg:col-span-3" />
            <div className="skeleton-shimmer h-64 rounded-xl" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="skeleton-shimmer h-48 rounded-xl" />
            <div className="skeleton-shimmer h-48 rounded-xl" />
          </div>
          <p className="text-center text-sm text-muted-foreground mt-2">Aggregating {platformLabel} stats&hellip;</p>
        </div>
      ) : selectedStats ? (
        <div className="flex flex-col gap-8">

          {/* Stat Cards — stagger in on mount */}
          <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <div className="stagger-item"><StatCard label="Total Listening" value={selectedStats.totalHours} unit="Hrs" /></div>
            <div className="stagger-item"><StatCard label="Music Playtime" value={selectedStats.totalMusicHours} unit="Hrs" accent="text-green-500" /></div>
            <div className="stagger-item"><StatCard label="Podcast Playtime" value={selectedStats.totalPodcastHours} unit="Hrs" accent="text-emerald-400" /></div>
            <div className="stagger-item">
              <StatCard
                label="Unique Artists"
                value={selectedStats.uniqueArtists}
                footnote={selectedStats.uniqueTracks ? `${selectedStats.uniqueTracks} tracks` : undefined}
              />
            </div>
            <div className="stagger-item">
              <StatCard
                label="Listening Streak"
                value={selectedStats.maxStreak || '—'}
                unit={selectedStats.maxStreak ? 'days' : ''}
                footnote={selectedStats.avgDailyHours ? `~${selectedStats.avgDailyHours}h/day avg` : undefined}
              />
            </div>
          </div>

          {/* Trend + Time of Day */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-4">
            <ListeningTrendChart data={selectedStats.dailyTrend || []} isAllPlatforms={platformView === 'all'} />
            <TimeOfDayChart data={selectedStats.listeningByTime || []} />
          </div>

          {/* Day of Week + Genres */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-4">
            <DayOfWeekChart data={selectedStats.listeningByDay || []} />
            <Card className="bg-card border border-border shadow-sm col-span-1 md:col-span-2 p-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Top Genres</CardTitle>
                <CardDescription>By total listening hours</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {(selectedStats.topGenres || []).slice(0, 10).map((genre, idx) => {
                  const pct = (genre.hours / ((selectedStats.topGenres || [])[0]?.hours || 1)) * 100;
                  return (
                    <div key={genre.name} className="stagger-item flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold truncate pr-4 capitalize flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] tabular-nums py-0 px-1.5 rounded-md">{idx + 1}</Badge>
                          {genre.name}
                        </span>
                        <span className="text-muted-foreground shrink-0 tabular-nums font-medium">{genre.hours} hrs</span>
                      </div>
                      <div className="progress-animate"><Progress value={pct} className="h-2" /></div>
                    </div>
                  );
                })}
                {(!selectedStats.topGenres || selectedStats.topGenres.length === 0) && (
                  <p className="text-muted-foreground text-center py-8 text-sm">
                    No genre data found. Make sure library/JSON export is present.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Artists + Tracks */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-card border border-border shadow-sm p-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Top Artists</CardTitle>
                <CardDescription>Top 20</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {selectedStats.topArtists.slice(0, 10).map((artist, idx) => {
                  const pct = (artist.hours / (selectedStats.topArtists[0]?.hours || 1)) * 100;
                  return (
                    <div key={artist.name} className="stagger-item flex flex-col gap-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold truncate pr-4">{idx + 1}. {artist.name}</span>
                        <span className="text-muted-foreground shrink-0 font-medium">{artist.hours} hrs</span>
                      </div>
                      <div className="progress-animate"><Progress value={pct} className="h-2" /></div>
                    </div>
                  );
                })}
                {selectedStats.topArtists.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">No artist data found.</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border border-border shadow-sm p-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Top Tracks</CardTitle>
                <CardDescription>Top 20</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Track Info</TableHead>
                      <TableHead className="text-right text-muted-foreground">Playtime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedStats.topTracks.slice(0, 10).map((track, idx) => (
                      <TableRow key={`${track.name}-${track.artist}`} className="stagger-item border-border">
                        <TableCell className="py-3">
                          <div className="font-semibold text-sm">{idx + 1}. {track.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">{track.artist} • {track.album}</div>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-muted-foreground tabular-nums py-3">
                          {track.hours} hrs
                        </TableCell>
                      </TableRow>
                    ))}
                    {selectedStats.topTracks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-8">No track data found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Top Albums + Podcasts */}
          <div className="grid gap-6 md:grid-cols-2">
            {(selectedStats.topAlbums || []).length > 0 && (
              <Card className="bg-card border border-border shadow-sm p-6">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">Top Albums</CardTitle>
                  <CardDescription>By Playtime</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {selectedStats.topAlbums.slice(0, 10).map((album, idx) => {
                    const pct = (album.hours / (selectedStats.topAlbums[0]?.hours || 1)) * 100;
                    return (
                      <div key={album.name} className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold truncate pr-4">{idx + 1}. {album.name}</span>
                          <span className="text-muted-foreground shrink-0 tabular-nums font-medium">{album.hours} hrs</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {(selectedStats.topPodcasts || []).length > 0 && (
              <Card className="bg-card border border-border shadow-sm p-6">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">Top Podcasts</CardTitle>
                  <CardDescription>By Playtime</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {selectedStats.topPodcasts.map((podcast, idx) => {
                    const pct = (podcast.hours / (selectedStats.topPodcasts[0]?.hours || 1)) * 100;
                    return (
                      <div key={podcast.name} className="flex flex-col gap-1.5 p-3 rounded-lg bg-card backdrop-blur-md border border-border">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold truncate pr-2">{idx + 1}. {podcast.name}</span>
                          <span className="text-muted-foreground shrink-0 font-medium">{podcast.hours} hrs</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

        </div>
      ) : (
        <Card className="text-center p-16 bg-card border border-dashed border-border">
          <CardTitle className="mb-3 text-2xl">No {platformLabel} Data Found</CardTitle>
          <CardDescription className="text-base">
            {platformView === 'apple'
              ? <>Upload your Apple Music CSV file above, or place it in <code className="bg-muted px-1.5 py-0.5 rounded-md text-primary text-sm">apple_music_data/csvs</code>.</>
              : <>Place your Spotify JSON files in <code className="bg-muted px-1.5 py-0.5 rounded-md text-primary text-sm">spotify_data/</code>.</>}
          </CardDescription>
        </Card>
      )}
    </div>
  );
}

