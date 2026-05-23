    const snapped = distance < DETENT_SNAP_RADIUS;
    const currentDetent = snapped ? nearest.name : 'BETWEEN';
    const effectiveDetent = effectiveDetentForPosition(position, allowReverse);
    const reverseLevel = reverseLevelFromLeverPosition(position, allowReverse);
    const n1 = n1FromLeverPosition(position, radioAltFt, allowReverse);
    return {
      sideName,
      position,
      targetPosition,
      nearest,
      distance,
      currentDetent,
      isBetween: !snapped,
      betweenLabel: snapped ? nearest.label : betweenDetentLabel(position, allowReverse),
      softDetent: distance < DETENT_SOFT_ZONE ? nearest.name : '',
      effectiveDetent,
      reverseLevel,
      n1,
      limitN1: n1,
      percent: displayLeverPercent(position),
      reversePercent: Math.round(reverseLevel * 100)
    };
  }

  function publishLeverState(leftProfile, rightProfile) {
    state.currentDetentLeft = leftProfile.currentDetent;
    state.currentDetentRight = rightProfile.currentDetent;
    state.nearestDetentLeft = leftProfile.nearest.name;
    state.nearestDetentRight = rightProfile.nearest.name;
    state.isBetweenDetentsLeft = leftProfile.isBetween;
    state.isBetweenDetentsRight = rightProfile.isBetween;
    state.thrustDetentLeft = leftProfile.currentDetent === 'BETWEEN' ? leftProfile.effectiveDetent : leftProfile.currentDetent;
    state.thrustDetentRight = rightProfile.currentDetent === 'BETWEEN' ? rightProfile.effectiveDetent : rightProfile.currentDetent;
    state.commandedThrustDetentLeft = leftProfile.effectiveDetent;
    state.commandedThrustDetentRight = rightProfile.effectiveDetent;
    state.targetThrustDetentLeft = nearestAllowedDetent(leftProfile.targetPosition, state.reverseAllowed).name;
    state.targetThrustDetentRight = nearestAllowedDetent(rightProfile.targetPosition, state.reverseAllowed).name;
    state.softDetentLeft = leftProfile.softDetent;
    state.softDetentRight = rightProfile.softDetent;
    state.leverPosition = (leftProfile.position + rightProfile.position) * 0.5;
    state.targetLeverPosition = (leftProfile.targetPosition + rightProfile.targetPosition) * 0.5;
    state.nearestDetent = nearestAllowedDetent(state.leverPosition, state.reverseAllowed).name;
    state.currentDetent = leftProfile.currentDetent === rightProfile.currentDetent ? leftProfile.currentDetent : 'LVR ASYM';
    state.isBetweenDetents = leftProfile.isBetween || rightProfile.isBetween;
    state.manualFineTune = state.isBetweenDetents || hadKeyboardThrottleInput || releaseSnapTimer > 0;
    state.leverPercent = displayLeverPercent(state.leverPosition);
    state.leverDetentLabel = leverLabelForProfiles(leftProfile, rightProfile);
    state.leverDetentDetail = detentDetailForProfiles(leftProfile, rightProfile);
    state.throttleDetent = state.currentDetent;
  }

  function updateFlightPhase(currentIas, radioAltFt, leftProfile, rightProfile, reverseActive) {
    const previous = state.flightPhase || 'PREFLIGHT';
    const highestPosition = Math.max(leftProfile.position, rightProfile.position);
    const leverName = effectiveDetentForPosition(highestPosition, state.reverseAllowed);
    const takeoffClimbState = ['TAKEOFF', 'INITIAL_CLIMB', 'CLIMB', 'GO_AROUND'].includes(previous);
    if (state.grounded && (reverseActive || ['FLARE', 'APPROACH', 'DESCENT', 'ROLLOUT'].includes(previous)) && currentIas > 5) {
      state.flightPhase = 'ROLLOUT';
    } else if (state.grounded && highestPosition >= detentByName('FLX_MCT').position - 0.035 && previous !== 'ROLLOUT') {
      state.flightPhase = 'TAKEOFF';
      if (takeoffReferenceAltFt === null) takeoffReferenceAltFt = radioAltFt;
    } else if (state.grounded && currentIas < 20 && !['TAKEOFF', 'ROLLOUT'].includes(previous)) {
      state.flightPhase = 'PREFLIGHT';
      takeoffReferenceAltFt = null;
    } else if (state.grounded && currentIas > 40 && previous !== 'ROLLOUT') {
      state.flightPhase = 'TAKEOFF';
      if (takeoffReferenceAltFt === null) takeoffReferenceAltFt = radioAltFt;
    } else if (!state.grounded && ['TAKEOFF', 'PREFLIGHT'].includes(previous)) {
      state.flightPhase = 'INITIAL_CLIMB';
      if (takeoffReferenceAltFt === null) takeoffReferenceAltFt = 0;
    } else if (!state.grounded && previous === 'INITIAL_CLIMB' && radioAltFt >= THRUST_REDUCTION_ALTITUDE_FT) {
      state.flightPhase = 'CLIMB';
    } else if (!state.grounded && leverName === 'TOGA' && ['APPROACH', 'FLARE'].includes(previous)) {
      state.flightPhase = 'GO_AROUND';
    } else if (!state.grounded && !takeoffClimbState && radioAltFt < 35 && currentIas < 180) {
      state.flightPhase = 'FLARE';
    } else if (!state.grounded && !takeoffClimbState && radioAltFt < 2500 && currentIas < 190) {
      state.flightPhase = 'APPROACH';
    } else if (!state.grounded && !takeoffClimbState && state.verticalSpeed < -600 && currentIas > 180) {
      state.flightPhase = 'DESCENT';
    } else if (!state.grounded && radioAltFt > 18000 && Math.abs(state.verticalSpeed) < 700) {
      state.flightPhase = 'CRUISE';
    } else if (!state.grounded && ['CLIMB', 'INITIAL_CLIMB', 'GO_AROUND'].includes(previous)) {
      state.flightPhase = previous === 'GO_AROUND' && radioAltFt >= THRUST_REDUCTION_ALTITUDE_FT ? 'CLIMB' : previous;
    } else if (state.grounded && ['FLARE', 'APPROACH', 'DESCENT'].includes(previous)) {
      state.flightPhase = 'ROLLOUT';
    }
    state.managedSpeedKts = managedSpeedForPhase(state.flightPhase, radioAltFt);
    state.targetSpeedKts = state.speedMode === 'SELECTED' ? state.selectedSpeedKts : state.managedSpeedKts;
    state.fmaVerticalMode = ['DESCENT', 'APPROACH', 'FLARE'].includes(state.flightPhase) ? 'DES' : state.flightPhase === 'CRUISE' ? 'ALT' : 'OP CLB';
    state.fmaLateralMode = 'HDG';
  }

  function updateAutoThrustState(currentIas, radioAltFt, leftProfile, rightProfile, reverseActive) {
    const averagePosition = (leftProfile.position + rightProfile.position) * 0.5;
    const asymmetric = Math.abs(leftProfile.position - rightProfile.position) > 0.035;
    const clPosition = detentByName('CL').position;
    const nearCl = Math.abs(averagePosition - clPosition) <= CL_ACTIVE_RADIUS && !asymmetric;
    const belowCl = averagePosition < clPosition - CL_ACTIVE_RADIUS;
    const aboveCl = averagePosition > clPosition + CL_HIGH_OVERRIDE_MARGIN;
    const lowEnergyHighAoa =
      state.lawMode === 'NORMAL_LAW' &&
      state.autoThrustArmed &&
      (state.angleOfAttack > ALPHA_MAX_AOA_RAD * 0.9 || (state.angleOfAttack > SAFE_AOA_RAD && currentIas < APPROACH_VLS_KT + 18));
    if (lowEnergyHighAoa && !reverseActive) {
      state.alphaFloorActive = true;
      state.togaLockActive = false;
      state.autoThrustActive = true;
    }
    if (state.alphaFloorActive && state.angleOfAttack < SAFE_AOA_RAD && currentIas > APPROACH_VLS_KT + 20) {
      state.alphaFloorActive = false;
      state.togaLockActive = true;
      state.autoThrustActive = true;
    }

    const canAutoThrust = state.autoThrustArmed && !reverseActive && !state.grounded && !aboveCl && averagePosition >= -0.005;
    state.autoThrustActive = state.alphaFloorActive || state.togaLockActive || (canAutoThrust && (nearCl || belowCl));

    if (reverseActive) {
      state.fmaThrustMode = 'REV';
    } else if (state.alphaFloorActive) {
      state.fmaThrustMode = 'A.FLOOR';
    } else if (state.togaLockActive) {
      state.fmaThrustMode = 'TOGA LK';
    } else if (aboveCl) {
      state.autoThrustActive = false;
      state.fmaThrustMode = manualModeForPosition(averagePosition, state.flightPhase);
    } else if (state.flightPhase === 'FLARE' && radioAltFt <= 35 && averagePosition > 0.02) {
      state.fmaThrustMode = 'RETARD';
    } else if (['INITIAL_CLIMB', 'CLIMB', 'GO_AROUND'].includes(state.flightPhase) && averagePosition >= detentByName('FLX_MCT').position - 0.035 && radioAltFt >= THRUST_REDUCTION_ALTITUDE_FT) {
      state.fmaThrustMode = 'LVR CLB';
    } else if (!state.autoThrustActive) {
      state.fmaThrustMode = nearCl && state.autoThrustArmed ? 'A/THR ARM' : manualModeForPosition(averagePosition, state.flightPhase);
    }
  }

  function targetN1ForSide(profile, currentIas, radioAltFt) {
    if (profile.reverseLevel > 0) {
      return state.reverseAllowed ? profile.n1 : IDLE_N1;
    }

    if (state.alphaFloorActive || state.togaLockActive) return TOGA_N1;
    if (!state.autoThrustActive) return profile.n1;

    const idle = idleForPhase(radioAltFt);
    const clPosition = detentByName('CL').position;
    const thrustLimit = profile.position < clPosition - CL_ACTIVE_RADIUS ? profile.n1 : CLIMB_N1;
    const speedError = state.targetSpeedKts - currentIas;
    const verticalEnergy = THREE.MathUtils.clamp((900 - state.verticalSpeed) / 900, -0.45, 0.85);
    const pitchEnergy = THREE.MathUtils.clamp((state.pitch * 180 / Math.PI - 4) / 14, -0.3, 1);
    let desired = idle + 32 + speedError * 0.55 + verticalEnergy * 7 + pitchEnergy * 8;
    if (currentIas > state.targetSpeedKts + 12 || state.flightPhase === 'DESCENT') desired = Math.min(desired, idle + 3);
    const limitedByLever = desired > thrustLimit - 0.8;
    desired = THREE.MathUtils.clamp(desired, idle, thrustLimit);
    if (currentIas > MAX_OPERATING_KT) state.fmaThrustMode = 'OVERSPEED';
    else if (profile.position < clPosition - CL_ACTIVE_RADIUS && limitedByLever) state.fmaThrustMode = 'LVR CLB';
    else if (desired <= idle + 2) state.fmaThrustMode = 'THR IDLE';
    else if (state.flightPhase === 'CLIMB' && desired > idle + 20) state.fmaThrustMode = 'THR CLB';
    else state.fmaThrustMode = 'SPEED';
    return desired;
  }

  function n1FromLeverPosition(position, radioAltFt, allowReverse) {
    const pos = clampAllowedLeverPosition(position, allowReverse);
    if (pos < 0) return reverseN1FromLeverPosition(pos, allowReverse);
    const idle = idleForPhase(radioAltFt);
    if (pos < detentByName('CL').position) {
      return THREE.MathUtils.lerp(idle, CLIMB_N1, smoothstepNumber(0, detentByName('CL').position, pos));
    }
    if (pos < detentByName('FLX_MCT').position) {
      const upper = state.flightPhase === 'TAKEOFF' ? FLEX_N1 : MCT_N1;
      return THREE.MathUtils.lerp(CLIMB_N1, upper, smoothstepNumber(detentByName('CL').position, detentByName('FLX_MCT').position, pos));
    }
    const flexOrMct = state.flightPhase === 'TAKEOFF' ? FLEX_N1 : MCT_N1;
    return THREE.MathUtils.lerp(flexOrMct, TOGA_N1, smoothstepNumber(detentByName('FLX_MCT').position, detentByName('TOGA').position, pos));
  }

  function reverseN1FromLeverPosition(position, allowReverse) {
    if (!allowReverse) return IDLE_N1;
    const reverseLevel = reverseLevelFromLeverPosition(position, allowReverse);
    if (reverseLevel <= 0) return IDLE_N1;
    return THREE.MathUtils.lerp(REVERSE_IDLE_N1, MAX_REVERSE_N1, smoothstepNumber(0.05, 1, reverseLevel));
  }

  function reverseLevelFromLeverPosition(position, allowReverse) {
    if (!allowReverse || position >= 0) return 0;
    return THREE.MathUtils.clamp((0 - position) / (0 - LEVER_MIN), 0, 1);
  }

  function manualModeForPosition(position, phase) {
    if (position >= detentByName('TOGA').position - DETENT_SOFT_ZONE) return 'MAN TOGA';
    if (position >= detentByName('FLX_MCT').position - DETENT_SOFT_ZONE) return phase === 'TAKEOFF' ? 'MAN FLEX' : 'MAN MCT';
    return 'MAN THR';
  }

  function managedSpeedForPhase(phase, altitudeFt = 0) {
    return managedSpeedForAircraftPhase(phase, altitudeFt);
  }

  function idleForPhase(radioAltFt) {
    return !state.grounded && (state.flightPhase === 'APPROACH' || radioAltFt < 2500) ? APPROACH_IDLE_N1 : IDLE_N1;
  }

  function reverseAllowed() {
    return state.grounded && state.mainGearCompressed;
  }

  function clampAllowedLeverPosition(position, allowReverse) {
    if (!allowReverse && position < 0) {
      showReverseLocked();
      return 0;
    }
    return THREE.MathUtils.clamp(position, allowReverse ? LEVER_MIN : 0, LEVER_MAX);
  }

  function showReverseLocked() {
    if (thrustAlertTimer <= 0.12) {
      state.audioCue = 'REV LOCKED';
      showDetentFlash('REV LOCKED');
    }
    state.thrustAlert = 'REV LOCKED';
    state.fmaThrustMode = 'REV LOCKED';
    thrustAlertTimer = 1.2;
  }

  function nearestAllowedDetent(position, allowReverse = reverseAllowed()) {
    let best = null;
    let bestDistance = Infinity;
    for (const detent of DETENTS) {
      if (detent.reverse > 0 && !allowReverse) continue;
      const distance = Math.abs(position - detent.position);
      if (distance < bestDistance) {
        best = detent;
        bestDistance = distance;
      }
    }
    return best || detentByName('IDLE');
  }

  function effectiveDetentForPosition(position, allowReverse) {
    if (position < -0.22 && allowReverse) return 'MAX_REV';
    if (position < -0.02 && allowReverse) return 'REV_IDLE';
    if (position >= detentByName('TOGA').position - DETENT_SOFT_ZONE) return 'TOGA';
    if (position >= detentByName('FLX_MCT').position - DETENT_SOFT_ZONE) return 'FLX_MCT';
    if (position >= detentByName('CL').position - DETENT_SOFT_ZONE) return 'CL';
    return 'IDLE';
  }

  function betweenDetentLabel(position, allowReverse) {
    const allowed = DETENTS.filter(detent => allowReverse || detent.reverse <= 0);
    for (let i = 0; i < allowed.length - 1; i++) {
      const lower = allowed[i];
      const upper = allowed[i + 1];
      if (position >= lower.position && position <= upper.position) {
        return `BETWEEN ${lower.label}-${upper.label}`;
      }
    }
    return nearestAllowedDetent(position, allowReverse).label;
  }

  function leverLabelForProfiles(leftProfile, rightProfile) {
    if (Math.abs(leftProfile.position - rightProfile.position) > 0.035) {
      return `L ${displayLeverPercent(leftProfile.position)}% / R ${displayLeverPercent(rightProfile.position)}%`;
    }
    if (leftProfile.currentDetent !== 'BETWEEN' && rightProfile.currentDetent !== 'BETWEEN' && leftProfile.currentDetent === rightProfile.currentDetent) {
      return leftProfile.nearest.label;
    }
    if (state.leverPosition < 0) return `REV ${Math.round(Math.max(leftProfile.reversePercent, rightProfile.reversePercent))}%`;
    return `${displayLeverPercent(state.leverPosition)}%`;
  }

  function detentDetailForProfiles(leftProfile, rightProfile) {
    if (Math.abs(leftProfile.position - rightProfile.position) > 0.035) {
      return 'LVR ASYM';
    }
    if (!leftProfile.isBetween && !rightProfile.isBetween) return leftProfile.nearest.label;
    return betweenDetentLabel((leftProfile.position + rightProfile.position) * 0.5, state.reverseAllowed);
  }

  function limitLabelForProfiles(leftProfile, rightProfile) {
    const averagePosition = (leftProfile.position + rightProfile.position) * 0.5;
    if (averagePosition < 0 && state.reverseAllowed) return `REV ${Math.round(state.targetN1Average || leftProfile.n1)}%`;
    if (state.autoThrustActive && Math.abs(averagePosition - detentByName('CL').position) <= CL_ACTIVE_RADIUS) return `CLB ${CLIMB_N1}%`;
    if (averagePosition >= detentByName('TOGA').position - DETENT_SOFT_ZONE) return `TOGA ${TOGA_N1}%`;
    if (averagePosition >= detentByName('FLX_MCT').position - DETENT_SOFT_ZONE) return `${state.flightPhase === 'TAKEOFF' ? 'FLEX' : 'MCT'} ${Math.round(Math.max(leftProfile.n1, rightProfile.n1))}%`;
    if (averagePosition >= detentByName('CL').position - DETENT_SOFT_ZONE) return `CLB ${Math.round(Math.max(leftProfile.n1, rightProfile.n1))}%`;
    return `MAN ${Math.round(Math.max(leftProfile.n1, rightProfile.n1))}%`;
  }

  function displayLeverPercent(position) {
    return Math.round(THREE.MathUtils.clamp(position, 0, 1) * 100);
  }

  function detentFromThrottle(throttle) {
    if (throttle >= 0.94) return detentByName('TOGA');
    if (throttle >= 0.82) return detentByName('FLX_MCT');
    if (throttle >= 0.28) return detentByName('CL');
    return detentByName('IDLE');
  }

  function detentByName(name) {
    return DETENTS[DETENT_INDEX.get(name)] || DETENTS[2];
  }

  function safeLeverPosition(sideName) {
    const key = `thrustLever${sideName}`;
    return Number.isFinite(state[key]) ? state[key] : detentByName('IDLE').position;
  }

  function radioAltitudeFeet() {
    const ground = terrainHeight(state.position.x, state.position.z) + AIRCRAFT_GROUND_OFFSET;
    return Math.max(0, (state.position.y - ground) * 3.28084);
  }

  function moveToward(current, target, maxDelta) {
    if (current < target) return Math.min(current + maxDelta, target);
    return Math.max(current - maxDelta, target);
  }

  function spoolRate(current, target) {
    if (target <= current) return SPOOL_DOWN_RATE;
    return current < 60 ? LOW_N1_SPOOL_UP_RATE : HIGH_N1_SPOOL_UP_RATE;
  }

  function smoothstepNumber(edge0, edge1, value) {
    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function updateAudioCues() {
    if (lastDetentLeft !== state.currentDetentLeft || lastDetentRight !== state.currentDetentRight) {
      if (state.currentDetentLeft !== 'BETWEEN' || state.currentDetentRight !== 'BETWEEN') {
        state.audioCue = 'detent';
      }
      lastDetentLeft = state.currentDetentLeft;
      lastDetentRight = state.currentDetentRight;
    }
    if (lastThrustMode !== state.fmaThrustMode && ['A.FLOOR', 'TOGA LK', 'RETARD', 'REV LOCKED', 'LVR ASYM'].includes(state.fmaThrustMode)) {
      state.audioCue = state.fmaThrustMode;
    }
    lastThrustMode = state.fmaThrustMode;
  }

  return {
    update,
    commandStep,
    nudgeLever,
    releaseLeverInput,
    setDetent,
    setLeverPosition,
    snapLever,
    toggleAutoThrust,
    toggleSpeedMode,
    detents: DETENTS
  };
}
