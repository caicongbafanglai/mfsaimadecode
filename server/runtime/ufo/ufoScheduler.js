import { clamp, finiteNumber, normalizeHeading, smoothstep } from '../serverMath.js';

const DAY_DURATION_SECONDS = 600;
const FT_TO_M = 0.3048;
const MAP_HALF_SIZE = 26000;
const HIDDEN_AIRPORT = Object.freeze({
  name: 'nothing there',
  x: -23580,
  z: 22180,
  heading: Math.PI * 0.17,
  size: 0.66,
  runwayLength: 1480,
  runwayWidth: 24,
  apronWidth: 260,
  apronDepth: 170
});
const UFO_MODES = Object.freeze({
  ISLAND_EVENT: 'ISLAND_EVENT',
  WORLD_ROAMING: 'WORLD_ROAMING',
  NIGHT_ENCOUNTER: 'NIGHT_ENCOUNTER',
  PLAYER_SIDE_ENCOUNTER: 'PLAYER_SIDE_ENCOUNTER'
});
const UFO_STATES = Object.freeze({
  PRE_GLOW: 'PRE_GLOW',
  VERTICAL_TAKEOFF: 'VERTICAL_TAKEOFF',
  HOVER: 'HOVER',
  TRACK_PLAYER: 'TRACK_PLAYER',
  FAST_DEPARTURE: 'FAST_DEPARTURE',
  DISAPPEAR: 'DISAPPEAR',
  COOLDOWN: 'COOLDOWN',
  WORLD_VISIBLE: 'WORLD_VISIBLE',
  WORLD_TRACKING: 'WORLD_TRACKING',
  WORLD_DEPARTING: 'WORLD_DEPARTING',
  WORLD_LOST: 'WORLD_LOST',
  WORLD_COOLDOWN: 'WORLD_COOLDOWN'
});
const UFO_WORLD_FLIGHT_TYPES = Object.freeze({
  HIGH_SPEED_PASS: 'HIGH_SPEED_PASS',
  SILENT_CRUISE: 'SILENT_CRUISE',
  HOVER_AND_DEPART: 'HOVER_AND_DEPART',
  CLOUD_EXIT: 'CLOUD_EXIT',
  OCEAN_RISE_DISTANT: 'OCEAN_RISE_DISTANT',
  BLUE_STREAK_PASS: 'BLUE_STREAK_PASS',
  SILENT_HOVER: 'SILENT_HOVER',
  OCEAN_GLIDE: 'OCEAN_GLIDE',
  VERTICAL_FLASH: 'VERTICAL_FLASH',
  PLAYER_SIDE_FOLLOW: 'PLAYER_SIDE_FOLLOW'
});
const HIDDEN_APRON_UFO_LOCAL_POSITIONS = Object.freeze([
  [-66, -36, -0.14],
  [0, -36, 0.08],
  [66, -36, 0.18],
  [-66, 36, -0.04],
  [0, 36, 0.12],
  [66, 36, -0.18]
]);

let getOnlinePlayers = () => [];
const ufoScheduler = {
  active: null,
  cycleKey: null,
  worldEventsThisCycle: 0,
  worldEventsLimit: 2,
  nightEncounterEventsThisCycle: 0,
  nightEncounterLimit: 2,
  phaseEventCounts: { night: 0, dusk: 0, dawn: 0, day: 0 },
  phaseEventLimits: { night: 3, dusk: 1, dawn: 1, day: 1 },
  nextWorldCheckMs: 0,
  nextNightEncounterCheckMs: 0,
  nextPlayerSideEncounterCheckMs: 0,
  cooldownUntilMs: 0,
  lastIslandCheckMs: 0,
  islandNightKey: null,
  departedIslandUfoIndices: new Set(),
  playerEncounterCooldownUntilMs: new Map()
};

export function createUfoScheduler({ getOnlinePlayers: getOnlinePlayersFn = () => [] } = {}) {
  getOnlinePlayers = typeof getOnlinePlayersFn === 'function' ? getOnlinePlayersFn : () => [];
  return {
    update: updateUfoScheduler,
    publicEvent: publicUfoEvent
  };
}

function updateUfoScheduler(time) {
  const nowMs = time.serverNowMs;
  const dayDurationMs = DAY_DURATION_SECONDS * 1000;
  const cycleKey = Math.floor(nowMs / dayDurationMs);
  if (ufoScheduler.cycleKey !== cycleKey) {
    ufoScheduler.cycleKey = cycleKey;
    ufoScheduler.worldEventsThisCycle = 0;
    ufoScheduler.nightEncounterEventsThisCycle = 0;
    ufoScheduler.worldEventsLimit = 2 + Math.floor(seeded01(cycleKey * 7919 + 37) * 3);
    ufoScheduler.nightEncounterLimit = 2 + Math.floor(seeded01(cycleKey * 3571 + 91) * 3);
    ufoScheduler.phaseEventCounts = { night: 0, dusk: 0, dawn: 0, day: 0 };
    ufoScheduler.phaseEventLimits = {
      night: 2 + Math.floor(seeded01(cycleKey * 4127 + 13) * 3),
      dusk: 1 + Math.floor(seeded01(cycleKey * 4789 + 31) * 2),
      dawn: 1,
      day: seeded01(cycleKey * 5279 + 47) < 0.55 ? 1 : 0
    };
  }

  if (ufoScheduler.active && nowMs >= ufoScheduler.active.endTime) {
    const finishedMode = ufoScheduler.active.mode;
    ufoScheduler.active = null;
    const cooldown = finishedMode === UFO_MODES.PLAYER_SIDE_ENCOUNTER
      ? randomBetween(45000, 90000)
      : finishedMode === UFO_MODES.NIGHT_ENCOUNTER
        ? randomBetween(25000, 50000)
        : finishedMode === UFO_MODES.WORLD_ROAMING
          ? randomBetween(45000, 90000)
          : randomBetween(90000, 150000);
    ufoScheduler.cooldownUntilMs = Math.max(ufoScheduler.cooldownUntilMs, nowMs + cooldown);
  }
  if (ufoScheduler.active || nowMs < ufoScheduler.cooldownUntilMs) return;

  const phase = serverDayPhase(time);
  if ((phase === 'night' || phase === 'dusk') && maybeStartIslandEvent(time, phase)) return;
  if (maybeStartPlayerSideEncounterEvent(time, phase)) return;
  if (phase === 'night' && maybeStartNightEncounterEvent(time)) return;
  maybeStartWorldRoamingEvent(time, phase);
}

function maybeStartIslandEvent(time, phase) {
  const nowMs = time.serverNowMs;
  if (nowMs - ufoScheduler.lastIslandCheckMs < 20000) return false;
  ufoScheduler.lastIslandCheckMs = nowMs;
  const nightKey = currentNightKey(nowMs, time.serverDayTimeNormalized);
  if (ufoScheduler.islandNightKey === nightKey) return false;

  const eligiblePlayer = onlinePlayers()
    .find(player => islandTriggerEligible(player, nowMs));
  if (!eligiblePlayer) return false;
  if (phaseLimitReached(phase)) return false;
  const probability = phase === 'night' ? 0.55
    : phase === 'dusk' || phase === 'dawn' ? 0.32
      : 0.06;
  if (Math.random() > probability) return false;

  const event = createIslandUfoEvent(time, eligiblePlayer);
  if (!event) return false;
  recordUfoPhaseEvent(phase);
  ufoScheduler.islandNightKey = nightKey;
  ufoScheduler.departedIslandUfoIndices.add(event.ufoIndex);
  ufoScheduler.active = event;
  return true;
}

function maybeStartNightEncounterEvent(time) {
  const nowMs = time.serverNowMs;
  if (!ufoScheduler.nextNightEncounterCheckMs) {
    ufoScheduler.nextNightEncounterCheckMs = nowMs + randomBetween(12000, 35000);
    return false;
  }
  if (nowMs < ufoScheduler.nextNightEncounterCheckMs) return false;
  ufoScheduler.nextNightEncounterCheckMs = nowMs + 60000 + randomBetween(0, 12000);
  if (ufoScheduler.nightEncounterEventsThisCycle >= ufoScheduler.nightEncounterLimit) return false;
  if (phaseLimitReached('night')) return false;

  const eligiblePlayers = onlinePlayers().filter(player => nightEncounterEligible(player, nowMs));
  if (!eligiblePlayers.length) return false;
  if (Math.random() > randomBetween(0.25, 0.40)) return false;

  const player = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
  const event = createNightEncounterUfoEvent(time, player);
  ufoScheduler.nightEncounterEventsThisCycle++;
  recordUfoPhaseEvent('night');
  ufoScheduler.playerEncounterCooldownUntilMs.set(player.playerId, nowMs + randomBetween(300000, 480000));
  ufoScheduler.active = event;
  return true;
}

function maybeStartPlayerSideEncounterEvent(time, phase) {
  if (phase === 'day') return false;
  const nowMs = time.serverNowMs;
  const cadence = sideEncounterCadence(phase);
  if (!ufoScheduler.nextPlayerSideEncounterCheckMs) {
    ufoScheduler.nextPlayerSideEncounterCheckMs = nowMs + randomBetween(25000, cadence.checkMs);
    return false;
  }
  if (nowMs < ufoScheduler.nextPlayerSideEncounterCheckMs) return false;
  ufoScheduler.nextPlayerSideEncounterCheckMs = nowMs + cadence.checkMs;
  if (phaseLimitReached(phase)) return false;

  const eligiblePlayers = onlinePlayers().filter(player => sideEncounterEligible(player, nowMs));
  if (!eligiblePlayers.length) return false;
  if (Math.random() > randomBetween(cadence.probabilityMin, cadence.probabilityMax)) return false;

  const targetPlayers = selectSideEncounterTargets(eligiblePlayers);
  const event = createPlayerSideEncounterUfoEvent(time, targetPlayers, phase);
  if (!event) return false;
  const eventTargetIds = new Set(event.targetPlayerIds || []);
  for (const player of targetPlayers) {
    if (!eventTargetIds.has(player.playerId)) continue;
    ufoScheduler.playerEncounterCooldownUntilMs.set(player.playerId, nowMs + randomBetween(300000, 480000));
  }
  recordUfoPhaseEvent(phase);
  ufoScheduler.active = event;
  return true;
}

function maybeStartWorldRoamingEvent(time, phase) {
  const nowMs = time.serverNowMs;
  if (!ufoScheduler.nextWorldCheckMs) {
    ufoScheduler.nextWorldCheckMs = nowMs + randomBetween(20000, 60000);
    return false;
  }
  if (nowMs < ufoScheduler.nextWorldCheckMs) return false;

  const checkInterval = phase === 'day' ? 120000 : 60000;
  ufoScheduler.nextWorldCheckMs = nowMs + checkInterval + randomBetween(0, 15000);
  const phaseLimit = phase === 'night'
    ? ufoScheduler.worldEventsLimit
    : phase === 'dusk' || phase === 'dawn'
      ? 1 + Math.floor(seeded01(Math.floor(nowMs / 60000) + 53) * 2)
      : 1;
  if (ufoScheduler.worldEventsThisCycle >= phaseLimit) return false;
  if (phaseLimitReached(phase)) return false;
  const activePlayers = onlinePlayers();
  if (!activePlayers.length) return false;

  const probability = phase === 'night' ? randomBetween(0.25, 0.40)
    : phase === 'dusk' ? randomBetween(0.12, 0.25)
      : phase === 'dawn' ? randomBetween(0.08, 0.18)
        : randomBetween(0.01, 0.05);
  if (Math.random() > probability) return false;

  ufoScheduler.worldEventsThisCycle++;
  recordUfoPhaseEvent(phase);
  ufoScheduler.active = createWorldRoamingUfoEvent(time, activePlayers, phase);
  return true;
}

function createIslandUfoEvent(time, player) {
  const nowMs = time.serverNowMs;
  const ufoIndex = 5;
  if (ufoScheduler.departedIslandUfoIndices.has(ufoIndex)) return null;
  const spawn = hiddenApronUfoWorldPoint(ufoIndex);
  const playerSnapshot = snapshotPlayerForUfo(player);
  const playerSpeedKts = finiteNumber(playerSnapshot.speed, 180);
  const targetAltitudeFt = clamp((playerSnapshot.altitude || 7000) + randomBetween(1200, 4200), 4200, 18500);
  const verticalSpeed = randomBetween(45, 95);
  const groundY = 3.1;
  const takeoffMs = clamp(((targetAltitudeFt * FT_TO_M - groundY) / verticalSpeed) * 1000, 9000, 16000);
  const followDurationMs = randomBetween(60000, 180000);
  const departureDurationMs = randomBetween(4200, 7800);
  const side = Math.random() < 0.5 ? -1 : 1;
  const followLeg = {
    playerId: player.playerId,
    startMs: 0,
    endMs: Math.round(followDurationMs),
    startOffset: {
      rightM: side * randomBetween(760, 1180),
      forwardM: randomBetween(1150, 1900),
      upM: randomBetween(260, 720)
    },
    endOffset: {
      rightM: side * randomBetween(520, 980),
      forwardM: randomBetween(820, 1550),
      upM: randomBetween(180, 640)
    },
    bobPhase: randomBetween(0, Math.PI * 2),
    bobMeters: randomBetween(5, 11),
    driftMeters: side * randomBetween(22, 80),
    microShiftMeters: -side * randomBetween(28, 110),
    microShiftPeriodMs: randomBetween(5200, 8800)
  };
  const durations = {
    preGlowMs: randomBetween(2500, 5000),
    takeoffMs,
    hoverMs: randomBetween(3500, 7000),
    trackMs: followDurationMs,
    departMs: departureDurationMs,
    lostMs: 2800
  };
  const totalMs = durations.preGlowMs + durations.takeoffMs + durations.hoverMs + durations.trackMs + durations.departMs + durations.lostMs;
  const away = normalized2(
    spawn.x - (player.state?.position?.x || HIDDEN_AIRPORT.x),
    spawn.z - (player.state?.position?.z || HIDDEN_AIRPORT.z)
  );
  const departure = rotate2(away.x, away.z, randomBetween(-0.55, 0.55));
  return {
    ufoEventId: `UFO-ISLAND-${nowMs}-${Math.floor(Math.random() * 10000)}`,
    mode: UFO_MODES.ISLAND_EVENT,
    state: UFO_STATES.PRE_GLOW,
    flightType: UFO_WORLD_FLIGHT_TYPES.PLAYER_SIDE_FOLLOW,
    eventCategory: 'NOTHING_THERE_ISLAND_EVENT',
    ufoIndex,
    apronInitialUfoCount: HIDDEN_APRON_UFO_LOCAL_POSITIONS.length,
    apronRemainingAfterTakeoff: HIDDEN_APRON_UFO_LOCAL_POSITIONS.length - ufoScheduler.departedIslandUfoIndices.size - 1,
    startTime: nowMs,
    endTime: nowMs + totalMs,
    spawnPoint: { x: spawn.x, y: groundY, z: spawn.z },
    targetAltitudeFt,
    departureDirection: departure,
    departureSpeed: randomBetween(320, 520),
    departureSpeedKts: Math.round(randomBetween(999, 1250)),
    visibility: 1,
    glowIntensity: 0.72,
    triggerPlayerId: player.playerId,
    targetPlayerId: player.playerId,
    targetPlayerIds: [player.playerId],
    targetPlayers: [playerSnapshot],
    followDurationMs: Math.round(followDurationMs),
    departureDurationMs: Math.round(departureDurationMs),
    sideEncounter: {
      speedMatch: true,
      minDistanceM: 300,
      preferredMinM: 600,
      preferredMaxM: 1800,
      maxFollowDistanceM: 3000,
      verticalOffsetMinM: 100,
      verticalOffsetMaxM: 800,
      visibleConeDeg: 120,
      minimumVisibleDurationMs: 45000,
      endHoldMs: randomBetween(5000, 9000),
      finalHoldOffset: sideEncounterFinalHoldOffset(),
      legs: [followLeg],
      departureDirection: departure
    },
    visibleRadius: 24000,
    speedKts: clamp(Math.round(playerSpeedKts + randomBetween(-20, 20)), 120, 380),
    speedOffsetKts: randomBetween(-20, 20),
    signalIntermittent: true,
    visualContact: false,
    durations
  };
}

function createNightEncounterUfoEvent(time, player) {
  const nowMs = time.serverNowMs;
  const state = player.state || {};
  const flightType = chooseNightEncounterFlightType();
  const path = createNightEncounterPath(flightType, state);
  const durationMs = nightEncounterDurationMs(flightType);
  const speedKts = visibleUfoSpeedKts(flightType, state.speed);
  return {
    ufoEventId: `UFO-NIGHT-${nowMs}-${Math.floor(Math.random() * 10000)}`,
    mode: UFO_MODES.NIGHT_ENCOUNTER,
    eventCategory: 'NIGHT_ENCOUNTER_EVENT',
    flightType,
    state: UFO_STATES.WORLD_VISIBLE,
    startTime: nowMs,
    durationMs,
    endTime: nowMs + durationMs + 2400,
    path,
    altitude: Math.round((path.controlPoint?.y || path.startPoint?.y || 0) / FT_TO_M),
    visibility: 1,
    glowIntensity: 0.68,
    speedKts,
    departureSpeedKts: Math.round(randomBetween(900, 1500)),
    targetPlayerId: player.playerId,
    visibleRadius: 52000,
    signalIntermittent: true
  };
}

function createPlayerSideEncounterUfoEvent(time, targetPlayers, phase) {
  if (!targetPlayers.length) return null;
  const nowMs = time.serverNowMs;
  const primary = targetPlayers[0];
  const primaryState = primary.state || {};
  const followDurationMs = sideEncounterDurationMs(phase);
  const maxTargets = Math.max(1, Math.min(3, Math.floor(followDurationMs / 30000)));
  targetPlayers = targetPlayers.slice(0, maxTargets);
  const departureDurationMs = randomBetween(1000, 3000);
  const legDurationMs = followDurationMs / targetPlayers.length;
  const legs = targetPlayers.map((player, index) => {
    const startMs = Math.round(index * legDurationMs);
    const endMs = Math.round(index === targetPlayers.length - 1 ? followDurationMs : (index + 1) * legDurationMs);
    return createSideEncounterLeg(player, startMs, endMs, index);
  });
  const departureHeading = normalizeHeading(finiteNumber(primaryState.heading, 0) + randomBetween(45, 135) * (Math.random() < 0.5 ? -1 : 1));
  const departureDirection = directionFromHeading(departureHeading);
  const speedKts = clamp(Math.round(finiteNumber(primaryState.speed, 180) + randomBetween(-20, 30)), 150, 350);

  return {
    ufoEventId: `UFO-SIDE-${nowMs}-${Math.floor(Math.random() * 10000)}`,
    mode: UFO_MODES.PLAYER_SIDE_ENCOUNTER,
    eventCategory: 'PLAYER_SIDE_ENCOUNTER',
    flightType: UFO_WORLD_FLIGHT_TYPES.PLAYER_SIDE_FOLLOW,
    state: UFO_STATES.WORLD_TRACKING,
    startTime: nowMs,
    followDurationMs: Math.round(followDurationMs),
    departureDurationMs: Math.round(departureDurationMs),
    durationMs: Math.round(followDurationMs + departureDurationMs),
    endTime: nowMs + Math.round(followDurationMs + departureDurationMs) + 2800,
    targetPlayerId: primary.playerId,
    targetPlayerIds: targetPlayers.map(player => player.playerId),
    targetPlayers: targetPlayers.map(snapshotPlayerForUfo),
    sideEncounter: {
      speedMatch: true,
      minDistanceM: 300,
      preferredMinM: 600,
      preferredMaxM: 1500,
      maxFollowDistanceM: 3000,
      verticalOffsetMinM: 100,
      verticalOffsetMaxM: 800,
      visibleConeDeg: 120,
      minimumVisibleDurationMs: 30000,
      endHoldMs: randomBetween(3000, 5000),
      finalHoldOffset: sideEncounterFinalHoldOffset(),
      legs,
      departureDirection,
      departureHeading
    },
    visibility: 1,
    visibleRadius: 22000,
    glowIntensity: phase === 'day' ? 0.24 : 0.78,
    speedKts,
    departureSpeedKts: Math.round(randomBetween(999, 1500)),
    signalIntermittent: true,
    mapSpeedUnknown: true,
    visualContact: true,
    silent: true
  };
}

function createWorldRoamingUfoEvent(time, activePlayers, phase) {
  const nowMs = time.serverNowMs;
  const player = activePlayers[Math.floor(Math.random() * activePlayers.length)];
  const state = player.state || {};
  const position = state.position || {};
  const heading = finiteNumber(state.heading, Math.random() * 360);
  const flightType = chooseWorldFlightType(phase);
  const centerDistance = phase === 'day' ? randomBetween(35000, 90000) : randomBetween(15000, 80000);
  const side = Math.random() < 0.5 ? -1 : 1;
  const offsetHeading = heading + side * randomBetween(45, 135) + randomBetween(-20, 20);
  const centerDir = directionFromHeading(offsetHeading);
  const center = keepAwayFromPlayer({
    x: finiteNumber(position.x, 0) + centerDir.x * centerDistance,
    z: finiteNumber(position.z, 0) + centerDir.z * centerDistance
  }, position);
  const highAltitude = phase === 'day' ? Math.random() < 0.45 : Math.random() < 0.13;
  const altitudeFt = highAltitude
    ? randomBetween(40000, 80000)
    : phase === 'day' ? randomBetween(18000, 52000) : randomBetween(8000, 35000);
  const durationMs = worldDurationMs(flightType, phase);
  const path = createWorldPath(flightType, center, altitudeFt, heading);
  return {
    ufoEventId: `UFO-WORLD-${nowMs}-${Math.floor(Math.random() * 10000)}`,
    mode: UFO_MODES.WORLD_ROAMING,
    flightType,
    state: UFO_STATES.WORLD_VISIBLE,
    startTime: nowMs,
    durationMs,
    endTime: nowMs + durationMs + 2800,
    path,
    altitude: Math.round(altitudeFt),
    visibility: 1,
    glowIntensity: phase === 'day' ? 0.06 : 0.42,
    speedKts: visibleUfoSpeedKts(flightType, state.speed),
    departureSpeedKts: Math.round(randomBetween(900, 1500))
  };
}

function createNightEncounterPath(flightType, state) {
  const position = state.position || {};
  const heading = finiteNumber(state.heading, Math.random() * 360);
  const distance = randomBetween(7000, 26000);
  const side = Math.random() < 0.5 ? -1 : 1;
  const offsetHeading = heading + side * randomBetween(35, 115) + randomBetween(-12, 18);
  const dir = directionFromHeading(offsetHeading);
  const center = keepAwayFromPlayer({
    x: finiteNumber(position.x, 0) + dir.x * distance,
    z: finiteNumber(position.z, 0) + dir.z * distance
  }, position);
  const playerAltitudeFt = Math.max(1600, finiteNumber(state.altitude, 6000));
  const altitudeFt = clamp(playerAltitudeFt + randomBetween(-1000, 10000), 2200, 36000);
  const altitudeM = altitudeFt * FT_TO_M;

  if (flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER) {
    const depart = directionFromHeading(heading + side * randomBetween(120, 190));
    return {
      startPoint: { x: center.x, y: altitudeM, z: center.z },
      controlPoint: { x: center.x, y: altitudeM + 800, z: center.z },
      endPoint: clampWorldPoint({ x: center.x + depart.x * randomBetween(3000, 6200), y: altitudeM + randomBetween(600, 1600), z: center.z + depart.z * randomBetween(3000, 6200) })
    };
  }

  if (flightType === UFO_WORLD_FLIGHT_TYPES.OCEAN_GLIDE) {
    const glide = directionFromHeading(heading + side * randomBetween(55, 155));
    const lowAltitudeM = randomBetween(500, 3000) * FT_TO_M;
    return {
      startPoint: clampWorldPoint({ x: center.x - glide.x * 2800, y: lowAltitudeM, z: center.z - glide.z * 2800 }, 500 * FT_TO_M),
      controlPoint: clampWorldPoint({ x: center.x, y: lowAltitudeM + randomBetween(80, 260), z: center.z }, 500 * FT_TO_M),
      endPoint: clampWorldPoint({ x: center.x + glide.x * 5200, y: altitudeM + 1400, z: center.z + glide.z * 5200 })
    };
  }

  if (flightType === UFO_WORLD_FLIGHT_TYPES.VERTICAL_FLASH) {
    const baseY = randomBetween(650, 1800) * FT_TO_M;
    return {
      startPoint: clampWorldPoint({ x: center.x, y: baseY, z: center.z }, 500 * FT_TO_M),
      controlPoint: clampWorldPoint({ x: center.x, y: altitudeM + randomBetween(1400, 3400), z: center.z }, 500 * FT_TO_M),
      endPoint: clampWorldPoint({ x: center.x + dir.x * randomBetween(2600, 6200), y: altitudeM + randomBetween(2400, 5200), z: center.z + dir.z * randomBetween(2600, 6200) })
    };
  }

  const line = directionFromHeading(heading + side * randomBetween(70, 170));
  const length = flightType === UFO_WORLD_FLIGHT_TYPES.BLUE_STREAK_PASS ? randomBetween(3500, 6500) : randomBetween(3000, 6500);
  return {
    startPoint: clampWorldPoint({ x: center.x - line.x * length * 0.5, y: altitudeM + randomBetween(-300, 220), z: center.z - line.z * length * 0.5 }),
    controlPoint: clampWorldPoint({ x: center.x + dir.x * randomBetween(900, 3600), y: altitudeM + randomBetween(400, 1800), z: center.z + dir.z * randomBetween(900, 3600) }),
    endPoint: clampWorldPoint({ x: center.x + line.x * length * 0.5, y: altitudeM + randomBetween(-160, 900), z: center.z + line.z * length * 0.5 })
  };
}

function createWorldPath(flightType, center, altitudeFt, playerHeading) {
  const altitudeM = altitudeFt * FT_TO_M;
  if (flightType === UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART) {
    const depart = directionFromHeading(playerHeading + randomBetween(95, 185));
    return {
      startPoint: { x: center.x, y: altitudeM, z: center.z },
      controlPoint: { x: center.x, y: altitudeM + 1200, z: center.z },
      endPoint: clampWorldPoint({ x: center.x + depart.x * randomBetween(4200, 8600), y: altitudeM + 900, z: center.z + depart.z * randomBetween(4200, 8600) })
    };
  }

  if (flightType === UFO_WORLD_FLIGHT_TYPES.OCEAN_RISE_DISTANT) {
    const cruise = directionFromHeading(playerHeading + randomBetween(70, 150));
    const start = clampWorldPoint({ x: center.x - cruise.x * 2600, y: Math.max(3000 * FT_TO_M, altitudeM * 0.28), z: center.z - cruise.z * 2600 });
    const end = clampWorldPoint({ x: center.x + cruise.x * 6200, y: altitudeM, z: center.z + cruise.z * 6200 });
    return {
      startPoint: start,
      controlPoint: { x: center.x, y: altitudeM, z: center.z },
      endPoint: end
    };
  }

  const line = directionFromHeading(playerHeading + randomBetween(55, 235));
  const length = flightType === UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS
    ? randomBetween(4500, 9000)
    : randomBetween(7000, 16000);
  const start = clampWorldPoint({ x: center.x - line.x * length * 0.5, y: altitudeM + randomBetween(-260, 220), z: center.z - line.z * length * 0.5 });
  const end = clampWorldPoint({ x: center.x + line.x * length * 0.5, y: altitudeM + randomBetween(-140, 720), z: center.z + line.z * length * 0.5 });
  const bend = rotate2(line.x, line.z, randomBetween(-0.9, 0.9));
  return {
    startPoint: start,
    controlPoint: clampWorldPoint({ x: center.x + bend.x * randomBetween(1800, 7200), y: altitudeM + randomBetween(500, 1900), z: center.z + bend.z * randomBetween(1800, 7200) }),
    endPoint: end
  };
}

function publicUfoEvent(nowMs) {
  const active = ufoScheduler.active;
  if (!active) return null;
  const event = {
    ...active,
    state: ufoStateAt(active, nowMs),
    serverAuthoritative: true,
    maxConcurrentWorldRoaming: 1,
    maxConcurrentUfoEvents: 1
  };
  if (active.mode === UFO_MODES.PLAYER_SIDE_ENCOUNTER || active.mode === UFO_MODES.ISLAND_EVENT) {
    event.targetPlayers = sideEncounterLiveTargets(active);
  }
  return event;
}

function ufoStateAt(event, nowMs) {
  const elapsed = Math.max(0, nowMs - event.startTime);
  if (event.mode === UFO_MODES.ISLAND_EVENT) {
    const durations = event.durations || {};
    const pre = durations.preGlowMs || 1800;
    const takeoff = pre + (durations.takeoffMs || 5200);
    const hover = takeoff + (durations.hoverMs || 5200);
    const track = hover + (durations.trackMs || 2200);
    const depart = track + (durations.departMs || 1400);
    if (elapsed < pre) return UFO_STATES.PRE_GLOW;
    if (elapsed < takeoff) return UFO_STATES.VERTICAL_TAKEOFF;
    if (elapsed < hover) return UFO_STATES.HOVER;
    if (elapsed < track) return UFO_STATES.TRACK_PLAYER;
    if (elapsed < depart) return UFO_STATES.FAST_DEPARTURE;
    if (nowMs < event.endTime) return UFO_STATES.DISAPPEAR;
    return UFO_STATES.COOLDOWN;
  }
  const duration = event.durationMs || Math.max(5000, event.endTime - event.startTime - 2800);
  if (event.mode === UFO_MODES.PLAYER_SIDE_ENCOUNTER) {
    const followDuration = event.followDurationMs || Math.max(15000, duration - 2000);
    if (elapsed < followDuration) return UFO_STATES.WORLD_TRACKING;
    if (elapsed < duration) return UFO_STATES.WORLD_DEPARTING;
    if (nowMs < event.endTime) return UFO_STATES.WORLD_LOST;
    return UFO_STATES.WORLD_COOLDOWN;
  }
  if (event.mode === UFO_MODES.NIGHT_ENCOUNTER) {
    if (elapsed < duration * 0.66) {
      return event.flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER
        ? UFO_STATES.WORLD_TRACKING
        : UFO_STATES.WORLD_VISIBLE;
    }
    if (elapsed < duration) return UFO_STATES.WORLD_DEPARTING;
    if (nowMs < event.endTime) return UFO_STATES.WORLD_LOST;
    return UFO_STATES.WORLD_COOLDOWN;
  }
  if (elapsed < duration * 0.72) {
    return event.flightType === UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART
      ? UFO_STATES.WORLD_TRACKING
      : UFO_STATES.WORLD_VISIBLE;
  }
  if (elapsed < duration) return UFO_STATES.WORLD_DEPARTING;
  if (nowMs < event.endTime) return UFO_STATES.WORLD_LOST;
  return UFO_STATES.WORLD_COOLDOWN;
}

function serverDayPhase(time) {
  const hour = (((time.serverDayTimeNormalized || 0) % 1) + 1) % 1 * 24;
  if (hour >= 20 || hour < 4) return 'night';
  if (hour >= 18 && hour < 20) return 'dusk';
  if (hour >= 4 && hour < 6) return 'dawn';
  return 'day';
}

function phaseLimitReached(phase) {
  const key = ['night', 'dusk', 'dawn', 'day'].includes(phase) ? phase : 'day';
  return (ufoScheduler.phaseEventCounts[key] || 0) >= (ufoScheduler.phaseEventLimits[key] || 0);
}

function recordUfoPhaseEvent(phase) {
  const key = ['night', 'dusk', 'dawn', 'day'].includes(phase) ? phase : 'day';
  ufoScheduler.phaseEventCounts[key] = (ufoScheduler.phaseEventCounts[key] || 0) + 1;
}

function currentNightKey(nowMs, normalized) {
  const cycle = Math.floor(nowMs / (DAY_DURATION_SECONDS * 1000));
  return normalized < 0.16 ? cycle - 1 : cycle;
}

function onlinePlayers() {
  return getOnlinePlayers();
}

function nightEncounterEligible(player, nowMs) {
  return stableFlightEligible(player, nowMs, { allowCooldown: true, minAltitudeAglFt: 1200, minSpeedKts: 120 });
}

function sideEncounterEligible(player, nowMs) {
  return stableFlightEligible(player, nowMs, { allowCooldown: true, minAltitudeAglFt: 1000, minSpeedKts: 120 });
}

function stableFlightEligible(player, nowMs, { allowCooldown, minAltitudeAglFt, minSpeedKts }) {
  const state = player.state || {};
  if (allowCooldown && ufoScheduler.playerEncounterCooldownUntilMs.get(player.playerId) > nowMs) return false;
  if (state.onGround) return false;
  const altitudeAglFt = finiteNumber(state.altitudeAGL, finiteNumber(state.altitude, 0));
  if (altitudeAglFt <= minAltitudeAglFt) return false;
  if (finiteNumber(state.speed, 0) <= minSpeedKts) return false;
  if (finiteNumber(state.wheelSpeedKts, 0) > 35) return false;
  const flightPhase = String(state.flightPhase || '').toUpperCase();
  if (['PREFLIGHT', 'TAKEOFF', 'ROLLOUT', 'FLARE', 'LANDING'].includes(flightPhase)) return false;
  if (flightPhase === 'APPROACH' && altitudeAglFt < 2500) return false;
  if (Math.abs(finiteNumber(state.pitch, 0)) > 1.2) return false;
  if (Math.abs(finiteNumber(state.roll, 0)) > 1.65) return false;
  if (Math.abs(finiteNumber(state.verticalSpeed, 0)) > 6500) return false;
  if (finiteNumber(state.stallFactor, 0) > 0.85) return false;
  return true;
}

function sideEncounterCadence(phase) {
  if (phase === 'night') {
    return { checkMs: 60000, probabilityMin: 0.25, probabilityMax: 0.40 };
  }
  if (phase === 'dusk' || phase === 'dawn') {
    return phase === 'dusk'
      ? { checkMs: 60000, probabilityMin: 0.12, probabilityMax: 0.25 }
      : { checkMs: 60000, probabilityMin: 0.08, probabilityMax: 0.18 };
  }
  return { checkMs: 120000, probabilityMin: 0, probabilityMax: 0 };
}

function sideEncounterDurationMs(phase) {
  const rareLong = Math.random() < (phase === 'night' ? 0.14 : 0.07);
  if (rareLong) return randomBetween(120000, 180000);
  if (phase === 'night') return randomBetween(60000, 120000);
  return randomBetween(45000, 95000);
}

function selectSideEncounterTargets(eligiblePlayers) {
  if (eligiblePlayers.length <= 1) return eligiblePlayers.slice();
  const primary = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
  const count = 1 + Math.floor(Math.random() * Math.min(3, eligiblePlayers.length));
  const primaryPosition = primary.state?.position || {};
  const nearby = eligiblePlayers
    .filter(player => player !== primary)
    .sort((a, b) => playerDistanceSq(a, primaryPosition) - playerDistanceSq(b, primaryPosition));
  return [primary, ...nearby.slice(0, count - 1)];
}

function playerDistanceSq(player, origin = {}) {
  const position = player.state?.position || {};
  const dx = finiteNumber(position.x, 0) - finiteNumber(origin.x, 0);
  const dz = finiteNumber(position.z, 0) - finiteNumber(origin.z, 0);
  return dx * dx + dz * dz;
}

function createSideEncounterLeg(player, startMs, endMs, index) {
  const placement = weightedPick([
    ['frontAbove', 0.26],
    ['leftFront', 0.22],
    ['rightFront', 0.22],
    ['leftSideBrief', 0.10],
    ['rightSideBrief', 0.10],
    ['diagonalFront', 0.07],
    ['overheadFrontCross', 0.03]
  ]);
  const startOffset = sideEncounterOffset(placement);
  const endOffset = sideEncounterEndOffset(placement, startOffset);
  return {
    playerId: player.playerId,
    startMs,
    endMs,
    placement,
    targetSnapshot: snapshotPlayerForUfo(player),
    startOffset,
    endOffset,
    bobPhase: randomBetween(0, Math.PI * 2),
    bobMeters: randomBetween(4, 12),
    driftMeters: randomBetween(18, 95) * (Math.random() < 0.5 ? -1 : 1),
    microShiftMeters: randomBetween(35, 120) * (Math.random() < 0.5 ? -1 : 1),
    microShiftPeriodMs: randomBetween(5200, 8600)
  };
}

function sideEncounterOffset(placement) {
  const side = Math.random() < 0.5 ? -1 : 1;
  if (placement === 'leftFront') {
    return { rightM: -randomBetween(600, 1100), forwardM: randomBetween(900, 1800), upM: randomBetween(140, 620) };
  }
  if (placement === 'rightFront') {
    return { rightM: randomBetween(600, 1100), forwardM: randomBetween(900, 1800), upM: randomBetween(140, 620) };
  }
  if (placement === 'frontAbove') {
    return { rightM: side * randomBetween(0, 520), forwardM: randomBetween(1200, 2500), upM: randomBetween(260, 800) };
  }
  if (placement === 'leftSideBrief') {
    return { rightM: -randomBetween(760, 1200), forwardM: randomBetween(650, 950), upM: randomBetween(140, 500) };
  }
  if (placement === 'rightSideBrief') {
    return { rightM: randomBetween(760, 1200), forwardM: randomBetween(650, 950), upM: randomBetween(140, 500) };
  }
  if (placement === 'overheadFrontCross') {
    return { rightM: side * randomBetween(650, 1100), forwardM: randomBetween(760, 1500), upM: randomBetween(520, 800) };
  }
  return { rightM: side * randomBetween(520, 1050), forwardM: randomBetween(850, 1700), upM: randomBetween(140, 680) };
}

function sideEncounterEndOffset(placement, startOffset) {
  if (placement === 'overheadFrontCross') {
    return {
      rightM: -startOffset.rightM * randomBetween(0.72, 1.06),
      forwardM: clamp(startOffset.forwardM + randomBetween(250, 850), 900, 2200),
      upM: clamp(startOffset.upM + randomBetween(-120, 120), 180, 800)
    };
  }
  if (placement === 'leftSideBrief' || placement === 'rightSideBrief') {
    return {
      rightM: clamp(startOffset.rightM * randomBetween(0.62, 0.86), -1050, 1050),
      forwardM: randomBetween(1000, 1800),
      upM: clamp(startOffset.upM + randomBetween(-80, 160), 120, 720)
    };
  }
  return {
    rightM: clamp(startOffset.rightM + randomBetween(-220, 220), -1200, 1200),
    forwardM: clamp(startOffset.forwardM + randomBetween(-180, 520), 760, 2500),
    upM: clamp(startOffset.upM + randomBetween(-120, 180), 100, 800)
  };
}

function sideEncounterFinalHoldOffset() {
  const variant = weightedPick([
    ['frontAbove', 0.42],
    ['leftFront', 0.29],
    ['rightFront', 0.29]
  ]);
  return sideEncounterOffset(variant);
}

function snapshotPlayerForUfo(player) {
  const state = player.state || {};
  const position = state.position || {};
  return {
    playerId: player.playerId,
    position: {
      x: finiteNumber(position.x, 0),
      y: finiteNumber(position.y, 0),
      z: finiteNumber(position.z, 0)
    },
    heading: normalizeHeading(finiteNumber(state.heading, 0)),
    speed: Math.max(0, finiteNumber(state.speed, 0)),
    altitude: Math.max(0, finiteNumber(state.altitude, 0)),
    altitudeAGL: Math.max(0, finiteNumber(state.altitudeAGL, finiteNumber(state.altitude, 0)))
  };
}

function sideEncounterLiveTargets(event) {
  const ids = new Set(event.targetPlayerIds || []);
  const liveTargets = onlinePlayers()
    .filter(player => ids.has(player.playerId))
    .map(snapshotPlayerForUfo);
  if (liveTargets.length) return liveTargets;
  return event.targetPlayers || [];
}

function islandTriggerEligible(player, nowMs) {
  if (!stableFlightEligible(player, nowMs, { allowCooldown: false, minAltitudeAglFt: 1000, minSpeedKts: 110 })) return false;
  const state = player.state || {};
  const position = state.position || {};
  const x = finiteNumber(position.x, 0);
  const z = finiteNumber(position.z, 0);
  const distance = Math.hypot(x - HIDDEN_AIRPORT.x, z - HIDDEN_AIRPORT.z);
  if (distance > 20000) return false;
  const altitude = finiteNumber(state.altitude, 0);
  if (altitude > 25000) return false;
  const bearing = bearingDeg(x, z, HIDDEN_AIRPORT.x, HIDDEN_AIRPORT.z);
  return distance < 14000 || Math.abs(angleDeltaDeg(finiteNumber(state.heading, 0), bearing)) <= 85;
}

function chooseWorldFlightType(phase) {
  if (phase === 'day') {
    return weightedPick([
      [UFO_WORLD_FLIGHT_TYPES.CLOUD_EXIT, 0.52],
      [UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS, 0.22],
      [UFO_WORLD_FLIGHT_TYPES.OCEAN_RISE_DISTANT, 0.18],
      [UFO_WORLD_FLIGHT_TYPES.SILENT_CRUISE, 0.08]
    ]);
  }
  return weightedPick([
    [UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS, 0.34],
    [UFO_WORLD_FLIGHT_TYPES.SILENT_CRUISE, 0.22],
    [UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART, 0.24],
    [UFO_WORLD_FLIGHT_TYPES.CLOUD_EXIT, 0.12],
    [UFO_WORLD_FLIGHT_TYPES.OCEAN_RISE_DISTANT, 0.08]
  ]);
}

function chooseNightEncounterFlightType() {
  return weightedPick([
    [UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER, 0.30],
    [UFO_WORLD_FLIGHT_TYPES.CLOUD_EXIT, 0.26],
    [UFO_WORLD_FLIGHT_TYPES.OCEAN_GLIDE, 0.20],
    [UFO_WORLD_FLIGHT_TYPES.BLUE_STREAK_PASS, 0.16],
    [UFO_WORLD_FLIGHT_TYPES.VERTICAL_FLASH, 0.08]
  ]);
}

function worldDurationMs(flightType, phase = 'night') {
  if (phase === 'day') {
    if (flightType === UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS) return randomBetween(9000, 16000);
    if (flightType === UFO_WORLD_FLIGHT_TYPES.CLOUD_EXIT) return randomBetween(8000, 15000);
    return randomBetween(10000, 18000);
  }
  if (flightType === UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS) return randomBetween(18000, 32000);
  if (flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_CRUISE) return randomBetween(25000, 50000);
  if (flightType === UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART) return randomBetween(15000, 30000);
  if (flightType === UFO_WORLD_FLIGHT_TYPES.CLOUD_EXIT) return randomBetween(16000, 30000);
  return randomBetween(20000, 36000);
}

function nightEncounterDurationMs(flightType) {
  if (flightType === UFO_WORLD_FLIGHT_TYPES.BLUE_STREAK_PASS) return randomBetween(12000, 22000);
  if (flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER) return randomBetween(15000, 30000);
  if (flightType === UFO_WORLD_FLIGHT_TYPES.CLOUD_EXIT) return randomBetween(10000, 22000);
  if (flightType === UFO_WORLD_FLIGHT_TYPES.OCEAN_GLIDE) return randomBetween(12000, 22000);
  return randomBetween(12000, 20000);
}

function visibleUfoSpeedKts(flightType, playerSpeedKts = 0) {
  if (flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER || flightType === UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART) {
    return Math.round(randomBetween(120, 240));
  }
  if (flightType === UFO_WORLD_FLIGHT_TYPES.BLUE_STREAK_PASS || flightType === UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS) {
    return Math.round(randomBetween(480, 600));
  }
  if (flightType === UFO_WORLD_FLIGHT_TYPES.PLAYER_SIDE_FOLLOW) {
    return clamp(Math.round(finiteNumber(playerSpeedKts, 180) + randomBetween(-20, 30)), 150, 350);
  }
  return Math.round(randomBetween(300, 560));
}

function hiddenApronUfoWorldPoint(index) {
  const size = HIDDEN_AIRPORT.size || 1;
  const runwayWidth = HIDDEN_AIRPORT.runwayWidth || 98 * Math.max(0.86, size);
  const runwayLength = HIDDEN_AIRPORT.runwayLength || 1320 * size;
  const apronW = HIDDEN_AIRPORT.apronWidth || 420 * size;
  const taxiX = runwayWidth * 1.18 + 70 * size;
  const apronX = taxiX + apronW * 0.45;
  const apronZ = runwayLength * 0.16;
  const [dx, dz] = HIDDEN_APRON_UFO_LOCAL_POSITIONS[index] || HIDDEN_APRON_UFO_LOCAL_POSITIONS[0];
  return airportWorldServer(HIDDEN_AIRPORT, apronX + dx, apronZ + dz);
}

function airportWorldServer(airport, x, z) {
  const c = Math.cos(airport.heading || 0);
  const s = Math.sin(airport.heading || 0);
  return { x: airport.x + c * x + s * z, z: airport.z - s * x + c * z };
}

function directionFromHeading(deg) {
  const rad = deg * Math.PI / 180;
  return { x: Math.sin(rad), z: -Math.cos(rad) };
}

function bearingDeg(fromX, fromZ, toX, toZ) {
  return normalizeHeading(Math.atan2(toX - fromX, -(toZ - fromZ)) * 180 / Math.PI);
}

function angleDeltaDeg(a, b) {
  return ((a - b + 540) % 360) - 180;
}

function normalized2(x, z) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function rotate2(x, z, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return normalized2(x * c - z * s, x * s + z * c);
}

function clampWorldPoint(point, minY = 3000 * FT_TO_M) {
  return {
    x: clamp(point.x, -MAP_HALF_SIZE + 900, MAP_HALF_SIZE - 900),
    y: Math.max(minY, finiteNumber(point.y, 10000 * FT_TO_M)),
    z: clamp(point.z, -MAP_HALF_SIZE + 900, MAP_HALF_SIZE - 900)
  };
}

function keepAwayFromPlayer(point, playerPosition = {}) {
  const px = finiteNumber(playerPosition.x, 0);
  const pz = finiteNumber(playerPosition.z, 0);
  let result = {
    x: clamp(point.x, -MAP_HALF_SIZE + 1200, MAP_HALF_SIZE - 1200),
    z: clamp(point.z, -MAP_HALF_SIZE + 1200, MAP_HALF_SIZE - 1200)
  };
  const dx = result.x - px;
  const dz = result.z - pz;
  const distance = Math.hypot(dx, dz);
  if (distance >= 8000) return result;
  const direction = normalized2(dx || 1, dz || 0);
  result = {
    x: clamp(px + direction.x * 12000, -MAP_HALF_SIZE + 1200, MAP_HALF_SIZE - 1200),
    z: clamp(pz + direction.z * 12000, -MAP_HALF_SIZE + 1200, MAP_HALF_SIZE - 1200)
  };
  return result;
}

function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function seeded01(seed) {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return ((value >>> 0) / 4294967296);
}
