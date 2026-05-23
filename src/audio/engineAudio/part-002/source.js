  connectChain(source, Object.values(filters), gain);
  gain.connect(destination);
  const layer = { source, gain, filters, started: false };
  if (graphLoopStartMode) {
    source.start();
    layer.started = true;
  }
  return layer;
}

function createFilter(context, type, frequency, q = 0.7, gain = 0) {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  filter.gain.value = gain;
  return filter;
}

function createSaturator(context, amount = 0.28) {
  const shaper = context.createWaveShaper();
  const samples = 512;
  const curve = new Float32Array(samples);
  const drive = 1 + amount * 18;
  for (let i = 0; i < samples; i++) {
    const x = i / (samples - 1) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

function connectChain(source, nodes, destination) {
  let current = source;
  nodes.forEach(node => {
    current.connect(node);
    current = node;
  });
  current.connect(destination);
}

function setLayerVolume(layer, value, now, timeConstant) {
  setParam(layer.gain.gain, Math.max(EPSILON_GAIN, value), now, timeConstant);
}

function setPlaybackRate(layer, value, now, timeConstant) {
  setParam(layer.source.playbackRate, Math.max(0.1, value), now, timeConstant);
}

function setParam(param, value, now, timeConstant) {
  if (!param || !Number.isFinite(value)) return;
  param.setTargetAtTime(value, now, timeConstant);
}

function getAverageN1(state) {
  const left = Number.isFinite(state.engineN1Left) ? state.engineN1Left : state.engineN1Average;
  const right = Number.isFinite(state.engineN1Right) ? state.engineN1Right : state.engineN1Average;
  if (Number.isFinite(left) && Number.isFinite(right)) return (left + right) * 0.5;
  if (Number.isFinite(state.engineN1Average)) return state.engineN1Average;
  return 22;
}

function getAverageTargetN1(state, fallback) {
  const left = Number.isFinite(state.targetN1Left) ? state.targetN1Left : fallback;
  const right = Number.isFinite(state.targetN1Right) ? state.targetN1Right : fallback;
  return (left + right) * 0.5;
}

function isCockpitMode(state) {
  const mode = String(state.cameraMode || state.viewMode || state.cameraView || '').toUpperCase();
  return mode.includes('COCKPIT') || mode.includes('FLIGHT_DECK') || mode.includes('PILOT');
}

function isTogaMode(state) {
  const mode = String(state.fmaThrustMode || state.thrustMode || '').toUpperCase();
  return mode.includes('TOGA') || mode === 'A.FLOOR' || state.alphaFloorActive || state.togaLockActive || hasDetent(state, 'TOGA');
}

function isFlexOrTogaDetent(state) {
  return hasDetent(state, 'TOGA') || hasDetent(state, 'FLX_MCT');
}

function hasDetent(state, detentName) {
  return state.thrustDetentLeft === detentName || state.thrustDetentRight === detentName || state.throttleDetent === detentName;
}

function createLowRumbleBuffer(context) {
  return createGeneratedBuffer(context, 4.4, 9187, 0.72, (data, sampleRate, random, channel) => {
    let brown = 0;
    let body = 0;
    const phase = channel * 0.71;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      brown = brown * 0.996 + white * 0.004;
      body = body * 0.985 + white * 0.015;
      const breathing = 0.86 + Math.sin(TWO_PI * (0.38 + channel * 0.025) * t + phase) * 0.1;
      data[i] = breathing * (
        brown * 0.88
        + body * 0.22
        + Math.sin(TWO_PI * 52 * t + phase) * 0.1
        + Math.sin(TWO_PI * 96 * t + phase * 0.3) * 0.055
        + Math.sin(TWO_PI * 138 * t + phase * 0.6) * 0.026
      );
    }
  });
}

function createFanWhooshBuffer(context) {
  return createGeneratedBuffer(context, 3.8, 28411, 0.74, (data, sampleRate, random, channel) => {
    let wideAir = 0;
    let movingAir = 0;
    const phase = channel * 1.33;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      wideAir = wideAir * 0.92 + white * 0.08;
      movingAir = movingAir * 0.62 + (white - wideAir) * 0.38;
      const swirl = 0.77
        + Math.sin(TWO_PI * 0.31 * t + phase) * 0.17
        + Math.sin(TWO_PI * 1.08 * t + phase * 0.4) * 0.06;
      data[i] = (wideAir * 0.76 + movingAir * 0.2) * swirl;
    }
  });
}

function createCoreWhineBuffer(context) {
  return createGeneratedBuffer(context, 2.6, 50321, 0.48, (data, sampleRate, random, channel) => {
    let shimmer = 0;
    const phase = channel * 0.42;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      shimmer = shimmer * 0.78 + (random() * 2 - 1) * 0.22;
      data[i] = Math.sin(TWO_PI * 540 * t + phase) * 0.35
        + Math.sin(TWO_PI * 810 * t + phase * 0.7) * 0.15
        + Math.sin(TWO_PI * 1080 * t + phase * 0.25) * 0.07
        + shimmer * 0.045;
    }
  });
}

function createCabinMuffleBuffer(context) {
  return createGeneratedBuffer(context, 4.1, 7319, 0.7, (data, sampleRate, random, channel) => {
    let low = 0;
    let cabin = 0;
    const phase = channel * 0.89;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      low = low * 0.993 + white * 0.007;
      cabin = cabin * 0.965 + white * 0.035;
      const pulse = 0.9 + Math.sin(TWO_PI * 0.46 * t + phase) * 0.07;
      data[i] = (low * 0.62 + cabin * 0.36 + Math.sin(TWO_PI * 76 * t + phase) * 0.055) * pulse;
    }
  });
}

function createTogaPowerBuffer(context) {
  return createGeneratedBuffer(context, 3.7, 41297, 0.78, (data, sampleRate, random, channel) => {
    let lowAir = 0;
    let bodyAir = 0;
    const phase = channel * 1.08;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      lowAir = lowAir * 0.988 + white * 0.012;
      bodyAir = bodyAir * 0.88 + white * 0.12;
      const pressure = 0.82
        + Math.sin(TWO_PI * 0.52 * t + phase) * 0.11
        + Math.sin(TWO_PI * 2.2 * t + phase * 0.3) * 0.045;
      data[i] = pressure * (
        lowAir * 0.52
        + bodyAir * 0.58
        + Math.sin(TWO_PI * 72 * t + phase) * 0.08
        + Math.sin(TWO_PI * 148 * t + phase * 0.4) * 0.055
      );
    }
  });
}

function createReverseRoarBuffer(context) {
  return createGeneratedBuffer(context, 3.5, 16057, 0.82, (data, sampleRate, random, channel) => {
    let roll = 0;
    let rough = 0;
    let chopState = 0;
    const phase = channel * 0.63;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      roll = roll * 0.986 + white * 0.014;
      rough = rough * 0.74 + white * 0.26;
      chopState = chopState * 0.82 + (random() * 2 - 1) * 0.18;
      const chop = 0.82 + Math.sin(TWO_PI * 6.4 * t + phase) * 0.12 + chopState * 0.05;
      data[i] = chop * (
        roll * 0.58
        + rough * 0.68
        + Math.sin(TWO_PI * 118 * t + phase) * 0.07
        + Math.sin(TWO_PI * 236 * t + phase * 0.5) * 0.04
      );
    }
  });
}

function createPowerRumbleBuffer(context) {
  return createGeneratedBuffer(context, 4.2, 62017, 0.84, (data, sampleRate, random, channel) => {
    let sub = 0;
    let body = 0;
    const phase = channel * 0.77;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      sub = sub * 0.997 + white * 0.003;
      body = body * 0.965 + white * 0.035;
      const pressure = 0.88
        + Math.sin(TWO_PI * 0.43 * t + phase) * 0.08
        + Math.sin(TWO_PI * 1.7 * t + phase * 0.4) * 0.035;
      data[i] = pressure * (
        sub * 0.72
        + body * 0.46
        + Math.sin(TWO_PI * 64 * t + phase) * 0.095
        + Math.sin(TWO_PI * 128 * t + phase * 0.45) * 0.065
        + Math.sin(TWO_PI * 245 * t + phase * 0.2) * 0.032
      );
    }
  });
}

function createAirMassRoarBuffer(context) {
  return createGeneratedBuffer(context, 4.0, 35171, 0.86, (data, sampleRate, random, channel) => {
    let wide = 0;
    let body = 0;
    let flow = 0;
    const phase = channel * 1.41;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      wide = wide * 0.88 + white * 0.12;
      body = body * 0.955 + white * 0.045;
      flow = flow * 0.7 + (white - wide) * 0.3;
      const surge = 0.82
        + Math.sin(TWO_PI * 0.27 * t + phase) * 0.12
        + Math.sin(TWO_PI * 0.83 * t + phase * 0.5) * 0.06;
      data[i] = surge * (
        wide * 0.62
        + body * 0.34
        + flow * 0.18
        + Math.sin(TWO_PI * 190 * t + phase * 0.2) * 0.026
      );
    }
  });
}

function createSpoolPressureBuffer(context) {
  return createGeneratedBuffer(context, 2.2, 48109, 0.7, (data, sampleRate, random, channel) => {
    let pressure = 0;
    let rush = 0;
    const phase = channel * 0.58;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      pressure = pressure * 0.94 + white * 0.06;
      rush = rush * 0.78 + (white - pressure) * 0.22;
      const swell = 0.72 + Math.sin(TWO_PI * 0.64 * t + phase) * 0.11 + Math.sin(TWO_PI * 3.1 * t + phase) * 0.035;
      data[i] = swell * (
        pressure * 0.56
        + rush * 0.28
        + Math.sin(TWO_PI * 310 * t + phase) * 0.04
        + Math.sin(TWO_PI * 470 * t + phase * 0.6) * 0.025
      );
    }
  });
}

function createCabinShakeBuffer(context) {
  return createGeneratedBuffer(context, 3.6, 77137, 0.76, (data, sampleRate, random, channel) => {
    let shake = 0;
    let thump = 0;
    const phase = channel * 0.35;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      shake = shake * 0.996 + white * 0.004;
      thump = thump * 0.982 + white * 0.018;
      data[i] = shake * 0.8
        + thump * 0.2
        + Math.sin(TWO_PI * 42 * t + phase) * 0.08
        + Math.sin(TWO_PI * 83 * t + phase * 0.4) * 0.04;
    }
  });
}

function createRunwayRumbleBuffer(context) {
  return createGeneratedBuffer(context, 3.0, 89431, 0.78, (data, sampleRate, random, channel) => {
    let low = 0;
    let bumps = 0;
    const phase = channel * 0.93;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      low = low * 0.99 + white * 0.01;
      bumps = bumps * 0.86 + white * 0.14;
      const slab = 0.84 + Math.sin(TWO_PI * 11.5 * t + phase) * 0.1 + Math.sin(TWO_PI * 23 * t + phase * 0.3) * 0.04;
      data[i] = (low * 0.58 + bumps * 0.34 + Math.sin(TWO_PI * 58 * t + phase) * 0.045) * slab;
    }
  });
}

function createTireRollBuffer(context) {
  return createGeneratedBuffer(context, 2.8, 24119, 0.68, (data, sampleRate, random, channel) => {
    let grain = 0;
    let scrape = 0;
    const phase = channel * 1.12;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      grain = grain * 0.72 + white * 0.28;
      scrape = scrape * 0.9 + (white - grain) * 0.1;
      const roll = 0.78 + Math.sin(TWO_PI * 17 * t + phase) * 0.08 + Math.sin(TWO_PI * 43 * t + phase * 0.2) * 0.03;
      data[i] = (grain * 0.28 + scrape * 0.34 + Math.sin(TWO_PI * 155 * t + phase) * 0.018) * roll;
    }
  });
}

function createCockpitRattleBuffer(context) {
  return createGeneratedBuffer(context, 2.4, 59183, 0.62, (data, sampleRate, random, channel) => {
    let knock = 0;
    let buzz = 0;
    const phase = channel * 0.26;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      knock = knock * 0.86 + white * 0.14;
      buzz = buzz * 0.64 + (white - knock) * 0.36;
      const panels = 0.64 + Math.sin(TWO_PI * 7.4 * t + phase) * 0.22;
      data[i] = (knock * 0.34 + buzz * 0.12 + Math.sin(TWO_PI * 96 * t + phase) * 0.02) * panels;
    }
  });
}

function createBrakeSquealLowBuffer(context) {
  return createGeneratedBuffer(context, 2.3, 43817, 0.48, (data, sampleRate, random, channel) => {
    let grit = 0;
    let rub = 0;
    const phase = channel * 0.74;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      grit = grit * 0.58 + white * 0.42;
      rub = rub * 0.92 + white * 0.08;
      const pulse = 0.66 + Math.sin(TWO_PI * 9.5 * t + phase) * 0.16 + Math.sin(TWO_PI * 19 * t + phase * 0.3) * 0.06;
      data[i] = pulse * (
        grit * 0.16
        + rub * 0.28
        + Math.sin(TWO_PI * 720 * t + phase) * 0.045
        + Math.sin(TWO_PI * 1180 * t + phase * 0.6) * 0.022
      );
    }
  });
}

function createBrakeRumbleBuffer(context) {
  return createGeneratedBuffer(context, 3.1, 74357, 0.72, (data, sampleRate, random, channel) => {
    let low = 0;
    let scrub = 0;
    const phase = channel * 0.51;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      low = low * 0.995 + white * 0.005;
      scrub = scrub * 0.9 + white * 0.1;
      const blocks = 0.78 + Math.sin(TWO_PI * 8.8 * t + phase) * 0.13 + Math.sin(TWO_PI * 17.6 * t + phase * 0.4) * 0.05;
      data[i] = blocks * (
        low * 0.7
        + scrub * 0.34
        + Math.sin(TWO_PI * 62 * t + phase) * 0.045
      );
    }
  });
}

function createTireGripNoiseBuffer(context) {
  return createGeneratedBuffer(context, 2.5, 27551, 0.6, (data, sampleRate, random, channel) => {
    let scrape = 0;
    let bite = 0;
    const phase = channel * 1.09;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      scrape = scrape * 0.7 + white * 0.3;
      bite = bite * 0.88 + (white - scrape) * 0.12;
      const grip = 0.74 + Math.sin(TWO_PI * 14.5 * t + phase) * 0.12 + Math.sin(TWO_PI * 38 * t + phase * 0.2) * 0.04;
      data[i] = grip * (
        scrape * 0.26
        + bite * 0.31
        + Math.sin(TWO_PI * 240 * t + phase) * 0.018
      );
    }
  });
}

function createReverseAirBlastBuffer(context) {
  return createGeneratedBuffer(context, 3.2, 66877, 0.84, (data, sampleRate, random, channel) => {
    let blast = 0;
    let turbulence = 0;
    let flutter = 0;
    const phase = channel * 1.55;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const white = random() * 2 - 1;
      blast = blast * 0.82 + white * 0.18;
      turbulence = turbulence * 0.945 + white * 0.055;
      flutter = flutter * 0.7 + (random() * 2 - 1) * 0.3;
      const churn = 0.8 + Math.sin(TWO_PI * 5.7 * t + phase) * 0.14 + flutter * 0.05;
      data[i] = (blast * 0.5 + turbulence * 0.46 + Math.sin(TWO_PI * 330 * t + phase) * 0.018) * churn;
    }
  });
}

function createReverseGroundRumbleBuffer(context) {
  return createGeneratedBuffer(context, 3.4, 11939, 0.82, (data, sampleRate, random, channel) => {
    let ground = 0;
    let impact = 0;
    const phase = channel * 0.48;
