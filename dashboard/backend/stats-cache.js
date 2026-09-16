'use strict';

function createAsyncCache(load, { ttlMs = 30_000 } = {}) {
  let pending;
  let hasValue = false;
  let expiresAt = 0;
  let value;
  let generation = 0;
  return {
    get() {
      if (hasValue && Date.now() < expiresAt) return Promise.resolve(value);
      if (!pending) {
        const started = generation;
        pending = Promise.resolve().then(load).then(result => {
          if (started === generation) {
            value = result;
            hasValue = true;
            expiresAt = Date.now() + ttlMs;
            pending = undefined;
          }
          return result;
        }, err => {
          if (started === generation) pending = undefined;
          throw err;
        });
      }
      return pending;
    },
    invalidate() {
      generation++;
      pending = undefined;
      value = undefined;
      hasValue = false;
      expiresAt = 0;
    },
  };
}

module.exports = { createAsyncCache };
