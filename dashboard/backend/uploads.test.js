const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

async function setup(t, options = {}) {
  const { createUploadRouter } = require('./uploads');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spotscraper-upload-'));
  const spotifyDir = path.join(root, 'spotify');
  const appleDir = path.join(root, 'apple');
  const events = [];
  const app = express();
  app.use('/api', createUploadRouter({ spotifyDir, appleDir, onUploaded: event => events.push(event), ...options }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function upload(name, content, route = '/upload', field = 'file') {
    // Raw multipart preserves hostile paths that FormData may normalize.
    const boundary = 'test-boundary-9c023';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n--${boundary}--\r\n`;
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body });
    return { status: response.status, body: await response.json() };
  }
  return { root, spotifyDir, appleDir, events, upload, base };
}

async function filesBelow(root) {
  const results = [];
  for (const item of await fs.readdir(root, { withFileTypes: true })) {
    const name = path.join(root, item.name);
    if (item.isDirectory()) results.push(...await filesBelow(name));
    else results.push(name);
  }
  return results;
}

test('rejects malformed JSON without committing or notifying', async t => {
  const { upload, root, events } = await setup(t);
  assert.equal((await upload('broken.json', '{broken')).status, 400);
  assert.deepEqual(await filesBelow(root), []);
  assert.equal(events.length, 0);
});

test('CSV imports reach Apple csvs and duplicate imports do not overwrite', async t => {
  const { upload, appleDir } = await setup(t);
  const result = await upload('history.csv', 'Track,Artist\nSong,Singer\n', '/apple/upload');
  assert.equal(result.status, 200);
  assert.equal(await fs.readFile(path.join(appleDir, 'csvs', 'history.csv'), 'utf8'), 'Track,Artist\nSong,Singer\n');
  assert.equal((await upload('history.csv', 'Track,Artist\nOther,Singer\n', '/apple/upload')).status, 409);
  assert.equal((await upload('program.exe', 'not music')).status, 415);
});

test('streams multipart JSON into Spotify and reports a committed upload', async t => {
  const { upload, spotifyDir, events, root } = await setup(t);
  const result = await upload('history.json', '[{"ms_played":120}]');
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(await fs.readFile(path.join(spotifyDir, 'history.json'), 'utf8'), '[{"ms_played":120}]');
  assert.equal(events.length, 1);
  assert.equal(events[0].source, 'spotify');
  assert.equal(events[0].fileName, 'history.json');
  assert.deepEqual(await filesBelow(root), [path.join(spotifyDir, 'history.json')]);
});
