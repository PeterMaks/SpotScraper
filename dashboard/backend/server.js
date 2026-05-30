const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { aggregateStats } = require('./parser');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

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

// List files in the downloads directory
app.get('/api/downloads', async (req, res) => {
  try {
    await fs.ensureDir(downloadsDir);
    const files = await fs.readdir(downloadsDir);
    const list = [];

    for (const file of files) {
      const filePath = path.join(downloadsDir, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        list.push({
          name: file,
          size: stat.size,
          mtime: stat.mtime,
          url: `/api/downloads/file/${encodeURIComponent(file)}`
        });
      }
    }

    // Sort by modified time desc (newest first)
    list.sort((a, b) => b.mtime - a.mtime);
    res.json({ files: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read downloads directory' });
  }
});

// Delete a download file
app.delete('/api/downloads/file/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(downloadsDir, filename);

    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      res.json({ success: true, message: `Deleted ${filename}` });
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

// Trigger a scraper run
app.post('/api/scrape/start', (req, res) => {
  if (processStatus === 'running') {
    return res.status(400).json({ error: 'A scrape process is already running.' });
  }

  const { script, limit, website, mode, query } = req.body;
  
  processType = script || 'api';
  processLog = `Starting ${processType === 'selenium' ? 'Selenium Scraper' : 'Qobuz-DL API Scraper'}...\n`;
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
    }
  } else {
    scriptPath = path.join(rootDir, 'Scraper.py');
    if (query) {
      args = ['query', query, website || 'https://qobuz.squid.wtf'];
    } else {
      args = [String(limit || 3), website || 'https://qobuz.squid.wtf'];
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
