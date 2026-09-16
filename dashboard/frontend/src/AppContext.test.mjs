import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

// Run the real provider with a small hook host: no DOM/test packages required.
const source = await readFile(new URL('./AppContext.jsx', import.meta.url), 'utf8');
const { code: compiled } = await transformWithOxc(source
  .replace(/import\s+(?:React,\s*)?\{([^}]+)\}\s+from\s+['"]react['"];?/, 'const {$1} = React;')
  .replaceAll('export const ', 'const ')
  .replace('import.meta.env.DEV', 'false') + '\nexports.AppProvider = AppProvider;', 'AppContext.jsx', {
    jsx: { runtime: 'classic' },
  });
assert.ok(compiled.includes('React.createElement'));

function createProvider(fetchImpl) {
  const slots = [];
  let cursor = 0;
  let value;
  let effects = [];
  const timers = new Map();
  const listeners = new Set();
  let timerId = 0;
  const React = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (_, props) => { value = props.value; },
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef: initial => {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useCallback: callback => callback,
    useEffect: effect => { effects.push(effect); },
  };
  const context = {
    exports: {}, React,
    fetch: fetchImpl, FormData, AbortController, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, console: { error() {}, warn() {} },
    Audio: class {}, File: globalThis.File,
    FileReader: class {
      readAsDataURL() { this.result = 'data:application/octet-stream;base64,YQ=='; this.onload(); }
    },
    setTimeout: fn => { timers.set(++timerId, { fn, repeat: false }); return timerId; },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { timers.set(++timerId, { fn, repeat: true }); return timerId; },
    clearInterval: id => timers.delete(id),
    window: {}, document: {
      hidden: false,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
    },
  };
  vm.runInNewContext(compiled, context);
  return {
    render() { cursor = 0; effects = []; context.exports.AppProvider({ children: null }); return value; },
    startPolling() { return effects.at(-1)(); },
    startInitialLoad() { return effects.at(-2)(); },
    timers, listeners,
    hide(hidden) { context.document.hidden = hidden; for (const fn of listeners) fn(); },
    tick() {
      const [id, timer] = timers.entries().next().value;
      if (!timer.repeat) timers.delete(id);
      timer.fn();
    },
  };
}

const response = data => ({ ok: true, json: async () => data });

test('shared player preserves a local blob URL instead of prefixing the backend', () => {
  const provider = createProvider(async () => response({}));
  const app = provider.render();
  app.audioRef.current = { src: '', load() {} };
  app.handlePlayTrack({ name: 'local.wav', url: 'blob:http://localhost/local', local: true });
  assert.equal(app.audioRef.current.src, 'blob:http://localhost/local');
});

test('next and previous are no-ops when the download filter has no matches', () => {
  const provider = createProvider(async () => response({}));
  const track = { name: 'song', url: '/song.mp3' };
  let app = provider.render();
  app.setDownloads([track]);
  app.setCurrentTrack(track);
  app.setDownloadsSearch('missing');
  app.setDuration(42);
  app.audioRef.current = { src: 'unchanged', load() { assert.fail('must not load'); } };
  for (const action of ['handlePlayNext', 'handlePlayPrev']) {
    app = provider.render();
    assert.doesNotThrow(() => app[action]());
    app = provider.render();
    assert.equal(app.currentTrack, track);
    assert.equal(app.duration, 42);
    assert.equal(app.isPlaying, false);
    assert.equal(app.audioRef.current.src, 'unchanged');
  }
});

test('Spotify rejects Excel locally and reports application upload errors', async () => {
  let calls = 0;
  const provider = createProvider(async () => { calls++; return response({ success: false, error: 'Invalid history' }); });
  await provider.render().handleFileUpload({ target: { files: [new File(['a'], 'history.xlsx')] } });
  assert.equal(calls, 0);
  assert.match(provider.render().uploadStatus, /CSV or JSON files only/);
  await provider.render().handleFileUpload({ target: { files: [new File(['a'], 'history.json')] } });
  assert.match(provider.render().uploadStatus, /Upload failed: Invalid history/);
});

test('refresh keeps existing data visible and ignores unsuccessful responses', async () => {
  let next = response({ files: [{ name: 'song' }], sources: ['history.json'], status: 'idle', output: 'old' });
  const provider = createProvider(async () => next);
  for (const [method, dataKey, loadingKey] of [
    ['fetchStats', 'stats', 'loadingStats'],
    ['fetchAppleStats', 'appleStats', 'loadingAppleStats'],
    ['fetchDownloads', 'downloads', 'loadingDownloads'],
    ['fetchLogs', 'logs', 'loadingLogs'],
    ['fetchSources', 'sourceFiles'],
    ['checkScraperStatus', 'scraperStatus'],
  ]) {
    next = response({ files: [{ name: 'song' }], sources: ['history.json'], status: 'idle', output: 'old' });
    await provider.render()[method]();
    const before = provider.render()[dataKey];
    let resolve;
    next = new Promise(done => { resolve = done; });
    const refresh = provider.render()[method]();
    if (loadingKey) assert.equal(provider.render()[loadingKey], false, method + ' must not hide loaded content');
    resolve({ ok: false, status: 500, statusText: 'Failure', text: async () => 'Failure', json: async () => ({ error: 'Failure' }) });
    await refresh;
    assert.equal(provider.render()[dataKey], before, method + ' must retain data on HTTP error');
  }
});

test('scraper polling waits for a response before scheduling the next tick', async () => {
  const pending = [];
  const provider = createProvider((url, options) => new Promise(resolve => pending.push({ url, options, resolve })));
  provider.render().setScraperStatus('running');
  provider.render();
  const cleanup = provider.startPolling();
  provider.tick();
  assert.equal(pending.length, 1);
  assert.equal(provider.timers.size, 0, 'no timer while the request is in flight');
  assert.ok(pending[0].options.signal instanceof AbortSignal);
  pending[0].resolve(response({ status: 'running', output: 'tick' }));
  await flush();
  assert.equal(provider.timers.size, 1);
  cleanup();
  assert.equal(provider.timers.size, 0);
});

test('hidden tabs abort polling and resume without overlapping a pending request', async () => {
  const pending = [];
  const provider = createProvider((url, options) => new Promise(resolve => pending.push({ url, options, resolve })));
  provider.render().setScraperStatus('running');
  provider.render();
  provider.hide(true);
  const cleanup = provider.startPolling();
  assert.equal(provider.timers.size, 0);
  provider.hide(false);
  provider.tick();
  provider.hide(true);
  assert.equal(pending[0].options.signal.aborted, true);
  provider.hide(false);
  assert.equal(provider.timers.size, 0);
  pending[0].resolve(response({ status: 'success', output: 'stale' }));
  await flush();
  assert.equal(provider.render().scraperStatus, 'running');
  assert.equal(provider.timers.size, 1);
  provider.tick();
  assert.equal(pending.length, 2);
  cleanup();
  assert.equal(pending[1].options.signal.aborted, true);
  assert.equal(provider.listeners.size, 0);
});

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }; 

test('upload posts each file as multipart field file without a JSON header', async () => {
  const calls = [];
  const provider = createProvider(async (url, options) => {
    calls.push({ url, options });
    return response({ success: true });
  });
  const files = [new File(['a'], 'one.json'), new File(['b'], 'two.csv')];
  await provider.render().handleFileUpload({ target: { files } });
  const uploads = calls.filter(call => call.url === '/api/upload');
  assert.equal(uploads.length, 2);
  for (const [index, { options }] of uploads.entries()) {
    assert.equal(options.method, 'POST');
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get('file'), files[index]);
    assert.equal(options.headers, undefined);
  }
  assert.equal(provider.render().uploadStatus, 'Successfully uploaded 2 file(s).');
  assert.equal(provider.render().uploading, false);
});
