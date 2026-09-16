const express = require('express');
const cors = require('cors');
const { resolveDownloadFile } = require('./download-path');

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
fs.pathExists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };
fs.readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
fs.writeJson = require('./state-store').writeJson;
fs.ensureDir = async (p) => fs.mkdir(p, { recursive: true });
fs.remove = async (p) => fs.rm(p, { recursive: true, force: true });
const { spawn } = require('child_process');
const { aggregateStats } = require('./parser');
const { aggregateAppleStats } = require('./apple_parser');
const { createAsyncCache } = require('./stats-cache');
const spotifyStatsCache = createAsyncCache(aggregateStats, { ttlMs: 60_000 });
const appleStatsCache = createAsyncCache(aggregateAppleStats, { ttlMs: 60_000 });

const { ZipArchive } = require('archiver');
const metadataModule = import('music-metadata');
// --- Global Log State ---
const rootDir = path.join(__dirname, '../..');
const stateDir = path.resolve(process.env.DATA_DIR || rootDir);
const downloadLinksPath = path.join(stateDir, 'download_links.json');
const scrapeLogPath = path.join(stateDir, 'scrape_log.json');

let inMemoryDownloadLinks = {};
let inMemoryScrapeLog = {};

const ready = (async () => {
  try {
    await fs.ensureDir(stateDir);
    if (await fs.pathExists(downloadLinksPath)) {
      inMemoryDownloadLinks = await fs.readJson(downloadLinksPath);
    }
    if (await fs.pathExists(scrapeLogPath)) {
      inMemoryScrapeLog = await fs.readJson(scrapeLogPath);
    }
  } catch (err) {
    console.error('Failed to initialize logs from disk', { error: err.message });
  }
})();

// --- User Metadata Fallback Logic ---

function normalizeStr(str) {
  if (!str) return '';
  return str.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatDurationMs(ms) {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const parseLine = l => l.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(l => {
    const vals = parseLine(l), row = {};
    headers.forEach((h, i) => row[h] = vals[i] || '');
    return row;
  });
}

let cachedUserMetadata = null;

async function loadUserMetadataMap() {
  const dataDir = (process.env.SPOTIFY_DATA_DIR || path.join(rootDir, 'spotify_data'));
  const queryToMeta = {};
  const titleToMeta = {};

  if (!(await fs.pathExists(dataDir))) {
    return { queryToMeta, titleToMeta };
  }

  try {
    const files = await fs.readdir(dataDir);

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      const ext = path.extname(file).toLowerCase();

      if (ext === '.json' && !file.toLowerCase().includes('playlist')) {
        try {
          const data = await fs.readJson(filePath);
          if (Array.isArray(data)) {
            for (const entry of data) {
              const track = entry.master_metadata_track_name;
              const artist = entry.master_metadata_album_artist_name;
              const album = entry.master_metadata_album_album_name;
              const ms = entry.ms_played || 0;

              if (track && artist) {
                const query = `${track} ${artist}`;
                const normQuery = normalizeStr(query);
                const normTitle = normalizeStr(track);

                const currentDurationMs = (queryToMeta[normQuery] && queryToMeta[normQuery].durationMs) || 0;
                const durationMs = Math.max(currentDurationMs, ms);

                const meta = {
                  title: track,
                  artist: artist,
                  album: album || 'Unknown Album',
                  duration: durationMs > 0 ? formatDurationMs(durationMs) : '-',
                  durationMs: durationMs
                };

                queryToMeta[normQuery] = meta;
                if (!titleToMeta[normTitle] || titleToMeta[normTitle].durationMs < durationMs) {
                  titleToMeta[normTitle] = meta;
                }
              }
            }
          }
        } catch (err) {
          console.warn(`Failed to parse user JSON file: ${file}`, { error: err.message });
        }
      } else if (ext === '.csv') {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const rows = parseCSV(content);

          for (const row of rows) {
            let track = '';
            let artist = '';
            let album = '';
            let durationMs = 0;
            let releaseDate = '';

            Object.entries(row).forEach(([key, val]) => {
              const k = key.toLowerCase().trim();
              if (['track', 'song', 'title', 'name', 'track name', 'song name'].includes(k)) {
                track = val;
              } else if (['artist', 'singer', 'band', 'artist name', 'artist name(s)', 'artists'].includes(k)) {
                artist = val;
              } else if (['album', 'album name'].includes(k)) {
                album = val;
              } else if (['duration', 'duration (ms)', 'duration_ms', 'ms'].includes(k)) {
                durationMs = parseInt(val) || 0;
              } else if (['release date', 'release_date', 'released'].includes(k)) {
                releaseDate = val;
              }
            });

            if (track) {
              const query = `${track} ${artist}`.trim();
              const normQuery = normalizeStr(query);
              const normTitle = normalizeStr(track);

              const meta = {
                title: track,
                artist: artist || 'Unknown Artist',
                album: album || 'Unknown Album',
                duration: durationMs > 0 ? formatDurationMs(durationMs) : '-',
                durationMs: durationMs,
                releaseDate: releaseDate || ''
              };

              queryToMeta[normQuery] = meta;
              titleToMeta[normTitle] = meta;
            }
          }
        } catch (err) {
          console.warn(`Failed to parse user CSV file: ${file}`, { error: err.message });
        }
      }
    }
  } catch (err) {
    console.error('Error loading user metadata maps', { error: err.message });
  }

  return { queryToMeta, titleToMeta };
}

async function getUserMetadata() {
  if (!cachedUserMetadata) {
    cachedUserMetadata = await loadUserMetadataMap();
  }
  return cachedUserMetadata;
}

function isPlaceholder(val) {
  if (!val) return true;
  const lower = val.toString().toLowerCase().trim();
  return lower === '' || lower === '-' || lower === 'local cache' || lower === 'already downloaded' || lower === 'unknown (local cache)' || lower === 'unknown artist' || lower === 'youtube video';
}

const { randomBytes } = require('node:crypto');
const internalToken = process.env.SCRAPER_INTERNAL_TOKEN || randomBytes(32).toString('hex');
const { createApiGuard } = require('./security');
const { rateLimit } = require('express-rate-limit');

const app = express();
const port = 3001;

// Disable Express fingerprinting banner
app.disable('x-powered-by');
app.set('trust proxy', false);
const apiLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false });
app.use(apiLimiter);
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// Restrict CORS to localhost/127.0.0.1 dynamically to support varying local ports
const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
];

// Local-only guard: cross-site/non-local origins and rebound hosts are rejected;
// /api/internal/* additionally requires the scraper's bearer token.
app.use(createApiGuard({ internalToken }));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(regex => regex.test(origin));
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'Sec-Fetch-Site'],
}));

// Set HTTP Security Headers manual middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' http://localhost:3001;");
  next();
});

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.use(express.json({ limit: '1mb' }));

// Serving the downloads directory statically for direct access
const downloadsDir = path.resolve(process.env.DOWNLOADS_DIR || path.join(rootDir, 'downloads'));
const appleMusicDataDir = path.join(__dirname, '../../apple_music_data/csvs');
app.get('/api/downloads/file/*', async (req, res, next) => {
  try {
    const file = await resolveDownloadFile(downloadsDir, req.params[0]);
    res.sendFile(file, err => { if (err) next(err); });
  } catch (err) { next(err); }
});

// Serve extracted album art directly from ID3 tags
app.get('/api/downloads/art/*', async (req, res) => {
  try {
    const filePath = await resolveDownloadFile(downloadsDir, req.params[0]);

    const metadata = await (await metadataModule).parseFile(filePath, { duration: false });
    const picture = metadata.common.picture && metadata.common.picture[0];

    if (picture) {
      res.setHeader('Content-Type', picture.format);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(picture.data);
    } else {
      res.status(404).json({ error: 'No album art found' });
    }
  } catch (err) {
    // ponytail: quietly return 404 on corrupted ID3 tags so the frontend image falls back gracefully without spamming the backend logs
    res.status(err.status || 404).json({ error: 'Album art missing or unavailable' });
  }
});
// Background process state
let currentProcess = null;
let processLog = '';
let processStatus = 'idle'; // 'idle', 'running', 'success', 'error'
let processType = ''; // 'api' or 'selenium'

// Get Apple Music stats
app.get('/api/apple/stats', async (req, res) => {
  try {
    const stats = await appleStatsCache.get();
    res.json(stats);
  } catch (err) {
    console.error('Failed to aggregate Apple stats', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to aggregate Apple stats' });
  }
});

// List Apple Music source files
app.get('/api/apple/sources', async (req, res) => {
  try {
    const baseDir = (process.env.APPLE_DATA_DIR || path.join(rootDir, 'apple_music_data'));
    const sources = [];
    for (const sub of ['csvs', 'jsons']) {
      const dir = path.join(baseDir, sub);
      await fs.ensureDir(dir);
      const files = await fs.readdir(dir);
      for (const f of files) {
        if (f.endsWith('.csv') || f.endsWith('.json')) sources.push(`${sub}/${f}`);
      }
    }
    res.json({ sources });
  } catch (err) {
    console.error('Failed to read Apple sources', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to read Apple sources' });
  }
});

// Get Spotify recap stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await spotifyStatsCache.get();
    res.json(stats);
  } catch (err) {
    console.error('Failed to aggregate stats', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to aggregate stats' });
  }
});



// List files in the downloads directory recursively
app.get('/api/downloads', async (req, res) => {
  try {
    await fs.ensureDir(downloadsDir);
    const ents = await fs.readdir(downloadsDir, { recursive: true, withFileTypes: true });
    const filePaths = ents.filter(e => e.isFile()).map(e => path.join(e.parentPath || e.path, e.name));

    // Load metadata from root cache files
    const rootDir = path.join(__dirname, '../..');
    let cacheMap = {};
    let metaMap = {};
    try {
      const cacheData = await fs.readJson(path.join(stateDir, 'download_cache.json')).catch(() => ({}));
      const metaData = await fs.readJson(path.join(stateDir, 'download_links.json')).catch(() => ({}));

      // cacheData maps query string to { file_path: "C:\\...\\downloads\\Song.mp3" }
      for (const [query, val] of Object.entries(cacheData)) {
        if (val && val.file_path) {
          const basename = path.basename(val.file_path);
          cacheMap[basename] = query;
        }
      }
      metaMap = metaData;
    } catch (e) {
      console.warn('Error reading metadata cache', { error: e.message });
    }

    const userMetadataMap = await getUserMetadata();
    const list = [];

    for (const filePath of filePaths) {
      const relativePath = path.relative(downloadsDir, filePath).replace(/\\/g, '/');
      const basename = path.basename(filePath);
      const stat = await fs.stat(filePath);

      let metadata = {};
      const query = cacheMap[basename];
      if (query && metaMap[query]) {
        metadata = {
          title: metaMap[query].title,
          artist: metaMap[query].artist,
          album: metaMap[query].album,
          duration: metaMap[query].duration
        };
      }

      let title = metadata.title;
      let artist = metadata.artist;
      let album = metadata.album;
      let duration = metadata.duration;

      // Dynamic fallback search in user provided metadata
      let userMeta = null;
      if (query) {
        userMeta = userMetadataMap.queryToMeta[normalizeStr(query)];
      }
      if (!userMeta) {
        // Fallback: check query maps by filename
        const cleanFilename = normalizeStr(path.basename(filePath, '.mp3'));
        userMeta = userMetadataMap.titleToMeta[cleanFilename];
      }

      if (userMeta) {
        if (isPlaceholder(title)) title = userMeta.title;
        if (isPlaceholder(artist)) artist = userMeta.artist;
        if (isPlaceholder(album)) album = userMeta.album;
        if (isPlaceholder(duration)) duration = userMeta.duration;
      }

      // Basic formatting splits as a final fallback if still placeholder and query is present
      if (isPlaceholder(title) && query) {
        const parts = query.split(' - ');
        if (parts.length >= 2) {
          if (isPlaceholder(artist)) artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        } else {
          title = query;
        }
      }

      // Ensure defaults if still placeholders
      if (isPlaceholder(title)) title = path.basename(filePath, '.mp3');
      if (isPlaceholder(artist)) artist = 'Unknown Artist';
      if (isPlaceholder(album)) album = 'Unknown Album';
      if (isPlaceholder(duration)) duration = '-';

      list.push({
        name: relativePath,
        size: stat.size,
        mtime: stat.mtime,
        url: `/api/downloads/file/${encodeURIComponent(relativePath)}`,
        title,
        artist,
        album,
        duration,
        releaseDate: (userMeta && userMeta.releaseDate) || ''
      });
    }

    // Sort by modified time desc (newest first)
    list.sort((a, b) => b.mtime - a.mtime);
    res.json({ files: list });
  } catch (err) {
    console.error('Failed to read downloads directory', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to read downloads directory' });
  }
});

// Downloads are application-owned. Only selected regular files may be removed.
app.delete('/api/downloads/file/*', async (req, res, next) => {
  try {
    const file = await resolveDownloadFile(downloadsDir, req.params[0]);
    await fs.unlink(file);
    res.json({ success: true, message: `Deleted ${req.params[0]}` });
  } catch (err) { next(err); }
});

function validFiles(files) {
  return Array.isArray(files) && files.length > 0 && files.length <= 500 &&
    files.every(f => typeof f === 'string' && f.length > 0 && f.length <= 1024);
}
app.post('/api/downloads/delete-batch', async (req, res) => {
  const { files } = req.body;
  if (!validFiles(files)) return res.status(400).json({ error: 'Provide 1–500 filenames' });
  const deleted = [], errors = [];
  for (const name of new Set(files)) {
    try {
      await fs.unlink(await resolveDownloadFile(downloadsDir, name));
      deleted.push(name);
    } catch (err) { errors.push({ file: name, error: err.status ? err.message : 'Deletion failed' }); }
  }
  res.json({ success: errors.length === 0, deleted, errors });
});

app.post('/api/downloads/zip', async (req, res, next) => {
  try {
    const { files } = req.body;
    if (!validFiles(files)) return res.status(400).json({ error: 'Provide 1–500 filenames' });
    const entries = [];
    let bytes = 0;
    for (const name of new Set(files)) {
      const file = await resolveDownloadFile(downloadsDir, name);
      bytes += (await fs.stat(file)).size;
      if (bytes > 2 * 1024 ** 3) return res.status(413).json({ error: 'ZIP selection exceeds 2 GiB' });
      entries.push({ file, name: path.relative(downloadsDir, file).replace(/\\/g, '/') });
    }
    const archive = new ZipArchive({ zlib: { level: 0 } });
    archive.on('error', next);
    res.on('close', () => archive.abort());
    res.attachment('spotscraper_batch.zip');
    archive.pipe(res);
    for (const entry of entries) archive.file(entry.file, { name: entry.name });
    await archive.finalize();
  } catch (err) { next(err); }
});

// Read previous scrape logs
app.get('/api/logs', async (req, res) => {
  try {
    res.json({
      downloadLinks: inMemoryDownloadLinks,
      scrapeLog: inMemoryScrapeLog
    });
  } catch (err) {
    console.error('Failed to load logs', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

// Internal Webhook for Scrapers
app.post('/api/internal/log', async (req, res) => {
  try {
    const { type, key, data } = req.body;
    if (!['downloadLinks', 'scrapeLog'].includes(type) || typeof key !== 'string' || key.length > 1024 || ['__proto__', 'constructor', 'prototype'].includes(key)) return res.status(400).json({ error: 'Invalid log entry' });
    if (type === 'downloadLinks') {
      inMemoryDownloadLinks[key] = data;
      await fs.writeJson(downloadLinksPath, inMemoryDownloadLinks, { spaces: 4 }).catch(err => {
        console.error('Failed to flush downloadLinks to disk', { error: err.message });
      });
    } else if (type === 'scrapeLog') {
      inMemoryScrapeLog[key] = data;
      await fs.writeJson(scrapeLogPath, inMemoryScrapeLog, { spaces: 4 }).catch(err => {
        console.error('Failed to flush scrapeLog to disk', { error: err.message });
      });
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Internal log error', { error: err.message });
    res.status(500).send('Error');
  }
});

// Helper to archive log entries
async function archiveLogs(downloadLinksKeys, scrapeLogKeys, allDownloadLinks, allScrapeLog) {
  const rootDir = path.join(__dirname, '../..');
  const archiveLinksPath = path.join(stateDir, 'archive_download_links.json');
  const archiveScrapePath = path.join(stateDir, 'archive_scrape_log.json');

  if (downloadLinksKeys.length > 0) {
    let archiveLinks = {};
    if (await fs.pathExists(archiveLinksPath)) {
      archiveLinks = await fs.readJson(archiveLinksPath);
    }
    for (const key of downloadLinksKeys) {
      if (allDownloadLinks[key] !== undefined) {
        archiveLinks[key] = allDownloadLinks[key];
      }
    }
    await fs.writeJson(archiveLinksPath, archiveLinks, { spaces: 2 });
  }

  if (scrapeLogKeys.length > 0) {
    let archiveScrape = {};
    if (await fs.pathExists(archiveScrapePath)) {
      archiveScrape = await fs.readJson(archiveScrapePath);
    }
    for (const key of scrapeLogKeys) {
      if (allScrapeLog[key] !== undefined) {
        archiveScrape[key] = allScrapeLog[key];
      }
    }
    await fs.writeJson(archiveScrapePath, archiveScrape, { spaces: 2 });
  }
}

// Batch delete specific logs
app.post('/api/logs/delete-batch', async (req, res) => {
  try {
    const { queries } = req.body;
    if (!Array.isArray(queries)) {
      return res.status(400).json({ error: 'Queries array required' });
    }

    const dlKeysToArchive = [];
    const slKeysToArchive = [];

    for (const q of queries) {
      if (inMemoryDownloadLinks[q] !== undefined) {
        dlKeysToArchive.push(q);
      }
      if (inMemoryScrapeLog[q] !== undefined) {
        slKeysToArchive.push(q);
      }
    }

    // Archive before deleting
    await archiveLogs(dlKeysToArchive, slKeysToArchive, inMemoryDownloadLinks, inMemoryScrapeLog);

    // Delete keys
    for (const q of dlKeysToArchive) delete inMemoryDownloadLinks[q];
    for (const q of slKeysToArchive) delete inMemoryScrapeLog[q];

    await fs.writeJson(downloadLinksPath, inMemoryDownloadLinks, { spaces: 4 });
    await fs.writeJson(scrapeLogPath, inMemoryScrapeLog, { spaces: 4 });

    res.json({ success: true, message: `Deleted ${queries.length} logs.` });
  } catch (err) {
    console.error('Failed to batch delete logs', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to batch delete logs' });
  }
});

// Clear all logs
app.post('/api/logs/clear', async (req, res) => {
  try {
    const dlKeysToArchive = Object.keys(inMemoryDownloadLinks);
    const slKeysToArchive = Object.keys(inMemoryScrapeLog);

    await archiveLogs(dlKeysToArchive, slKeysToArchive, inMemoryDownloadLinks, inMemoryScrapeLog);

    inMemoryDownloadLinks = {};
    inMemoryScrapeLog = {};

    await fs.writeJson(downloadLinksPath, inMemoryDownloadLinks, { spaces: 4 });
    await fs.writeJson(scrapeLogPath, inMemoryScrapeLog, { spaces: 4 });

    res.json({ success: true, message: 'All logs cleared and archived.' });
  } catch (err) {
    console.error('Failed to clear logs', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Stream imports through a single validated router.
const { createUploadRouter } = require('./uploads');
app.use('/api', createUploadRouter({
  spotifyDir: process.env.SPOTIFY_DATA_DIR || path.join(rootDir, 'spotify_data'),
  appleDir: process.env.APPLE_DATA_DIR || path.join(rootDir, 'apple_music_data'),
  onUploaded: () => { cachedUserMetadata = null; spotifyStatsCache.invalidate(); appleStatsCache.invalidate(); }
}));

// List available data source files
app.get('/api/sources', async (req, res) => {
  try {
    const spotifyDataDir = (process.env.SPOTIFY_DATA_DIR || path.join(rootDir, 'spotify_data'));
    if (!(await fs.pathExists(spotifyDataDir))) {
      return res.json({ sources: [] });
    }
    const files = await fs.readdir(spotifyDataDir);
    const sources = files.filter(f => f.endsWith('.json') || f.endsWith('.csv') || f.endsWith('.xlsx') || f.endsWith('.xls'));
    res.json({ sources });
  } catch (err) {
    console.error('Failed to read sources', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to read sources' });
  }
});

// Trigger a scraper run
app.post('/api/scrape/start', (req, res, next) => {
  try {
    if (processStatus === 'running') {
      return res.status(400).json({ error: 'A scrape process is already running.' });
    }

    const { script, limit, website, query, sourceFile } = req.body;
    if ((script !== undefined && !['api', 'selenium'].includes(script)) ||
        (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) ||
        (query !== undefined && (typeof query !== 'string' || query.length > 500)) ||
        (sourceFile !== undefined && (typeof sourceFile !== 'string' || sourceFile.length > 200 || /[\\/]/.test(sourceFile))) ||
        (website !== undefined && !['https://qobuz.squid.wtf', 'https://qobuz.squid.wtf/'].includes(website))) {
      return res.status(400).json({ error: 'Invalid scraper settings (limit 1–500, approved website only).' });
    }

    processType = script || 'api';
    processLog = `Starting ${processType === 'selenium' ? 'High Quality - Albums (320kbps)' : 'Fast MP3 - Tracks (192kbps)'}...\n`;
    if (sourceFile) processLog += `Using data source: ${sourceFile}\n`;
    processStatus = 'running';

    const rootDir = path.join(__dirname, '../..');
    let scriptPath;
    let args = [];

    // Sanitize sourceFile to prevent directory traversal
    const safeSourceFile = sourceFile ? path.basename(sourceFile) : null;

    if (processType === 'selenium') {
      scriptPath = path.join(rootDir, 'Scraper.py');
      if (query) {
        args = ['query', query];
      } else {
        args = [String(limit !== undefined ? limit : 5), 'https://qobuz.squid.wtf'];
        if (safeSourceFile) args.push(safeSourceFile);
      }
    } else {
      scriptPath = path.join(rootDir, 'Scraper.py');
      if (query) {
        args = ['query', query, website || 'https://qobuz.squid.wtf'];
      } else {
        args = [String(limit !== undefined ? limit : 3), website || 'https://qobuz.squid.wtf'];
        if (safeSourceFile) args.push(safeSourceFile);
      }
    }

    processLog += `Command: python ${path.basename(scriptPath)} ${args.join(' ')}\n\n`;

    // Spawn Python process
    let pythonExecutable = 'python';
    const venvWinPath = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
    const venvNixPath = path.join(rootDir, '.venv', 'bin', 'python');

    if (fsSync.existsSync(venvWinPath)) {
      pythonExecutable = venvWinPath;
    } else if (fsSync.existsSync(venvNixPath)) {
      pythonExecutable = venvNixPath;
    }

    currentProcess = spawn(pythonExecutable, [scriptPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        SCRAPER_INTERNAL_TOKEN: internalToken,
        DATA_DIR: stateDir,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      }
    });

    currentProcess.stdout.on('data', (data) => {
      processLog += data.toString();
      // Cap log at 100,000 chars to avoid memory issues
      if (processLog.length > 100000) {
        processLog = processLog.slice(-100000);
      }
    });

    currentProcess.stderr.on('data', (data) => {
      processLog += `[ERROR] ${data.toString()}`;
      if (processLog.length > 100000) {
        processLog = processLog.slice(-100000);
      }
    });

    currentProcess.on('error', (err) => {
      console.error('Failed to start scrape process', { error: err.message, scriptPath, args });
      processLog += `\nFailed to start process: ${err.message}\n`;
      processStatus = 'error';
      currentProcess = null;
    });

    currentProcess.on('close', (code) => {
      console.log('Scrape process finished', { code, scriptPath });
      processLog += `\nProcess exited with code ${code}\n`;
      processStatus = code === 0 ? 'success' : 'error';
      currentProcess = null;
    });

    console.log('Scrape process started', { ip: req.ip, script: processType, query, limit, sourceFile: safeSourceFile });
    res.json({ success: true, status: processStatus });
  } catch (err) {
    next(err);
  }
});

// Check status and logs of background scraper
app.get('/api/scrape/status', (req, res) => {
  res.json({
    status: processStatus,
    type: processType,
    output: processLog
  });
});

// Stop running scraper
app.post('/api/scrape/stop', (req, res) => {
  if (currentProcess) {
    // Attempt SIGTERM first, then SIGKILL if needed. On Windows, SIGTERM kills the process.
    currentProcess.kill('SIGTERM');
    processStatus = 'idle';
    processLog += '\n--- Process terminated by user ---\n';
    currentProcess = null;
    console.log('Scrape process stopped by user', { ip: req.ip });
    res.json({ success: true, message: 'Scrape process cancelled.' });
  } else {
    res.status(400).json({ error: 'No scrape process running.' });
  }
});

// Global Error Handler Middleware (CWE-756 / CWE-248)
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error('Server error', { error: err.message, path: req.path });
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status < 500 ? err.message : 'An unexpected server error occurred.' });
});

// Start Express Server
const host = process.env.HOST || '127.0.0.1';
if (require.main === module) {
  ready.then(() => app.listen(Number(process.env.PORT || port), host, () => {
    console.log(`Backend listening on ${host}`);
  })).catch(err => { console.error(err.message); process.exitCode = 1; });
}
module.exports = { app, ready };
