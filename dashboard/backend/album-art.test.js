const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Minimal ID3v2.3 APIC tag containing a known PNG, no personal music needed.
function taggedAudio(png) {
  const payload = Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0'), Buffer.from([3, 0]), png]);
  const frame = Buffer.alloc(10); frame.write('APIC'); frame.writeUInt32BE(payload.length, 4);
  const size = frame.length + payload.length;
  const header = Buffer.from([73, 68, 51, 3, 0, 0, (size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127]);
  return Buffer.concat([header, frame, payload]);
}

test('album art HTTP response contains original PNG bytes, not serialized typed arrays', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spotscraper-art-'));
  let server;
  try {
    const downloads = path.join(root, 'downloads');
    await fs.mkdir(downloads);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=', 'base64');
    await fs.writeFile(path.join(downloads, 'cover.mp3'), taggedAudio(png));
    process.env.DATA_DIR = root;
    process.env.DOWNLOADS_DIR = downloads;
    process.env.SPOTIFY_DATA_DIR = path.join(root, 'spotify');
    process.env.APPLE_DATA_DIR = path.join(root, 'apple');
    const { app, ready } = require('./server');
    await ready;
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/downloads/art/cover.mp3`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^image\/png/);
    const body = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(body, png);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await fs.rm(root, { recursive: true, force: true });
  }
});
