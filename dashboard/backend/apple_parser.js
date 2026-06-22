const path = require('path');
const fs = require('fs').promises;

const dataDir = path.join(__dirname, '../../apple_music_data/csvs');

function msToHours(ms) {
  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
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

// Minimal, fast CSV parser that handles quotes properly
function parseCSV(content) {
  const rows = [];
  let inQuotes = false;
  let currentField = '';
  let currentRow = [];
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i+1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && content[i+1] === '\n') i++;
      currentRow.push(currentField);
      if (currentRow.length > 1 || currentRow[0].length > 0) rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || currentRow[0].length > 0) rows.push(currentRow);
  }
  return rows;
}

async function aggregateAppleStats() {
  const jsonDir = path.join(__dirname, '../../apple_music_data/jsons');
  let libraryTracks = [];
  try {
    const jsonStr = await fs.readFile(path.join(jsonDir, 'Apple Music Library Tracks.json'), 'utf-8');
    libraryTracks = JSON.parse(jsonStr);
  } catch (e) {
    console.warn('apple_parser: could not load library tracks json:', e.message);
  }

  const metaMap = {};
  for (const track of libraryTracks) {
    if (track.Title) {
      const artist = (track.Artist || 'Unknown Artist').toLowerCase().trim();
      const title = track.Title.toLowerCase().trim();
      const meta = { album: track.Album || 'Unknown Album', genre: track.Genre || 'Unknown Genre' };
      metaMap[`${artist} - ${title}`] = meta;
      if (!metaMap[title]) metaMap[title] = meta;
    }
  }

  let files;
  try {
    files = (await fs.readdir(dataDir)).filter(f => f.endsWith('.csv'));
  } catch {
    return emptyStats();
  }
  
  // Find the exact daily tracks file if it exists, otherwise scan all CSVs
  let targetFiles = files.filter(f => f.includes('Play History Daily Tracks'));
  if (targetFiles.length === 0) targetFiles = files;
  if (targetFiles.length === 0) return emptyStats();

  const artists = {};  // name -> ms
  const tracks  = {};  // 'song|artist' -> { name, artist, album, ms }
  const albums  = {};  // name -> ms
  const genres  = {};  // name -> ms
  const dailyMs = {};  // 'YYYY-MM-DD' -> ms
  const byDow   = [0, 0, 0, 0, 0, 0, 0];
  const byTime  = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  
  let totalMusicMs = 0;
  let totalPlays   = 0;
  let skipped      = 0;

  for (const file of targetFiles) {
    const filePath = path.join(dataDir, file);
    let content;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      console.warn(`apple_parser: failed to read ${file}:`, e.message);
      continue;
    }

    const rows = parseCSV(content);
    if (rows.length < 2) continue;

    const headers = rows[0].map(h => h.trim().toLowerCase());
    
    // Fallbacks if columns differ slightly
    const dateIdx = headers.indexOf('date played');
    const hoursIdx = headers.indexOf('hours');
    const durationIdx = headers.indexOf('play duration milliseconds');
    const playCountIdx = headers.indexOf('play count');
    const skipCountIdx = headers.indexOf('skip count');
    const descIdx = headers.indexOf('track description');

    // If it's not the daily tracks format, skip
    if (dateIdx === -1 || durationIdx === -1 || descIdx === -1) continue;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length <= descIdx) continue;

      const playMs = Number(row[durationIdx]) || 0;
      if (playMs <= 0) continue;

      const description = row[descIdx];
      let artist = "Unknown Artist";
      let song = description;
      
      // Parse "Artist - Song" from description
      if (description && description.includes(' - ')) {
        const parts = description.split(' - ');
        artist = parts[0].trim();
        song = parts.slice(1).join(' - ').trim();
      }

      let album = 'Unknown Album';
      let genre = 'Unknown Genre';
      const key1 = `${artist.toLowerCase()} - ${song.toLowerCase()}`;
      const key2 = song.toLowerCase();
      
      const meta = metaMap[key1] || metaMap[key2];
      if (meta) {
        album = meta.album;
        genre = meta.genre;
      }

      if (album !== 'Unknown Album') albums[album] = (albums[album] || 0) + playMs;
      if (genre !== 'Unknown Genre') genres[genre] = (genres[genre] || 0) + playMs;

      const pCount = Number(row[playCountIdx]) || 1;
      const sCount = Number(row[skipCountIdx]) || 0;
      
      totalPlays += pCount;
      skipped += sCount;
      totalMusicMs += playMs;

      artists[artist] = (artists[artist] || 0) + playMs;

      const trackKey = `${song}|${artist}`;
      if (!tracks[trackKey]) tracks[trackKey] = { name: song, artist, album, ms: 0 };
      tracks[trackKey].ms += playMs;

      // Date parsing: YYYYMMDD
      const dateStr = row[dateIdx];
      let d;
      if (dateStr && dateStr.length === 8) {
        const y = parseInt(dateStr.slice(0, 4));
        const m = parseInt(dateStr.slice(4, 6)) - 1;
        const dNum = parseInt(dateStr.slice(6, 8));
        d = new Date(Date.UTC(y, m, dNum));
      } else if (dateStr) {
        d = new Date(dateStr);
      }

      if (d && !isNaN(d.getTime())) {
        byDow[d.getUTCDay()] += playMs;
        const dayKey = d.toISOString().slice(0, 10);
        dailyMs[dayKey] = (dailyMs[dayKey] || 0) + playMs;
        
        // Time parsing: take first hour if list
        let hStr = row[hoursIdx] || "";
        let hNum = 12; // default afternoon
        if (hStr) {
          hNum = parseInt(hStr.split(',')[0].trim());
        }
        if (!isNaN(hNum)) {
          if      (hNum >= 5  && hNum < 12) byTime.morning   += playMs;
          else if (hNum >= 12 && hNum < 17) byTime.afternoon += playMs;
          else if (hNum >= 17 && hNum < 21) byTime.evening   += playMs;
          else                              byTime.night     += playMs;
        }
      }
    }
  }

  const allDays = Object.keys(dailyMs).sort();
  let maxStreak = 0, currentStreak = 0;
  for (let i = 0; i < allDays.length; i++) {
    if (i === 0) { currentStreak = 1; }
    else {
      const diff = (new Date(allDays[i]) - new Date(allDays[i - 1])) / 86400000;
      currentStreak = diff <= 1 ? currentStreak + 1 : 1;
    }
    maxStreak = Math.max(maxStreak, currentStreak);
  }

  const uniqueDays    = allDays.length;
  const totalHours    = msToHours(totalMusicMs);
  const avgDailyHours = uniqueDays > 0 ? Math.round((totalHours / uniqueDays) * 10) / 10 : 0;

  const topArtists = Object.entries(artists)
    .map(([name, ms]) => ({ name, hours: msToHours(ms) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 20);

  const topTracks = Object.values(tracks)
    .map(t => ({ name: t.name, artist: t.artist, album: t.album, hours: msToHours(t.ms) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 20);

  const topAlbums = Object.entries(albums)
    .map(([name, ms]) => ({ name, hours: msToHours(ms) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 20);

  const topGenres = Object.entries(genres)
    .map(([name, ms]) => ({ name, hours: msToHours(ms) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 20);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const listeningByDay = dayNames.map((day, i) => ({ day, hours: msToHours(byDow[i]) }));

  const listeningByTime = [
    { period: 'Morning',   hours: msToHours(byTime.morning),   fill: 'var(--chart-1)' },
    { period: 'Afternoon', hours: msToHours(byTime.afternoon), fill: 'var(--chart-2)' },
    { period: 'Evening',   hours: msToHours(byTime.evening),   fill: 'var(--chart-3)' },
    { period: 'Night',     hours: msToHours(byTime.night),     fill: 'var(--chart-4)' },
  ];

  const dailyTrend = Object.entries(dailyMs)
    .map(([date, ms]) => ({ date, hours: msToHours(ms) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalHours,
    totalMusicHours:   totalHours,
    totalPodcastHours: 0,
    uniqueArtists:     Object.keys(artists).length,
    uniqueTracks:      Object.keys(tracks).length,
    uniquePodcasts:    0,
    totalPlays,
    skippedCount: skipped,
    maxStreak,
    avgDailyHours,
    topArtists,
    topTracks,
    topPodcasts: [],
    topAlbums,
    topGenres,
    listeningByDay,
    listeningByTime,
    dailyTrend,
  };
}

module.exports = { aggregateAppleStats };
