    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      ground = ground * 0.995 + white * 0.005;
      impact = impact * 0.94 + white * 0.06;
      const slabs = 0.82 + Math.sin(TWO_PI * 9.6 * t + phase) * 0.12 + Math.sin(TWO_PI * 18.8 * t + phase * 0.4) * 0.05;
      data[i] = (ground * 0.72 + impact * 0.38 + Math.sin(TWO_PI * 74 * t + phase) * 0.045) * slabs;
    }
  });
}

function createReverseBrakeMixBuffer(context) {
  return createGeneratedBuffer(context, 2.7, 99053, 0.64, (data, sampleRate, random, channel) => {
    let grit = 0;
    let drag = 0;
    const phase = channel * 1.22;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      grit = grit * 0.66 + white * 0.34;
      drag = drag * 0.9 + white * 0.1;
      const scrub = 0.78 + Math.sin(TWO_PI * 13.2 * t + phase) * 0.1 + Math.sin(TWO_PI * 31 * t + phase * 0.5) * 0.04;
      data[i] = (grit * 0.18 + drag * 0.38 + Math.sin(TWO_PI * 220 * t + phase) * 0.02) * scrub;
    }
  });
}

function createGeneratedBuffer(context, seconds, seed, targetPeak, fillChannel) {
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * seconds);
  const buffer = context.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    fillChannel(data, sampleRate, seededRandom(seed + channel * 1009), channel);
    crossfadeLoop(data, Math.min(Math.floor(sampleRate * 0.045), Math.floor(length * 0.12)));
  }
  normalizeBuffer(buffer, targetPeak);
  return buffer;
}

function crossfadeLoop(data, fadeSamples) {
  const length = data.length;
  if (fadeSamples <= 0 || fadeSamples * 2 >= length) return;
  for (let i = 0; i < fadeSamples; i++) {
    const blend = i / fadeSamples;
    const tail = data[length - fadeSamples + i];
    data[i] = tail * (1 - blend) + data[i] * blend;
  }
}

function normalizeBuffer(buffer, targetPeak) {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
  }
  if (peak <= 0) return;
  const scale = targetPeak / peak;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      data[i] *= scale;
    }
  }
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function damp(current, target, lambda, deltaTime) {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.max(0, deltaTime)));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
