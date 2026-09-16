const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('only regular files contained in downloads are accepted', async () => {
  const { resolveDownloadFile } = require('./download-path');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'spotscraper-path-'));
  const root = path.join(parent, 'downloads');
  try {
    await fs.mkdir(path.join(root, 'album'), { recursive: true });
    await fs.mkdir(path.join(parent, 'downloads_backup'));
    await fs.writeFile(path.join(root, 'album', 'song.mp3'), 'test');
    await fs.writeFile(path.join(parent, 'downloads_backup', 'song.mp3'), 'private');
    assert.equal(await resolveDownloadFile(root, 'album/song.mp3'), await fs.realpath(path.join(root, 'album', 'song.mp3')));
    for (const name of ['../downloads_backup/song.mp3', '..\\downloads_backup\\song.mp3', '.', 'album', path.join(root, 'album', 'song.mp3')]) {
      await assert.rejects(resolveDownloadFile(root, name), { status: 403 }, name);
    }
    await assert.rejects(resolveDownloadFile(root, ''), { status: 400 });
    await assert.rejects(resolveDownloadFile(root, 'missing.mp3'), { status: 404 });
    await fs.symlink(path.join(parent, 'downloads_backup'), path.join(root, 'linked'), 'junction');
    await assert.rejects(resolveDownloadFile(root, 'linked/song.mp3'), { status: 403 });
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
