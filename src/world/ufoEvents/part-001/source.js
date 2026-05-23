import * as THREE from '../../three.module.min.js?v=202605050057';
import {
  AIRCRAFT_GROUND_OFFSET,
  AIRPORTS,
  MAP_SIZE,
  WATER_LEVEL
} from '../data/worldData.js?v=202605070100';
import { airportWorld } from './spatial.js?v=202605056000';

const FT_TO_M = 0.3048;
const M_TO_FT = 3.28084;
const KT_PER_MPS = 1.94384;
const CONTACT_LOST_HOLD_MS = 2800;
const BODY_RADIUS = 25.4;
const SIDE_ENCOUNTER_VISIBLE_CONE_DEG = 120;
const SIDE_VISIBILITY_CHECK_MS = 2000;
const SIDE_VISIBILITY_GRACE_MS = 5000;
const SIDE_VISIBILITY_SLIDE_MS = 4200;
const HIDDEN_AIRPORT = AIRPORTS.find(airport => airport.airportCategory === 'HIDDEN_REMOTE_AIRFIELD') || AIRPORTS[AIRPORTS.length - 1];

export const UFO_EVENT_MODES = Object.freeze({
  ISLAND_EVENT: 'ISLAND_EVENT',
  WORLD_ROAMING: 'WORLD_ROAMING',
  NIGHT_ENCOUNTER: 'NIGHT_ENCOUNTER',
  PLAYER_SIDE_ENCOUNTER: 'PLAYER_SIDE_ENCOUNTER'
});

export const UFO_EVENT_STATES = Object.freeze({
  HIDDEN: 'HIDDEN',
  PRE_GLOW: 'PRE_GLOW',
  VERTICAL_TAKEOFF: 'VERTICAL_TAKEOFF',
  HOVER: 'HOVER',
  TRACK_PLAYER: 'TRACK_PLAYER',
  FAST_DEPARTURE: 'FAST_DEPARTURE',
  DISAPPEAR: 'DISAPPEAR',
  COOLDOWN: 'COOLDOWN',
  WORLD_HIDDEN: 'WORLD_HIDDEN',
  WORLD_SPAWN_PENDING: 'WORLD_SPAWN_PENDING',
  WORLD_VISIBLE: 'WORLD_VISIBLE',
  WORLD_TRACKING: 'WORLD_TRACKING',
  WORLD_DEPARTING: 'WORLD_DEPARTING',
  WORLD_LOST: 'WORLD_LOST',
  WORLD_COOLDOWN: 'WORLD_COOLDOWN'
});

export const UFO_WORLD_FLIGHT_TYPES = Object.freeze({
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

export function createUfoEventController({
  scene,
  state,
  camera,
  terrainHeight,
  getHiddenIslandUfoManager = () => null,
  getServerTime = () => null
}) {
  const model = createUfoModel();
  const preGlow = createPreGlow();
  const vectors = {
    position: new THREE.Vector3(),
    previousPosition: new THREE.Vector3(),
    start: new THREE.Vector3(),
    control: new THREE.Vector3(),
    end: new THREE.Vector3(),
    player: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, -1)
  };
  let activeEventId = '';
  let lastContactPosition = null;
  let lostUntilMs = 0;
  let currentYaw = 0;
  let sideVisibilityLastCheckMs = 0;
  let sideOffscreenSinceMs = 0;
  let sideCorrectionStartMs = 0;
  let localDebugEvent = null;
  let hiddenIslandUfoManager = null;
  let report = createInitialReport();

  model.setVisible?.(false);
  model.setBlueGlowEnabled?.(false);
  preGlow.group.visible = false;
  scene.add(model.group);
  scene.add(preGlow.group);
  state.ufoContact = null;
  state.ufoEventReport = report;

  function update(dt, { serverEvent = null, cycleState = null } = {}) {
    const serverTime = getServerTime?.() || null;
    const nowMs = estimatedServerNowMs(serverTime);
    const debugEvent = debugPayload(nowMs);
    const payload = serverEvent || debugEvent;
    const nightFactor = cycleState?.nightLightFactor ?? serverTime?.nightLightFactor ?? 0;

    if (!payload) {
      hideInactive(nowMs);
      return;
    }

    if (payload.ufoEventId !== activeEventId) {
      activeEventId = payload.ufoEventId || '';
      lastContactPosition = null;
      lostUntilMs = 0;
      sideVisibilityLastCheckMs = 0;
      sideOffscreenSinceMs = 0;
      sideCorrectionStartMs = 0;
      vectors.previousPosition.copy(model.group.position);
      if (payload.mode === UFO_EVENT_MODES.ISLAND_EVENT) {
        hiddenIslandUfoManager = getHiddenIslandUfoManager?.() || null;
        hiddenIslandUfoManager?.beginEvent?.(payload, nightFactor);
      }
    }

    if (payload.mode === UFO_EVENT_MODES.ISLAND_EVENT) {
      updateIslandEvent(payload, dt, nowMs, nightFactor);
    } else {
      updateWorldEvent(payload, dt, nowMs, nightFactor);
    }
  }

  function updateIslandEvent(payload, dt, nowMs, nightFactor) {
    const durations = normalizeIslandDurations(payload);
    const elapsed = Math.max(0, nowMs - payload.startTime);
    const spawn = readPoint(payload.spawnPoint, islandFallbackSpawnPoint());
    const managedSpawn = hiddenIslandUfoManager?.getSpawnWorldPoint?.(payload.ufoIndex);
    if (managedSpawn) spawn.copy(managedSpawn);
    const groundY = Math.max(terrainHeight(spawn.x, spawn.z) + AIRCRAFT_GROUND_OFFSET + 10, spawn.y || 0);
    const targetAltitudeM = Math.max(
      groundY + 900,
      (payload.targetAltitudeFt || 7200) * FT_TO_M
    );

    const takeoffStart = durations.preGlowMs;
    const hoverStart = takeoffStart + durations.takeoffMs;
    const trackStart = hoverStart + durations.hoverMs;
    const departStart = trackStart + durations.trackMs;
    const disappearStart = departStart + durations.departMs;
    const endTime = payload.endTime || (payload.startTime + disappearStart + durations.lostMs);
    let phase = UFO_EVENT_STATES.PRE_GLOW;
    let visible = true;
    let coreVisible = true;
    let glowIntensity = 0.18;
    let speedKts = 0;

    vectors.position.set(spawn.x, groundY + 28, spawn.z);
    if (elapsed < takeoffStart) {
      phase = UFO_EVENT_STATES.PRE_GLOW;
      coreVisible = false;
      glowIntensity = 0.12 + smoothstep(0, takeoffStart, elapsed) * 0.42;
      preGlow.group.position.set(spawn.x, groundY + 16, spawn.z);
      preGlow.group.visible = true;
      preGlow.material.opacity = 0.08 + glowIntensity * 0.32;
      preGlow.group.rotation.y += dt * 0.7;
    } else if (elapsed < hoverStart) {
      phase = UFO_EVENT_STATES.VERTICAL_TAKEOFF;
      const t = smoothstep(0, durations.takeoffMs, elapsed - takeoffStart);
      vectors.position.set(spawn.x, THREE.MathUtils.lerp(groundY + 22, targetAltitudeM, t), spawn.z);
      glowIntensity = 0.36 + t * 0.42;
      speedKts = Math.round(((targetAltitudeM - groundY) / Math.max(0.1, durations.takeoffMs / 1000)) * KT_PER_MPS);
    } else if (elapsed < trackStart) {
      phase = UFO_EVENT_STATES.HOVER;
      const bob = Math.sin(nowMs * 0.0022) * 7.5;
      vectors.position.set(spawn.x, targetAltitudeM + bob, spawn.z);
      glowIntensity = 0.56;
    } else if (elapsed < departStart) {
      phase = UFO_EVENT_STATES.TRACK_PLAYER;
      const bob = Math.sin(nowMs * 0.002) * 6.2;
      vectors.position.set(spawn.x, targetAltitudeM + bob, spawn.z);
      glowIntensity = 0.62;
    } else if (elapsed < disappearStart) {
      phase = UFO_EVENT_STATES.FAST_DEPARTURE;
      const t = smoothstep(0, durations.departMs, elapsed - departStart);
      const departureSpeed = payload.departureSpeed || 1300;
      const departure = readDirection(payload.departureDirection, playerAwayDirection(spawn));
      vectors.position.set(
        spawn.x + departure.x * departureSpeed * (elapsed - departStart) / 1000,
        targetAltitudeM + 220 * t,
        spawn.z + departure.z * departureSpeed * (elapsed - departStart) / 1000
      );
      glowIntensity = 0.78 + (1 - t) * 0.42;
      speedKts = 999;
    } else if (nowMs < endTime) {
      phase = UFO_EVENT_STATES.DISAPPEAR;
      visible = false;
      coreVisible = false;
      glowIntensity = 0;
      lostUntilMs = Math.max(lostUntilMs, performance.now() + CONTACT_LOST_HOLD_MS);
    } else {
      phase = UFO_EVENT_STATES.COOLDOWN;
      visible = false;
      coreVisible = false;
    }

    renderEvent({
      payload,
      phase,
      position: vectors.position,
      visible,
      coreVisible: hiddenIslandUfoManager ? false : coreVisible,
      glowIntensity,
      speedKts,
      headingDeg: headingFromVector(vectors.previousPosition, vectors.position),
      nightFactor,
      dt,
      managedIslandUfo: hiddenIslandUfoManager
    });
  }

  function updateWorldEvent(payload, dt, nowMs, nightFactor) {
    const durationMs = Math.max(5000, payload.durationMs || Math.max(5000, (payload.endTime || nowMs + 18000) - payload.startTime - CONTACT_LOST_HOLD_MS));
    const elapsed = Math.max(0, nowMs - payload.startTime);
    const t = THREE.MathUtils.clamp(elapsed / durationMs, 0, 1);
    const flightType = payload.flightType || UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS;
    if (payload.mode === UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER || flightType === UFO_WORLD_FLIGHT_TYPES.PLAYER_SIDE_FOLLOW) {
      updatePlayerSideEncounterEvent(payload, dt, nowMs, nightFactor, durationMs, elapsed);
      return;
    }
    const start = readPoint(payload.path?.startPoint || payload.startPoint, worldFallbackPoint(0));
    const control = readPoint(payload.path?.controlPoint || payload.controlPoint, worldMidPoint(start, payload));
    const end = readPoint(payload.path?.endPoint || payload.endPoint, worldFallbackPoint(1));
    vectors.start.copy(start);
    vectors.control.copy(control);
    vectors.end.copy(end);

    let phase = UFO_EVENT_STATES.WORLD_VISIBLE;
    let visible = elapsed <= durationMs;
    let coreVisible = visible;
    let glowIntensity = nightFactor > 0.35 ? 0.42 : 0.18;
    let speedKts = payload.speedKts || 620;

    if (flightType === UFO_WORLD_FLIGHT_TYPES.BLUE_STREAK_PASS || flightType === UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS) {
      vectors.position.lerpVectors(vectors.start, vectors.end, smoothstep(0, 1, t));
      phase = t > 0.86 ? UFO_EVENT_STATES.WORLD_DEPARTING : UFO_EVENT_STATES.WORLD_VISIBLE;
      speedKts = t > 0.86 ? (payload.departureSpeedKts || 999) : (payload.speedKts || 560);
      glowIntensity = (flightType === UFO_WORLD_FLIGHT_TYPES.BLUE_STREAK_PASS ? 0.62 : 0.42) + smoothstep(0.72, 1, t) * 0.55;
    } else if (flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_CRUISE) {
      quadraticBezier(vectors.position, vectors.start, vectors.control, vectors.end, t);
      phase = t > 0.72 ? UFO_EVENT_STATES.WORLD_TRACKING : UFO_EVENT_STATES.WORLD_VISIBLE;
      speedKts = payload.speedKts || 560;
      glowIntensity = nightFactor > 0.35 ? 0.34 : 0.11;
    } else if (flightType === UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART || flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER) {
      const hoverEnd = flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER ? 0.62 : 0.45;
      if (t < hoverEnd) {
        vectors.position.copy(vectors.start);
        vectors.position.y += Math.sin(nowMs * 0.002) * 6;
        phase = UFO_EVENT_STATES.WORLD_TRACKING;
        speedKts = 0;
        glowIntensity = flightType === UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER ? 0.74 : 0.48;
      } else {
        const departT = smoothstep(0, 1, (t - hoverEnd) / (1 - hoverEnd));
        vectors.position.lerpVectors(vectors.start, vectors.end, departT);
        phase = UFO_EVENT_STATES.WORLD_DEPARTING;
        speedKts = payload.departureSpeedKts || 999;
        glowIntensity = 0.92;
      }
    } else if (flightType === UFO_WORLD_FLIGHT_TYPES.CLOUD_EXIT) {
      quadraticBezier(vectors.position, vectors.start, vectors.control, vectors.end, t);
      phase = t > 0.68 ? UFO_EVENT_STATES.WORLD_DEPARTING : UFO_EVENT_STATES.WORLD_VISIBLE;
      const cloudFade = smoothstep(0.08, 0.24, t) * (1 - smoothstep(0.72, 0.96, t));
      coreVisible = cloudFade > 0.05;
      visible = coreVisible || t < 1;
      glowIntensity = (nightFactor > 0.35 ? 0.36 : 0.08) * cloudFade;
      speedKts = payload.speedKts || 540;
    } else if (flightType === UFO_WORLD_FLIGHT_TYPES.OCEAN_GLIDE) {
      const pullUpT = smoothstep(0.58, 1, t);
      quadraticBezier(vectors.position, vectors.start, vectors.control, vectors.end, t);
      vectors.position.y += pullUpT * pullUpT * 900;
      phase = t > 0.72 ? UFO_EVENT_STATES.WORLD_DEPARTING : UFO_EVENT_STATES.WORLD_VISIBLE;
      speedKts = t > 0.72 ? (payload.departureSpeedKts || 999) : payload.speedKts || 520;
      glowIntensity = 0.34 + pullUpT * 0.58;
    } else if (flightType === UFO_WORLD_FLIGHT_TYPES.VERTICAL_FLASH) {
      const riseEnd = 0.56;
      if (t < riseEnd) {
        vectors.position.lerpVectors(vectors.start, vectors.control, smoothstep(0, 1, t / riseEnd));
        phase = UFO_EVENT_STATES.WORLD_VISIBLE;
        speedKts = 0;
        glowIntensity = 0.72 + t * 0.32;
      } else if (t < 0.74) {
        vectors.position.copy(vectors.control);
        vectors.position.y += Math.sin(nowMs * 0.003) * 5;
        phase = UFO_EVENT_STATES.WORLD_TRACKING;
        speedKts = 0;
        glowIntensity = 0.9;
      } else {
        const departT = smoothstep(0, 1, (t - 0.74) / 0.26);
        vectors.position.lerpVectors(vectors.control, vectors.end, departT);
        phase = UFO_EVENT_STATES.WORLD_DEPARTING;
        speedKts = payload.departureSpeedKts || 999;
        glowIntensity = 1.05;
      }
    } else {
      const riseT = smoothstep(0, 0.46, t);
      vectors.position.lerpVectors(vectors.start, vectors.end, smoothstep(0, 1, t));
      vectors.position.y = THREE.MathUtils.lerp(vectors.start.y, vectors.control.y, riseT) + Math.sin(t * Math.PI) * 180;
      phase = t > 0.82 ? UFO_EVENT_STATES.WORLD_DEPARTING : UFO_EVENT_STATES.WORLD_VISIBLE;
      speedKts = t > 0.82 ? (payload.departureSpeedKts || 999) : t < 0.32 ? 160 : (payload.speedKts || 420);
      glowIntensity = nightFactor > 0.35 ? 0.46 : 0.12;
    }

    const groundSafeY = terrainHeight(vectors.position.x, vectors.position.z) + AIRCRAFT_GROUND_OFFSET + 914;
    vectors.position.y = Math.max(vectors.position.y, groundSafeY, WATER_LEVEL + 914);

    if (elapsed > durationMs) {
      phase = UFO_EVENT_STATES.WORLD_LOST;
      visible = false;
      coreVisible = false;
      speedKts = 999;
      glowIntensity = 0;
      lostUntilMs = Math.max(lostUntilMs, performance.now() + CONTACT_LOST_HOLD_MS);
    }
    if (payload.endTime && nowMs >= payload.endTime) {
      phase = UFO_EVENT_STATES.WORLD_COOLDOWN;
      visible = false;
      coreVisible = false;
    }

    renderEvent({
      payload,
      phase,
      position: vectors.position,
      visible,
      coreVisible,
      glowIntensity,
      speedKts,
      headingDeg: headingFromVector(vectors.previousPosition, vectors.position),
      nightFactor,
      dt
    });
  }

  function updatePlayerSideEncounterEvent(payload, dt, nowMs, nightFactor, durationMs, elapsed) {
    const followDurationMs = Math.max(15000, payload.followDurationMs || durationMs - 1800);
    const departureDurationMs = Math.max(1000, payload.departureDurationMs || durationMs - followDurationMs);
    const followElapsed = Math.min(elapsed, followDurationMs);
    const leg = sideEncounterLegAt(payload, followElapsed);
    const target = sideEncounterTarget(payload, leg?.playerId);
    const targetPosition = readPoint(target?.position || leg?.targetSnapshot?.position, worldFallbackPoint(0));
    const targetHeading = finite(target?.heading, leg?.targetSnapshot?.heading ?? 0);
    const targetSpeed = finite(target?.speed, payload.speedKts || 180);
    const phaseSeed = finite(leg?.bobPhase, 0);
    const legProgress = sideEncounterLegProgress(leg, followElapsed);

    setSideEncounterRelativePosition(vectors.position, targetPosition, targetHeading, leg, legProgress, nowMs);

    let phase = UFO_EVENT_STATES.WORLD_TRACKING;
    let visible = elapsed <= durationMs;
    let coreVisible = visible;
    let glowIntensity = (nightFactor > 0.35 ? 0.74 : 0.24) + Math.sin(nowMs * 0.002 + phaseSeed) * 0.035;
    let speedKts = payload.speedKts || THREE.MathUtils.clamp(targetSpeed + finite(payload.speedOffsetKts, 0), 150, 350);

    const endHoldMs = Math.max(3000, finite(payload.sideEncounter?.endHoldMs, 4000));
    const holdStartMs = Math.max(0, followDurationMs - endHoldMs);
    if (elapsed >= holdStartMs && elapsed <= followDurationMs) {
      const holdOffset = payload.sideEncounter?.finalHoldOffset || leg?.endOffset || { rightM: 0, forwardM: 1600, upM: 420 };
      const holdLeg = {
        startOffset: holdOffset,
        endOffset: holdOffset,
        bobPhase: phaseSeed,
        bobMeters: 4,
        driftMeters: 0,
        microShiftMeters: 0,
        microShiftPeriodMs: 6000
      };
      setSideEncounterRelativePosition(vectors.control, targetPosition, targetHeading, holdLeg, 1, nowMs);
      const holdBlend = smoothstep(0, Math.min(2600, endHoldMs), elapsed - holdStartMs);
      vectors.position.lerp(vectors.control, holdBlend);
      glowIntensity += holdBlend * 0.16;
      speedKts = THREE.MathUtils.clamp(targetSpeed, 150, 350);
    }

    let visualState = keepSideEncounterInForwardView(vectors.position, targetPosition, targetHeading, nowMs);

    if (elapsed > followDurationMs) {
      const departElapsed = elapsed - followDurationMs;
      const departT = smoothstep(0, departureDurationMs, departElapsed);
      const direction = readDirection(payload.sideEncounter?.departureDirection, sideEncounterAwayDirection(vectors.position, targetPosition));
      const departureSpeedMps = (payload.departureSpeedKts || 1200) / KT_PER_MPS;
      vectors.position.x += direction.x * departureSpeedMps * departElapsed / 1000;
      vectors.position.y += THREE.MathUtils.lerp(60, 520, departT);
      vectors.position.z += direction.z * departureSpeedMps * departElapsed / 1000;
      phase = UFO_EVENT_STATES.WORLD_DEPARTING;
      glowIntensity = 0.9 + departT * 0.28;
      speedKts = payload.departureSpeedKts || 999;
      visualState = keepSideEncounterInForwardView(vectors.position, targetPosition, targetHeading, nowMs);
    }

    const groundSafeY = terrainHeight(vectors.position.x, vectors.position.z) + AIRCRAFT_GROUND_OFFSET + 220;
    vectors.position.y = Math.max(vectors.position.y, groundSafeY, WATER_LEVEL + 220);

    if (elapsed > durationMs) {
      phase = UFO_EVENT_STATES.WORLD_LOST;
      visible = false;
      coreVisible = false;
      speedKts = 999;
      glowIntensity = 0;
      lostUntilMs = Math.max(lostUntilMs, performance.now() + CONTACT_LOST_HOLD_MS);
    }
    if (payload.endTime && nowMs >= payload.endTime) {
      phase = UFO_EVENT_STATES.WORLD_COOLDOWN;
      visible = false;
      coreVisible = false;
    }

    renderEvent({
      payload: {
        ...payload,
        visualContact: visualState.visualContact,
        signalOffset: visualState.signalOffset
      },
      phase,
      position: vectors.position,
      visible,
      coreVisible,
      glowIntensity,
      speedKts,
      headingDeg: normalizeHeading(targetHeading),
      nightFactor,
      dt
    });
  }

  function keepSideEncounterInForwardView(position, targetPosition, headingDeg, nowMs) {
    const visualNow = sideEncounterPositionVisible(position, targetPosition, headingDeg);
    if (nowMs - sideVisibilityLastCheckMs >= SIDE_VISIBILITY_CHECK_MS) {
      sideVisibilityLastCheckMs = nowMs;
      if (visualNow) {
        sideOffscreenSinceMs = 0;
        sideCorrectionStartMs = 0;
      } else if (!sideOffscreenSinceMs) {
        sideOffscreenSinceMs = nowMs;
      }
    }

    const shouldCorrect = sideOffscreenSinceMs && nowMs - sideOffscreenSinceMs >= SIDE_VISIBILITY_GRACE_MS;
    if (!shouldCorrect) {
      return { visualContact: visualNow, signalOffset: !visualNow };
    }

    if (!sideCorrectionStartMs) sideCorrectionStartMs = nowMs;
    const relative = sideEncounterRelativeComponents(position, targetPosition, headingDeg);
    const sideSign = relative.rightM >= 0 ? 1 : -1;
    const recoveryOffset = {
      rightM: sideSign * THREE.MathUtils.clamp(Math.abs(relative.rightM) * 0.55, 520, 820),
      forwardM: THREE.MathUtils.clamp(Math.max(relative.forwardM, 1200), 1200, 2000),
      upM: THREE.MathUtils.clamp(relative.upM, 220, 680)
    };
    const correctionLeg = {
      startOffset: recoveryOffset,
      endOffset: recoveryOffset,
      bobPhase: 0,
      bobMeters: 3,
      driftMeters: 0,
      microShiftMeters: 0,
      microShiftPeriodMs: 6000
    };
    setSideEncounterRelativePosition(vectors.control, targetPosition, headingDeg, correctionLeg, 1, nowMs);
    const slideT = smoothstep(0, SIDE_VISIBILITY_SLIDE_MS, nowMs - sideCorrectionStartMs);
    position.lerp(vectors.control, slideT);
    const visualAfterCorrection = sideEncounterPositionVisible(position, targetPosition, headingDeg);
    return {
      visualContact: visualAfterCorrection,
      signalOffset: !visualAfterCorrection
    };
  }

  function renderEvent({ payload, phase, position, visible, coreVisible, glowIntensity, speedKts, headingDeg, nightFactor, dt, managedIslandUfo = null }) {
    preGlow.group.visible = phase === UFO_EVENT_STATES.PRE_GLOW;
    if (managedIslandUfo) {
      managedIslandUfo.updateEvent?.(payload, phase, position, glowIntensity, dt, nightFactor);
    }
    model.state = phase;
    model.eventId = payload?.ufoEventId || '';
    model.isParked = false;
    model.isAirborne = Boolean(visible && coreVisible);
    model.setVisible?.(visible && coreVisible);
    model.setBlueGlowEnabled?.(visible && coreVisible);
    if (visible && coreVisible) {
      vectors.previousPosition.copy(model.group.position);
      model.setAirborneTransform?.(position);
      orientTowardPlayer(position, dt, phase);
      updateMaterials(nightFactor, glowIntensity, payload.mode);
      updateLod(position);
      model.ringGroup.rotation.y += dt * (phase === UFO_EVENT_STATES.FAST_DEPARTURE || phase === UFO_EVENT_STATES.WORLD_DEPARTING ? 7.2 : 1.35 + glowIntensity * 1.6);
      model.edgeRing.rotation.z -= dt * 0.26;
      updateTrail(position, glowIntensity, phase);
    } else {
      model.trail.visible = false;
    }

    const contactVisible = visible || phase === UFO_EVENT_STATES.DISAPPEAR || phase === UFO_EVENT_STATES.WORLD_LOST || performance.now() < lostUntilMs;
    updateContact(payload, phase, position, contactVisible, speedKts, headingDeg);
    updateReport(payload, phase, visible, coreVisible, managedIslandUfo);
  }

  function orientTowardPlayer(position, dt, phase) {
    const playerPosition = state.visualPosition || state.position;
    vectors.player.copy(playerPosition);
    const dx = vectors.player.x - position.x;
    const dz = vectors.player.z - position.z;
    let targetYaw = currentYaw;
    if (Math.hypot(dx, dz) > 1) {
      targetYaw = Math.atan2(dx, dz);
    }
    const tracking = phase === UFO_EVENT_STATES.TRACK_PLAYER ||
      phase === UFO_EVENT_STATES.HOVER ||
      phase === UFO_EVENT_STATES.WORLD_TRACKING;
    const alpha = tracking ? (1 - Math.exp(-dt * 0.72)) : (1 - Math.exp(-dt * 1.5));
    currentYaw = dampAngle(currentYaw, targetYaw, alpha);
    model.group.rotation.set(0, currentYaw, 0, 'YXZ');
  }

  function updateMaterials(nightFactor, glowIntensity, mode) {
    if (model.updateMaterialForTime) {
      model.updateMaterialForTime({ nightFactor, glowIntensity, mode });
      return;
    }
    const night = THREE.MathUtils.clamp(nightFactor, 0, 1);
    model.bodyMaterial.roughness = THREE.MathUtils.lerp(0.76, 0.36, night);
    model.bodyMaterial.envMapIntensity = THREE.MathUtils.lerp(0.34, 0.94, night);
    model.bodyMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.006, 0.038, night) + glowIntensity * 0.012;
    model.seamMaterial.roughness = THREE.MathUtils.lerp(0.62, 0.34, night);
    model.seamMaterial.envMapIntensity = THREE.MathUtils.lerp(0.34, 0.88, night);
    model.seamMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.012, 0.048, night) + glowIntensity * 0.012;
    model.cockpitMaterial.roughness = THREE.MathUtils.lerp(0.18, 0.07, night);
    model.cockpitMaterial.envMapIntensity = THREE.MathUtils.lerp(0.48, 1.15, night);
    model.cockpitMaterial.emissiveIntensity = night * 0.02;
    model.glowMaterial.opacity = THREE.MathUtils.clamp(
      (mode === UFO_EVENT_MODES.WORLD_ROAMING ? 0.045 : 0.065) + glowIntensity * (night > 0.25 ? 0.5 : 0.12),
      0,
      0.68
    );
    model.glowMaterial.color.setHex(night > 0.25 ? 0x86dcff : 0x6fa6c6);
    model.ringCoreMaterial.emissiveIntensity = 0.36 + glowIntensity * 1.62;
    model.ringCoreMaterial.opacity = THREE.MathUtils.clamp(0.42 + glowIntensity * 0.44, 0.32, 0.88);
  }

  function updateLod(position) {
    const distance = camera ? camera.position.distanceTo(position) : position.distanceTo(state.position);
    const near = distance < 45000;
    const far = distance > 76000;
    model.detailGroup.visible = near;
    model.panelGroup.visible = near;
    model.group.scale.setScalar(far ? 1.65 : 1);
  }

  function updateTrail(position, glowIntensity, phase) {
    const departing = phase === UFO_EVENT_STATES.FAST_DEPARTURE || phase === UFO_EVENT_STATES.WORLD_DEPARTING;
    if (!departing || glowIntensity < 0.42) {
      model.trail.visible = false;
      return;
    }
    const back = vectors.direction.subVectors(vectors.previousPosition, position);
    if (back.lengthSq() < 1) {
      model.trail.visible = false;
      return;
    }
    back.normalize();
    const positions = model.trail.geometry.attributes.position;
    positions.setXYZ(0, 0, 0, 0);
    positions.setXYZ(1, back.x * 180, back.y * 180, back.z * 180);
    positions.needsUpdate = true;
    model.trail.material.opacity = 0.08 + glowIntensity * 0.12;
    model.trail.visible = true;
  }

  function updateContact(payload, phase, position, visible, speedKts, headingDeg) {
    const now = performance.now();
    if (visible && position) {
      lastContactPosition = { x: position.x, y: position.y, z: position.z };
    }
    const lost = phase === UFO_EVENT_STATES.DISAPPEAR ||
      phase === UFO_EVENT_STATES.WORLD_LOST ||
      phase === UFO_EVENT_STATES.COOLDOWN ||
      phase === UFO_EVENT_STATES.WORLD_COOLDOWN ||
      now < lostUntilMs;
