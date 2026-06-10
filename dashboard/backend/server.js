const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { aggregateStats } = require('./parser');
const logger = require('./logger');
const archiver = require('archiver');

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

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  const results = [];
  const headers = parseCSVLine(lines[0]);
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    results.push(row);
  }
  return results;
}

let cachedUserMetadata = null;

async function loadUserMetadataMap() {
  const dataDir = path.join(__dirname, '../../spotify_data');
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
          logger.warn(`Failed to parse user JSON file: ${file}`, { error: err.message });
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
                durationMs: durationMs
              };
              
              queryToMeta[normQuery] = meta;
              titleToMeta[normTitle] = meta;
            }
          }
        } catch (err) {
          logger.warn(`Failed to parse user CSV file: ${file}`, { error: err.message });
        }
      }
    }
  } catch (err) {
    logger.error('Error loading user metadata maps', { error: err.message });
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

const app = express();
const port = 3001;

// Disable Express fingerprinting banner
app.disable('x-powered-by');

// Restrict CORS to localhost/127.0.0.1 dynamically to support varying local ports
const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
];

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
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Set HTTP Security Headers manual middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' http://localhost:3001;");
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serving the downloads directory statically for direct access
const downloadsDir = path.join(__dirname, '../../downloads');
app.use('/api/downloads/file', express.static(downloadsDir));

// Background process state
let currentProcess = null;
let processLog = '';
let processStatus = 'idle'; // 'idle', 'running', 'success', 'error'
let processType = ''; // 'api' or 'selenium'

// Get Spotify recap stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await aggregateStats();
    res.json(stats);
  } catch (err) {
    logger.error('Failed to aggregate stats', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to aggregate stats' });
  }
});

// Helper function to recursively read files in a directory
async function getFilesRecursive(dir) {
  let results = [];
  const list = await fs.readdir(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(await getFilesRecursive(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

// List files in the downloads directory recursively
app.get('/api/downloads', async (req, res) => {
  try {
    await fs.ensureDir(downloadsDir);
    const filePaths = await getFilesRecursive(downloadsDir);
    
    // Load metadata from root cache files
    const rootDir = path.join(__dirname, '../..');
    let cacheMap = {};
    let metaMap = {};
    try {
      const cacheData = await fs.readJson(path.join(rootDir, 'download_cache.json')).catch(() => ({}));
      const metaData = await fs.readJson(path.join(rootDir, 'download_links.json')).catch(() => ({}));
      
      // cacheData maps query string to { file_path: "C:\\...\\downloads\\Song.mp3" }
      for (const [query, val] of Object.entries(cacheData)) {
        if (val && val.file_path) {
          const basename = path.basename(val.file_path);
          cacheMap[basename] = query;
        }
      }
      metaMap = metaData;
    } catch (e) {
      logger.warn('Error reading metadata cache', { error: e.message });
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
        duration
      });
    }

    // Sort by modified time desc (newest first)
    list.sort((a, b) => b.mtime - a.mtime);
    res.json({ files: list });
  } catch (err) {
    logger.error('Failed to read downloads directory', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to read downloads directory' });
  }
});

// Delete a download file (handles subfolders via wildcard match)
app.delete('/api/downloads/file/*', async (req, res) => {
  try {
    const relativePath = req.params[0];
    const filePath = path.join(downloadsDir, relativePath);

    // Resolve paths to absolute paths to prevent directory traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloadsDir = path.resolve(downloadsDir);

    if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
      logger.warn('Directory traversal attempt detected', { ip: req.ip, path: relativePath });
      return res.status(403).json({ error: 'Access denied: Directory traversal detected.' });
    }

    if (await fs.pathExists(resolvedPath)) {
      await fs.remove(resolvedPath);
      logger.info('File deleted', { ip: req.ip, file: relativePath });
      res.json({ success: true, message: `Deleted ${relativePath}` });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    logger.error('Failed to delete file', { error: err.message, ip: req.ip, file: req.params[0] });
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Batch delete
app.post('/api/downloads/delete-batch', async (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files)) {
      return res.status(400).json({ error: 'files must be an array' });
    }

    const deleted = [];
    const errors = [];

    const resolvedDownloadsDir = path.resolve(downloadsDir);

    for (const relativePath of files) {
      const filePath = path.join(downloadsDir, relativePath);
      const resolvedPath = path.resolve(filePath);

      if (!resolvedPath.startsWith(resolvedDownloadsDir)) {
        errors.push({ file: relativePath, error: 'Directory traversal detected' });
        continue;
      }

      if (await fs.pathExists(resolvedPath)) {
        await fs.remove(resolvedPath);
        deleted.push(relativePath);
      } else {
        errors.push({ file: relativePath, error: 'File not found' });
      }
    }
    
    logger.info('Batch delete completed', { ip: req.ip, deletedCount: deleted.length, errorCount: errors.length });
    res.json({ success: true, deleted, errors });
  } catch (err) {
    logger.error('Failed batch delete', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed batch delete' });
  }
});

// Batch download ZIP
app.post('/api/downloads/zip', async (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files must be a non-empty array' });
    }

    const resolvedDownloadsDir = path.resolve(downloadsDir);
    
    res.attachment('spotscraper_batch.zip');
    const archive = archiver('zip', {
      zlib: { level: 0 } // Fast compression since MP3s are already compressed
    });

    archive.on('error', function(err) {
      logger.error('Archive error', { error: err.message });
      if (!res.headersSent) res.status(500).send({error: err.message});
    });

    archive.pipe(res);

    for (const relativePath of files) {
      const filePath = path.join(downloadsDir, relativePath);
      const resolvedPath = path.resolve(filePath);

      if (resolvedPath.startsWith(resolvedDownloadsDir) && await fs.pathExists(resolvedPath)) {
        archive.file(resolvedPath, { name: path.basename(relativePath) });
      }
    }

    archive.finalize();
  } catch (err) {
    logger.error('Failed batch zip', { error: err.message, ip: req.ip });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed batch zip' });
    }
  }
});

// Read previous scrape logs
app.get('/api/logs', async (req, res) => {
  try {
    const rootDir = path.join(__dirname, '../..');
    const downloadLinksPath = path.join(rootDir, 'download_links.json');
    const scrapeLogPath = path.join(rootDir, 'scrape_log.json');

    let downloadLinks = {};
    let scrapeLog = {};

    if (await fs.pathExists(downloadLinksPath)) {
      downloadLinks = await fs.readJson(downloadLinksPath);
    }
    if (await fs.pathExists(scrapeLogPath)) {
      scrapeLog = await fs.readJson(scrapeLogPath);
    }

    res.json({
      downloadLinks,
      scrapeLog
    });
  } catch (err) {
    logger.error('Failed to load logs', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

// Upload Spotify history JSON, CSV or Excel file (Base64 decoder)
app.post('/api/upload', async (req, res) => {
  try {
    const { fileName, content } = req.body;
    if (!fileName || !content) {
      return res.status(400).json({ error: 'Missing fileName or content.' });
    }

    const spotifyDataDir = path.join(__dirname, '../../spotify_data');
    await fs.ensureDir(spotifyDataDir);

    // Clean up filename to prevent directory traversal
    const safeName = path.basename(fileName);

    // Whitelist file extensions
    const ext = path.extname(safeName).toLowerCase();
    if (!['.json', '.csv', '.xlsx', '.xls'].includes(ext)) {
      return res.status(400).json({ error: 'Unsupported file type. Only .json, .csv, .xlsx, and .xls files are allowed.' });
    }

    const targetPath = path.join(spotifyDataDir, safeName);

    // Write file decoding from base64
    const fileBuffer = Buffer.from(content, 'base64');

    // Restrict size to 10MB
    const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
    if (fileBuffer.length > MAX_UPLOAD_SIZE) {
      logger.warn('File upload exceeded size limit', { ip: req.ip, file: safeName, size: fileBuffer.length });
      return res.status(400).json({ error: 'File size exceeds the 10MB limit.' });
    }

    await fs.writeFile(targetPath, fileBuffer);
    cachedUserMetadata = null; // Invalidate cache so it is rebuilt on the next query

    logger.info('File uploaded successfully', { ip: req.ip, file: safeName });
    res.json({ success: true, message: `Successfully uploaded ${safeName}` });
  } catch (err) {
    logger.error('Failed to upload file', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to upload file.' });
  }
});

// List available data source files
app.get('/api/sources', async (req, res) => {
  try {
    const spotifyDataDir = path.join(__dirname, '../../spotify_data');
    if (!(await fs.pathExists(spotifyDataDir))) {
      return res.json({ sources: [] });
    }
    const files = await fs.readdir(spotifyDataDir);
    const sources = files.filter(f => f.endsWith('.json') || f.endsWith('.csv') || f.endsWith('.xlsx') || f.endsWith('.xls'));
    res.json({ sources });
  } catch (err) {
    logger.error('Failed to read sources', { error: err.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to read sources' });
  }
});

// Trigger a scraper run
app.post('/api/scrape/start', (req, res, next) => {
  try {
    if (processStatus === 'running') {
      return res.status(400).json({ error: 'A scrape process is already running.' });
    }

    const { script, limit, website, mode, query, sourceFile } = req.body;
    
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
      scriptPath = path.join(rootDir, 'qobuz_scrapper.py');
      if (query) {
        args = ['query', query];
      } else {
        args = [mode || 'albums', String(limit || 5)];
        if (safeSourceFile) args.push(safeSourceFile);
      }
    } else {
      scriptPath = path.join(rootDir, 'Scraper.py');
      if (query) {
        args = ['query', query, website || 'https://qobuz.squid.wtf'];
      } else {
        args = [String(limit || 3), website || 'https://qobuz.squid.wtf'];
        if (safeSourceFile) args.push(safeSourceFile);
      }
    }

    processLog += `Command: python ${path.basename(scriptPath)} ${args.join(' ')}\n\n`;

    // Spawn Python process
    let pythonExecutable = 'python';
    const venvWinPath = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
    const venvNixPath = path.join(rootDir, '.venv', 'bin', 'python');
    
    if (fs.existsSync(venvWinPath)) {
      pythonExecutable = venvWinPath;
    } else if (fs.existsSync(venvNixPath)) {
      pythonExecutable = venvNixPath;
    }

    currentProcess = spawn(pythonExecutable, [scriptPath, ...args], {
      cwd: rootDir,
      env: { 
        ...process.env, 
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
      logger.error('Failed to start scrape process', { error: err.message, scriptPath, args });
      processLog += `\nFailed to start process: ${err.message}\n`;
      processStatus = 'error';
      currentProcess = null;
    });

    currentProcess.on('close', (code) => {
      logger.info('Scrape process finished', { code, scriptPath });
      processLog += `\nProcess exited with code ${code}\n`;
      processStatus = code === 0 ? 'success' : 'error';
      currentProcess = null;
    });

    logger.info('Scrape process started', { ip: req.ip, script: processType, query, limit, sourceFile: safeSourceFile });
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
    logger.info('Scrape process stopped by user', { ip: req.ip });
    res.json({ success: true, message: 'Scrape process cancelled.' });
  } else {
    res.status(400).json({ error: 'No scrape process running.' });
  }
});

// Global Error Handler Middleware (CWE-756 / CWE-248)
app.use((err, req, res, next) => {
  logger.error('Unhandled server error', { error: err.message, stack: err.stack, ip: req.ip, path: req.path });
  res.status(500).json({ error: 'An unexpected server error occurred. Please try again later.' });
});

// Start Express Server
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  logger.info(`Backend listening at http://${host}:${port}`);
});
