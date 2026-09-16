const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const queues = new Map();
function writeJson(file, data, options = {}) {
  const snapshot = JSON.stringify(data, null, options.spaces || 0);
  const previous = queues.get(file) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temp, 'wx', 0o600);
      try { await handle.writeFile(snapshot, 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      await fs.rename(temp, file);
    } finally { await fs.rm(temp, { force: true }); }
  });
  queues.set(file, task);
  const cleanup = () => { if (queues.get(file) === task) queues.delete(file); };
  task.then(cleanup, cleanup);
  return task;
}
module.exports = { writeJson };
