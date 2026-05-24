const TWO_PI = Math.PI * 2;
const EPSILON_GAIN = 0.0001;
const WARNING_CUES = new Set(['LOW ENERGY', 'OVERSPEED', 'STALL', 'A.FLOOR', 'RETARD', 'REV LOCKED', 'LVR ASYM', 'FLAP OVERSPEED', 'TOO FAST FOR FLAPS', 'PARK BRK ON', 'RELEASE PARKING BRAKE']);
let graphLoopStartMode = true;

export function createEngineAudioSystem({ state }) {
  let context = null;
  let graph = null;
  let unavailable = false;
  let smoothedN1 = 22;
  let previousN1 = 22;
  let spoolPressureEnvelope = 0;
  let loopsStarted = false;

  function prewarm() {
    return initContext(false);
  }

  function ensure() {
    return initContext(true);
  }

  function initContext(resume) {
    if (unavailable) return false;
    if (context) {
      if (resume) {
        startGraphLoops();
        if (context.state === 'suspended') context.resume().catch(() => {});
      }
      return true;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      unavailable = true;
      return false;
    }

    try {
      context = new AudioContextClass();
      graph = buildEngineGraph(context, { startLoops: resume });
      loopsStarted = resume;
      if (resume) {
        startGraphLoops();
        if (context.state === 'suspended') context.resume().catch(() => {});
      }
      return true;
    } catch (error) {
      unavailable = true;
      context = null;
      graph = null;
      console.warn('Engine audio unavailable:', error);
      return false;
    }
  }

  function startGraphLoops() {
    if (!graph || loopsStarted) return;
    for (const layer of Object.values(graph.layers || {})) {
      if (!layer?.source || layer.started) continue;
      try {
        layer.source.start();
        layer.started = true;
      } catch {
        // BufferSource start is one-shot; ignore if the browser already accepted it.
      }
    }
    loopsStarted = true;
  }

  function update(deltaTime = 1 / 60) {
    if (!context || !graph || context.state === 'closed') return;
    if (context.state === 'suspended') return;

    const now = context.currentTime;
    const safeDeltaTime = clamp(deltaTime, 1 / 120, 0.5);
    const rawN1 = getAverageN1(state);
    const n1Rate = (rawN1 - previousN1) / safeDeltaTime;
    previousN1 = rawN1;
    smoothedN1 = damp(smoothedN1, rawN1, 3.4, safeDeltaTime);
    const n1 = clamp(smoothedN1, 0, 100);
    const targetN1 = getAverageTargetN1(state, n1);
    const speedKts = state.preventGroundMovement ? 0 : Math.abs(state.speed || 0) * 1.94384;
    const onGround = state.grounded === true;
    const mainGearCompressed = onGround && state.mainGearCompressed !== false;
    const flightPhase = String(state.flightPhase || '');
    const windAmount = smoothstep(58, 280, speedKts) * (onGround ? 0.72 : 1);
    const reverseAmount = clamp(Math.max(state.reverseEffect || 0, state.reverse || 0), 0, 1);
    const reverseSelected = reverseAmount > 0.04 || state.fmaThrustMode === 'REV' || state.fmaThrustMode === 'REV LOCKED';
    const reverseActive = mainGearCompressed && reverseSelected;
    const reverseIntensity = reverseActive ? clamp(Math.max(state.reverse || 0, state.reverseEffect || 0), 0, 1) : 0;
    const groundSpeedFactor = onGround ? smoothstep(20, 145, speedKts) : 0;
    const takeoffGroundSpeed = onGround ? smoothstep(40, 145, speedKts) : 0;
    const highSpeedWind = smoothstep(180, 340, speedKts);
    const reverseSpeedFactor = reverseActive ? smoothstep(18, 120, speedKts) : 0;
    const reverseN1 = reverseActive ? Math.max(n1, 30 + reverseAmount * 42) : 0;
    const reverseRoarVolume = reverseActive ? smoothstep(30, 70, reverseN1) : 0;
    const togaDemanded = isTogaMode(state) || targetN1 > 88;
    const flexOrTogaDetent = isFlexOrTogaDetent(state);
    const togaPowerVolume = Math.max(smoothstep(88, 96, n1), togaDemanded ? smoothstep(82, 94, n1) * 0.82 : 0);
    const highPower = smoothstep(70, 90, n1);
    const powerRumble = Math.max(smoothstep(60, 90, n1) * 0.55, smoothstep(85, 96, n1));
    const spoolUp = clamp((targetN1 - n1) / 34, 0, 1) * smoothstep(35, 82, n1);
    const risingPressure = clamp(n1Rate / 15, 0, 1) * smoothstep(24, 90, targetN1);
    spoolPressureEnvelope = damp(
      spoolPressureEnvelope,
      Math.max(risingPressure, spoolUp * 0.72),
      risingPressure > spoolPressureEnvelope ? 12 : 2.2,
      safeDeltaTime
    );
    const spoolDown = clamp((n1 - targetN1) / 38, 0, 1) * smoothstep(30, 75, n1);
    const cockpit = isCockpitMode(state);
    const takeoffRoll = onGround && flightPhase === 'TAKEOFF' && flexOrTogaDetent && !reverseActive;
    const runwayRoll = onGround ? smoothstep(25, 145, speedKts) : 0;
    const tireRoll = onGround ? smoothstep(10, 120, speedKts) : 0;
    const reverseGroundHit = reverseIntensity * groundSpeedFactor;
    const brakePressure = clamp(state.totalBrakePressure || 0, 0, 1);
    const brakeAvailable = mainGearCompressed && brakePressure > 0.015;
    const brakeSpeedFactor = brakeAvailable ? smoothstep(5, 120, speedKts) : 0;
    const brakeEnergy = brakePressure * brakeSpeedFactor;
    const brakeLowSpeed = brakeAvailable
      ? brakePressure * smoothstep(3, 45, speedKts) * (1 - smoothstep(70, 125, speedKts))
      : 0;
    const brakeHighSpeed = brakeAvailable ? brakePressure * smoothstep(45, 145, speedKts) : 0;
    const brakeRumbleHit = brakeEnergy * (0.45 + brakePressure * 0.55);
    const brakeReverseBlend = brakeEnergy * reverseIntensity;
    const highLiftMotion = clamp(state.highLiftMoving || 0, 0, 1);
    const speedBrakeAir = !onGround ? clamp(state.actualSpeedBrakePosition || 0, 0, 1) * smoothstep(150, 300, speedKts) : 0;
    const speedBrakeBuffet = speedBrakeAir * smoothstep(180, 300, speedKts);
    const groundSpoilerHit = mainGearCompressed ? clamp(state.actualGroundSpoilerPosition || 0, 0, 1) * groundSpeedFactor : 0;

    const lowRumbleVolume = smoothstep(25, 90, n1) * 0.8;
    const fanWhooshVolume = smoothstep(20, 85, n1);
    const coreWhineVolume = smoothstep(60, 100, n1) * 0.25;
    const cabinMuffleVolume = smoothstep(20, 90, n1);
    const descentWind = windAmount * (1 - smoothstep(38, 60, n1)) * 0.9;

    const lowTarget = 0.015
      + lowRumbleVolume * (cockpit ? 0.39 : 0.34)
      + powerRumble * (cockpit ? 0.08 : 0.07)
      + togaPowerVolume * (cockpit ? 0.09 : 0.105)
      + reverseRoarVolume * 0.045
      + spoolPressureEnvelope * 0.04;
    const fanTarget = 0.012
      + fanWhooshVolume * (cockpit ? 0.145 : 0.225)
      + windAmount * (cockpit ? 0.075 : 0.13)
      + highSpeedWind * (cockpit ? 0.045 : 0.09)
      + descentWind * (cockpit ? 0.048 : 0.11)
      + spoolPressureEnvelope * 0.025
      - spoolDown * 0.018;
    const coreTarget = coreWhineVolume * (cockpit ? 0.035 : 0.07) + spoolUp * (cockpit ? 0.002 : 0.004);
    const cabinTarget = (0.018 + cabinMuffleVolume * 0.13 + togaPowerVolume * 0.045 + reverseGroundHit * 0.06) * (cockpit ? 1 : 0.32);
    const togaTarget = togaPowerVolume * (togaDemanded ? 1 : 0.74) * (cockpit ? 0.24 : 0.34);
    const reverseTarget = reverseRoarVolume * reverseIntensity * (cockpit ? 0.06 : 0.08);

    const powerRumbleTarget = (powerRumble * 0.34 + togaPowerVolume * 0.25 + spoolPressureEnvelope * 0.08) * (cockpit ? 1.16 : 1.04);
    const airMassRoarTarget = (highPower * 0.38 + togaPowerVolume * 0.22 + windAmount * 0.13 + highSpeedWind * 0.08 + speedBrakeAir * 0.18 + highLiftMotion * 0.05 + spoolPressureEnvelope * 0.09) * (cockpit ? 0.82 : 1.08);
    const spoolPressureTarget = spoolPressureEnvelope * (0.2 + highPower * 0.14) * (cockpit ? 0.7 : 1);
    const cabinShakeTarget = Math.max(
      togaPowerVolume * 0.42,
      takeoffRoll ? takeoffGroundSpeed * 0.52 : 0,
      reverseGroundHit * 0.74,
      groundSpoilerHit * 0.58,
      speedBrakeBuffet * 0.34,
      highLiftMotion * 0.16,
      brakeRumbleHit * 0.24,
      spoolPressureEnvelope * 0.16
    ) * (cockpit ? 1 : 0.42);
    const runwayRumbleTarget = onGround
      ? (runwayRoll * 0.18 + (takeoffRoll ? takeoffGroundSpeed * 0.25 : 0) + reverseGroundHit * 0.48 + groundSpoilerHit * 0.36 + brakeRumbleHit * 0.24) * (cockpit ? 1.12 : 0.96)
      : 0;
    const tireRollTarget = onGround
      ? (tireRoll * 0.16 + (takeoffRoll ? takeoffGroundSpeed * 0.18 : 0) + reverseGroundHit * 0.22 + brakeEnergy * 0.15) * (cockpit ? 0.9 : 1.04)
      : 0;
    const cockpitRattleTarget = (spoolPressureEnvelope * 0.045 + togaPowerVolume * 0.08 + reverseGroundHit * 0.36 + groundSpoilerHit * 0.24 + speedBrakeBuffet * 0.18 + highLiftMotion * 0.08 + brakeRumbleHit * 0.16 + highSpeedWind * 0.045 + (takeoffRoll ? takeoffGroundSpeed * 0.12 : 0)) * (cockpit ? 1 : 0.38);
    const reverseLowSpeedHold = reverseActive ? lerp(0.28, 1, reverseSpeedFactor) : 0;
    const reverseRoarTarget = reverseIntensity * reverseLowSpeedHold * (cockpit ? 0.5 : 0.68);
    const reverseAirBlastTarget = reverseIntensity * groundSpeedFactor * (cockpit ? 0.22 : 0.48);
    const reverseGroundRumbleTarget = reverseGroundHit * (cockpit ? 0.48 : 0.42);
    const reverseBrakeMixTarget = reverseGroundHit * (state.parkingBrake ? 0.28 : 0.2) + brakeEnergy * 0.18 + brakeReverseBlend * 0.22;
    const brakeSquealTarget = brakeLowSpeed * (cockpit ? 0.065 : 0.095) + brakeHighSpeed * (cockpit ? 0.03 : 0.05);
    const brakeRumbleTarget = brakeRumbleHit * (cockpit ? 0.32 : 0.28);
    const tireGripTarget = brakeEnergy * (cockpit ? 0.14 : 0.2);

    setLayerVolume(graph.layers.engine_low_rumble_loop, lowTarget, now, 0.32);
    setLayerVolume(graph.layers.engine_fan_whoosh_loop, Math.max(0, fanTarget), now, 0.26);
    setLayerVolume(graph.layers.engine_core_whine_loop, Math.max(0, coreTarget), now, 0.35);
    setLayerVolume(graph.layers.engine_cabin_muffle_loop, cabinTarget, now, 0.42);
    setLayerVolume(graph.layers.engine_toga_power_layer, togaTarget, now, 0.22);
    setLayerVolume(graph.layers.engine_reverse_roar_loop, reverseTarget, now, 0.18);
    setLayerVolume(graph.layers.engine_power_rumble_layer, powerRumbleTarget, now, 0.2);
    setLayerVolume(graph.layers.engine_air_mass_roar_layer, airMassRoarTarget, now, 0.2);
    setLayerVolume(graph.layers.engine_spool_pressure_layer, spoolPressureTarget, now, 0.08);
    setLayerVolume(graph.layers.cabin_low_frequency_shake_layer, cabinShakeTarget, now, 0.18);
    setLayerVolume(graph.layers.runway_rumble_loop, runwayRumbleTarget, now, 0.16);
    setLayerVolume(graph.layers.tire_roll_loop, tireRollTarget, now, 0.14);
    setLayerVolume(graph.layers.cockpit_rattle_loop, cockpitRattleTarget, now, 0.1);
    setLayerVolume(graph.layers.brake_squeal_low, brakeSquealTarget, now, 0.08);
    setLayerVolume(graph.layers.brake_rumble, brakeRumbleTarget, now, 0.12);
    setLayerVolume(graph.layers.tire_grip_noise, tireGripTarget, now, 0.08);
    setLayerVolume(graph.layers.reverse_roar_layer, reverseRoarTarget, now, 0.12);
    setLayerVolume(graph.layers.reverse_air_blast_layer, reverseAirBlastTarget, now, 0.1);
    setLayerVolume(graph.layers.reverse_ground_rumble_layer, reverseGroundRumbleTarget, now, 0.1);
    setLayerVolume(graph.layers.reverse_brake_mix_layer, reverseBrakeMixTarget, now, 0.12);

    const globalPitch = lerp(0.92, 1.08, n1 / 100);
    const coreWhinePitch = lerp(0.95, 1.15, n1 / 100);
    setPlaybackRate(graph.layers.engine_low_rumble_loop, globalPitch, now, 0.38);
    setPlaybackRate(graph.layers.engine_fan_whoosh_loop, globalPitch * (1 + spoolUp * 0.012), now, 0.28);
    setPlaybackRate(graph.layers.engine_core_whine_loop, coreWhinePitch, now, 0.24);
    setPlaybackRate(graph.layers.engine_cabin_muffle_loop, globalPitch * 0.96, now, 0.42);
    setPlaybackRate(graph.layers.engine_toga_power_layer, lerp(0.88, 1.04, n1 / 100), now, 0.28);
    setPlaybackRate(graph.layers.engine_reverse_roar_loop, lerp(0.82, 1.02, reverseN1 / 100), now, 0.22);
    setPlaybackRate(graph.layers.engine_power_rumble_layer, lerp(0.86, 1.03, n1 / 100), now, 0.24);
    setPlaybackRate(graph.layers.engine_air_mass_roar_layer, lerp(0.9, 1.06, n1 / 100), now, 0.18);
    setPlaybackRate(graph.layers.engine_spool_pressure_layer, lerp(0.92, 1.08, clamp(n1Rate / 24, 0, 1)), now, 0.06);
    setPlaybackRate(graph.layers.cabin_low_frequency_shake_layer, lerp(0.82, 1.02, Math.max(togaPowerVolume, reverseGroundHit)), now, 0.18);
    setPlaybackRate(graph.layers.runway_rumble_loop, lerp(0.68, 1.34, groundSpeedFactor), now, 0.12);
    setPlaybackRate(graph.layers.tire_roll_loop, lerp(0.7, 1.42, groundSpeedFactor), now, 0.1);
    setPlaybackRate(graph.layers.cockpit_rattle_loop, lerp(0.78, 1.24, Math.max(groundSpeedFactor, spoolPressureEnvelope, highSpeedWind)), now, 0.1);
    setPlaybackRate(graph.layers.brake_squeal_low, lerp(0.76, 1.18, Math.max(brakeLowSpeed, brakeHighSpeed)), now, 0.08);
    setPlaybackRate(graph.layers.brake_rumble, lerp(0.72, 1.1, groundSpeedFactor), now, 0.1);
    setPlaybackRate(graph.layers.tire_grip_noise, lerp(0.82, 1.26, groundSpeedFactor), now, 0.08);
    setPlaybackRate(graph.layers.reverse_roar_layer, lerp(0.76, 1, reverseN1 / 100), now, 0.12);
    setPlaybackRate(graph.layers.reverse_air_blast_layer, lerp(0.8, 1.04, groundSpeedFactor), now, 0.1);
    setPlaybackRate(graph.layers.reverse_ground_rumble_layer, lerp(0.72, 1.08, groundSpeedFactor), now, 0.12);
    setPlaybackRate(graph.layers.reverse_brake_mix_layer, lerp(0.72, 1.14, groundSpeedFactor), now, 0.1);

    setParam(graph.filters.lowShelf.gain, (cockpit ? 4.4 : 3.4) + togaPowerVolume * 2.2 + powerRumble * 1.4 + reverseGroundHit * 1.8, now, 0.34);
    setParam(graph.filters.bodyPeak.gain, (cockpit ? 2.8 : 2.2) + togaPowerVolume * 2.0 + highPower * 1.25 + reverseRoarVolume * 1.8, now, 0.34);
    setParam(graph.filters.harshCut.gain, (cockpit ? -14 : -11.5) - highPower * 1.8 - reverseIntensity * 1.3, now, 0.35);
    setParam(graph.filters.airShelf.gain, (cockpit ? -16 : -9.5) - highPower * 1.4 - reverseIntensity * 1.0, now, 0.45);
    setParam(graph.filters.viewLowPass.frequency, cockpit ? 1750 : 5200, now, 0.38);
    setParam(graph.filters.viewLowPass.Q, cockpit ? 0.55 : 0.35, now, 0.38);

    setParam(
      graph.layers.engine_fan_whoosh_loop.filters.lowPass.frequency,
      cockpit ? lerp(900, 1700, n1 / 100) : lerp(1150, 3150, n1 / 100),
      now,
      0.28
    );
    setParam(graph.layers.engine_core_whine_loop.filters.lowPass.frequency, cockpit ? 1550 : 2350, now, 0.32);
    setParam(graph.layers.engine_reverse_roar_loop.filters.lowPass.frequency, cockpit ? 680 : 920, now, 0.24);
    setParam(graph.layers.engine_air_mass_roar_layer.filters.lowPass.frequency, cockpit ? lerp(760, 1380, highPower) : lerp(980, 2300, highPower), now, 0.22);
    setParam(graph.layers.engine_spool_pressure_layer.filters.lowPass.frequency, cockpit ? 980 : 1550, now, 0.1);
    setParam(graph.layers.reverse_air_blast_layer.filters.lowPass.frequency, cockpit ? 880 : 1500, now, 0.12);
    setParam(graph.layers.reverse_roar_layer.filters.lowPass.frequency, cockpit ? 620 : 920, now, 0.12);
    setParam(graph.layers.tire_roll_loop.filters.lowPass.frequency, lerp(420, cockpit ? 1050 : 1550, groundSpeedFactor), now, 0.12);
    setParam(graph.layers.brake_squeal_low.filters.lowPass.frequency, lerp(900, cockpit ? 1700 : 2600, brakePressure), now, 0.08);
    setParam(graph.layers.tire_grip_noise.filters.lowPass.frequency, lerp(760, cockpit ? 1500 : 2450, brakeSpeedFactor), now, 0.08);
  }

  function playCue(cue) {
    if (!context || !graph || context.state === 'closed') return;
    const now = context.currentTime;
    const warning = WARNING_CUES.has(cue);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const toneFilter = createFilter(context, 'lowpass', warning ? 1900 : 2600, 0.65);
    const duration = warning ? 0.29 : 0.095;

    oscillator.type = warning ? 'square' : 'triangle';
    oscillator.frequency.value = cue === 'OVERSPEED' || cue === 'REV LOCKED'
      ? 720
      : cue === 'STALL'
        ? 420
        : cue === 'RETARD'
          ? 520
          : 940;
    gain.gain.setValueAtTime(EPSILON_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(warning ? 0.062 : 0.03, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(EPSILON_GAIN, now + duration);
    oscillator.connect(toneFilter).connect(gain).connect(graph.cueBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      toneFilter.disconnect();
      gain.disconnect();
    };
  }

  return {
    prewarm,
    ensure,
    update,
    playCue,
    get active() {
      return !!context && !!graph && context.state !== 'closed';
    }
  };
}

function buildEngineGraph(context, options = {}) {
  const previousLoopStartMode = graphLoopStartMode;
  graphLoopStartMode = options.startLoops !== false;
  const engineBus = context.createGain();
  const cueBus = context.createGain();
  const masterGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const lowShelf = createFilter(context, 'lowshelf', 135, 0.7, 3.4);
  const bodyPeak = createFilter(context, 'peaking', 285, 0.75, 2.2);
  const mudTrim = createFilter(context, 'peaking', 780, 0.85, -1.2);
  const harshCut = createFilter(context, 'peaking', 3200, 1.15, -11.5);
  const airShelf = createFilter(context, 'highshelf', 5000, 0.7, -9.5);
  const viewLowPass = createFilter(context, 'lowpass', 5200, 0.35);

  engineBus.gain.value = 0.88;
  cueBus.gain.value = 0.9;
  masterGain.gain.value = 0.82;
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 2.7;
  compressor.attack.value = 0.018;
  compressor.release.value = 0.34;

  connectChain(engineBus, [lowShelf, bodyPeak, mudTrim, harshCut, airShelf, viewLowPass, compressor, masterGain], context.destination);
  cueBus.connect(context.destination);

  const fanHighPass = createFilter(context, 'highpass', 70, 0.45);
  const fanLowPass = createFilter(context, 'lowpass', 1800, 0.45);
  const coreHighPass = createFilter(context, 'highpass', 520, 0.7);
  const coreLowPass = createFilter(context, 'lowpass', 2250, 0.5);
  const cabinLowPass = createFilter(context, 'lowpass', 1050, 0.55);
  const togaHighPass = createFilter(context, 'highpass', 48, 0.45);
  const togaLowPass = createFilter(context, 'lowpass', 1050, 0.55);
  const reverseHighPass = createFilter(context, 'highpass', 44, 0.55);
  const reverseBody = createFilter(context, 'peaking', 245, 0.75, 3.2);
  const reverseLowPass = createFilter(context, 'lowpass', 880, 0.7);
  const powerRumbleHighPass = createFilter(context, 'highpass', 38, 0.5);
  const powerRumbleBody = createFilter(context, 'peaking', 175, 0.7, 4.2);
  const powerRumbleLowPass = createFilter(context, 'lowpass', 560, 0.6);
  const airMassHighPass = createFilter(context, 'highpass', 55, 0.55);
  const airMassBody = createFilter(context, 'peaking', 420, 0.8, 2.4);
  const airMassLowPass = createFilter(context, 'lowpass', 1450, 0.45);
  const spoolPressureHighPass = createFilter(context, 'highpass', 72, 0.55);
  const spoolPressureBody = createFilter(context, 'peaking', 360, 0.75, 3.1);
  const spoolPressureLowPass = createFilter(context, 'lowpass', 1250, 0.55);
  const cabinShakeLowPass = createFilter(context, 'lowpass', 210, 0.7);
  const runwayLowPass = createFilter(context, 'lowpass', 320, 0.62);
  const tireHighPass = createFilter(context, 'highpass', 75, 0.55);
  const tireLowPass = createFilter(context, 'lowpass', 1100, 0.55);
  const rattleHighPass = createFilter(context, 'highpass', 95, 0.7);
  const rattleLowPass = createFilter(context, 'lowpass', 920, 0.7);
  const reverseBlastHighPass = createFilter(context, 'highpass', 62, 0.6);
  const reverseBlastLowPass = createFilter(context, 'lowpass', 1280, 0.56);
  const reverseGroundLowPass = createFilter(context, 'lowpass', 240, 0.72);
  const reverseBrakeHighPass = createFilter(context, 'highpass', 88, 0.65);
  const reverseBrakeLowPass = createFilter(context, 'lowpass', 1200, 0.58);
  const brakeSquealHighPass = createFilter(context, 'highpass', 420, 0.7);
  const brakeSquealLowPass = createFilter(context, 'lowpass', 1800, 0.64);
  const brakeRumbleLowPass = createFilter(context, 'lowpass', 260, 0.72);
  const tireGripHighPass = createFilter(context, 'highpass', 95, 0.58);
  const tireGripLowPass = createFilter(context, 'lowpass', 1450, 0.55);

  const layers = {
    engine_low_rumble_loop: createLoopLayer(context, createLowRumbleBuffer(context), engineBus, {
      lowPass: createFilter(context, 'lowpass', 240, 0.55)
    }),
    engine_fan_whoosh_loop: createLoopLayer(context, createFanWhooshBuffer(context), engineBus, {
      highPass: fanHighPass,
      lowPass: fanLowPass
    }),
    engine_core_whine_loop: createLoopLayer(context, createCoreWhineBuffer(context), engineBus, {
      highPass: coreHighPass,
      lowPass: coreLowPass
    }),
    engine_cabin_muffle_loop: createLoopLayer(context, createCabinMuffleBuffer(context), engineBus, {
      lowPass: cabinLowPass
    }),
    engine_toga_power_layer: createLoopLayer(context, createTogaPowerBuffer(context), engineBus, {
      highPass: togaHighPass,
      lowPass: togaLowPass
    }),
    engine_reverse_roar_loop: createLoopLayer(context, createReverseRoarBuffer(context), engineBus, {
      highPass: reverseHighPass,
      body: reverseBody,
      lowPass: reverseLowPass
    }),
    engine_power_rumble_layer: createLoopLayer(context, createPowerRumbleBuffer(context), engineBus, {
      highPass: powerRumbleHighPass,
      body: powerRumbleBody,
      lowPass: powerRumbleLowPass
    }),
    engine_air_mass_roar_layer: createLoopLayer(context, createAirMassRoarBuffer(context), engineBus, {
      highPass: airMassHighPass,
      body: airMassBody,
      lowPass: airMassLowPass
    }),
    engine_spool_pressure_layer: createLoopLayer(context, createSpoolPressureBuffer(context), engineBus, {
      highPass: spoolPressureHighPass,
      body: spoolPressureBody,
      lowPass: spoolPressureLowPass
    }),
    cabin_low_frequency_shake_layer: createLoopLayer(context, createCabinShakeBuffer(context), engineBus, {
      lowPass: cabinShakeLowPass
    }),
    runway_rumble_loop: createLoopLayer(context, createRunwayRumbleBuffer(context), engineBus, {
      lowPass: runwayLowPass
    }),
    tire_roll_loop: createLoopLayer(context, createTireRollBuffer(context), engineBus, {
      highPass: tireHighPass,
      lowPass: tireLowPass
    }),
    cockpit_rattle_loop: createLoopLayer(context, createCockpitRattleBuffer(context), engineBus, {
      highPass: rattleHighPass,
      lowPass: rattleLowPass
    }),
    brake_squeal_low: createLoopLayer(context, createBrakeSquealLowBuffer(context), engineBus, {
      highPass: brakeSquealHighPass,
      lowPass: brakeSquealLowPass
    }),
    brake_rumble: createLoopLayer(context, createBrakeRumbleBuffer(context), engineBus, {
      lowPass: brakeRumbleLowPass
    }),
    tire_grip_noise: createLoopLayer(context, createTireGripNoiseBuffer(context), engineBus, {
      highPass: tireGripHighPass,
      lowPass: tireGripLowPass
    }),
    reverse_roar_layer: createLoopLayer(context, createReverseRoarBuffer(context), engineBus, {
      highPass: createFilter(context, 'highpass', 40, 0.55),
      body: createFilter(context, 'peaking', 225, 0.8, 4.2),
      saturator: createSaturator(context, 0.42),
      lowPass: createFilter(context, 'lowpass', 860, 0.74)
    }),
    reverse_air_blast_layer: createLoopLayer(context, createReverseAirBlastBuffer(context), engineBus, {
      highPass: reverseBlastHighPass,
      saturator: createSaturator(context, 0.28),
      lowPass: reverseBlastLowPass
    }),
    reverse_ground_rumble_layer: createLoopLayer(context, createReverseGroundRumbleBuffer(context), engineBus, {
      lowPass: reverseGroundLowPass
    }),
    reverse_brake_mix_layer: createLoopLayer(context, createReverseBrakeMixBuffer(context), engineBus, {
      highPass: reverseBrakeHighPass,
      saturator: createSaturator(context, 0.22),
      lowPass: reverseBrakeLowPass
    })
  };

  graphLoopStartMode = previousLoopStartMode;
  return {
    layers,
    cueBus,
    filters: {
      lowShelf,
      bodyPeak,
      mudTrim,
      harshCut,
      airShelf,
      viewLowPass
    }
  };
}

function createLoopLayer(context, buffer, destination, filters = {}) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = 1;
  gain.gain.value = EPSILON_GAIN;
