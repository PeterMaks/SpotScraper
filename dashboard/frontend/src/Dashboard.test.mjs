import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./pages/Dashboard.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const handleAppleUpload ='), source.indexOf('  const selectedStats ='));
function uploadHost(fetch) {
  const state = { uploading: false, status: '', refreshed: 0 };
  const context = {
    fetch, FormData, backendUrl: '',
    FileReader: class { readAsDataURL() { this.result = 'data:;base64,YQ=='; this.onload(); } },
    setAppleUploading: value => { state.uploading = value; },
    setAppleUploadStatus: value => { state.status = value; },
    fetchAppleStats: () => { state.refreshed++; },
    setTimeout() {},
  };
  vm.runInNewContext(`${handler}\nthis.upload = handleAppleUpload;`, context);
  return { state, upload: context.upload };
}

test('Apple upload uses multipart file and surfaces HTTP failures', async () => {
  const calls = [];
  const host = uploadHost(async (url, options) => {
    calls.push({ url, options });
    return { ok: false, status: 415, text: async () => 'Upload CSV or JSON files only' };
  });
  const file = new File(['a'], 'history.csv');
  await host.upload({ target: { files: [file] } });
  assert.equal(calls[0].url, '/api/apple/upload');
  assert.equal(calls[0].options.method, 'POST');
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.body.get('file'), file);
  assert.equal(calls[0].options.headers, undefined);
  assert.match(host.state.status, /Upload failed:.*415.*CSV or JSON/);
  assert.equal(host.state.uploading, false);
  assert.equal(host.state.refreshed, 0);
});

test('Apple rejects Excel locally and upload help advertises CSV or JSON only', async () => {
  const host = uploadHost(async () => assert.fail('unsupported file must not be posted'));
  await host.upload({ target: { files: [new File(['a'], 'history.xlsx')] } });
  assert.match(host.state.status, /CSV or JSON files only/);
  assert.doesNotMatch(source, /\.xlsx/);
  assert.match(source, /accept="\.csv,\.json"/);
});
