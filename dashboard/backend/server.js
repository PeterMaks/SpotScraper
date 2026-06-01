const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { aggregateStats } = require('./parser');

const app = express();
const port = 3001;

app.use(cors());
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
    console.error(err);
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
    const list = [];

    for (const filePath of filePaths) {
      const relativePath = path.relative(downloadsDir, filePath).replace(/\\/g, '/');
      const stat = await fs.stat(filePath);
      list.push({
        name: relativePath,
        size: stat.size,
        mtime: stat.mtime,
        url: `/api/downloads/file/${encodeURIComponent(relativePath)}`
      });
    }

    // Sort by modified time desc (newest first)
    list.sort((a, b) => b.mtime - a.mtime);
    res.json({ files: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read downloads directory' });
  }
});

// Delete a download file (handles subfolders via wildcard match)
app.delete('/api/downloads/file/*', async (req, res) => {
  try {
    const relativePath = req.params[0];
    const filePath = path.join(downloadsDir, relativePath);

    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      res.json({ success: true, message: `Deleted ${relativePath}` });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete file' });
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
    console.error(err);
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
    const targetPath = path.join(spotifyDataDir, safeName);

    // Write file decoding from base64
    const fileBuffer = Buffer.from(content, 'base64');
    await fs.writeFile(targetPath, fileBuffer);

    res.json({ success: true, message: `Successfully uploaded ${safeName}` });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'Failed to read sources' });
  }
});

// Trigger a scraper run
app.post('/api/scrape/start', (req, res) => {
  if (processStatus === 'running') {
    return res.status(400).json({ error: 'A scrape process is already running.' });
  }

  const { script, limit, website, mode, query, sourceFile } = req.body;
  
  processType = script || 'api';
  processLog = `Starting ${processType === 'selenium' ? 'YouTube-DL High Quality (320kbps)' : 'YouTube-DL Fast MP3 (192kbps)'}...\n`;
  if (sourceFile) processLog += `Using data source: ${sourceFile}\n`;
  processStatus = 'running';

  const rootDir = path.join(__dirname, '../..');
  let scriptPath;
  let args = [];

  if (processType === 'selenium') {
    scriptPath = path.join(rootDir, 'qobuz_scrapper.py');
    if (query) {
      args = ['query', query];
    } else {
      args = [mode || 'albums', String(limit || 5)];
      if (sourceFile) args.push(sourceFile);
    }
  } else {
    scriptPath = path.join(rootDir, 'Scraper.py');
    if (query) {
      args = ['query', query, website || 'https://qobuz.squid.wtf'];
    } else {
      args = [String(limit || 3), website || 'https://qobuz.squid.wtf'];
      if (sourceFile) args.push(sourceFile);
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
    processLog += `\nFailed to start process: ${err.message}\n`;
    processStatus = 'error';
    currentProcess = null;
  });

  currentProcess.on('close', (code) => {
    processLog += `\nProcess exited with code ${code}\n`;
    processStatus = code === 0 ? 'success' : 'error';
    currentProcess = null;
  });

  res.json({ success: true, status: processStatus });
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
    res.json({ success: true, message: 'Scrape process cancelled.' });
  } else {
    res.status(400).json({ error: 'No scrape process running.' });
  }
});

// Start Express Server
app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
