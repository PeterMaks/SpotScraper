const fs = require('fs').promises;
const path = require('path');

/**
 * RFC 4180 compliant CSV parser that strips UTF-8 BOM, preserves commas inside
 * quoted fields (e.g. Genres: "anime,j-pop,j-rock"), and collapses embedded
 * newlines inside quoted track titles (e.g. "Thinking About You (feat.\n\nAyah Marar)").
 */
function parseSpotifyCSVContent(rawContent) {
  const content = (rawContent || '').replace(/^\uFEFF/, '');
  const rows = [];
  let inQuotes = false;
  let currentField = '';
  let currentRow = [];

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(currentField.replace(/\s*\r?\n\s*/g, ' ').trim());
      currentField = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      currentRow.push(currentField.replace(/\s*\r?\n\s*/g, ' ').trim());
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.replace(/\s*\r?\n\s*/g, ' ').trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').toLowerCase().trim());

  return rows.slice(1).map(vals => {
    const row = {};
    headers.forEach((h, idx) => {
      if (h) row[h] = vals[idx] ?? '';
    });
    return row;
  });
}

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
      const rows = parseSpotifyCSVContent(content);
      for (const row of rows) {
        const uri = row['track uri'] || row['uri'] || row['id'];
        if (!uri) continue;
        const genreStr = row['genres'] || row['genre'] || '';
        const genres = genreStr.split(',').map(g => g.trim().toLowerCase()).filter(Boolean);
        meta.set(uri, {
          genres,
          danceability: parseFloat(row['danceability']) || 0,
          energy: parseFloat(row['energy']) || 0,
          valence: parseFloat(row['valence']) || 0,
          tempo: parseFloat(row['tempo']) || 0,
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

    const streamUris = new Set();
    const streamTrackKeys = new Set();

    const jsonFiles = (await fs.readdir(dataDir))
      .filter(f => f.endsWith('.json') && !f.toLowerCase().includes('playlist'));

    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      try {
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

            if (uri) streamUris.add(uri);
            if (track && artist) streamTrackKeys.add(`${track.toLowerCase()}|${artist.toLowerCase()}`);

            // Platform breakdown
            stats.platforms[platform] = (stats.platforms[platform] || 0) + ms;

            // Time-based aggregations from timestamp
            if (entry.ts) {
              const d = new Date(entry.ts);
              if (!isNaN(d.getTime())) {
                stats.byDayOfWeek[d.getUTCDay()] += ms;
                const hour = d.getUTCHours();
                if (hour >= 5 && hour < 12) stats.byTimeOfDay.morning += ms;
                else if (hour >= 12 && hour < 17) stats.byTimeOfDay.afternoon += ms;
                else if (hour >= 17 && hour < 21) stats.byTimeOfDay.evening += ms;
                else stats.byTimeOfDay.night += ms;

                const dayKey = d.toISOString().slice(0, 10);
                stats.dailyMs[dayKey] = (stats.dailyMs[dayKey] || 0) + ms;
              }
            }

            if (track && artist) {
              stats.totalMusicMs += ms;
              stats.uniqueArtists.add(artist);
              stats.uniqueTracks.add(`${track} | ${artist}`);
              stats.artists[artist] = (stats.artists[artist] || 0) + ms;

              if (album) {
                stats.albums[album] = (stats.albums[album] || 0) + ms;
              }

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
              stats.totalPodcastMs += ms;
              stats.uniquePodcasts.add(show);
              stats.podcasts[show] = (stats.podcasts[show] || 0) + ms;
            }
          }
        }
      } catch (parseErr) {
        console.warn(`parser: could not parse json file ${file}:`, parseErr.message);
      }
    }

    // Process standalone CSV files in spotify_data
    const csvFiles = (await fs.readdir(dataDir)).filter(f => f.endsWith('.csv'));
    for (const file of csvFiles) {
      try {
        const content = await fs.readFile(path.join(dataDir, file), 'utf8');
        const rows = parseSpotifyCSVContent(content);
        for (const row of rows) {
          const track = row['track name'] || row['track'] || row['song'] || row['title'] || row['name'] || '';
          const rawArtist = row['artist name(s)'] || row['artist name'] || row['artist'] || row['artists'] || '';
          if (!track || !rawArtist) continue;

          // Normalize semicolon-separated artists
          const artistParts = rawArtist.split(';').map(a => a.trim()).filter(Boolean);
          const artist = artistParts.join(', ') || rawArtist;
          const primaryArtist = artistParts[0] || rawArtist;

          const album = row['album name'] || row['album'] || 'Unknown Album';
          const uri = row['track uri'] || row['uri'] || row['id'] || '';
          const ms = parseFloat(row['duration (ms)'] || row['duration_ms'] || row['duration'] || 180000) || 180000;

          // Deduplicate against streaming history
          const trackKey = `${track.toLowerCase()}|${primaryArtist.toLowerCase()}`;
          if (uri && streamUris.has(uri)) continue;
          if (streamTrackKeys.has(trackKey)) continue;

          stats.totalPlays++;
          stats.totalMusicMs += ms;
          stats.uniqueArtists.add(primaryArtist);
          stats.uniqueTracks.add(`${track} | ${primaryArtist}`);
          stats.artists[primaryArtist] = (stats.artists[primaryArtist] || 0) + ms;

          if (album && album !== 'Unknown Album') {
            stats.albums[album] = (stats.albums[album] || 0) + ms;
          }

          // Handle genres
          const rowGenres = (row['genres'] || row['genre'] || '')
            .split(',')
            .map(g => g.trim().toLowerCase())
            .filter(Boolean);
          for (const g of rowGenres) {
            stats.genreMs[g] = (stats.genreMs[g] || 0) + ms;
          }

          // Handle added at for timeline / day / time distribution
          const addedAt = row['added at'] || row['added_at'] || row['release date'] || row['release_date'];
          if (addedAt) {
            const d = new Date(addedAt);
            if (!isNaN(d.getTime())) {
              stats.byDayOfWeek[d.getUTCDay()] += ms;
              const hour = d.getUTCHours();
              if (hour >= 5 && hour < 12) stats.byTimeOfDay.morning += ms;
              else if (hour >= 12 && hour < 17) stats.byTimeOfDay.afternoon += ms;
              else if (hour >= 17 && hour < 21) stats.byTimeOfDay.evening += ms;
              else stats.byTimeOfDay.night += ms;

              const dayKey = d.toISOString().slice(0, 10);
              stats.dailyMs[dayKey] = (stats.dailyMs[dayKey] || 0) + ms;
            }
          }

          const fullTrackKey = `${track}|${artist}|${album}`;
          if (!stats.tracks[fullTrackKey]) {
            stats.tracks[fullTrackKey] = {
              name: track,
              artist,
              album,
              ms: 0
            };
          }
          stats.tracks[fullTrackKey].ms += ms;
        }
      } catch (csvErr) {
        console.warn(`parser: error aggregating csv file ${file}:`, csvErr.message);
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

    // Daily trend (all time, sorted)
    const sortedDays = Object.entries(stats.dailyMs)
      .map(([date, ms]) => ({ date, hours: msToHours(ms) }))
      .sort((a, b) => a.date.localeCompare(b.date));

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

module.exports = { aggregateStats, parseSpotifyCSVContent, parseCSVLine };
