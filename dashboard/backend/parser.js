const fs = require('fs').promises;
const path = require('path');

/**
 * Parse a CSV line respecting quoted fields with commas inside.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Load genre + audio feature data from CSV files in spotify_data.
 * Returns a Map of trackUri -> { genres: string[], danceability, energy, valence, tempo }
 */
async function loadTrackMetadata(dataDir) {
  const meta = new Map();
  try {
    const files = (await fs.readdir(dataDir)).filter(f => f.endsWith('.csv'));
    for (const file of files) {
      const content = await fs.readFile(path.join(dataDir, file), 'utf8');
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) continue;

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const uriIdx = headers.indexOf('track uri');
      const genreIdx = headers.indexOf('genres');
      const danceIdx = headers.indexOf('danceability');
      const energyIdx = headers.indexOf('energy');
      const valenceIdx = headers.indexOf('valence');
      const tempoIdx = headers.indexOf('tempo');

      if (uriIdx === -1 || genreIdx === -1) continue;

      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]);
        const uri = vals[uriIdx];
        if (!uri) continue;
        const genreStr = vals[genreIdx] || '';
        const genres = genreStr.split(',').map(g => g.trim()).filter(Boolean);
        meta.set(uri, {
          genres,
          danceability: parseFloat(vals[danceIdx]) || 0,
          energy: parseFloat(vals[energyIdx]) || 0,
          valence: parseFloat(vals[valenceIdx]) || 0,
          tempo: parseFloat(vals[tempoIdx]) || 0,
        });
      }
    }
  } catch (e) {
    // CSV metadata is optional enhancement
  }
  return meta;
}

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
    podcasts: {}, // showName -> ms
    albums: {},  // albumName -> ms
    // New aggregations
    byDayOfWeek: [0, 0, 0, 0, 0, 0, 0], // Sun=0 ... Sat=6 in ms
    byTimeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 }, // ms
    dailyMs: {},  // 'YYYY-MM-DD' -> ms (for trend chart)
    genreMs: {},  // genre -> ms
    platforms: {},  // platform -> ms
    skippedCount: 0,
    totalPlays: 0,
  };

  try {
    const dirExists = await fs.access(dataDir).then(() => true).catch(() => false);
    if (!dirExists) {
      console.warn(`Spotify data directory not found at ${dataDir}`);
      return emptyStats();
    }

    // Load genre metadata from CSVs
    const trackMeta = await loadTrackMetadata(dataDir);

    const files = (await fs.readdir(dataDir)).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));

      if (Array.isArray(data)) {
        for (const entry of data) {
          const ms = entry.ms_played || 0;
          if (ms <= 0) continue;

          stats.totalPlays++;
          if (entry.skipped) stats.skippedCount++;

          const track = entry.master_metadata_track_name;
          const artist = entry.master_metadata_album_artist_name;
          const album = entry.master_metadata_album_album_name;
          const show = entry.episode_show_name;
          const uri = entry.spotify_track_uri;
          const platform = entry.platform || 'unknown';

          // Platform breakdown
          stats.platforms[platform] = (stats.platforms[platform] || 0) + ms;

          // Time-based aggregations from timestamp
          if (entry.ts) {
            const d = new Date(entry.ts);
            if (!isNaN(d.getTime())) {
              // Day of week
              stats.byDayOfWeek[d.getUTCDay()] += ms;
              
              // Time of day
              const hour = d.getUTCHours();
              if (hour >= 5 && hour < 12) stats.byTimeOfDay.morning += ms;
              else if (hour >= 12 && hour < 17) stats.byTimeOfDay.afternoon += ms;
              else if (hour >= 17 && hour < 21) stats.byTimeOfDay.evening += ms;
              else stats.byTimeOfDay.night += ms;

              // Daily trend
              const dayKey = d.toISOString().slice(0, 10);
              stats.dailyMs[dayKey] = (stats.dailyMs[dayKey] || 0) + ms;
            }
          }

          if (track && artist) {
            // It's music
            stats.totalMusicMs += ms;
            stats.uniqueArtists.add(artist);
            stats.uniqueTracks.add(`${track} | ${artist}`);
            stats.artists[artist] = (stats.artists[artist] || 0) + ms;

            // Album aggregation
            if (album) {
              stats.albums[album] = (stats.albums[album] || 0) + ms;
            }

            // Genre aggregation from CSV metadata
            if (uri && trackMeta.has(uri)) {
              const meta = trackMeta.get(uri);
              for (const genre of meta.genres) {
                stats.genreMs[genre] = (stats.genreMs[genre] || 0) + ms;
              }
            }

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
      .slice(0, 20);

    const topTracks = Object.values(stats.tracks)
      .map(t => ({ name: t.name, artist: t.artist, album: t.album, hours: msToHours(t.ms) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 20);

    const topPodcasts = Object.entries(stats.podcasts)
      .map(([name, ms]) => ({ name, hours: msToHours(ms) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    const topAlbums = Object.entries(stats.albums)
      .map(([name, ms]) => ({ name, hours: msToHours(ms) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    const topGenres = Object.entries(stats.genreMs)
      .map(([name, ms]) => ({ name, hours: msToHours(ms) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 15);

    const totalMusicHours = msToHours(stats.totalMusicMs);
    const totalPodcastHours = msToHours(stats.totalPodcastMs);
    const totalHours = msToHours(stats.totalMusicMs + stats.totalPodcastMs);

    // Day of week breakdown
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const listeningByDay = dayNames.map((day, i) => ({
      day,
      hours: msToHours(stats.byDayOfWeek[i])
    }));

    // Time of day breakdown
    const listeningByTime = [
      { period: 'Morning', hours: msToHours(stats.byTimeOfDay.morning), fill: 'var(--chart-1)' },
      { period: 'Afternoon', hours: msToHours(stats.byTimeOfDay.afternoon), fill: 'var(--chart-2)' },
      { period: 'Evening', hours: msToHours(stats.byTimeOfDay.evening), fill: 'var(--chart-3)' },
      { period: 'Night', hours: msToHours(stats.byTimeOfDay.night), fill: 'var(--chart-4)' },
    ];

    // Daily trend (last 90 days, sorted)
    const sortedDays = Object.entries(stats.dailyMs)
      .map(([date, ms]) => ({ date, hours: msToHours(ms) }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-90);

    // Listening streak
    const allDays = Object.keys(stats.dailyMs).sort();
    let maxStreak = 0, currentStreak = 0;
    for (let i = 0; i < allDays.length; i++) {
      if (i === 0) { currentStreak = 1; }
      else {
        const prev = new Date(allDays[i - 1]);
        const curr = new Date(allDays[i]);
        const diff = (curr - prev) / (1000 * 60 * 60 * 24);
        currentStreak = diff <= 1 ? currentStreak + 1 : 1;
      }
      maxStreak = Math.max(maxStreak, currentStreak);
    }

    // Unique listening days
    const uniqueDays = allDays.length;
    const avgDailyHours = uniqueDays > 0 ? Math.round((totalHours / uniqueDays) * 10) / 10 : 0;

    return {
      totalHours,
      totalMusicHours,
      totalPodcastHours,
      uniqueArtists: stats.uniqueArtists.size,
      uniqueTracks: stats.uniqueTracks.size,
      uniquePodcasts: stats.uniquePodcasts.size,
      totalPlays: stats.totalPlays,
      skippedCount: stats.skippedCount,
      maxStreak,
      avgDailyHours,
      topArtists,
      topTracks,
      topPodcasts,
      topAlbums,
      topGenres,
      listeningByDay,
      listeningByTime,
      dailyTrend: sortedDays,
    };
  } catch (err) {
    console.error("Error parsing stats in parser.js:", err);
    throw err;
  }
}

function emptyStats() {
  return {
    totalHours: 0, totalMusicHours: 0, totalPodcastHours: 0,
    uniqueArtists: 0, uniqueTracks: 0, uniquePodcasts: 0,
    totalPlays: 0, skippedCount: 0, maxStreak: 0, avgDailyHours: 0,
    topArtists: [], topTracks: [], topPodcasts: [],
    topAlbums: [], topGenres: [],
    listeningByDay: [], listeningByTime: [], dailyTrend: [],
  };
}

module.exports = { aggregateStats };
