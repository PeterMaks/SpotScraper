const test = require('node:test');
const assert = require('node:assert/strict');

test('expires TTL from successful completion', async (t) => {
  const { createAsyncCache } = require('./stats-cache');
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  let calls = 0;
  const cache = createAsyncCache(() => ++calls, { ttlMs: 50 });
  assert.equal(await cache.get(), 1);
  t.mock.timers.tick(49);
  assert.equal(await cache.get(), 1);
  t.mock.timers.tick(1);
  assert.equal(await cache.get(), 2);
});

test('loads again after failure, without caching the error', async () => {
  const { createAsyncCache } = require('./stats-cache');
  let calls = 0;
  const cache = createAsyncCache(() => { calls++; throw new Error('load failed ' + calls); });
  await assert.rejects(cache.get(), /load failed 1/);
  await assert.rejects(cache.get(), /load failed 2/);
  assert.equal(calls, 2);
});

test('invalidate clears the cached value so the next get reloads', async () => {
  const { createAsyncCache } = require('./stats-cache');
  let calls = 0;
  const cache = createAsyncCache(() => ++calls);
  assert.equal(await cache.get(), 1);
  cache.invalidate();
  assert.equal(await cache.get(), 2);
});

test('failure retries immediately and may cache a successful undefined', async () => {
  const { createAsyncCache } = require('./stats-cache');
  let fail = true;
  let calls = 0;
  const cache = createAsyncCache(() => { calls++; if (fail) throw new Error('temporary'); });
  await assert.rejects(cache.get(), /temporary/);
  fail = false;
  assert.equal(await cache.get(), undefined);
  assert.equal(await cache.get(), undefined);
  assert.equal(calls, 2);
});

test('invalidation during a load starts a new generation that stale results cannot replace', async () => {
  const { createAsyncCache } = require('./stats-cache');
  const resolvers = [];
  const cache = createAsyncCache(() => new Promise(resolve => resolvers.push(resolve)));
  const old = cache.get();
  await Promise.resolve();
  cache.invalidate();
  const fresh = cache.get();
  await Promise.resolve();
  assert.equal(resolvers.length, 2);
  resolvers[1]('new');
  assert.equal(await fresh, 'new');
  resolvers[0]('old');
  assert.equal(await old, 'old');
  assert.equal(await cache.get(), 'new');
});

test('coalesces concurrent loads and caches successful values', async () => {
  const { createAsyncCache } = require('./stats-cache');
  let calls = 0;
  let finish;
  const cache = createAsyncCache(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = cache.get();
  const second = cache.get();
  await Promise.resolve();
  assert.equal(calls, 1);
  finish({ total: 42 });
  assert.deepEqual(await first, { total: 42 });
  assert.equal(await first, await second);
  assert.equal(await cache.get(), await first);
  assert.equal(calls, 1);
});
