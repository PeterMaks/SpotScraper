const fs = require('fs').promises;
const path = require('path');

async function aggregateStats() {
  const dataDir = path.join(__dirname, '../../spotify_data');
  
  const stats = {
    totalMusicMs: 0,
    totalPodcastMs: 0,
    uniqueArtists: new Set(),
    uniqueTracks: new Set(),
    uniquePodcasts: new Set(),
    artists: {}, // artistName -> ms
    tracks: {},  // trackKey -> { name, artist, album, ms }
    podcasts: {} // showName -> ms
  };

  try {
    const dirExists = await fs.access(dataDir).then(() => true).catch(() => false);
    if (!dirExists) {
      console.warn(`Spotify data directory not found at ${dataDir}`);
      return {
        totalHours: 0,
        totalMusicHours: 0,
        totalPodcastHours: 0,
        uniqueArtists: 0,
        uniqueTracks: 0,
        uniquePodcasts: 0,
        topArtists: [],
        topTracks: [],
        topPodcasts: []
      };
    }

    const files = (await fs.readdir(dataDir)).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));

      if (Array.isArray(data)) {
        for (const entry of data) {
          const ms = entry.ms_played || 0;
          if (ms <= 0) continue;

          const track = entry.master_metadata_track_name;
          const artist = entry.master_metadata_album_artist_name;
          const album = entry.master_metadata_album_album_name;
          const show = entry.episode_show_name;
          const episode = entry.episode_name;

          if (track && artist) {
            // It's music
            stats.totalMusicMs += ms;
            stats.uniqueArtists.add(artist);
            stats.uniqueTracks.add(`${track} | ${artist}`);
            stats.artists[artist] = (stats.artists[artist] || 0) + ms;

            const trackKey = `${track}|${artist}|${album || 'Unknown Album'}`;
            if (!stats.tracks[trackKey]) {
              stats.tracks[trackKey] = {
                name: track,
                artist: artist,
                album: album || 'Unknown Album',
                ms: 0
              };
            }
            stats.tracks[trackKey].ms += ms;
          } else if (show) {
            // It's a podcast
            stats.totalPodcastMs += ms;
            stats.uniquePodcasts.add(show);
            stats.podcasts[show] = (stats.podcasts[show] || 0) + ms;
          }
        }
      }
    }

    const msToHours = (ms) => Math.round((ms / (1000 * 60 * 60)) * 10) / 10;

    const topArtists = Object.entries(stats.artists)
      .map(([name, ms]) => ({ name, hours: msToHours(ms) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 20); // Top 20 artists

    const topTracks = Object.values(stats.tracks)
      .map(t => ({ name: t.name, artist: t.artist, album: t.album, hours: msToHours(t.ms) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 20); // Top 20 tracks

    const topPodcasts = Object.entries(stats.podcasts)
      .map(([name, ms]) => ({ name, hours: msToHours(ms) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10); // Top 10 podcasts

    const totalMusicHours = msToHours(stats.totalMusicMs);
    const totalPodcastHours = msToHours(stats.totalPodcastMs);
    const totalHours = msToHours(stats.totalMusicMs + stats.totalPodcastMs);

    return {
      totalHours,
      totalMusicHours,
      totalPodcastHours,
      uniqueArtists: stats.uniqueArtists.size,
      uniqueTracks: stats.uniqueTracks.size,
      uniquePodcasts: stats.uniquePodcasts.size,
      topArtists,
      topTracks,
      topPodcasts
    };
  } catch (err) {
    console.error("Error parsing stats in parser.js:", err);
    throw err;
  }
}

module.exports = { aggregateStats };
