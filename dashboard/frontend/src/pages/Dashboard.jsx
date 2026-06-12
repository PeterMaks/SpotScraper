import React from 'react';
import { useAppContext } from '../AppContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"

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
      <Card>
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
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Listening Time</CardDescription>
                <CardTitle className="text-2xl">{stats.totalHours} <span className="text-sm font-normal text-muted-foreground">Hrs</span></CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Music Playtime</CardDescription>
                <CardTitle className="text-2xl text-purple-500">{stats.totalMusicHours} <span className="text-sm font-normal text-muted-foreground">Hrs</span></CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Podcast Playtime</CardDescription>
                <CardTitle className="text-2xl text-blue-500">{stats.totalPodcastHours} <span className="text-sm font-normal text-muted-foreground">Hrs</span></CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unique Artists</CardDescription>
                <CardTitle className="text-2xl">{stats.uniqueArtists}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unique Tracks</CardDescription>
                <CardTitle className="text-2xl">{stats.uniqueTracks}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Artists Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Top Artists</CardTitle>
                <CardDescription>Top 20</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
            <Card>
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
                        <TableCell className="text-right font-medium text-muted-foreground">
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

          {/* Podcasts Panel if exists */}
          {stats.topPodcasts && stats.topPodcasts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Podcasts</CardTitle>
                <CardDescription>By Playtime</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {stats.topPodcasts.map((podcast, idx) => {
                  const maxHours = stats.topPodcasts[0]?.hours || 1;
                  const percentage = (podcast.hours / maxHours) * 100;
                  return (
                    <div key={podcast.name} className="flex flex-col gap-1.5 p-3 rounded-lg border bg-card">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium truncate pr-2">{idx + 1}. {podcast.name}</span>
                        <span className="text-muted-foreground shrink-0">{podcast.hours} hrs</span>
                      </div>
                      <Progress value={percentage} className="h-1.5 [&>div]:bg-purple-500" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="text-center p-12">
          <CardTitle className="mb-2">No Spotify Data Found</CardTitle>
          <CardDescription>
            Please place your Spotify JSON files in the <code className="bg-muted px-1 rounded">spotify_data/</code> folder at the root of the project.
          </CardDescription>
        </Card>
      )}
    </div>
  );
}
