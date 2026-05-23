export const KT_TO_MS = 0.514444;
export const MS_TO_KT = 1.94384;
export const FT_PER_M = 3.28084;
export const DEG_TO_RAD = Math.PI / 180;
export const GRAVITY = 9.80665;

export const A320NEO_CONFIG = Object.freeze({
  aircraftType: 'A320neo',
  publicDataSources: [
    'Airbus A320neo key figures: https://www.aircraft.airbus.com/en/aircraft/a320-family/a320neo',
    'Airbus aircraft characteristics downloads: https://www.aircraft.airbus.com/en/customer-care/fleet-wide-care/airport-operations-and-aircraft-characteristics/aircraft-characteristics'
  ],
  gameApproximationNote: 'Manual-level VFE, high-lift, spoiler, brake and aero coefficients below are game approximations kept configurable.',
  dimensions: {
    lengthM: 37.57,
    wingspanM: 35.8,
    heightM: 11.76,
    referenceWingAreaM2: 122.6
  },
  mass: {
    defaultKg: 73500,
    minKg: 60000,
    maxKg: 79000
  },
  engines: {
    count: 2,
    type: 'PW1100G / CFM LEAP-1A game approximation',
    maxThrustEachN: 120000,
    maxThrustEachRangeN: [109000, 156000],
    maxTotalThrustN: 240000,
    idleN1: 22,
    approachIdleN1: 30,
    climbN1: 82,
    mctN1: 88,
    flexN1: 90,
    togaN1: 94,
    reverseIdleN1: 35,
    maxReverseN1: 70,
    lowN1SpoolUpRate: 12,
    highN1SpoolUpRate: 7,
    spoolDownRate: 15
  },
  performance: {
    v1Kts: 135,
    vrKts: 140,
    v2Kts: 145,
    takeoffDistanceReferenceM: 2190,
    initialClimbIasKts: 175,
    initialClimbRocFpm: 2500,
    climbBelow10000Kts: 250,
    climbAbove10000Kts: 290,
    cruiseMach: 0.78,
    cruiseIasKts: 290,
    descentIasKts: 280,
    approachVappKts: 140,
    vmoKts: 350,
    mmo: 0.82,
    greenDotKts: 210,
    sSpeedKts: 190,
    fSpeedKts: 145
  },
  aerodynamics: {
    airDensitySeaLevel: 1.225,
    cdClean: 0.039,
    cdGroundBase: 0.072,
    inducedDragScale: 0.022,
    climbEnergyScale: 0.95,
    diveEnergyScale: 1.12,
    maxLiftAccelerationMS2: 15.2,
    minAirborneSpeedMS: 20,
    maxDiveGameKts: 380
  },
  protections: {
    safeAoADeg: 10,
    alphaProtAoADeg: 14,
    criticalAoADeg: 17,
    alphaMaxAoADeg: 18
  },
  flaps: [
    {
      index: 0,
      key: 'CONF_0',
      label: 'CONF 0',
      shortLabel: '0',
      slats: 0,
      flaps: 0,
      vfeKts: null,
      vfeNextKts: 230,
      stallSpeedKts: 135,
      liftMultiplier: 1,
      dragAdder: 0,
      pitchMoment: 0,
      moveSecondsToNext: 3
    },
    {
      index: 1,
      key: 'CONF_1',
      label: 'CONF 1',
      shortLabel: '1',
      slats: 0.45,
      flaps: 0,
      vfeKts: 230,
      vfeNextKts: 215,
      stallSpeedKts: 125,
      liftMultiplier: 1.12,
      dragAdder: 0.015,
      pitchMoment: -0.02,
      moveSecondsToNext: 3
    },
    {
      index: 2,
      key: 'CONF_1F',
      label: 'CONF 1+F',
      shortLabel: '1+F',
      slats: 0.45,
      flaps: 0.35,
      vfeKts: 215,
      vfeNextKts: 200,
      stallSpeedKts: 118,
      liftMultiplier: 1.2,
      dragAdder: 0.025,
      pitchMoment: -0.04,
      moveSecondsToNext: 4
    },
    {
      index: 3,
      key: 'CONF_2',
      label: 'CONF 2',
      shortLabel: '2',
      slats: 0.7,
      flaps: 0.55,
      vfeKts: 200,
      vfeNextKts: 185,
      stallSpeedKts: 112,
      liftMultiplier: 1.32,
      dragAdder: 0.045,
      pitchMoment: -0.06,
      moveSecondsToNext: 4
    },
    {
      index: 4,
      key: 'CONF_3',
      label: 'CONF 3',
      shortLabel: '3',
      slats: 0.85,
      flaps: 0.75,
      vfeKts: 185,
      vfeNextKts: 177,
      stallSpeedKts: 108,
      liftMultiplier: 1.45,
      dragAdder: 0.065,
      pitchMoment: -0.08,
      moveSecondsToNext: 5
    },
    {
      index: 5,
      key: 'CONF_FULL',
      label: 'CONF FULL',
      shortLabel: 'FULL',
      slats: 1,
      flaps: 1,
      vfeKts: 177,
      vfeNextKts: null,
      stallSpeedKts: 105,
      liftMultiplier: 1.55,
      dragAdder: 0.085,
      pitchMoment: -0.1,
      moveSecondsToNext: 5
    }
  ],
  gear: {
    dragAdder: 0.052,
    deployTimeSeconds: 4,
    retractTimeSeconds: 4,
    vloKts: 250,
    vleKts: 280
  },
  speedBrake: {
    deployRatePerSecond: 1.5,
    retractRatePerSecond: 2.0,
    initialDecelKtsPerSecond: 4.0,
    decayTimeSeconds: 6.0,
    minEffectiveKts: 150,
    strongEffectKts: 240,
    terminalIasKts: 155,
    liftLoss: 0.12,
    pitchMoment: -0.03,
    buffetStartKts: 180,
    buffetStrongKts: 300,
    visualAngleDeg: 35,
    dragFactor: 1,
    cdMax: 0.105
  },
  groundSpoilers: {
    deployRatePerSecond: 3.0,
    retractRatePerSecond: 2.5,
    liftLoss: 0.70,
    dragAdder: 0.10,
    brakeEfficiencyMultiplier: 1.25,
    visualAngleDeg: 56
  },
  reverse: {
    maxThrustRatio: 0.55,
    lowSpeedWeakKts: 20,
    reduceReverseKts: 60,
    fullEffectKts: 90
  },
  brakes: {
    maxBrakeDecelerationMS2: 3.6,
    maxTotalGroundDecelerationMS2: 5.5,
    applyRatePerSecond: 3.5,
    releaseRatePerSecond: 5.0,
    antiSkidEnabled: true,
    differentialBrakeYawEnabled: false,
    rollingResistanceCoefficient: 0.03
  }
});

export const THRUST_DETENTS = Object.freeze([
  { name: 'MAX_REV', label: 'MAX REV', position: -0.3, n1: A320NEO_CONFIG.engines.maxReverseN1, reverse: 1 },
  { name: 'REV_IDLE', label: 'REV IDLE', position: -0.15, n1: A320NEO_CONFIG.engines.reverseIdleN1, reverse: 0.32 },
  { name: 'IDLE', label: 'IDLE', position: 0, n1: A320NEO_CONFIG.engines.idleN1, reverse: 0 },
  { name: 'CL', label: 'CL', position: 0.45, n1: A320NEO_CONFIG.engines.climbN1, reverse: 0 },
  { name: 'FLX_MCT', label: 'FLX/MCT', position: 0.72, n1: A320NEO_CONFIG.engines.flexN1, reverse: 0 },
  { name: 'TOGA', label: 'TOGA', position: 1, n1: A320NEO_CONFIG.engines.togaN1, reverse: 0 }
]);

export function ktToMS(kts) {
  return kts * KT_TO_MS;
}

export function msToKt(ms) {
  return ms * MS_TO_KT;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function moveToward(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function flapConfigAt(positionIndex) {
  const flaps = A320NEO_CONFIG.flaps;
  const clamped = clamp(positionIndex, 0, flaps.length - 1);
  const lowIndex = Math.floor(clamped);
  const highIndex = Math.min(flaps.length - 1, lowIndex + 1);
  const t = clamped - lowIndex;
  const low = flaps[lowIndex];
  const high = flaps[highIndex];
  const rounded = flaps[Math.round(clamped)] || low;
  const vfeKts = t <= 0.001
    ? low.vfeKts
    : Math.min(low.vfeKts || Infinity, high.vfeKts || Infinity);
  return {
    index: clamped,
    handleIndex: rounded.index,
    key: rounded.key,
    label: rounded.label,
    shortLabel: rounded.shortLabel,
    slats: low.slats + (high.slats - low.slats) * t,
    flaps: low.flaps + (high.flaps - low.flaps) * t,
    vfeKts: Number.isFinite(vfeKts) ? vfeKts : null,
    vfeNextKts: rounded.vfeNextKts,
    liftMultiplier: low.liftMultiplier + (high.liftMultiplier - low.liftMultiplier) * t,
    dragAdder: low.dragAdder + (high.dragAdder - low.dragAdder) * t,
    stallSpeedKts: low.stallSpeedKts + (high.stallSpeedKts - low.stallSpeedKts) * t,
    pitchMoment: low.pitchMoment + (high.pitchMoment - low.pitchMoment) * t
  };
}

export function thrustFromN1(n1, config = A320NEO_CONFIG) {
  const normalizedN1 = clamp((n1 - config.engines.idleN1) / (config.engines.togaN1 - config.engines.idleN1), 0, 1);
  return config.engines.maxTotalThrustN * Math.pow(normalizedN1, 1.7);
}

export function airDensityForAltitude(altitudeFeet, config = A320NEO_CONFIG) {
  return config.aerodynamics.airDensitySeaLevel * clamp(1 - altitudeFeet / 145000, 0.58, 1);
}

export function managedSpeedForPhase(phase, altitudeFt = 0) {
  const perf = A320NEO_CONFIG.performance;
  if (phase === 'TAKEOFF') return perf.v2Kts;
  if (phase === 'INITIAL_CLIMB' || phase === 'GO_AROUND') {
    return perf.v2Kts + 10 + (perf.initialClimbIasKts - (perf.v2Kts + 10)) * smoothstep(400, 3000, altitudeFt);
  }
  if (phase === 'CLIMB') return altitudeFt < 10000 ? perf.climbBelow10000Kts : perf.climbAbove10000Kts;
  if (phase === 'CRUISE') return perf.cruiseIasKts;
  if (phase === 'DESCENT') return altitudeFt < 10000 ? 250 : perf.descentIasKts;
  if (phase === 'APPROACH' || phase === 'FLARE' || phase === 'LANDING') return perf.approachVappKts;
  if (phase === 'ROLLOUT') return perf.approachVappKts;
  return 250;
}

export function vlsForFlapPosition(positionIndex) {
  return Math.max(A320NEO_CONFIG.performance.approachVappKts - 10, flapConfigAt(positionIndex).stallSpeedKts + 15);
}

export function vmaxForConfig(positionIndex, gearPosition = 0) {
  const flap = flapConfigAt(positionIndex);
  const gearLimit = gearPosition > 0.05 ? A320NEO_CONFIG.gear.vleKts : Infinity;
  return Math.min(flap.vfeKts || A320NEO_CONFIG.performance.vmoKts, gearLimit, A320NEO_CONFIG.performance.vmoKts);
}
