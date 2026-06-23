import React from 'react';
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
  const [isAnimating, setIsAnimating] = React.useState(false);
  const prevValueRef = React.useRef(value);

  React.useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setIsAnimating(false);
      const raf = requestAnimationFrame(() => setIsAnimating(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [value]);

  React.useEffect(() => { setIsAnimating(true); }, []);

  const str = String(value ?? '');
  return (
    <span className={`t-digit-group ${isAnimating ? 'is-animating' : ''}`}>
      {str.split('').map((ch, i) => {
        const stagger = i === str.length - 2 ? "1" : i === str.length - 1 ? "2" : undefined;
        return <span key={i} className="t-digit" data-stagger={stagger}>{ch}</span>;
      })}
    </span>
  );
}

function StatCard({ label, value, unit, accent, footnote }) {
  return (
    <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)] transition-all duration-300 hover:shadow-[0_8px_40px_rgba(0,0,0,0.12)] hover:scale-[1.02]">
      <CardHeader className="pb-1">
        <CardDescription className="text-xs font-medium">{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <p className={`font-semibold text-2xl tabular-nums ${accent || ''}`}>
          <NumberPopIn value={value} /> {unit && <span className="text-sm font-normal text-muted-foreground">{unit}</span>}
        </p>
        {footnote && <span className="text-xs text-muted-foreground">{footnote}</span>}
      </CardContent>
    </Card>
  );
}

const TOGGLE_VIEWS = [
  { key: 'all',     label: 'All Platforms' },
  { key: 'spotify', label: 'Spotify' },
  { key: 'apple',   label: 'Apple Music' },
];

function PlatformToggle({ view, setView }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 backdrop-blur-sm border border-white/10">
      {TOGGLE_VIEWS.map(({ key, label }) => (
        <button
          key={key}
          id={`platform-toggle-${key}`}
          onClick={() => setView(key)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            view === key
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          }`}
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

  const [appleUploading, setAppleUploading] = React.useState(false);
  const [appleUploadStatus, setAppleUploadStatus] = React.useState('');

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

  const selectedStats = React.useMemo(() => {
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
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Recaps &amp; Insights</h2>
          <p className="text-muted-foreground mt-1">Listening stats · {platformLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <PlatformToggle view={platformView} setView={setPlatformView} />
          <Button variant="secondary" onClick={() => { fetchStats(); fetchAppleStats(); }} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Upload Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          <CardHeader>
            <CardTitle>Spotify Data</CardTitle>
            <CardDescription>StreamingHistory*.json, Playlist*.json, .csv / .xlsx</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button asChild disabled={uploading}>
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

        <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          <CardHeader>
            <CardTitle>Apple Music Data</CardTitle>
            <CardDescription>Apple Music - Play History Daily Tracks .csv</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button asChild disabled={appleUploading}>
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
        <div className="text-center p-10 animate-pulse text-muted-foreground">
          <p>Aggregating {platformLabel} stats...</p>
        </div>
      ) : selectedStats ? (
        <div className="flex flex-col gap-6">

          {/* Stat Cards */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Listening" value={selectedStats.totalHours} unit="Hrs" />
            <StatCard label="Music Playtime" value={selectedStats.totalMusicHours} unit="Hrs" accent="text-purple-500" />
            <StatCard label="Podcast Playtime" value={selectedStats.totalPodcastHours} unit="Hrs" accent="text-blue-500" />
            <StatCard
              label="Unique Artists"
              value={selectedStats.uniqueArtists}
              footnote={selectedStats.uniqueTracks ? `${selectedStats.uniqueTracks} tracks` : undefined}
            />
            <StatCard
              label="Listening Streak"
              value={selectedStats.maxStreak || '—'}
              unit={selectedStats.maxStreak ? 'days' : ''}
              footnote={selectedStats.avgDailyHours ? `~${selectedStats.avgDailyHours}h/day avg` : undefined}
            />
          </div>

          {/* Trend + Time of Day */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-4">
            <ListeningTrendChart data={selectedStats.dailyTrend || []} isAllPlatforms={platformView === 'all'} />
            <TimeOfDayChart data={selectedStats.listeningByTime || []} />
          </div>

          {/* Day of Week + Genres */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-4">
            <DayOfWeekChart data={selectedStats.listeningByDay || []} />
            <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)] col-span-1 md:col-span-2">
              <CardHeader>
                <CardTitle>Top Genres</CardTitle>
                <CardDescription>By total listening hours</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(selectedStats.topGenres || []).slice(0, 10).map((genre, idx) => {
                  const pct = (genre.hours / ((selectedStats.topGenres || [])[0]?.hours || 1)) * 100;
                  return (
                    <div key={genre.name} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium truncate pr-4 capitalize">
                          <Badge variant="outline" className="mr-2 text-[10px] tabular-nums py-0">{idx + 1}</Badge>
                          {genre.name}
                        </span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">{genre.hours} hrs</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
                {(!selectedStats.topGenres || selectedStats.topGenres.length === 0) && (
                  <p className="text-muted-foreground text-center py-4 text-sm">
                    No genre data found. Make sure library/JSON export is present.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Artists + Tracks */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
              <CardHeader>
                <CardTitle>Top Artists</CardTitle>
                <CardDescription>Top 20</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {selectedStats.topArtists.slice(0, 10).map((artist, idx) => {
                  const pct = (artist.hours / (selectedStats.topArtists[0]?.hours || 1)) * 100;
                  return (
                    <div key={artist.name} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium truncate pr-4">{idx + 1}. {artist.name}</span>
                        <span className="text-muted-foreground shrink-0">{artist.hours} hrs</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })}
                {selectedStats.topArtists.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No artist data found.</p>
                )}
              </CardContent>
            </Card>

            <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
              <CardHeader>
                <CardTitle>Top Tracks</CardTitle>
                <CardDescription>Top 20</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Track Info</TableHead>
                      <TableHead className="text-right">Playtime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedStats.topTracks.slice(0, 10).map((track, idx) => (
                      <TableRow key={`${track.name}-${track.artist}`}>
                        <TableCell>
                          <div className="font-semibold">{idx + 1}. {track.name}</div>
                          <div className="text-sm text-muted-foreground">{track.artist} • {track.album}</div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-muted-foreground tabular-nums">
                          {track.hours} hrs
                        </TableCell>
                      </TableRow>
                    ))}
                    {selectedStats.topTracks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">No track data found.</TableCell>
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
              <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
                <CardHeader>
                  <CardTitle>Top Albums</CardTitle>
                  <CardDescription>By Playtime</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {selectedStats.topAlbums.slice(0, 10).map((album, idx) => {
                    const pct = (album.hours / (selectedStats.topAlbums[0]?.hours || 1)) * 100;
                    return (
                      <div key={album.name} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium truncate pr-4">{idx + 1}. {album.name}</span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">{album.hours} hrs</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {(selectedStats.topPodcasts || []).length > 0 && (
              <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
                <CardHeader>
                  <CardTitle>Top Podcasts</CardTitle>
                  <CardDescription>By Playtime</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {selectedStats.topPodcasts.map((podcast, idx) => {
                    const pct = (podcast.hours / (selectedStats.topPodcasts[0]?.hours || 1)) * 100;
                    return (
                      <div key={podcast.name} className="flex flex-col gap-1.5 p-3 rounded-lg border border-white/10 bg-card/30 backdrop-blur-md">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium truncate pr-2">{idx + 1}. {podcast.name}</span>
                          <span className="text-muted-foreground shrink-0">{podcast.hours} hrs</span>
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
        <Card className="text-center p-12 backdrop-blur-xl bg-card/40 border-white/20">
          <CardTitle className="mb-2">No {platformLabel} Data Found</CardTitle>
          <CardDescription>
            {platformView === 'apple'
              ? <>Upload your Apple Music CSV file above, or place it in <code className="bg-muted px-1 rounded">apple_music_data/csvs</code>.</>
              : <>Place your Spotify JSON files in <code className="bg-muted px-1 rounded">spotify_data/</code>.</>}
          </CardDescription>
        </Card>
      )}
    </div>
  );
}
