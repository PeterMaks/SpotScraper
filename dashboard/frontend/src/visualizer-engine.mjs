// Log-frequency peak analysis + history projection adapted from the supplied
// TouchDesigner histogram. Camera is deliberately fixed: no yaw or orbit.
export function spectrumSlice(raw, sampleRate, channels = 50, boost = 2.2, gain = 1.2) {
  const result = new Float32Array(channels);
  const nyquist = sampleRate / 2;
  const high = Math.min(16000, nyquist);
  for (let c = 0; c < channels; c++) {
    const start = Math.max(1, Math.floor(24 * (high / 24) ** (c / channels) / nyquist * raw.length));
    const end = Math.min(raw.length - 1, Math.ceil(24 * (high / 24) ** ((c + 1) / channels) / nyquist * raw.length));
    let peak = 0;
    for (let b = start; b <= end; b++) peak = Math.max(peak, raw[b] / 255);
    const gated = Math.max(0, (peak - 0.08) / 0.92);
    const tilt = 0.8 + (c / Math.max(1, channels - 1)) ** 1.25 * boost;
    result[c] = Math.min(1.8, gated ** 1.7 * tilt * gain * 0.55);
  }
  return result;
}

// A power-spaced spectrum preserves bass placement without the broad low-end
// plateau of logarithmic bins. Gate analyser noise before shaping the peaks.
export function referenceSpectrum(raw, sampleRate, channels = 50, boost = 2.2, gain = 1.2) {
  const out = new Float32Array(channels);
  const high = Math.min(12000, sampleRate / 2);
  for (let c = 0; c < channels; c++) {
    const lo = Math.max(1, Math.floor((24 + (high - 24) * (c / channels) ** 1.45) / (sampleRate / 2) * raw.length));
    const hi = Math.min(raw.length - 1, Math.ceil((24 + (high - 24) * ((c + 1) / channels) ** 1.45) / (sampleRate / 2) * raw.length));
    let peak = 0;
    for (let b = lo; b <= hi; b++) peak = Math.max(peak, raw[b] / 255);
    const clean = Math.max(0, (peak - 0.22) / 0.78);
    out[c] = Math.min(1.8, clean ** 1.8 * gain * (0.9 + c / channels * boost * 0.35));
  }
  return out;
}

// Reuse the oldest row, launch the new wave at its peak, and damp older rows.
// The caller scales retention to trail length: the oldest wave approaches baseline.
export function pushHistorySlice(history, input, retention = 0.96, launchGain = 1.2) {
  if (!history.length) return;
  const recycled = history.pop();
  for (const row of history) {
    for (let c = 0; c < row.length; c++) row[c] *= retention;
  }
  for (let c = 0; c < recycled.length; c++) recycled[c] = (input[c] || 0) * launchGain;
  history.unshift(recycled);
}

// Smooth the supplied frequency channels, retaining actual audio peaks.
export function interpolateContour(values, steps = 4) {
  if (values.length < 2) return Float32Array.from(values);
  const out = new Float32Array((values.length - 1) * steps + 1);
  for (let i = 0; i < values.length - 1; i++) {
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const blend = t * t * (3 - 2 * t);
      out[i * steps + j] = values[i] + (values[i + 1] - values[i]) * blend;
    }
  }
  out[out.length - 1] = values[values.length - 1];
  return out;
}

// Audio-shaped damped oscillation; no autonomous motion or fabricated silent signal.
export function waveContour(bands, age = 0, gain = 1, cycles = 5, settling = 3.9) {
  const count = 197;
  const out = new Float32Array(count);
  const energy = Math.sqrt(bands.reduce((sum, v) => sum + v * v, 0) / Math.max(1, bands.length));
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const index = u * (bands.length - 1);
    const lo = Math.floor(index), f = index - lo;
    const local = (bands[lo] || 0) * (1 - f) + (bands[Math.min(lo + 1, bands.length - 1)] || 0) * f;
    const envelope = Math.sin(Math.PI * u) ** 0.7 * Math.exp(-u * 1.8) * Math.exp(-age * settling);
    const phase = 2 * Math.PI * (cycles * u + 1.3 * u * u);
    out[i] = (energy * 0.65 + local * 0.7) * gain * envelope * (Math.sin(phase) + 0.22 * Math.sin(phase * 2));
  }
  return out;
}

// Blend toward the next recorded row so flow is smooth at display refresh rate.
export function blendHistory(history, ageIndex, fraction) {
  const current = history[ageIndex];
  const newer = history[Math.max(0, ageIndex - 1)];
  const t = Math.max(0, Math.min(1, fraction));
  return Float32Array.from(current, (v, i) => v + (newer[i] - v) * t);
}

// Rounded, localized wave packets: bass broadens, treble stays fine. No fixed
// sine carrier, so peaks track the song rather than appearing in empty bands.
export function referenceContour(bands, age = 0, gain = 1, softness = 1.2, settling = 3) {
  const out = new Float32Array(197);
  const decay = Math.exp(-Math.max(0, age) * settling);
  for (let i = 0; i < out.length; i++) {
    const u = i / (out.length - 1);
    const x = u * (bands.length - 1);
    const sigma = Math.max(0.35, softness * (1.2 - u * 0.75));
    let sum = 0, weight = 0, peak = 0;
    for (let c = Math.max(0, Math.floor(x - 3 * sigma)); c <= Math.min(bands.length - 1, Math.ceil(x + 3 * sigma)); c++) {
      const w = Math.exp(-0.5 * ((c - x) / sigma) ** 2);
      sum += bands[c] * w;
      peak = Math.max(peak, bands[c] * w);
      weight += w;
    }
    out[i] = (0.6 * peak + 0.4 * sum / Math.max(weight, 1e-9)) * gain * decay;
  }
  return out;
}

export function projectPoint(u, depth, amplitude, width, height) {
  const p = Math.max(0, Math.min(1, depth));
  const margin = width * 0.05;
  return {
    x: margin + u * (width - 2 * margin),
    y: height * (0.56 + 0.38 * p) - Math.min(1.8, amplitude) * height * 0.19,
  };
}
