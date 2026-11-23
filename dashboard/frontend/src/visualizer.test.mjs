import test from 'node:test';
import assert from 'node:assert/strict';

test('frequency channels preserve silence and respond to audio at the actual sample rate', async () => {
  const { spectrumSlice } = await import('./visualizer-engine.mjs');
  const quiet = spectrumSlice(new Uint8Array(1024), 48000, 50, 2.2, 1.2);
  assert.equal(quiet.length, 50);
  assert.ok(quiet.every(v => v === 0));
  const tone = new Uint8Array(1024); tone[43] = 230;
  const loud = spectrumSlice(tone, 48000, 50, 2.2, 1.2);
  assert.ok(loud.some(v => v > 0));
  assert.ok(loud.every(Number.isFinite));
});

test('reference projection uses parallel contours with visible page margins', async () => {
  const { projectPoint } = await import('./visualizer-engine.mjs');
  for (const [width, height] of [[1100, 620], [360, 440]]) {
    const back = projectPoint(0, 0, 0, width, height);
    const front = projectPoint(0, 1, 0, width, height);
    assert.equal(back.x, front.x, 'no perspective flare or camera rotation');
    assert.ok(front.x >= width * 0.04, 'left breathing room');
    assert.ok(projectPoint(1, 1, 0, width, height).x <= width * 0.96);
    assert.ok(front.y <= height * 0.96, 'bottom breathing room');
    assert.ok(back.y >= height * 0.5, 'black headroom above contours');
  }
});

test('slices peak at creation, then settle as they age through the trail', async () => {
  const { pushHistorySlice } = await import('./visualizer-engine.mjs');
  const history = [Float32Array.from([1, 1]), Float32Array.from([1, 1])];
  pushHistorySlice(history, Float32Array.from([0.5, 0]), 0.5, 1.2);
  assert.equal(history.length, 2);
  assert.ok(Math.abs(history[0][0] - 0.6) < 1e-6, 'new slice boosted at creation');
  assert.equal(history[0][1], 0);
  assert.ok(Math.abs(history[1][0] - 0.5) < 1e-6, 'older slice settled by decay');
  const quiet = [Float32Array.from([0, 0])];
  pushHistorySlice(quiet, Float32Array.from([0, 0]), 0.5, 1.2);
  assert.equal(quiet.length, 1);
  assert.ok(quiet[0].every(v => v === 0));
});

test('waves settle to two percent at the end for every history length', async () => {
  const { pushHistorySlice } = await import('./visualizer-engine.mjs');
  for (const count of [40, 100, 160]) {
    const history = Array.from({ length: count }, () => new Float32Array(1));
    const retention = Math.pow(0.02, 1 / (count - 1));
    pushHistorySlice(history, Float32Array.of(1), retention, 1.2);
    let previous = history[0][0];
    for (let age = 1; age < count; age++) {
      pushHistorySlice(history, Float32Array.of(0), retention, 1.2);
      assert.ok(history[age][0] < previous);
      previous = history[age][0];
    }
    assert.ok(Math.abs(history[count - 1][0] - 0.024) < 1e-6);
  }
});

test('contour interpolation preserves silence and endpoints without overshoot', async () => {
  const { interpolateContour } = await import('./visualizer-engine.mjs');
  assert.equal(typeof interpolateContour, 'function');
  const line = interpolateContour(Float32Array.from([0, 0.2, 1, 0.4, 0]), 4);
  assert.equal(line.length, 17);
  assert.equal(line[0], 0);
  assert.equal(line[16], 0);
  assert.equal(line[8], 1);
  assert.ok(line.every(v => v >= 0 && v <= 1));
  assert.ok(interpolateContour(new Float32Array(50)).every(v => v === 0));
});

test('damped wave contours oscillate around baseline and settle at their tail', async () => {
  const { waveContour } = await import('./visualizer-engine.mjs');
  const quiet = waveContour(new Float32Array(50), 0, 1);
  assert.ok(quiet.every(v => v === 0));
  const wave = waveContour(new Float32Array(50).fill(0.6), 0, 1);
  assert.ok(wave.some(v => v > 0.1));
  assert.ok(wave.some(v => v < -0.03));
  assert.ok(Math.abs(wave[wave.length - 1]) < 0.001);
  const late = waveContour(new Float32Array(50).fill(0.6), 1, 1);
  assert.ok(Math.max(...late.map(Math.abs)) < Math.max(...wave.map(Math.abs)) * 0.03);
});

test('reference waves follow localized audio peaks instead of imposing a carrier', async () => {
  const { referenceContour } = await import('./visualizer-engine.mjs');
  const bands = new Float32Array(50); bands[12] = 1;
  const wave = referenceContour(bands, 0, 1, 1.2, 3);
  assert.equal(wave.length, 197);
  assert.ok(Math.max(...wave) > 0.5);
  assert.ok(wave.slice(110).every(v => Math.abs(v) < 0.001), 'no fabricated distant oscillations');
  assert.ok(referenceContour(new Float32Array(50)).every(v => v === 0));
  const aged = referenceContour(bands, 1, 1, 1.2, 3);
  assert.ok(Math.max(...aged) < Math.max(...wave) * 0.06);
  assert.ok(wave.every(Number.isFinite));
});

test('reference frequency mapping puts bass left and suppresses the noise floor', async () => {
  const { referenceSpectrum } = await import('./visualizer-engine.mjs');
  const raw = new Uint8Array(1024).fill(80); raw[9] = 255;
  const values = referenceSpectrum(raw, 48000);
  const peak = values.indexOf(Math.max(...values));
  assert.ok(peak > 0 && peak < 10);
  assert.ok(values[peak] > 0.5);
  assert.ok(values.slice(20).every(v => v < 0.05), "noise floor suppressed but band structure kept");
});

test('history interpolation moves continuously between stored samples', async () => {
  const { blendHistory } = await import('./visualizer-engine.mjs');
  const h = [Float32Array.of(1), Float32Array.of(0.5), Float32Array.of(0)];
  assert.equal(blendHistory(h, 1, 0)[0], 0.5);
  assert.equal(blendHistory(h, 1, 0.5)[0], 0.75);
  assert.equal(blendHistory(h, 1, 1)[0], 1);
  assert.equal(blendHistory(h, 0, 0.5)[0], 1);
});

test('fixed projection leaves headroom and fills width without orbital drift', async () => {
  const { projectPoint } = await import('./visualizer-engine.mjs');
  const back = projectPoint(0.5, 0, 0, 1000, 650);
  const front = projectPoint(0.5, 1, 0, 1000, 650);
  assert.equal(back.x, front.x);
  assert.ok(back.y > 650 * 0.35);
  assert.ok(front.y > 650 * 0.9);
  assert.ok(projectPoint(0, 0, 0, 1000, 650).x < 60);
  assert.deepEqual(back, projectPoint(0.5, 0, 0, 1000, 650));
});
