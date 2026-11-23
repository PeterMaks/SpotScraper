const fs = require('node:fs/promises');
const path = require('node:path');
const fail = (status, message) => Object.assign(new Error(message), { status });

// Reject links at every component: downloads is application-owned, not a
// writable sandbox for mutually untrusted local users (no TOCTOU guarantee).
async function resolveDownloadFile(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\0')) throw fail(400, 'Invalid filename');
  if (path.win32.isAbsolute(name) || path.posix.isAbsolute(name) || name.includes(':')) throw fail(403, 'Forbidden path');
  const parts = name.replace(/\\/g, '/').split('/');
  if (parts.some(p => !p || p === '.' || p === '..')) throw fail(403, 'Forbidden path');
  try {
    const base = await fs.realpath(root);
    let target = base;
    for (const part of parts) {
      target = path.join(target, part);
      if ((await fs.lstat(target)).isSymbolicLink()) throw fail(403, 'Links are not allowed');
    }
    const real = await fs.realpath(target);
    const relative = path.relative(base, real);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw fail(403, 'Forbidden path');
    if (!(await fs.stat(real)).isFile()) throw fail(403, 'Only regular files are allowed');
    return real;
  } catch (err) {
    if (['ENOENT', 'ENOTDIR'].includes(err.code)) throw fail(404, 'File not found');
    throw err;
  }
}
module.exports = { resolveDownloadFile };
