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
