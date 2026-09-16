const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('actual download routes serve files, reject directories, and delete only the selected file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spotscraper-routes-'));
  let server;
  try {
    const downloads = path.join(root, 'downloads');
    await fs.mkdir(path.join(downloads, 'album'), { recursive: true });
    await fs.writeFile(path.join(downloads, 'album', 'song.mp3'), 'test audio');
    process.env.DOWNLOADS_DIR = downloads;
    process.env.DATA_DIR = root;
    process.env.SPOTIFY_DATA_DIR = path.join(root, 'spotify');
    process.env.APPLE_DATA_DIR = path.join(root, 'apple');
    process.env.SCRAPER_INTERNAL_TOKEN = 'test-only-internal';
    assert.match(await fs.readFile(path.join(__dirname, 'server.js'), 'utf8'), /module\.exports/, 'server must be importable without starting a listener');
    const { app, ready } = require('./server');
    await ready;
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    assert.equal((await fetch(`${url}/api/internal/log`, { method: 'POST' })).status, 401);
    const upload = async () => {
      const form = new FormData(); form.append('file', new Blob(['[{"ms_played":120}]']), 'history.json');
      return fetch(`${url}/api/upload`, { method: 'POST', body: form });
    };
    assert.equal((await upload()).status, 200);
    assert.equal((await upload()).status, 409);
    assert.equal(await fs.readFile(path.join(root, 'spotify', 'history.json'), 'utf8'), '[{"ms_played":120}]');
    const apple = new FormData(); apple.append('file', new Blob(['Track,Artist\nSong,Artist\n']), 'history.csv');
    assert.equal((await fetch(`${url}/api/apple/upload`, { method: 'POST', body: apple })).status, 200);
    assert.equal(await fs.readFile(path.join(root, 'apple', 'csvs', 'history.csv'), 'utf8'), 'Track,Artist\nSong,Artist\n');
    assert.equal(await (await fetch(`${url}/api/downloads/file/album/song.mp3`)).text(), 'test audio');
    assert.equal((await fetch(`${url}/api/downloads/file/album`, { method: 'DELETE' })).status, 403);
    assert.equal(await fs.readFile(path.join(downloads, 'album', 'song.mp3'), 'utf8'), 'test audio');
    const zip = await fetch(`${url}/api/downloads/zip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: ['album/song.mp3'] }) });
    assert.equal(zip.status, 200);
    assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    assert.equal((await fetch(`${url}/api/downloads/file/album/song.mp3`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${url}/api/downloads/file/album/song.mp3`)).status, 404);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await fs.rm(root, { recursive: true, force: true });
  }
});
