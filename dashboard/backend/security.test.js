const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

test('local API rejects cross-site and rebound hosts; internal webhook needs its own token', async () => {
  const { createApiGuard } = require('./security');
  const app = express();
  app.use(createApiGuard({ internalToken: 'test-internal' }));
  app.use((req,res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening',r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url)).status,200);
    assert.equal((await fetch(url,{headers:{Origin:'https://evil.example'}})).status,403);
    // Node fetch overrides the Host header; use a raw request to test host rebound
    const rebound = await new Promise((resolve, reject) => {
      const req = http.request(url + '/', { method: 'GET', headers: { Host: 'evil.example' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(rebound, 403);
    assert.equal((await fetch(url,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    assert.equal((await fetch(url+'/api/internal/log',{method:'POST'})).status,401);
    assert.equal((await fetch(url+'/api/internal/log',{method:'POST',headers:{Authorization:'Bearer test-internal'}})).status,200);
  } finally { server.closeAllConnections(); await new Promise(r=>server.close(r)); }
});
