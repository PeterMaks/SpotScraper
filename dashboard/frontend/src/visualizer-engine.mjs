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

export function projectPoint(u, depth, amplitude, width, height) {
  const p = Math.max(0, Math.min(1, depth));
  const margin = width * 0.05;
  return {
    x: margin + u * (width - 2 * margin),
    y: height * (0.56 + 0.38 * p) - Math.min(1.8, amplitude) * height * 0.19,
  };
}
