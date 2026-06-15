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

function NumberPopIn({ value }) {
  const [isAnimating, setIsAnimating] = React.useState(false);
  const prevValueRef = React.useRef(value);

  React.useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setIsAnimating(false);
      const raf = requestAnimationFrame(() => {
        setIsAnimating(true);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [value]);

  React.useEffect(() => {
    setIsAnimating(true);
  }, []);

  const str = String(value ?? '');
  return (
    <span className={`t-digit-group ${isAnimating ? 'is-animating' : ''}`}>
      {str.split('').map((ch, i) => {
        const stagger = i === str.length - 2 ? "1" : i === str.length - 1 ? "2" : undefined;
        return (
          <span key={i} className="t-digit" data-stagger={stagger}>
            {ch}
          </span>
        );
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
        {footnote && (
          <span className="text-xs text-muted-foreground">{footnote}</span>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const {
    stats,
    fetchStats,
    loadingStats,
    uploadStatus,
    uploading,
    handleFileUpload
  } = useAppContext();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Spotify Recaps & Insights</h2>
          <p className="text-muted-foreground mt-1">Overview gathered from Spotify Extended Streaming History</p>
        </div>
        <Button variant="secondary" onClick={fetchStats} disabled={loadingStats}>
          Refresh Stats
        </Button>
      </div>

      {/* Upload Zone */}
      <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        <CardHeader>
          <CardTitle>Load Your Own Data</CardTitle>
          <CardDescription>
            Upload Spotify data files (e.g., StreamingHistory*.json, Playlist*.json) or custom .csv / Excel files (with Track, Artist, Playlist headers or simple format).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button asChild disabled={uploading}>
              <label className="cursor-pointer">
                <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Choose Files to Upload
                <input 
                  type="file" 
                  multiple 
                  accept=".json,.csv,.xlsx,.xls" 
                  onChange={handleFileUpload} 
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </Button>
            
            {uploadStatus && (
              <span className={`text-sm font-medium ${uploading ? 'text-primary' : 'text-foreground'}`}>
                {uploadStatus}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {loadingStats ? (
        <div className="text-center p-10 animate-pulse text-muted-foreground">
          <p>Aggregating Spotify stats from history...</p>
        </div>
      ) : stats ? (
        <div className="flex flex-col gap-6">

          {/* Row 1 — Stat Cards */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Total Listening"
              value={stats.totalHours}
              unit="Hrs"
            />
            <StatCard
              label="Music Playtime"
              value={stats.totalMusicHours}
              unit="Hrs"
              accent="text-purple-500"
            />
            <StatCard
              label="Podcast Playtime"
              value={stats.totalPodcastHours}
              unit="Hrs"
              accent="text-blue-500"
            />
            <StatCard
              label="Unique Artists"
              value={stats.uniqueArtists}
              footnote={stats.uniqueTracks ? `${stats.uniqueTracks} tracks` : undefined}
            />
            <StatCard
              label="Listening Streak"
              value={stats.maxStreak || '—'}
              unit={stats.maxStreak ? 'days' : ''}
              footnote={stats.avgDailyHours ? `~${stats.avgDailyHours}h/day avg` : undefined}
            />
          </div>

          {/* Row 2 — Listening Trend (3 cols) + Time of Day Pie (1 col) */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-4">
            <ListeningTrendChart data={stats.dailyTrend || []} />
            <TimeOfDayChart data={stats.listeningByTime || []} />
          </div>

          {/* Row 3 — Day of Week Bar (2 cols) + Top Genres (2 cols) */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-4">
            <DayOfWeekChart data={stats.listeningByDay || []} />
            
            {/* Genre Breakdown */}
            <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)] col-span-1 md:col-span-2">
              <CardHeader>
                <CardTitle>Top Genres</CardTitle>
                <CardDescription>By total listening hours</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(stats.topGenres || []).slice(0, 10).map((genre, idx) => {
                  const maxHours = (stats.topGenres || [])[0]?.hours || 1;
                  const pct = (genre.hours / maxHours) * 100;
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
                {(!stats.topGenres || stats.topGenres.length === 0) && (
                  <p className="text-muted-foreground text-center py-4 text-sm">
                    No genre data found. Upload a Liked_Songs.csv with a Genres column.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 4 — Top Artists + Top Tracks */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Artists Panel */}
            <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
              <CardHeader>
                <CardTitle>Top Artists</CardTitle>
                <CardDescription>Top 20</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {stats.topArtists.slice(0, 10).map((artist, idx) => {
                  const maxHours = stats.topArtists[0]?.hours || 1;
                  const percentage = (artist.hours / maxHours) * 100;
                  return (
                    <div key={artist.name} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium truncate pr-4">{idx + 1}. {artist.name}</span>
                        <span className="text-muted-foreground shrink-0">{artist.hours} hrs</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
                {stats.topArtists.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No artist data found.</p>
                )}
              </CardContent>
            </Card>

            {/* Top Tracks Panel */}
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
                    {stats.topTracks.slice(0, 10).map((track, idx) => (
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
                    {stats.topTracks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">No track data found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Row 5 — Top Albums + Podcasts */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Albums */}
            {(stats.topAlbums || []).length > 0 && (
              <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
                <CardHeader>
                  <CardTitle>Top Albums</CardTitle>
                  <CardDescription>By Playtime</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {stats.topAlbums.slice(0, 10).map((album, idx) => {
                    const maxHours = stats.topAlbums[0]?.hours || 1;
                    const pct = (album.hours / maxHours) * 100;
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

            {/* Podcasts Panel */}
            {stats.topPodcasts && stats.topPodcasts.length > 0 && (
              <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
                <CardHeader>
                  <CardTitle>Top Podcasts</CardTitle>
                  <CardDescription>By Playtime</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {stats.topPodcasts.map((podcast, idx) => {
                    const maxHours = stats.topPodcasts[0]?.hours || 1;
                    const percentage = (podcast.hours / maxHours) * 100;
                    return (
                      <div key={podcast.name} className="flex flex-col gap-1.5 p-3 rounded-lg border border-white/10 bg-card/30 backdrop-blur-md">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium truncate pr-2">{idx + 1}. {podcast.name}</span>
                          <span className="text-muted-foreground shrink-0">{podcast.hours} hrs</span>
                        </div>
                        <Progress value={percentage} className="h-1.5" />
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
          <CardTitle className="mb-2">No Spotify Data Found</CardTitle>
          <CardDescription>
            Please place your Spotify JSON files in the <code className="bg-muted px-1 rounded">spotify_data/</code> folder at the root of the project.
          </CardDescription>
        </Card>
      )}
    </div>
  );
}
