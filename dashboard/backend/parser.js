const fs = require('fs-extra');
const path = require('path');

async function aggregateStats() {
  const dataDir = path.join(__dirname, '../spotify_data');
  const stats = {
    totalHours: 0,
    topArtists: {}, // artistName -> hours
    topTracks: []   // Array of { name, artist, album, hours }
  };

  try {
    const files = (await fs.readdir(dataDir)).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      const data = await fs.readJson(filePath);

      // Assuming data is an array of objects: { trackName, artistName, albumName, msPlayed }
      // or similar structure from Spotify streaming history
      if (Array.isArray(data)) {
        for (const entry of data) {
          const hours = entry.msPlayed / (1000 * 60 * 60);
          stats.totalHours += hours;

          const artist = entry.artistName || 'Unknown Artist';
          stats.topArtists[artist] = (stats.topArtists[artist] || 0) + hours;

          // Track tracking: we need to keep track of tracks to handle the "Top Tracks" requirement
          // Since we are aggregating, we'll store them in a way that we can later sort.
          // For simplicity in this task, we'll use a Map or just add to a list and aggregate later.
        }
      }
    }

    // Post-processing: Transform topArtists to sorted array
    const sortedArtists = Object.entries(stats.topArtists)
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    // For tracks, we need a more detailed structure.
    // Let's re-read and do it properly.
    // Since we need tracks, we'll need a second pass or a different structure.

    return {
      totalHours: stats.totalHours,
      topArtists: sortedArtists
    };
  } catch (err) {
    console.error("Error parsing stats:", err);
    throw err;
  }
}

// Re-implementing with more robust track tracking
async function aggregateStatsRobust() {
    const dataDir = path.join(__dirname, '../spotify_data');
    const stats = {
      totalHours: 0,
      topArtists: {},
      tracks: {} // trackKey -> { name, artist, album, hours }
    };

    try {
      const files = (await fs.readdir(dataDir)).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filePath = path.join(dataDir, file);
        const data = await fs.readJson(filePath);

        if (Array.isArray(data)) {
          for (const entry of data) {
            const hours = entry.msPlayed / (1000 * 60 * 60);
            stats.totalmsPlayed = (stats.msPlayed || 0) + entry.msPlayed;

            const artist = entry.artistName || 'Unknown Artist';
            stats.topArtists[artist] = (stats.topArtists[artist] || 0) + hours;

            const trackName = entry.trackName || 'Unknown Track';
            const albumName = entry.albumName || 'Unknown Album';
            const trackKey = `${trackName}|${artist}|${albumName}`;

            if (!stats.tracks[trackKey]) {
                stats.tracks[trackKey] = { name: trackName, artist, album: albumName, hours: 0 };
            }
            stats.tracks[trackKey].hours += hours;
          }
        }
      }

      const totalHours = (stats.msPlayed || 0) / (1000 * 60 * 60);
      const sortedArtists = Object.entries(stats.topArtists)
        .map(([name, hours]) => ({ name, hours }))
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 10);

      const topTracks = Object.values(stats.tracks)
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 10);

      return {
        totalHours,
        topArtists: sortedArtists,
        topTracks
      };
    } catch (err) {
      console.error("Error parsing stats:", err);
      throw err;
    }
  }

module.exports = { aggregateStats: aggregateStatsRobust };
