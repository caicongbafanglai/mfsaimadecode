import * as THREE from '../../three.module.min.js?v=202605050057';
import { AIRCRAFT_GROUND_OFFSET } from '../data/worldData.js?v=202605070100';
import {
  A320NEO_CONFIG,
  KT_TO_MS,
  THRUST_DETENTS,
  managedSpeedForPhase as managedSpeedForAircraftPhase
} from './aircraftConfig.js?v=202605061100';

const KT_TO_MPS = KT_TO_MS;
const DETENTS = THRUST_DETENTS;
const DETENT_INDEX = new Map(DETENTS.map((detent, index) => [detent.name, index]));
const ENGINE = A320NEO_CONFIG.engines;
const PERF = A320NEO_CONFIG.performance;
const IDLE_N1 = ENGINE.idleN1;
const APPROACH_IDLE_N1 = ENGINE.approachIdleN1;
const CLIMB_N1 = ENGINE.climbN1;
const MCT_N1 = ENGINE.mctN1;
const FLEX_N1 = ENGINE.flexN1;
const TOGA_N1 = ENGINE.togaN1;
const REVERSE_IDLE_N1 = ENGINE.reverseIdleN1;
const MAX_REVERSE_N1 = ENGINE.maxReverseN1;
const LEVER_MIN = -0.3;
const LEVER_MAX = 1;
const LEVER_CONTINUOUS_MOVE_SPEED = 0.55;
const LEVER_FINE_STEP = 0.025;
const LEVER_TARGET_CHASE_SPEED = 1.05;
const DETENT_SNAP_RADIUS = 0.025;
const DETENT_SOFT_ZONE = 0.06;
const DETENT_RESISTANCE = 0.45;
const DETENT_RELEASE_DELAY = 0.12;
const DETENT_CLICK_COOLDOWN = 0.15;
const LOW_N1_SPOOL_UP_RATE = ENGINE.lowN1SpoolUpRate;
const HIGH_N1_SPOOL_UP_RATE = ENGINE.highN1SpoolUpRate;
const SPOOL_DOWN_RATE = ENGINE.spoolDownRate;
const THRUST_REDUCTION_ALTITUDE_FT = 1500;
const SAFE_AOA_RAD = 10 * Math.PI / 180;
const ALPHA_MAX_AOA_RAD = 18 * Math.PI / 180;
const APPROACH_VLS_KT = PERF.approachVappKts - 10;
const MAX_OPERATING_KT = PERF.vmoKts;
const CL_ACTIVE_RADIUS = 0.05;
const CL_HIGH_OVERRIDE_MARGIN = 0.08;

export function createThrottleSystem({ state, terrainHeight, keys = new Set() }) {
  let takeoffReferenceAltFt = null;
  let lastDetentLeft = '';
  let lastDetentRight = '';
  let lastThrustMode = '';
  let thrustAlertTimer = 0;
  let detentFlashTimer = 0;
  let detentClickCooldown = 0;
  let releaseSnapTimer = 0;
  let hadKeyboardThrottleInput = false;
  let lastInputWasFineStep = false;
  let lastSoftDetent = '';

  initThrottleState();

  function initThrottleState() {
    const initialDetent = detentFromThrottle(state.throttle || 0);
    const initialPosition = initialDetent.position;
    state.thrustLeversLinked = true;
    state.thrustLeverLeft = initialPosition;
    state.thrustLeverRight = initialPosition;
    state.targetThrustLeverLeft = initialPosition;
    state.targetThrustLeverRight = initialPosition;
    state.targetThrustDetentLeft = initialDetent.name;
    state.targetThrustDetentRight = initialDetent.name;
    state.thrustDetentLeft = initialDetent.name;
    state.thrustDetentRight = initialDetent.name;
    state.currentDetentLeft = initialDetent.name;
    state.currentDetentRight = initialDetent.name;
    state.commandedThrustDetentLeft = initialDetent.name;
    state.commandedThrustDetentRight = initialDetent.name;
    state.nearestDetentLeft = initialDetent.name;
    state.nearestDetentRight = initialDetent.name;
    state.isBetweenDetentsLeft = false;
    state.isBetweenDetentsRight = false;
    state.isBetweenDetents = false;
    state.manualFineTune = false;
    state.leverPosition = initialPosition;
    state.targetLeverPosition = initialPosition;
    state.nearestDetent = initialDetent.name;
    state.currentDetent = initialDetent.name;
    state.leverDetentLabel = initialDetent.label;
    state.leverDetentDetail = initialDetent.label;
    state.leverPercent = Math.round(Math.max(0, initialPosition) * 100);
    state.engineN1Left = initialDetent.n1;
    state.engineN1Right = initialDetent.n1;
    state.targetN1Left = initialDetent.n1;
    state.targetN1Right = initialDetent.n1;
    state.targetN1Average = initialDetent.n1;
    state.engineN1Average = initialDetent.n1;
    state.thrustLimitN1 = initialDetent.n1;
    state.thrustLimitLabel = `${initialDetent.label} ${Math.round(initialDetent.n1)}%`;
    state.autoThrustArmed = true;
    state.autoThrustActive = false;
    state.athrStatus = 'ARM';
    state.alphaFloorActive = false;
    state.togaLockActive = false;
    state.togaLockArmedForReset = false;
    state.speedMode = 'MANAGED';
    state.selectedSpeedKts = 250;
    state.targetSpeedKts = managedSpeedForPhase('PREFLIGHT');
    state.v1Kts = PERF.v1Kts;
    state.vrKts = PERF.vrKts;
    state.v2Kts = PERF.v2Kts;
    state.managedSpeedKts = state.targetSpeedKts;
    state.speedTrendKts = 0;
    state.flightPhase = state.grounded ? 'PREFLIGHT' : 'CLIMB';
    state.fmaThrustMode = 'MAN THR';
    state.fmaVerticalMode = 'OP CLB';
    state.fmaLateralMode = 'HDG';
    state.thrustAlert = '';
    state.detentFlash = '';
    state.lvrAsym = false;
    state.thrustAsymmetry = 0;
    state.reverseEffect = 0;
    state.mainGearCompressed = state.grounded;
    state.reverseAllowed = state.grounded && state.mainGearCompressed;
    lastDetentLeft = state.thrustDetentLeft;
    lastDetentRight = state.thrustDetentRight;
  }

  function update(dt) {
    const previousSpeed = state._previousThrottleSpeed ?? state.speed;
    const currentIas = Math.abs(state.speed) / KT_TO_MPS;
    const radioAltFt = radioAltitudeFeet();
    state.mainGearCompressed = state.grounded && radioAltFt <= 2;
    const allowReverse = reverseAllowed();

    state.speedTrendKts = ((state.speed - previousSpeed) / KT_TO_MPS) / Math.max(dt, 0.001);
    state._previousThrottleSpeed = state.speed;
    state.reverseAllowed = allowReverse;
    updateTimers(dt);
    updateKeyboardThrottleInput(dt, allowReverse);
    updateLeverAnimation(dt, allowReverse);

    const leftProfile = leverProfile('Left', radioAltFt, allowReverse);
    const rightProfile = leverProfile('Right', radioAltFt, allowReverse);
    publishLeverState(leftProfile, rightProfile);
    const reverseActive = leftProfile.reverseLevel > 0 || rightProfile.reverseLevel > 0;

    updateFlightPhase(currentIas, radioAltFt, leftProfile, rightProfile, reverseActive);
    updateAutoThrustState(currentIas, radioAltFt, leftProfile, rightProfile, reverseActive);

    const leftTarget = targetN1ForSide(leftProfile, currentIas, radioAltFt);
    const rightTarget = targetN1ForSide(rightProfile, currentIas, radioAltFt);
    state.targetN1Left = leftTarget;
    state.targetN1Right = rightTarget;
    state.targetN1Average = (leftTarget + rightTarget) * 0.5;
    state.engineN1Left = moveToward(state.engineN1Left, leftTarget, spoolRate(state.engineN1Left, leftTarget) * dt);
    state.engineN1Right = moveToward(state.engineN1Right, rightTarget, spoolRate(state.engineN1Right, rightTarget) * dt);
    state.engineN1Average = (state.engineN1Left + state.engineN1Right) * 0.5;

    const reverseBase = Math.max(leftProfile.reverseLevel, rightProfile.reverseLevel);
    const lowSpeedReverseScale = THREE.MathUtils.lerp(0.25, 1, smoothstepNumber(20, 60, currentIas));
    state.reverse = allowReverse ? reverseBase : 0;
    state.reverseEffect = allowReverse ? reverseBase * lowSpeedReverseScale : 0;
    state.throttle = state.reverse > 0.02 ? 0 : THREE.MathUtils.clamp((state.engineN1Average - IDLE_N1) / (TOGA_N1 - IDLE_N1), 0, 1);
    state.thrustAsymmetry = (state.engineN1Right - state.engineN1Left) / 100;
    state.lvrAsym = Math.abs(state.thrustLeverLeft - state.thrustLeverRight) > 0.035;

    if (state.lvrAsym && state.fmaThrustMode !== 'LVR ASYM') {
      state.fmaThrustMode = 'LVR ASYM';
    }
    if (state.thrustAlert) state.fmaThrustMode = state.thrustAlert;
    if (!state.thrustAlert && ['LOW ENERGY', 'OVERSPEED'].includes(state.flightWarning)) {
      const protectedMode = ['A.FLOOR', 'TOGA LK', 'REV', 'RETARD', 'LVR ASYM'].includes(state.fmaThrustMode);
      if (!protectedMode) state.fmaThrustMode = state.flightWarning;
    }
    state.athrStatus = state.autoThrustActive ? 'ACTIVE' : state.autoThrustArmed ? 'ARM' : 'OFF';
    state.thrustLimitN1 = Math.max(leftProfile.limitN1, rightProfile.limitN1);
    state.thrustLimitLabel = limitLabelForProfiles(leftProfile, rightProfile);
    updateAudioCues();
  }

  function updateTimers(dt) {
    if (thrustAlertTimer > 0) {
      thrustAlertTimer = Math.max(0, thrustAlertTimer - dt);
    } else {
      state.thrustAlert = '';
    }
    if (detentFlashTimer > 0) {
      detentFlashTimer = Math.max(0, detentFlashTimer - dt);
    } else {
      state.detentFlash = '';
    }
    detentClickCooldown = Math.max(0, detentClickCooldown - dt);
  }

  function updateKeyboardThrottleInput(dt, allowReverse) {
    const input = continuousThrottleDirection();
    if (input !== 0) {
      hadKeyboardThrottleInput = true;
      lastInputWasFineStep = false;
      releaseSnapTimer = DETENT_RELEASE_DELAY;
      moveLeverBy(input, LEVER_CONTINUOUS_MOVE_SPEED * dt, 'both', allowReverse);
      return;
    }

    if (!hadKeyboardThrottleInput) return;
    if (lastInputWasFineStep) {
      hadKeyboardThrottleInput = false;
      lastInputWasFineStep = false;
      lastSoftDetent = '';
      return;
    }
    releaseSnapTimer -= dt;
    if (releaseSnapTimer <= 0) {
      maybeSnapLever('both', allowReverse);
      hadKeyboardThrottleInput = false;
      lastSoftDetent = '';
    }
  }

  function continuousThrottleDirection() {
    const up = keys.has('ArrowUp') || keys.has('PageUp') || keys.has('KeyR');
    const down = keys.has('ArrowDown') || keys.has('PageDown') || keys.has('KeyF');
    return (up ? 1 : 0) - (down ? 1 : 0);
  }

  function commandStep(direction) {
    return nudgeLever(direction);
  }

  function nudgeLever(direction, side = 'both') {
    if (!direction) return false;
    hadKeyboardThrottleInput = true;
    lastInputWasFineStep = true;
    releaseSnapTimer = DETENT_RELEASE_DELAY;
    return moveLeverBy(direction, LEVER_FINE_STEP, side, reverseAllowed(), true);
  }

  function releaseLeverInput() {
    if (hadKeyboardThrottleInput) releaseSnapTimer = DETENT_RELEASE_DELAY;
  }

  function moveLeverBy(direction, amount, side = 'both', allowReverse = reverseAllowed(), bypassResistance = false) {
    if (side === 'both') {
      state.thrustLeversLinked = true;
      const start = (safeLeverPosition('Left') + safeLeverPosition('Right')) * 0.5;
      const next = bypassResistance
        ? clampAllowedLeverPosition(start + direction * amount, allowReverse)
        : applyDetentResistance(start, direction, amount, allowReverse, 'Both');
      setImmediateLeverPosition(next, 'both', allowReverse);
      return true;
    }

    const sideName = side === 'left' ? 'Left' : 'Right';
    const start = safeLeverPosition(sideName);
    const next = bypassResistance
      ? clampAllowedLeverPosition(start + direction * amount, allowReverse)
      : applyDetentResistance(start, direction, amount, allowReverse, sideName);
    setImmediateLeverPosition(next, side, allowReverse);
    state.thrustLeversLinked = false;
    return true;
  }

  function applyDetentResistance(position, direction, amount, allowReverse, sideName) {
    const nearest = nearestAllowedDetent(position, allowReverse);
    const distance = Math.abs(position - nearest.position);
    let movement = direction * amount;
    if (distance < DETENT_SOFT_ZONE) {
      const resistanceFactor = 1 - DETENT_RESISTANCE * (1 - distance / DETENT_SOFT_ZONE);
      movement *= THREE.MathUtils.clamp(resistanceFactor, 0.38, 1);
      triggerSoftDetentNotch(nearest, sideName);
    }
    return clampAllowedLeverPosition(position + movement, allowReverse);
  }

  function triggerSoftDetentNotch(detent, sideName) {
    const key = `${sideName}:${detent.name}`;
    if (key === lastSoftDetent || detentClickCooldown > 0) return;
    lastSoftDetent = key;
    state.audioCue = 'detent';
    showDetentFlash(detent.label);
    detentClickCooldown = DETENT_CLICK_COOLDOWN;
  }

  function setDetent(name, side = 'both') {
    const detent = detentByName(name);
    if (detent.reverse > 0 && !reverseAllowed()) {
      showReverseLocked();
      return false;
    }
    if (state.togaLockActive && name === 'TOGA') {
      state.togaLockArmedForReset = true;
    } else if (state.togaLockActive && state.togaLockArmedForReset && name === 'CL') {
      state.togaLockActive = false;
      state.togaLockArmedForReset = false;
    }
    if (detent.position > detentByName('IDLE').position) {
      state.parkingBrake = false;
    }
    if (side === 'left' || side === 'both') {
      state.targetThrustDetentLeft = detent.name;
      state.targetThrustLeverLeft = detent.position;
    }
    if (side === 'right' || side === 'both') {
      state.targetThrustDetentRight = detent.name;
      state.targetThrustLeverRight = detent.position;
    }
    if (side === 'both') state.thrustLeversLinked = true;
    state.targetThrottleDetent = detent.name;
    hadKeyboardThrottleInput = false;
    releaseSnapTimer = 0;
    state.manualFineTune = false;
    return true;
  }

  function showDetentFlash(text) {
    state.detentFlash = text;
    detentFlashTimer = 0.85;
  }

  function setLeverPosition(position, side = 'both', fine = false) {
    const allowReverse = reverseAllowed();
    const clamped = clampAllowedLeverPosition(position, allowReverse);
    setImmediateLeverPosition(clamped, fine ? side : 'both', allowReverse);
    state.thrustLeversLinked = !fine;
    state.manualFineTune = true;
    hadKeyboardThrottleInput = false;
    releaseSnapTimer = 0;
  }

  function setImmediateLeverPosition(position, side = 'both', allowReverse = reverseAllowed()) {
    const clamped = clampAllowedLeverPosition(position, allowReverse);
    if (side === 'left' || side === 'both') {
      state.thrustLeverLeft = clamped;
      state.targetThrustLeverLeft = clamped;
      state.targetThrustDetentLeft = nearestAllowedDetent(clamped, allowReverse).name;
    }
    if (side === 'right' || side === 'both') {
      state.thrustLeverRight = clamped;
      state.targetThrustLeverRight = clamped;
      state.targetThrustDetentRight = nearestAllowedDetent(clamped, allowReverse).name;
    }
    if (clamped > 0.015) state.parkingBrake = false;
  }

  function snapLever(side = 'both') {
    return maybeSnapLever(side, reverseAllowed());
  }

  function maybeSnapLever(side = 'both', allowReverse = reverseAllowed()) {
    if (side === 'left') return maybeSnapSide('Left', allowReverse);
    if (side === 'right') return maybeSnapSide('Right', allowReverse);

    const average = (safeLeverPosition('Left') + safeLeverPosition('Right')) * 0.5;
    const nearest = nearestAllowedDetent(average, allowReverse);
    if (Math.abs(average - nearest.position) < DETENT_SNAP_RADIUS) {
      setImmediateLeverPosition(nearest.position, 'both', allowReverse);
      state.manualFineTune = false;
      playDetentClick(nearest);
      return true;
    }
    state.manualFineTune = true;
    return false;
  }

  function maybeSnapSide(sideName, allowReverse) {
    const position = safeLeverPosition(sideName);
    const nearest = nearestAllowedDetent(position, allowReverse);
    if (Math.abs(position - nearest.position) < DETENT_SNAP_RADIUS) {
      setImmediateLeverPosition(nearest.position, sideName === 'Left' ? 'left' : 'right', allowReverse);
      playDetentClick(nearest);
      return true;
    }
    state.manualFineTune = true;
    return false;
  }

  function playDetentClick(detent) {
    if (detentClickCooldown <= 0) {
      state.audioCue = 'detent';
      detentClickCooldown = DETENT_CLICK_COOLDOWN;
    }
    showDetentFlash(detent.label);
  }

  function toggleAutoThrust() {
    if (state.autoThrustArmed || state.autoThrustActive || state.alphaFloorActive || state.togaLockActive) {
      state.autoThrustArmed = false;
      state.autoThrustActive = false;
      state.alphaFloorActive = false;
      state.togaLockActive = false;
      state.togaLockArmedForReset = false;
      state.fmaThrustMode = 'A/THR OFF';
    } else {
      state.autoThrustArmed = true;
      state.fmaThrustMode = 'A/THR ARM';
    }
    state.audioCue = 'detent';
  }

  function toggleSpeedMode() {
    state.speedMode = state.speedMode === 'SELECTED' ? 'MANAGED' : 'SELECTED';
    state.audioCue = 'detent';
  }

  function updateLeverAnimation(dt, allowReverse) {
    updateLeverSide('Left', dt, allowReverse);
    updateLeverSide('Right', dt, allowReverse);
  }

  function updateLeverSide(sideName, dt, allowReverse) {
    const leverKey = `thrustLever${sideName}`;
    const targetLeverKey = `targetThrustLever${sideName}`;
    const current = safeLeverPosition(sideName);
    const target = clampAllowedLeverPosition(Number.isFinite(state[targetLeverKey]) ? state[targetLeverKey] : current, allowReverse);
    const next = moveToward(current, target, LEVER_TARGET_CHASE_SPEED * dt);
    state[leverKey] = Math.abs(next - target) < 0.003 ? target : next;
    state[targetLeverKey] = target;
    if (state[leverKey] > 0.015) state.parkingBrake = false;
  }

  function leverProfile(sideName, radioAltFt, allowReverse) {
    const position = clampAllowedLeverPosition(safeLeverPosition(sideName), allowReverse);
    const targetPosition = clampAllowedLeverPosition(Number.isFinite(state[`targetThrustLever${sideName}`]) ? state[`targetThrustLever${sideName}`] : position, allowReverse);
    const nearest = nearestAllowedDetent(position, allowReverse);
    const distance = Math.abs(position - nearest.position);
