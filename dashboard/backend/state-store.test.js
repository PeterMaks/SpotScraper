const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('serialized atomic JSON writes keep the last snapshot and leave no temporary files', async () => {
  const { writeJson } = require('./state-store');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spotscraper-state-'));
  try {
    const file = path.join(root, 'state.json');
    await Promise.all(Array.from({ length: 30 }, (_, n) => writeJson(file, { n })));
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { n: 29 });
    assert.deepEqual(await fs.readdir(root), ['state.json']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
