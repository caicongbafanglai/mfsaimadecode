  function updateProtectionsAndStall(dt, angleOfAttack, currentIAS, wasGrounded) {
    const aoaDeg = angleOfAttack / DEG_TO_RAD;
    const safeAoA = config.protections.safeAoADeg;
    const alphaProt = config.protections.alphaProtAoADeg;
    const criticalAoA = config.protections.criticalAoADeg;
    const alphaMax = config.protections.alphaMaxAoADeg;
    const normalLaw = state.lawMode !== STALL_TRAINING;
    const lowSpeedRisk = 1 - smoothstep(state.stallSpeedKts, state.stallSpeedKts + 30, currentIAS);
    const aoaRisk = smoothstep(safeAoA, criticalAoA, aoaDeg);
    const recoveryReady = currentIAS > state.stallSpeedKts + 25 && aoaDeg < safeAoA;
    const stallCondition = !wasGrounded && currentIAS < state.stallSpeedKts && aoaDeg > criticalAoA;
    const targetStall = !normalLaw && !recoveryReady ? Math.max(lowSpeedRisk * aoaRisk, stallCondition ? 0.75 : 0) : 0;
    stallFactor = THREE.MathUtils.damp(stallFactor, targetStall, targetStall > stallFactor ? 1.55 : 1.2, dt);
    if (normalLaw) stallFactor = THREE.MathUtils.damp(stallFactor, 0, 3.6, dt);
    state.angleOfAttack = angleOfAttack;
    state.angleOfAttackDeg = aoaDeg;
    state.flightPathPitch = flightPathPitch;
    state.stallFactor = stallFactor;
    state.alphaProtActive = normalLaw && aoaDeg >= alphaProt * 0.96;
    state.alphaMaxActive = normalLaw && aoaDeg >= alphaMax * 0.98;
    state.overspeedProtectionActive = normalLaw && currentIAS > config.performance.vmoKts;
    state.lowEnergy = !wasGrounded && currentIAS < state.vlsKts + 15 && aoaDeg > safeAoA * 0.8;
    const speedAuthority = clamp(currentIAS / 210, 0.25, 1);
    const alphaSoftening = state.alphaProtActive ? 0.68 : 1;
    const stallSoftening = 1 - stallFactor * (normalLaw ? 0.3 : 0.52);
    state.controlAuthority = clamp(speedAuthority * alphaSoftening * stallSoftening, 0.25, 1);
  }

  function updateGroundVelocity(dt, currentIAS, altitudeFeet) {
    const speedMs = Math.max(0, physicsVelocity.length());
    const groundSpeedKts = speedMs * MS_TO_KT;
    const parkingBrakeState = updateParkingBrakeState(true, groundSpeedKts);
    if (parkingBrakeState.locked) {
      publishForceState({
        netForceN: 0,
        thrustN: 0,
        dragN: 0,
        reverseForceN: 0,
        rollingResistanceN: 0,
        wheelBrakeForceN: 0,
        parkingBrakeForceN: massKg * PARK_BRAKE_LOW_SPEED_DECEL_MS2,
        speedBrakeForceN: 0,
        climbEnergyN: 0,
        diveEnergyN: 0,
        accelerationMS2: 0
      });
      return;
    }

    const density = airDensityForAltitude(altitudeFeet, config);
    const flap = state.flapConfig || flapConfigAt(state.flapPositionIndex);
    const speedBrake = speedBrakeEffect(currentIAS);
    const groundSpoiler = state.groundSpoilerPosition || 0;
    const cdTotal = config.aerodynamics.cdGroundBase +
      flap.dragAdder +
      config.gear.dragAdder * (state.gearPosition || 0) +
      speedBrake.cdAdder +
      config.groundSpoilers.dragAdder * groundSpoiler;
    const dragN = aerodynamicDrag(speedMs, density, cdTotal);
    const rollingResistanceN = massKg * GRAVITY * config.brakes.rollingResistanceCoefficient;
    const thrustN = thrustFromN1(state.engineN1Average || config.engines.idleN1, config);
    const reverseForceN = reverseForce(currentIAS);
    const wheelBrakeForceN = wheelBrakeForce(currentIAS);
    const forwardThrustN = state.reverse > 0.02 ? 0 : thrustN;
    const groundAccelerationThrustN = parkingBrakeState.active ? 0 : forwardThrustN;
    const parkingBrakeForceN = parkingBrakeState.active ? massKg * parkingBrakeState.decelerationMS2 : 0;
    let netForceN = groundAccelerationThrustN - dragN - rollingResistanceN - reverseForceN - wheelBrakeForceN - parkingBrakeForceN;
    if (netForceN < 0) {
      const limitedDecel = Math.min(-netForceN / massKg, config.brakes.maxTotalGroundDecelerationMS2);
      netForceN = -limitedDecel * massKg;
    }
    let nextSpeed = speedMs + (netForceN / massKg) * dt;
    if (nextSpeed < 0.25 && netForceN <= 0) nextSpeed = 0;
    if (parkingBrakeState.active && nextSpeed * MS_TO_KT < PARK_BRAKE_LOCK_KTS) nextSpeed = 0;
    groundForward.set(0, 0, -1).applyEuler(new THREE.Euler(0, state.yaw, 0, 'YXZ')).normalize();
    physicsVelocity.copy(groundForward).multiplyScalar(clamp(nextSpeed, 0, ktToMS(410)));
    physicsVelocity.y = 0;
    if (parkingBrakeState.active && nextSpeed <= 0) lockAircraftOnGround();

    const rotateReady = currentIAS >= config.performance.vrKts && state.pitch > 4 * DEG_TO_RAD;
    const liftRatio = Math.pow(Math.max(nextSpeed, 1) / ktToMS(flap.stallSpeedKts), 2) * flap.liftMultiplier * (1 - groundSpoiler * config.groundSpoilers.liftLoss);
    if (!parkingBrakeState.active && rotateReady && liftRatio > 0.96 && state.gearPosition > 0.45) {
      physicsVelocity.y = Math.max(1.5, (liftRatio - 0.88) * 6.5 + state.pitch * 12);
    }

    publishForceState({
      netForceN,
      thrustN: groundAccelerationThrustN,
      dragN,
      reverseForceN,
      rollingResistanceN,
      wheelBrakeForceN,
      parkingBrakeForceN,
      speedBrakeForceN: speedBrake.forceN,
      climbEnergyN: 0,
      diveEnergyN: 0,
      accelerationMS2: netForceN / massKg
    });
  }

  function updateAirVelocity(dt, currentIAS, altitudeFeet, angleOfAttack) {
    updateParkingBrakeState(false, 0);
    let speedMs = Math.max(physicsVelocity.length(), config.aerodynamics.minAirborneSpeedMS);
    velocityDirection.copy(physicsVelocity).normalize();
    if (velocityDirection.lengthSq() < 0.5) velocityDirection.copy(attitudeForward);

    const density = airDensityForAltitude(altitudeFeet, config);
    const flap = state.flapConfig || flapConfigAt(state.flapPositionIndex);
    const speedBrake = speedBrakeEffect(currentIAS);
    const aoaDeg = Math.abs(angleOfAttack / DEG_TO_RAD);
    const inducedDrag = config.aerodynamics.inducedDragScale * Math.pow(aoaDeg / config.protections.criticalAoADeg, 2);
    const maneuverDrag = Math.abs(state.roll) * 0.018 + Math.abs(state.controlInputPitch || 0) * 0.014 + stallFactor * 0.16;
    const cdTotal = config.aerodynamics.cdClean +
      flap.dragAdder +
      config.gear.dragAdder * (state.gearPosition || 0) +
      speedBrake.cdAdder +
      inducedDrag +
      maneuverDrag;
    const dragN = aerodynamicDrag(speedMs, density, cdTotal);
    const thrustN = thrustFromN1(state.engineN1Average || config.engines.idleN1, config) * altitudeThrustScale(altitudeFeet);
    const thrustAlongPathN = thrustN * clamp(attitudeForward.dot(velocityDirection), 0, 1);
    const climbFactor = clamp(velocityDirection.y, 0, 1);
    const diveFactor = clamp(-velocityDirection.y, 0, 1);
    const climbEnergyN = massKg * GRAVITY * climbFactor * config.aerodynamics.climbEnergyScale;
    const diveEnergyN = massKg * GRAVITY * diveFactor * config.aerodynamics.diveEnergyScale;
    const netForceN = thrustAlongPathN - dragN - speedBrake.forceN - climbEnergyN + diveEnergyN;
    const accelerationMS2 = netForceN / massKg;

    physicsVelocity.addScaledVector(velocityDirection, accelerationMS2 * dt);
    speedMs = Math.max(physicsVelocity.length(), config.aerodynamics.minAirborneSpeedMS);
    velocityDirection.copy(physicsVelocity).normalize();
    applyLiftAndGravity(dt, speedMs, density, flap, angleOfAttack, speedBrake);
    alignVelocityWithAttitude(dt);

    const maxSpeed = ktToMS(config.aerodynamics.maxDiveGameKts);
    const nextSpeed = clamp(physicsVelocity.length(), config.aerodynamics.minAirborneSpeedMS, maxSpeed);
    physicsVelocity.normalize().multiplyScalar(nextSpeed);
    publishForceState({
      netForceN,
      thrustN,
      dragN,
      reverseForceN: 0,
      rollingResistanceN: 0,
      wheelBrakeForceN: 0,
      speedBrakeForceN: speedBrake.forceN,
      climbEnergyN,
      diveEnergyN,
      accelerationMS2
    });
  }

  function applyLiftAndGravity(dt, speedMs, density, flap, angleOfAttack, speedBrake) {
    const liftProjection = bodyUpDirection.dot(velocityDirection);
    liftDirection.copy(bodyUpDirection).addScaledVector(velocityDirection, -liftProjection);
    if (liftDirection.lengthSq() < 0.001) liftDirection.set(0, 1, 0);
    liftDirection.normalize();
    const stallSpeedMS = ktToMS(flap.stallSpeedKts);
    const speedLiftFactor = clamp(Math.pow(speedMs / Math.max(stallSpeedMS, 1), 2), 0, 1.55);
    const positiveAoA = clamp((angleOfAttack + 4 * DEG_TO_RAD) / ((config.protections.safeAoADeg + 4) * DEG_TO_RAD), 0.05, 1.25);
    const alphaLiftLoss = smoothstep(config.protections.alphaProtAoADeg, config.protections.alphaMaxAoADeg * 1.1, Math.max(0, angleOfAttack / DEG_TO_RAD)) * 0.45;
    const bankLiftLoss = Math.abs(state.roll) * 0.16;
    const speedBrakeLiftLoss = speedBrake.position * config.speedBrake.liftLoss;
    const groundSpoilerLiftLoss = (state.groundSpoilerPosition || 0) * config.groundSpoilers.liftLoss;
    const liftFactor = speedLiftFactor * positiveAoA * flap.liftMultiplier *
      (1 - stallFactor * 0.88) *
      (1 - alphaLiftLoss) *
      (1 - bankLiftLoss) *
      (1 - speedBrakeLiftLoss) *
      (1 - groundSpoilerLiftLoss);
    const liftAcceleration = clamp(GRAVITY * liftFactor, 0, config.aerodynamics.maxLiftAccelerationMS2);
    lateralAcceleration.set(0, -GRAVITY, 0).addScaledVector(liftDirection, liftAcceleration);
    const alongPath = lateralAcceleration.dot(velocityDirection);
    lateralAcceleration.addScaledVector(velocityDirection, -alongPath);
    physicsVelocity.addScaledVector(lateralAcceleration, dt);
    state.liftAccelerationMS2 = liftAcceleration;
    state.liftDirection = state.liftDirection?.isVector3 ? state.liftDirection : new THREE.Vector3();
    state.liftDirection.copy(liftDirection);
  }

  function alignVelocityWithAttitude(dt) {
    const speedMs = Math.max(physicsVelocity.length(), config.aerodynamics.minAirborneSpeedMS);
    velocityDirection.copy(physicsVelocity).normalize();
    const alignmentRate = THREE.MathUtils.lerp(0.65, 1.75, smoothstep(120, 300, speedMs * MS_TO_KT));
    const alphaSeparation = smoothstep(config.protections.safeAoADeg, config.protections.criticalAoADeg * 1.45, Math.abs(state.angleOfAttackDeg || 0));
    const authority = clamp(state.controlAuthority || 0.5, 0.08, 1.2);
    slerpDirection(velocityDirection, attitudeForward, clamp(alignmentRate * authority * (1 - stallFactor * 0.82) * (1 - alphaSeparation * 0.45) * dt, 0, 0.38));
    physicsVelocity.copy(velocityDirection).multiplyScalar(speedMs);
  }

  function updateWorldPosition(dt, wasGrounded) {
    if (state.parkingBrake && state.isParked && wasGrounded && state.mainGearCompressed !== false) {
      lockAircraftOnGround();
      state.worldTravelScale = 0;
      state.visualMapSpeed = 0;
      state.visualPosition.copy(state.position);
      return;
    }

    const activeTravelScale = activeWorldTravelScale(wasGrounded);
    worldVelocity.copy(physicsVelocity);
    worldVelocity.x *= activeTravelScale;
    worldVelocity.z *= activeTravelScale;
    state.worldTravelScale = activeTravelScale;
    state.visualMapSpeed = Math.hypot(worldVelocity.x, worldVelocity.z);
    state.position.addScaledVector(worldVelocity, dt);
    state.visualPosition.copy(state.position);
  }

  function updateParkingBrakeState(groundEffective, groundSpeedKts) {
    state.parkingBrakePressure = state.parkingBrake ? 1 : 0;
    if (!state.parkingBrake) {
      state.isParked = false;
      state.preventGroundMovement = false;
      state.parkBrakeWarning = false;
      state.parkBrakeWarningText = '';
      state.parkBrakeStatusText = '';
      state._parkBrakeThrustConflict = false;
      return { active: false, locked: false, decelerationMS2: 0 };
    }

    const active = groundEffective && state.grounded === true && state.mainGearCompressed !== false;
    state.parkBrakeStatusText = state.isParked ? 'PARKED' : 'PARK BRK';
    if (!active) {
      state.isParked = false;
      state.preventGroundMovement = false;
      state.parkBrakeWarning = false;
      state.parkBrakeWarningText = '';
      state.parkBrakeStatusText = 'PARK BRK';
      state._parkBrakeThrustConflict = false;
      return { active: false, locked: false, decelerationMS2: 0 };
    }

    const thrustConflict = parkingBrakeThrustDemanded();
    state.parkBrakeWarning = true;
    state.parkBrakeStatusText = thrustConflict ? 'PARK BRK ON' : (state.isParked ? 'PARKED' : 'PARK BRK');
    state.parkBrakeWarningText = thrustConflict ? 'RELEASE PARKING BRAKE' : '';
    if (thrustConflict && !state._parkBrakeThrustConflict) state.audioCue = 'PARK BRK ON';
    state._parkBrakeThrustConflict = thrustConflict;

    if (state.isParked || groundSpeedKts < PARK_BRAKE_LOCK_KTS) {
      lockAircraftOnGround();
      state.parkBrakeStatusText = thrustConflict ? 'PARK BRK ON' : 'PARKED';
      return { active: true, locked: true, decelerationMS2: PARK_BRAKE_LOW_SPEED_DECEL_MS2 };
    }

    return {
      active: true,
      locked: false,
      decelerationMS2: parkingBrakeDecelerationForSpeed(groundSpeedKts)
    };
  }

  function parkingBrakeDecelerationForSpeed(groundSpeedKts) {
    if (groundSpeedKts > PARK_BRAKE_HIGH_SPEED_KTS) return PARK_BRAKE_HIGH_SPEED_DECEL_MS2;
    if (groundSpeedKts > PARK_BRAKE_LOW_SPEED_KTS) return PARK_BRAKE_MID_SPEED_DECEL_MS2;
    return PARK_BRAKE_LOW_SPEED_DECEL_MS2;
  }

  function parkingBrakeThrustDemanded() {
    const leverPosition = Math.max(
      finiteLeverPosition(state.thrustLeverLeft),
      finiteLeverPosition(state.thrustLeverRight),
      finiteLeverPosition(state.targetThrustLeverLeft),
      finiteLeverPosition(state.targetThrustLeverRight),
      finiteLeverPosition(state.leverPosition),
      finiteLeverPosition(state.targetLeverPosition),
      finiteLeverPosition(state.throttle)
    );
    const n1 = Math.max(
      Number.isFinite(state.engineN1Average) ? state.engineN1Average : config.engines.idleN1,
      Number.isFinite(state.targetN1Average) ? state.targetN1Average : config.engines.idleN1
    );
    return leverPosition > PARK_BRAKE_IDLE_LEVER_THRESHOLD || n1 > config.engines.idleN1 + PARK_BRAKE_IDLE_N1_MARGIN;
  }

  function finiteLeverPosition(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function applyParkingBrakeLock() {
    if (!state.parkingBrake || !state.isParked || state.grounded !== true || state.mainGearCompressed === false) return;
    lockAircraftOnGround();
  }

  function lockAircraftOnGround() {
    const verticalY = Number.isFinite(physicsVelocity.y) ? physicsVelocity.y : 0;
    physicsVelocity.x = 0;
    physicsVelocity.z = 0;
    physicsVelocity.y = verticalY;
    worldVelocity.x = 0;
    worldVelocity.z = 0;
    if (state.velocity?.isVector3 && state.velocity !== physicsVelocity) {
      const velocityY = Number.isFinite(state.velocity.y) ? state.velocity.y : 0;
      state.velocity.x = 0;
      state.velocity.z = 0;
      state.velocity.y = velocityY;
    }
    if (state.horizontalVelocity?.isVector3) {
      state.horizontalVelocity.x = 0;
      state.horizontalVelocity.z = 0;
    }
    if (state.groundVelocity?.isVector3) {
      state.groundVelocity.x = 0;
      state.groundVelocity.z = 0;
    }
    if (state.worldVelocity?.isVector3) {
      state.worldVelocity.x = 0;
      state.worldVelocity.z = 0;
    }
    state.groundSpeedKts = 0;
    state.wheelSpeedKts = 0;
    state.visualMapSpeed = 0;
    state.physicsSpeedMS = Math.abs(verticalY);
    state.indicatedSpeedMS = Math.abs(verticalY);
    state.speed = Math.abs(verticalY);
    state.isParked = true;
    state.preventGroundMovement = true;
  }

  function resolveGroundContact(dt) {
    const ground = terrainHeight(state.position.x, state.position.z) + AIRCRAFT_GROUND_OFFSET;
    if (state.position.y <= ground) {
      state.position.y = ground;
      state.grounded = true;
      state.mainGearCompressed = state.gearPosition > 0.75;
      physicsVelocity.y = Math.max(0, physicsVelocity.y);
      const iasKts = physicsVelocity.length() * MS_TO_KT;
      const rotating = iasKts >= config.performance.vrKts - 5 && (state.controlInputPitch || 0) > 0.05;
      if (!rotating) state.pitch = THREE.MathUtils.damp(state.pitch, 0, 5.5, dt);
      else state.pitch = clamp(state.pitch, 0, 12 * DEG_TO_RAD);
      state.roll = THREE.MathUtils.damp(state.roll, 0, 7, dt);
    } else {
      state.grounded = false;
      state.mainGearCompressed = false;
    }
    state.reverseAllowed = state.grounded && state.mainGearCompressed;
  }

  function updateWarnings(currentIAS) {
    const normalLaw = state.lawMode !== STALL_TRAINING;
    let warning = '';
    if (state.flapWarning) warning = state.flapWarning;
    else if (currentIAS > state.vmaxKts + 1) warning = state.flapVfeKts && currentIAS > state.flapVfeKts ? 'FLAP OVERSPEED' : 'OVERSPEED';
    else if (state.gearWarning) warning = state.gearWarning;
    else if (!normalLaw && stallFactor > 0.55) warning = 'STALL';
    else if (!normalLaw && stallFactor > 0.18 && flightPathPitch < -5 * DEG_TO_RAD) warning = 'DIVE RECOVERY';
    else if (state.alphaMaxActive) warning = 'ALPHA MAX';
    else if (state.alphaProtActive) warning = 'ALPHA PROT';
    else if (state.lowEnergy) warning = 'LOW ENERGY';
    else if (state.speedBrakeCaution) warning = state.speedBrakeCaution;
    state.flightWarning = warning;
  }

  function updateModel(model, dt) {
    if (!model?.group) return;
    collectMechanisms(model.group);
    const rotating = state.grounded && (state.currentIAS || 0) >= config.performance.vrKts - 5 && (state.pitch || 0) > 0;
    const displayPitch = state.grounded && !rotating ? 0 : state.pitch;
    const displayRoll = state.grounded ? 0 : state.roll;
    model.group.position.copy(state.position);
    model.group.rotation.set(displayPitch, state.yaw, displayRoll, 'YXZ');
    updateControlSurfaces(model, dt);
    animateMechanisms(model, dt);
    if (model.fans) {
      const fanSpeed = 16 + (state.engineN1Average || 22) * 1.1 + (state.physicsSpeedMS || 0) * 0.24;
      for (const fan of model.fans) fan.rotation.z += fanSpeed * dt;
    }
  }

  function updateControlSurfaces(model, dt) {
    if (!model.controlSurfaces) return;
    const { aileronLeft, aileronRight, elevator, rudder } = model.controlSurfaces;
    const turnInput = state.controlInputRoll || 0;
    const pitchInput = state.controlInputPitch || 0;
    if (aileronLeft && aileronRight) {
      aileronLeft.rotation.x = THREE.MathUtils.damp(aileronLeft.rotation.x, turnInput * 0.28, 12, dt);
      aileronRight.rotation.x = THREE.MathUtils.damp(aileronRight.rotation.x, -turnInput * 0.28, 12, dt);
    }
    if (elevator) elevator.rotation.x = THREE.MathUtils.damp(elevator.rotation.x, -pitchInput * 0.26, 12, dt);
    if (rudder) rudder.rotation.y = THREE.MathUtils.damp(rudder.rotation.y, -turnInput * (state.grounded ? 0.46 : 0.18), 10, dt);
  }

  function collectMechanisms(root) {
    if (mechanisms.collected) return;
    root.traverse(object => {
      if (/flap/i.test(object.name)) mechanisms.flaps.push(object);
      if (/spoiler_panel/i.test(object.name)) mechanisms.spoilers.push(object);
      if (/landing_gear|main_gear|nose_gear/i.test(object.name) && object.isGroup) mechanisms.gears.push(object);
    });
    mechanisms.collected = true;
  }

  function animateMechanisms(model, dt) {
    const hasDetailedHighLift = Boolean(model?.highLiftSurfaces);
    if (hasDetailedHighLift) animateHighLiftSurfaces(model.highLiftSurfaces, dt);
    else {
      const flapAmount = clamp((state.flapPositionIndex || 0) / (config.flaps.length - 1), 0, 1);
      for (const flap of mechanisms.flaps) flap.rotation.x = THREE.MathUtils.damp(flap.rotation.x, -flapAmount * 0.48, 8, dt);
      const spoilerAmount = Math.max(state.speedBrakePosition || 0, state.groundSpoilerPosition || 0);
      for (const spoiler of mechanisms.spoilers) spoiler.rotation.x = THREE.MathUtils.damp(spoiler.rotation.x, -spoilerAmount * 0.55, 10, dt);
    }
    for (const gear of mechanisms.gears) gear.visible = (state.gearPosition || 0) > 0.04;
  }

  function animateHighLiftSurfaces(surfaces, dt) {
    const slatAmount = clamp(state.actualSlatPosition || 0, 0, 1), flapAmount = clamp(state.actualFlapPosition || 0, 0, 1);
    const airSpoilerAmount = clamp(state.actualSpeedBrakePosition || state.speedBrakePosition || 0, 0, 1), groundSpoilerAmount = clamp(state.actualGroundSpoilerPosition || state.groundSpoilerPosition || 0, 0, 1);
    const airSpoilers = new Set(surfaces.speedBrakeSpoilers || []);
    for (const slat of surfaces.slats || []) {
      const data = highLiftData(slat);
      slat.position.copy(data.basePosition).addScaledVector(Z_AXIS, (data.extendZ || 0) * slatAmount).addScaledVector(Y_AXIS, (data.dropY || 0) * slatAmount);
      slat.rotation.x = THREE.MathUtils.damp(slat.rotation.x, -(data.angle || 0.16) * slatAmount, 7, dt);
    }
    for (const flap of surfaces.flaps || []) {
      const data = highLiftData(flap);
      flap.position.copy(data.basePosition).addScaledVector(Z_AXIS, (data.slideZ || 0) * flapAmount).addScaledVector(Y_AXIS, (data.dropY || 0) * flapAmount);
      flap.rotation.x = THREE.MathUtils.damp(flap.rotation.x, -(data.angle || 0.48) * flapAmount, 7, dt);
    }
    for (const spoiler of surfaces.groundSpoilers || []) {
      const data = highLiftData(spoiler);
      const airAmount = airSpoilers.has(spoiler) ? airSpoilerAmount : 0;
      const airAngle = (data.airAngle ?? -config.speedBrake.visualAngleDeg * DEG_TO_RAD) * airAmount * (1 - groundSpoilerAmount);
      const groundAngle = (data.groundAngle ?? -config.groundSpoilers.visualAngleDeg * DEG_TO_RAD) * groundSpoilerAmount;
      spoiler.rotation.x = THREE.MathUtils.damp(spoiler.rotation.x, airAngle + groundAngle, 10, dt);
    }
  }

  function highLiftData(surface) {
    surface.userData.highLift = surface.userData.highLift || {};
    const data = surface.userData.highLift;
    if (!data.basePosition) data.basePosition = surface.position.clone();
    return data;
  }
