'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { parse } = require('csv-parse');
const fail = (status, message) => Object.assign(new Error(message), { status });

function validateJson(filePath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      try {
        const data = JSON.parse(require('node:fs').readFileSync(workerData, 'utf8'));
        parentPort.postMessage(data !== null && typeof data === 'object');
      } catch { parentPort.postMessage(false); }
    `, { eval: true, workerData: filePath, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    const timer = setTimeout(() => { worker.terminate(); reject(fail(400, 'JSON validation timed out.')); }, 30_000);
    worker.once('message', ok => { clearTimeout(timer); ok ? resolve() : reject(fail(400, 'Invalid JSON object or array.')); });
    worker.once('error', () => { clearTimeout(timer); reject(fail(400, 'JSON validation failed.')); });
    worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(fail(400, 'JSON validation failed.')); });
  });
}
async function validateCsv(file) {
  const input = createReadStream(file);
  const parser = parse({ bom: true, skip_empty_lines: true, max_record_size: 1024 * 1024 });
  input.on('error', err => parser.destroy(err));
  input.pipe(parser);
  let rows = 0;
  try {
    for await (const row of parser) {
      if (!rows && row.length < 2) throw fail(400, 'CSV must contain a header with at least two columns.');
      rows++;
    }
    if (rows < 2) throw fail(400, 'CSV must contain a header and data.');
  } catch { throw fail(400, 'Invalid CSV file.'); }
  finally { input.destroy(); parser.destroy(); }
}
function safeName(name) {
  if (typeof name !== 'string' || name.length > 200 || /[\\/:\x00-\x1f<>"|?*]/.test(name) || /[. ]$/.test(name) || name.startsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) throw fail(400, 'Invalid filename.');
  const ext = path.extname(name).toLowerCase();
  if (!['.json', '.csv'].includes(ext)) throw fail(415, 'Upload CSV or JSON; export spreadsheets to CSV first.');
  return ext;
}
function createUploadRouter({ spotifyDir, appleDir, onUploaded = () => {}, maxBytes = 100 * 1024 ** 2 }) {
  const router = express.Router();
  // Bound simultaneous validation work, not just bytes per request.
  let active = 0;
  function route(source, root) {
    return async (req, res) => {
      if (active >= 2) return res.status(429).json({ error: 'Uploads busy; retry shortly.' });
      active++;
      let temporary;
      try {
        await fs.mkdir(root, { recursive: true });
        temporary = await fs.mkdtemp(path.join(root, '.upload-'));
        const receive = multer({ dest: temporary, preservePath: true,
          limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 1 },
          fileFilter: (req, file, done) => { try { safeName(file.originalname); done(null, true); } catch (err) { done(err); } }
        }).single('file');
        await new Promise((resolve, reject) => receive(req, res, err => err ? reject(err) : resolve()));
        if (!req.file) throw fail(400, 'A multipart file field is required.');
        const fileName = req.file.originalname;
        const ext = safeName(fileName);
        if (!req.file.size) throw fail(400, 'Empty files are not accepted.');
        if (ext === '.json') await validateJson(req.file.path);
        else await validateCsv(req.file.path);
        const target = source === 'apple' ? path.join(root, ext === '.json' ? 'jsons' : 'csvs') : root;
        await fs.mkdir(target, { recursive: true });
        const filePath = path.join(target, fileName);
        // Atomic no-clobber publication; temp and destination share a filesystem.
        await fs.link(req.file.path, filePath);
        await onUploaded({ source, fileName, filePath, size: req.file.size });
        await fs.rm(temporary, { recursive: true, force: true });
        temporary = null;
        res.json({ success: true, fileName, message: `Successfully uploaded ${fileName}` });
      } catch (err) {
        if (temporary) { await fs.rm(temporary, { recursive: true, force: true }); temporary = null; }
        const status = err.code === 'EEXIST' ? 409 : err.code === 'LIMIT_FILE_SIZE' ? 413 : err instanceof multer.MulterError ? 400 : err.status || 500;
        res.status(status).json({ error: status === 409 ? 'File already exists; rename the import.' : status === 413 ? 'File exceeds the upload limit.' : status === 500 ? 'Upload failed.' : err.message });
      } finally {
        if (temporary) await fs.rm(temporary, { recursive: true, force: true });
        active--;
      }
    };
  }
  router.post('/upload', route('spotify', spotifyDir));
  router.post('/apple/upload', route('apple', appleDir));
  return router;
}
module.exports = { createUploadRouter };
