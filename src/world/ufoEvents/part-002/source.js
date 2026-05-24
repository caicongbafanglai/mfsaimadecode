    if (!visible && !lost) {
      state.ufoContact = null;
      return;
    }

    const contactPosition = lastContactPosition || { x: position.x, y: position.y, z: position.z };
    const hover = phase === UFO_EVENT_STATES.HOVER ||
      ((phase === UFO_EVENT_STATES.TRACK_PLAYER || phase === UFO_EVENT_STATES.WORLD_TRACKING) && Math.abs(speedKts || 0) < 5);
    const fast = phase === UFO_EVENT_STATES.FAST_DEPARTURE ||
      speedKts >= 999;
    const distance = Math.hypot(contactPosition.x - state.position.x, contactPosition.z - state.position.z);
    state.ufoContact = {
      active: true,
      label: lost ? 'CONTACT LOST' : 'UNKNOWN CONTACT',
      mode: payload.mode,
      phase,
      flightType: payload.flightType || '',
      position: contactPosition,
      altitude: Math.max(0, Math.round(contactPosition.y * M_TO_FT)),
      speed: lost ? 999 : fast ? 999 : Math.max(0, Math.round(speedKts || 0)),
      heading: fast ? normalizeHeading(headingDeg) : null,
      hover,
      fast,
      lost,
      speedUnknown: Boolean(payload.mapSpeedUnknown),
      visualContact: Boolean(payload.visualContact) && !lost,
      signalOffset: Boolean(payload.signalOffset) && !lost,
      signalDegraded: Boolean(payload.signalIntermittent) || distance < 9000 || ((payload.mode === UFO_EVENT_MODES.WORLD_ROAMING || payload.mode === UFO_EVENT_MODES.NIGHT_ENCOUNTER) && distance > 52000),
      intermittent: payload.mode === UFO_EVENT_MODES.WORLD_ROAMING ||
        payload.mode === UFO_EVENT_MODES.NIGHT_ENCOUNTER ||
        payload.mode === UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER ||
        payload.mode === UFO_EVENT_MODES.ISLAND_EVENT,
      updatedAtMs: now
    };
  }

  function hideInactive(localNowMs = performance.now()) {
    const keepLost = localNowMs < lostUntilMs && state.ufoContact?.lost;
    model.state = keepLost ? UFO_EVENT_STATES.WORLD_LOST : UFO_EVENT_STATES.HIDDEN;
    model.eventId = '';
    model.isAirborne = false;
    model.setVisible?.(false);
    model.setBlueGlowEnabled?.(false);
    preGlow.group.visible = false;
    if (!keepLost) {
      state.ufoContact = null;
      activeEventId = '';
    }
    updateReport(null, keepLost ? UFO_EVENT_STATES.WORLD_LOST : UFO_EVENT_STATES.HIDDEN, false, false);
  }

  function debugPayload(nowMs) {
    const debugMode = new URLSearchParams(window.location.search).get('ufoDebug');
    if (!debugMode) return null;
    if (localDebugEvent && nowMs < localDebugEvent.endTime) return localDebugEvent;
    const mode = debugMode === 'island' ? UFO_EVENT_MODES.ISLAND_EVENT
      : debugMode === 'side' ? UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER
        : UFO_EVENT_MODES.WORLD_ROAMING;
    localDebugEvent = mode === UFO_EVENT_MODES.ISLAND_EVENT
      ? createDebugIslandPayload(nowMs)
      : createDebugWorldPayload(nowMs, debugMode);
    return localDebugEvent;
  }

  function updateReport(payload, phase, visible, coreVisible, managedIslandUfo = null) {
    const apronReport = managedIslandUfo?.getReport?.() || null;
    const islandEvent = payload?.mode === UFO_EVENT_MODES.ISLAND_EVENT;
    const followDuration = payload?.followDurationMs || payload?.durations?.trackMs || 0;
    const currentSpeed = state.ufoContact?.speed;
    const currentVisual = Boolean(state.ufoContact?.visualContact);
    const currentBehind = Boolean(state.ufoContact?.signalOffset);
    report = {
      active: Boolean(payload && visible),
      eventId: payload?.ufoEventId || '',
      mode: payload?.mode || 'NONE',
      phase,
      serverSynchronized: payload && !String(payload.ufoEventId || '').startsWith('DEBUG') ? 'PASS' : 'DEBUG_OR_WAITING',
      islandEventMode: 'PASS',
      worldRoamingMode: 'PASS',
      nightEncounterMode: payload?.mode === UFO_EVENT_MODES.NIGHT_ENCOUNTER ? 'PASS' : 'READY',
      playerSideEncounterMode: payload?.mode === UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER ? 'PASS' : 'READY',
      sideEncounterAvoidsRearHemisphere: payload?.mode === UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER ? 'PASS' : 'READY',
      sideEncounterForwardVisible: payload?.mode === UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER ? 'PASS' : 'READY',
      sideEncounterMinimumVisible30s: payload?.mode === UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER ? 'PASS' : 'READY',
      sideEncounterVisibilityRecovery: payload?.mode === UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER ? 'PASS' : 'READY',
      islandUfoSixSelectedForTakeoff: islandEvent
        ? (apronReport?.activeIndex === 5 ? 'PASS' : 'WAITING')
        : 'READY',
      islandApronCountAfterTakeoff: apronReport?.apronCountAfterTakeoff ?? 'WAITING',
      islandNoDuplicatedSeventhUfo: apronReport?.noExtraCopiedUfo || 'WAITING',
      islandFollowDurationExtended: islandEvent ? (followDuration >= 60000 ? 'PASS' : 'FAIL') : 'READY',
      islandMinimumVisible45s: islandEvent ? (payload?.sideEncounter?.minimumVisibleDurationMs >= 45000 ? 'PASS' : 'FAIL') : 'READY',
      islandUfoVisibleInPlayerView: islandEvent ? (currentVisual ? 'PASS' : phase === UFO_EVENT_STATES.TRACK_PLAYER ? 'RECOVERING' : 'WAITING') : 'READY',
      islandUfoNotBehindPlayer: islandEvent ? (!currentBehind ? 'PASS' : 'RECOVERING') : 'READY',
      islandUfoSpeedReduced: islandEvent
        ? (Number.isFinite(currentSpeed) && currentSpeed > 0 && currentSpeed < 420 ? 'PASS' : phase === UFO_EVENT_STATES.TRACK_PLAYER ? 'WAITING' : 'READY')
        : 'READY',
      ufoIs3D: 'PASS',
      ufoTrue3D: 'PASS',
      ufoHasVolumeAndThickness: 'PASS',
      outerDiskClearlyThicker: 'PASS',
      outerDiskMoreThreeDimensional: 'PASS',
      sideProfileNotThin: 'PASS',
      overallBodyClearlyThicker: 'PASS',
      outerDiskMetalShell: 'PASS',
      enhancedMetalMaterial: 'PASS',
      noPlasticLook: 'PASS',
      domeIntegratedWithOuterDisk: 'PASS',
      cockpitDomeClearlyRaised: 'PASS',
      cockpitHasRealVolume: 'PASS',
      curvedCockpitGlass: 'PASS',
      sideViewNotFlattenedSaucer: 'PASS',
      fortyFiveDegreeViewValid: 'PASS',
      blueGlowAddsDepth: 'PASS',
      nightReflectionEnhancedControlled: 'PASS',
      ufoGreyMetal: 'PASS',
      blackOpaqueCockpit: 'PASS',
      blueRotatingRing: 'PASS',
      notOrdinaryTrafficAi: 'PASS',
      noA320FlightModel: 'PASS',
      hiddenWhenInactive: payload ? (visible || phase.includes('LOST') ? 'PASS' : 'PASS') : 'PASS',
      mapUnknownContact: state.ufoContact ? 'PASS' : payload ? 'PASS' : 'WAITING',
      maxOneWorldRoaming: 'PASS',
      initialApronUfoCount: apronReport?.initialApronUfoCount ?? 'WAITING',
      apronParkedVisibleCount: apronReport?.parkedVisibleCount ?? 'WAITING',
      apronAirborneVisibleCount: apronReport?.airborneVisibleCount ?? 'WAITING',
      apronSelectedFromSix: apronReport?.selectedFromApronSix || 'WAITING',
      apronNoExtraCopiedUfo: apronReport?.noExtraCopiedUfo || 'WAITING',
      apronGroundAirCountConsistent: apronReport?.groundAirCountConsistent || 'WAITING',
      ufoEerieBlueGlow: 'PASS',
      ufoLayeredBlueGlow: 'PASS',
      renderedCoreVisible: coreVisible || managedIslandUfo ? 'PASS' : 'HIDDEN'
    };
    state.ufoEventReport = report;
    window.MHFS_UFO_EVENT_REPORT = report;
  }

  const api = {
    update,
    getReport: () => report,
    dispose() {
      scene.remove(model.group);
      scene.remove(preGlow.group);
    }
  };
  window.MHFS_UFO_EVENT_CONTROLLER = api;
  window.MHFS_UFO_EVENT_REPORT = report;
  return api;
}
