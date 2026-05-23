import * as THREE from '../../three.module.min.js?v=202605050057';
import { AIRCRAFT_GROUND_OFFSET } from '../data/worldData.js?v=202605070100';
import {
  A320NEO_CONFIG,
  DEG_TO_RAD,
  FT_PER_M,
  GRAVITY,
  KT_TO_MS,
  MS_TO_KT,
  airDensityForAltitude,
  clamp,
  flapConfigAt,
  ktToMS,
  moveToward,
  smoothstep,
  thrustFromN1,
  vlsForFlapPosition,
  vmaxForConfig
} from './aircraftConfig.js?v=202605061100';

const NORMAL_LAW = 'NORMAL_LAW';
const STALL_TRAINING = 'STALL_TRAINING';
const CONTROL_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const HOLD_SENSITIVITY_DELAY = 0.35;
const PITCH_HOLD_SENSITIVITY_RAMP_TIME = 1.8;
const TURN_HOLD_SENSITIVITY_RAMP_TIME = 2.15;
const MAX_PITCH_HOLD_SENSITIVITY = 1.34;
const MAX_TURN_HOLD_SENSITIVITY = 1.72;
const NORMAL_PITCH_LIMIT_UP = 30 * DEG_TO_RAD;
const NORMAL_PITCH_LIMIT_DOWN = -15 * DEG_TO_RAD;
const TRAINING_PITCH_LIMIT_UP = 42 * DEG_TO_RAD;
const TRAINING_PITCH_LIMIT_DOWN = -32 * DEG_TO_RAD;
const MAX_ROLL_NORMAL = 67 * DEG_TO_RAD;
const BANK_SOFT_LIMIT = 33 * DEG_TO_RAD;
const DEFAULT_GROUND_TRAVEL_SCALE = 1.4;
const DEFAULT_AIR_TRAVEL_SCALE = 1.5;
const MAX_WORLD_TRAVEL_SCALE = 1.8;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export function createFlightPhysics({ keys, state, forwardVec, terrainHeight, smoothstep: externalSmoothstep }) {
  const config = A320NEO_CONFIG;
  const massKg = clamp(Number(state.aircraftMassKg) || config.mass.defaultKg, config.mass.minKg, config.mass.maxKg);
  const keyHoldTimes = new Map();
  const previousKeys = new Set();
  const physicsVelocity = state.physicsVelocity?.isVector3 ? state.physicsVelocity : new THREE.Vector3();
  const worldVelocity = state.worldVelocity?.isVector3 ? state.worldVelocity : new THREE.Vector3();
  const attitudeForward = new THREE.Vector3();
  const bodyUpDirection = new THREE.Vector3();
  const velocityDirection = new THREE.Vector3();
  const liftDirection = new THREE.Vector3();
  const lateralAcceleration = new THREE.Vector3();
  const groundForward = new THREE.Vector3();
  const mechanisms = { collected: false, flaps: [], spoilers: [], gears: [] };
  let pitchRate = 0;
  let rollRate = 0;
  let smoothedPitchInput = 0;
  let flightPathPitch = 0;
  let stallFactor = state.stallFactor || 0;

  initAircraftState();

  function updateAircraft(dt, model) {
    const safeDt = clamp(dt, 0.001, 0.08);
    const wasGrounded = state.grounded === true;
    const radioAltFt = radioAltitudeFeet();
    const currentIAS = Math.max(0, Math.abs(state.currentIAS || state.speed * MS_TO_KT || 0));
    const brakeKeyPriority = wasGrounded && state.mainGearCompressed !== false;

    handleDiscreteSystemKeys(currentIAS);
    updateKeyHoldTimes(safeDt, brakeKeyPriority ? new Set(['KeyW']) : null);
    updateBrakeInputAndPressure(safeDt, wasGrounded, currentIAS, brakeKeyPriority);
    updateFlaps(safeDt);
    updateGear(safeDt, currentIAS);
    updateSpeedBrake(safeDt, currentIAS);
    updateGroundSpoilers(safeDt, wasGrounded);
    updateAttitude(safeDt, wasGrounded, brakeKeyPriority, currentIAS);
    publishAttitudeDirections();
    ensurePhysicsVelocity(wasGrounded);

    velocityDirection.copy(physicsVelocity);
    if (velocityDirection.lengthSq() > 0.0001) velocityDirection.normalize();
    else velocityDirection.copy(attitudeForward);
    flightPathPitch = wasGrounded ? 0 : Math.asin(clamp(velocityDirection.y, -1, 1));
    const angleOfAttack = computeAngleOfAttack();
    updateProtectionsAndStall(safeDt, angleOfAttack, currentIAS, wasGrounded);

    const previousY = state.position.y;
    if (wasGrounded) updateGroundVelocity(safeDt, currentIAS, radioAltFt);
    else updateAirVelocity(safeDt, currentIAS, radioAltFt, angleOfAttack);

    updateWorldPosition(safeDt, wasGrounded);
    resolveGroundContact(safeDt);
    publishPhysicsVelocity();
    state.verticalSpeed = ((state.position.y - previousY) / safeDt) * 196.85;
    updateWarnings(currentIAS);
    updateModel(model, safeDt);
    publishPreviousKeys();
  }

  function initAircraftState() {
    state.aircraftConfig = config;
    state.aircraftType = config.aircraftType;
    state.aircraftMassKg = massKg;
    state.physicsVelocity = physicsVelocity;
    state.worldVelocity = worldVelocity;
    state.visualPosition = state.visualPosition?.isVector3 ? state.visualPosition : state.position.clone();
    state.groundTravelScale = Number.isFinite(state.groundTravelScale) ? state.groundTravelScale : DEFAULT_GROUND_TRAVEL_SCALE;
    state.airTravelScale = Number.isFinite(state.airTravelScale) ? state.airTravelScale : DEFAULT_AIR_TRAVEL_SCALE;
    state.maxTravelScale = Number.isFinite(state.maxTravelScale) ? state.maxTravelScale : MAX_WORLD_TRAVEL_SCALE;
    state.flapTargetIndex = Number.isFinite(state.flapTargetIndex) ? state.flapTargetIndex : (state.grounded ? 2 : 0);
    state.flapPositionIndex = Number.isFinite(state.flapPositionIndex) ? state.flapPositionIndex : state.flapTargetIndex;
    state.gearCommand = Number.isFinite(state.gearCommand) ? state.gearCommand : (state.grounded ? 1 : 0);
    state.gearPosition = Number.isFinite(state.gearPosition) ? state.gearPosition : state.gearCommand;
    state.speedBrakeCommand = Number.isFinite(state.speedBrakeCommand) ? state.speedBrakeCommand : 0;
    state.speedBrakePosition = Number.isFinite(state.speedBrakePosition) ? state.speedBrakePosition : 0;
    state.speedBrakeOpenTime = 0;
    state.groundSpoilersArmed = state.groundSpoilersArmed !== false;
    state.groundSpoilerPosition = Number.isFinite(state.groundSpoilerPosition) ? state.groundSpoilerPosition : 0;
    state.mainGearCompressed = state.grounded;
    state.reverseAllowed = state.grounded && state.mainGearCompressed;
    state.differentialBrakeYawEnabled = false;
    state.leftBrakePressure = state.leftBrakePressure || 0;
    state.rightBrakePressure = state.rightBrakePressure || 0;
    state.totalBrakePressure = state.totalBrakePressure || 0;
    state.v1Kts = config.performance.v1Kts;
    state.vrKts = config.performance.vrKts;
    state.v2Kts = config.performance.v2Kts;
    publishConfigSpeeds();
    publishPhysicsVelocity();
  }

  function handleDiscreteSystemKeys(currentIAS) {
    if (justPressed('KeyX')) {
      state.speedBrakeCommand = state.speedBrakeCommand > 0.5 ? 0 : 1;
      state.audioCue = state.speedBrakeCommand ? 'SPEED BRK' : 'SPEED BRK RETRACT';
    }
    if (justPressed('KeyG')) {
      if (currentIAS > config.gear.vloKts + 5) {
        state.systemWarning = 'GEAR SPEED';
        state.audioCue = 'GEAR SPEED';
      }
      state.gearCommand = state.gearCommand > 0.5 ? 0 : 1;
    }
    if (justPressed('KeyY')) {
      state.groundSpoilersArmed = !state.groundSpoilersArmed;
      state.audioCue = state.groundSpoilersArmed ? 'GND SPLR ARM' : 'GND SPLR OFF';
    }
    if (justPressed('KeyC') || justPressed('BracketRight')) {
      const currentTarget = clamp(Math.round(state.flapTargetIndex || 0), 0, config.flaps.length - 1);
      const nextTarget = Math.min(config.flaps.length - 1, currentTarget + 1);
      const limitForNext = config.flaps[currentTarget]?.vfeNextKts ?? config.flaps[nextTarget]?.vfeKts ?? null;
      if (nextTarget > currentTarget && Number.isFinite(limitForNext) && currentIAS > limitForNext) {
        state.flapWarning = 'TOO FAST FOR FLAPS';
        state.flapWarningTimer = 2.8;
        state.audioCue = 'TOO FAST FOR FLAPS';
      } else {
        state.flapTargetIndex = nextTarget;
        state.audioCue = nextTarget !== currentTarget ? 'FLAPS' : '';
      }
    }
    if (justPressed('KeyZ') || justPressed('BracketLeft')) {
      state.flapTargetIndex = Math.max(0, Math.round(state.flapTargetIndex || 0) - 1);
      state.audioCue = 'FLAPS';
    }
  }

  function updateFlaps(dt) {
    if (state.flapWarningTimer > 0) {
      state.flapWarningTimer = Math.max(0, state.flapWarningTimer - dt);
      if (state.flapWarningTimer <= 0) state.flapWarning = '';
    }
    const target = clamp(Math.round(state.flapTargetIndex || 0), 0, config.flaps.length - 1);
    const current = clamp(Number(state.flapPositionIndex) || 0, 0, config.flaps.length - 1);
    const direction = Math.sign(target - current);
    if (direction !== 0) {
      const fromIndex = direction > 0 ? Math.floor(current) : Math.ceil(current);
      const segment = config.flaps[clamp(fromIndex, 0, config.flaps.length - 1)];
      const seconds = Math.max(0.5, segment.moveSecondsToNext || 4);
      state.flapPositionIndex = moveToward(current, target, dt / seconds);
    } else {
      state.flapPositionIndex = target;
    }
    state.flapTargetIndex = target;
    const flap = flapConfigAt(state.flapPositionIndex);
    const targetConfig = config.flaps[target];
    state.flapConfig = flap;
    state.selectedFlapIndex = target;
    state.selectedFlapConfig = targetConfig.key;
    state.flapHandle = targetConfig.shortLabel;
    state.flapLabel = flap.label;
    state.flapVfeKts = flap.vfeKts;
    state.vfeNextKts = targetConfig.vfeNextKts;
    state.flapLiftMultiplier = flap.liftMultiplier;
    state.flapDragAdder = flap.dragAdder;
    state.flapPitchMoment = flap.pitchMoment;
    state.stallSpeedKts = flap.stallSpeedKts;
    state.flapStatusText = `FLAPS ${targetConfig.shortLabel}`;
    state.actualSlatPosition = clamp(flap.slats, 0, 1);
    state.actualFlapPosition = clamp(flap.flaps, 0, 1);
    state.highLiftMoving = clamp(
      Math.abs((targetConfig.slats || 0) - state.actualSlatPosition) +
      Math.abs((targetConfig.flaps || 0) - state.actualFlapPosition),
      0,
      1
    );
    publishConfigSpeeds();
  }

  function updateGear(dt, currentIAS) {
    const target = state.gearCommand > 0.5 ? 1 : 0;
    const time = target > state.gearPosition ? config.gear.deployTimeSeconds : config.gear.retractTimeSeconds;
    state.gearPosition = moveToward(clamp(state.gearPosition || 0, 0, 1), target, dt / Math.max(0.5, time));
    state.gearState = state.gearPosition > 0.98 ? 'DOWN' : state.gearPosition < 0.02 ? 'UP' : target > 0 ? 'TRANSIT DOWN' : 'TRANSIT UP';
    state.gearStatusText = state.gearState === 'DOWN' ? 'GEAR DOWN' : state.gearState === 'UP' ? 'GEAR UP' : 'GEAR TRANSIT';
    state.gearWarning = currentIAS > (target > 0 ? config.gear.vloKts : config.gear.vleKts) && state.gearPosition > 0.05 ? 'GEAR SPEED' : '';
    publishConfigSpeeds();
  }

  function updateSpeedBrake(dt, currentIAS) {
    const requested = state.speedBrakeCommand > 0.5 && !state.grounded ? 1 : 0;
    const rate = requested > state.speedBrakePosition ? config.speedBrake.deployRatePerSecond : config.speedBrake.retractRatePerSecond;
    state.speedBrakePosition = moveToward(clamp(state.speedBrakePosition || 0, 0, 1), requested, rate * dt);
    if (state.speedBrakePosition > 0.02) state.speedBrakeOpenTime += dt;
    else state.speedBrakeOpenTime = 0;
    state.speedBrakeActive = state.speedBrakePosition > 0.04;
    state.actualSpeedBrakePosition = state.speedBrakePosition;
    state.speedBrakeBuffetIntensity = state.speedBrakePosition * smoothstep(
      config.speedBrake.buffetStartKts,
      config.speedBrake.buffetStrongKts,
      currentIAS
    );
    if (state.speedBrakeActive && currentIAS < state.vlsKts + 10) state.speedBrakeCaution = 'SPD BRK LOW SPD';
    else state.speedBrakeCaution = '';
    state.speedBrakeStatusText = state.speedBrakeActive ? `SPEED BRK ${Math.round(state.speedBrakePosition * 100)}%` : '';
  }

  function updateGroundSpoilers(dt, wasGrounded) {
    const leverIdleOrReverse = (state.leverPosition || 0) <= 0.02 || (state.reverse || 0) > 0.02;
    const shouldDeploy = wasGrounded && state.mainGearCompressed !== false && state.groundSpoilersArmed && leverIdleOrReverse;
    const target = shouldDeploy ? 1 : 0;
    const rate = target ? config.groundSpoilers.deployRatePerSecond : config.groundSpoilers.retractRatePerSecond;
    state.groundSpoilerPosition = moveToward(clamp(state.groundSpoilerPosition || 0, 0, 1), target, rate * dt);
    state.actualGroundSpoilerPosition = state.groundSpoilerPosition;
    state.groundSpoilersActive = state.groundSpoilerPosition > 0.05;
    if (state.groundSpoilersActive) state.speedBrakeStatusText = `GND SPLR ${Math.round(state.groundSpoilerPosition * 100)}%`;
    else if (!state.speedBrakeActive) state.speedBrakeStatusText = state.groundSpoilersArmed ? 'GND SPLR ARM' : 'SPLR OFF';
  }

  function updateAttitude(dt, wasGrounded, brakeKeyPriority, currentIAS) {
    const rawPitchInput = (keys.has('KeyS') ? 1 : 0) - (!brakeKeyPriority && keys.has('KeyW') ? 1 : 0);
    const rawTurnInput = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const rawYawInput = (!brakeKeyPriority && keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
    const trainingLaw = state.lawMode === STALL_TRAINING;
    const normalLaw = !trainingLaw;
    const pitchInput = smoothPitchInput(rawPitchInput, dt, wasGrounded, trainingLaw);
    const turnInput = wasGrounded ? rawTurnInput : rawTurnInput * holdSensitivity(rawTurnInput, 'KeyA', 'KeyD', TURN_HOLD_SENSITIVITY_RAMP_TIME, MAX_TURN_HOLD_SENSITIVITY);
    state.controlInputPitch = pitchInput;
    state.controlInputRoll = turnInput;

    if (wasGrounded) {
      const rotateDemand = currentIAS >= config.performance.vrKts - 2 && pitchInput > 0.05;
      const targetPitch = rotateDemand ? clamp(pitchInput, 0, 1) * 11 * DEG_TO_RAD : 0;
      state.pitch = THREE.MathUtils.damp(state.pitch, targetPitch, rotateDemand ? 2.7 : 7.5, dt);
      pitchRate = THREE.MathUtils.damp(pitchRate, 0, 8, dt);
      state.yaw += turnInput * clamp((currentIAS * KT_TO_MS) / 42, 0.52, 1.35) * 1.18 * dt;
      state.roll = THREE.MathUtils.damp(state.roll, 0, 7, dt);
      rollRate = THREE.MathUtils.damp(rollRate, 0, 8, dt);
    } else {
      const authority = clamp(state.controlAuthority || 0.5, 0.18, 1.15);
      const limitUp = normalLaw ? NORMAL_PITCH_LIMIT_UP : TRAINING_PITCH_LIMIT_UP;
      const limitDown = normalLaw ? NORMAL_PITCH_LIMIT_DOWN : TRAINING_PITCH_LIMIT_DOWN;
      let pitchAccel = pitchInput * (normalLaw ? 21 : 27) * DEG_TO_RAD * authority;
      pitchAccel += ((state.flapPitchMoment || 0) + (state.actualSpeedBrakePosition || 0) * config.speedBrake.pitchMoment) * 18 * DEG_TO_RAD * authority;
      if (normalLaw && state.alphaProtActive) pitchAccel -= smoothstep(config.protections.alphaProtAoADeg, config.protections.alphaMaxAoADeg, state.angleOfAttackDeg || 0) * 18 * DEG_TO_RAD;
      if (normalLaw && state.overspeedProtectionActive) pitchAccel += smoothstep(config.performance.vmoKts, config.performance.vmoKts + 30, currentIAS) * 7 * DEG_TO_RAD;
      if (Math.abs(pitchInput) < 0.04) {
        const neutralPitch = normalLaw ? neutralNormalLawPitch(currentIAS) : 0;
        pitchAccel += (neutralPitch - state.pitch) * (normalLaw ? 0.34 : 0.045);
      }
      pitchRate = clamp((pitchRate + pitchAccel * dt) * Math.pow(normalLaw ? 0.965 : 0.975, dt * 60), -18 * DEG_TO_RAD, 18 * DEG_TO_RAD);
      state.pitch = clamp(state.pitch + pitchRate * dt, limitDown, limitUp);

      const rollAuthority = authority * (state.alphaProtActive ? 0.78 : 1);
      let rollCommand = turnInput * 0.38 * rollAuthority;
      if (normalLaw && rawTurnInput === 0 && Math.abs(state.roll) > BANK_SOFT_LIMIT) rollCommand += (Math.sign(state.roll) * BANK_SOFT_LIMIT - state.roll) * 1.15;
      else if (rawTurnInput === 0) rollCommand += -state.roll * (normalLaw ? 0.08 : 0.035);
      rollRate = THREE.MathUtils.damp(rollRate, rollCommand, 3.5, dt);
      state.roll = clamp(state.roll + rollRate * dt, normalLaw ? -MAX_ROLL_NORMAL : -1.28, normalLaw ? MAX_ROLL_NORMAL : 1.28);
      const speedMS = Math.max(physicsVelocity.length(), 45);
      const coordinatedTurnRate = Math.tan(state.roll) * GRAVITY / speedMS * 2.15 * (1 - stallFactor * 0.35);
      state.yaw += (coordinatedTurnRate + rawYawInput * 0.1 * authority + (state.thrustAsymmetry || 0) * 0.14) * dt;
    }

    attitudeForward.set(0, 0, -1).applyEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ')).normalize();
    bodyUpDirection.set(0, 1, 0).applyEuler(new THREE.Euler(state.pitch, state.yaw, state.roll, 'YXZ')).normalize();
  }
