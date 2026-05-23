  function updateBrakeInputAndPressure(dt, wasGrounded, currentIAS, brakeKeyPriority) {
    const brakesAvailable = wasGrounded && state.mainGearCompressed !== false;
    const leftBrakeInput = brakeKeyPriority && keys.has('KeyQ') ? 1 : 0;
    const rightBrakeInput = brakeKeyPriority && keys.has('KeyW') ? 1 : 0;
    state.leftBrakeInput = leftBrakeInput;
    state.rightBrakeInput = rightBrakeInput;
    state.brakesAvailable = brakesAvailable;
    state.leftBrakePressure = moveBrakePressure(state.leftBrakePressure || 0, brakesAvailable ? leftBrakeInput : 0, dt);
    state.rightBrakePressure = moveBrakePressure(state.rightBrakePressure || 0, brakesAvailable ? rightBrakeInput : 0, dt);
    state.totalBrakePressure = (state.leftBrakePressure + state.rightBrakePressure) * 0.5;
    state.brakeInput = (leftBrakeInput + rightBrakeInput) * 0.5;
    state.brakeYawMoment = 0;
    state.brakeStatusText = brakeStatusText(leftBrakeInput, rightBrakeInput, state.totalBrakePressure, currentIAS);
  }

  function wheelBrakeForce(currentIAS) {
    if (!state.brakesAvailable || state.totalBrakePressure <= 0.005) {
      state.brakeEfficiency = 0;
      state.antiSkidActive = false;
      return 0;
    }
    const wheelSpeedFactor = smoothstep(5, 45, currentIAS);
    const spoilerMultiplier = state.groundSpoilersActive ? config.groundSpoilers.brakeEfficiencyMultiplier : 1;
    let brakeEfficiency = wheelSpeedFactor * spoilerMultiplier;
    const requestedDecel = config.brakes.maxBrakeDecelerationMS2 * state.totalBrakePressure * brakeEfficiency;
    state.antiSkidActive = config.brakes.antiSkidEnabled && currentIAS > 15 && requestedDecel > 4.8;
    if (state.antiSkidActive) brakeEfficiency *= 0.78;
    const brakeDeceleration = config.brakes.maxBrakeDecelerationMS2 * state.totalBrakePressure * brakeEfficiency;
    state.brakeEfficiency = brakeEfficiency;
    state.wheelBrakeDecelerationMS2 = brakeDeceleration;
    return massKg * brakeDeceleration;
  }

  function reverseForce(currentIAS) {
    if (!state.grounded || !state.mainGearCompressed || state.reverse <= 0.02) return 0;
    const reverseLevel = clamp(state.reverse, 0, 1);
    const reverseEffectiveness = clamp(currentIAS / config.reverse.fullEffectKts, 0.25, 1);
    const reverseN1Power = clamp(((state.engineN1Average || config.engines.idleN1) - config.engines.idleN1) / (config.engines.maxReverseN1 - config.engines.idleN1), 0, 1);
    return config.engines.maxTotalThrustN * config.reverse.maxThrustRatio * reverseLevel * reverseEffectiveness * reverseN1Power;
  }

  function speedBrakeEffect(currentIAS) {
    const position = clamp(state.speedBrakePosition || 0, 0, 1);
    if (position <= 0.001) return { position: 0, cdAdder: 0, forceN: 0 };
    const speedFactor = smoothstep(config.speedBrake.minEffectiveKts, config.speedBrake.strongEffectKts, currentIAS);
    const timeFactor = Math.exp(-(state.speedBrakeOpenTime || 0) / config.speedBrake.decayTimeSeconds);
    let decayFactor = THREE.MathUtils.lerp(0.25, 1, timeFactor);
    if (currentIAS < config.speedBrake.terminalIasKts) decayFactor *= 0.15;
    if (currentIAS < state.vlsKts + 10) decayFactor *= 0.3;
    const equivalentDecel = config.speedBrake.initialDecelKtsPerSecond * KT_TO_MS * speedFactor * decayFactor * position;
    const cdAdder = config.speedBrake.cdMax * config.speedBrake.dragFactor * position * Math.max(0.18, speedFactor);
    return {
      position,
      cdAdder,
      forceN: massKg * equivalentDecel
    };
  }

  function brakeStatusText(leftInput, rightInput, totalPressure, currentIAS) {
    const brakePercent = Math.round(clamp(totalPressure, 0, 1) * 100);
    const reverseActive = state.reverse > 0.08;
    if (reverseActive && currentIAS < config.reverse.lowSpeedWeakKts) return 'REV LOW EFFECT';
    if (reverseActive && currentIAS < config.reverse.reduceReverseKts && brakePercent <= 4) return 'REDUCE REV';
    if (reverseActive && brakePercent > 0) return brakePercent >= 90 ? 'REV + BRAKE 100%' : `REV + BRK ${brakePercent}%`;
    if (totalPressure <= 0.04 && leftInput + rightInput === 0) return state.groundSpoilersActive ? 'GND SPLR' : '';
    if (state.longitudinalAccelerationMS2 < -3.2 && brakePercent <= 4) return 'DECEL';
    if (leftInput && rightInput) return `BRAKE ${brakePercent}%`;
    if (leftInput) return `LEFT BRK ${brakePercent}%`;
    if (rightInput) return `RIGHT BRK ${brakePercent}%`;
    return brakePercent > 0 ? `BRK ${brakePercent}%` : '';
  }

  function publishForceState(forces) {
    state.netForceN = forces.netForceN;
    state.engineThrustN = forces.thrustN;
    state.dragForceN = forces.dragN;
    state.reverseForceN = forces.reverseForceN;
    state.rollingResistanceN = forces.rollingResistanceN;
    state.wheelBrakeForceN = forces.wheelBrakeForceN;
    state.brakeForceN = forces.wheelBrakeForceN;
    state.speedBrakeForceN = forces.speedBrakeForceN;
    state.climbEnergyCostN = forces.climbEnergyN;
    state.diveEnergyGainN = forces.diveEnergyN;
    state.longitudinalAccelerationMS2 = forces.accelerationMS2;
    state.forwardAcceleration = forces.accelerationMS2;
  }

  function publishPhysicsVelocity() {
    const speedMS = Math.max(0, physicsVelocity.length());
    state.physicsSpeedMS = speedMS;
    state.indicatedSpeedMS = speedMS;
    state.currentIAS = speedMS * MS_TO_KT;
    state.groundSpeedKts = Math.hypot(physicsVelocity.x, physicsVelocity.z) * MS_TO_KT;
    state.wheelSpeedKts = state.grounded ? state.groundSpeedKts : 0;
    state.speed = speedMS;
    if (speedMS > 0.001) {
      state.velocityDirection = state.velocityDirection?.isVector3 ? state.velocityDirection : new THREE.Vector3();
      state.velocityDirection.copy(physicsVelocity).divideScalar(speedMS);
    }
    state.speedTrendKts = (state.longitudinalAccelerationMS2 || 0) * 10 * MS_TO_KT;
    publishConfigSpeeds();
  }

  function publishConfigSpeeds() {
    state.vlsKts = vlsForFlapPosition(state.flapPositionIndex || 0);
    state.vfeKts = state.flapVfeKts || null;
    state.vmaxKts = vmaxForConfig(state.flapPositionIndex || 0, state.gearPosition || 0);
    state.selectedSpeedKts = Number.isFinite(state.selectedSpeedKts) ? state.selectedSpeedKts : 250;
  }

  function ensurePhysicsVelocity(wasGrounded) {
    const speedMS = Math.max(Math.abs(state.speed || 0), wasGrounded ? 0 : config.aerodynamics.minAirborneSpeedMS);
    if (physicsVelocity.lengthSq() < 0.01 || !Number.isFinite(physicsVelocity.x + physicsVelocity.y + physicsVelocity.z)) {
      physicsVelocity.copy(attitudeForward).multiplyScalar(speedMS);
      if (wasGrounded) physicsVelocity.y = 0;
    }
  }

  function computeAngleOfAttack() {
    return clamp(state.pitch - flightPathPitch, -16 * DEG_TO_RAD, 32 * DEG_TO_RAD);
  }

  function publishAttitudeDirections() {
    state.forwardDirection = state.forwardDirection?.isVector3 ? state.forwardDirection : new THREE.Vector3();
    state.bodyUpDirection = state.bodyUpDirection?.isVector3 ? state.bodyUpDirection : new THREE.Vector3();
    state.forwardDirection.copy(attitudeForward);
    state.bodyUpDirection.copy(bodyUpDirection);
  }

  function aerodynamicDrag(speedMs, density, cd) {
    return 0.5 * density * speedMs * speedMs * config.dimensions.referenceWingAreaM2 * cd;
  }

  function altitudeThrustScale(altitudeFeet) {
    return clamp(1 - Math.pow(smoothstep(10000, 41000, altitudeFeet), 1.25), 0, 1);
  }

  function activeWorldTravelScale(wasGrounded) {
    const maxTravelScale = Number.isFinite(state.maxTravelScale) ? state.maxTravelScale : MAX_WORLD_TRAVEL_SCALE;
    const requestedScale = wasGrounded
      ? (Number.isFinite(state.groundTravelScale) ? state.groundTravelScale : DEFAULT_GROUND_TRAVEL_SCALE)
      : (Number.isFinite(state.airTravelScale) ? state.airTravelScale : DEFAULT_AIR_TRAVEL_SCALE);
    return clamp(requestedScale, 1, maxTravelScale);
  }

  function smoothPitchInput(rawPitchInput, dt, wasGrounded, trainingLaw) {
    const target = wasGrounded
      ? rawPitchInput
      : rawPitchInput * holdSensitivity(rawPitchInput, 'KeyS', 'KeyW', PITCH_HOLD_SENSITIVITY_RAMP_TIME, MAX_PITCH_HOLD_SENSITIVITY) * (trainingLaw ? 1.08 : 1);
    const rate = Math.abs(target) > Math.abs(smoothedPitchInput) ? 3 : 4;
    smoothedPitchInput = moveToward(smoothedPitchInput, target, rate * dt);
    return smoothedPitchInput;
  }

  function neutralNormalLawPitch(currentIAS) {
    const phase = state.flightPhase || '';
    const targetSpeed = Number.isFinite(state.targetSpeedKts) ? state.targetSpeedKts : config.performance.initialClimbIasKts;
    let targetDeg = 0;
    if (phase === 'TAKEOFF' || phase === 'INITIAL_CLIMB') {
      const accelerationProgress = smoothstep(config.performance.v2Kts + 8, config.performance.initialClimbIasKts, currentIAS);
      targetDeg = THREE.MathUtils.lerp(7.5, 9.5, accelerationProgress);
      if (currentIAS < config.performance.v2Kts + 5) targetDeg = 5.2;
    } else if (phase === 'CLIMB' || phase === 'GO_AROUND') {
      const speedMargin = currentIAS - targetSpeed;
      targetDeg = speedMargin < -18 ? 4.5 : speedMargin > 12 ? 8.2 : 6.4;
    } else if (phase === 'CRUISE') {
      targetDeg = 1.4;
    } else if (phase === 'DESCENT') {
      targetDeg = -1.8;
    } else if (phase === 'APPROACH') {
      targetDeg = 3.2;
    } else if (phase === 'FLARE' || phase === 'LANDING') {
      targetDeg = 2.4;
    }
    if (state.lowEnergy || state.alphaProtActive) targetDeg = Math.min(targetDeg, 2.5);
    if (state.overspeedProtectionActive) targetDeg = Math.max(targetDeg, 3.5);
    return targetDeg * DEG_TO_RAD;
  }

  function holdSensitivity(input, positiveCode, negativeCode, rampTime, maxSensitivity) {
    if (input === 0) return 1;
    const code = input > 0 ? positiveCode : negativeCode;
    const heldFor = keyHoldTimes.get(code) || 0;
    const ramp = smoothstep(HOLD_SENSITIVITY_DELAY, HOLD_SENSITIVITY_DELAY + rampTime, heldFor);
    return 1 + ramp * (maxSensitivity - 1);
  }

  function updateKeyHoldTimes(dt, suppressedCodes = null) {
    for (const code of CONTROL_KEYS) {
      keyHoldTimes.set(code, keys.has(code) && !suppressedCodes?.has(code) ? (keyHoldTimes.get(code) || 0) + dt : 0);
    }
  }

  function moveBrakePressure(current, target, dt) {
    const rate = target > current ? config.brakes.applyRatePerSecond : config.brakes.releaseRatePerSecond;
    return moveToward(current, target, rate * dt);
  }

  function justPressed(code) {
    return keys.has(code) && !previousKeys.has(code);
  }

  function publishPreviousKeys() {
    previousKeys.clear();
    for (const key of keys) previousKeys.add(key);
  }

  function slerpDirection(from, to, alpha) {
    const t = clamp(alpha, 0, 1);
    if (t <= 0) return from.normalize();
    const dot = clamp(from.dot(to), -1, 1);
    if (dot > 0.9995) return from.lerp(to, t).normalize();
    if (dot < -0.9995) return from.lerp(to, Math.min(t, 0.5)).normalize();
    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const fromScale = Math.sin((1 - t) * theta) / sinTheta;
    const toScale = Math.sin(t * theta) / sinTheta;
    return from.multiplyScalar(fromScale).addScaledVector(to, toScale).normalize();
  }

  function radioAltitudeFeet() {
    const ground = terrainHeight(state.position.x, state.position.z) + AIRCRAFT_GROUND_OFFSET;
    return Math.max(0, (state.position.y - ground) * FT_PER_M);
  }

  return { updateAircraft };
}
