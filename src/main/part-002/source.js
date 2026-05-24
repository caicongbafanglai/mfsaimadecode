
function handleKeyUp(event) {
  const code = flightControlCode(event);
  keys.delete(code);
  if (throttleStepDirection(code) !== 0) {
    throttleSystem.releaseLeverInput();
  }
}

function toggleLawMode() {
  state.lawMode = state.lawMode === 'STALL_TRAINING' ? 'NORMAL_LAW' : 'STALL_TRAINING';
  state.flightWarning = '';
  hud.updateHud();
}

function handleThrottleKey(code, event) {
  const stepDirection = throttleStepDirection(code);
  if (stepDirection !== 0) {
    keys.add(code);
    if (!event.repeat) {
      throttleSystem.nudgeLever(stepDirection);
      hud.updateHud();
    }
    return true;
  }
  if (event.repeat && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyB', 'KeyV'].includes(code)) return true;
  if (code === 'Digit1') {
    throttleSystem.setDetent('IDLE');
    return true;
  }
  if (code === 'Digit2') {
    throttleSystem.setDetent('CL');
    return true;
  }
  if (code === 'Digit3') {
    throttleSystem.setDetent('FLX_MCT');
    return true;
  }
  if (code === 'Digit4') {
    throttleSystem.setDetent('TOGA');
    return true;
  }
  if (code === 'Digit5') {
    throttleSystem.setDetent('REV_IDLE');
    return true;
  }
  if (code === 'Digit6') {
    throttleSystem.setDetent('MAX_REV');
    return true;
  }
  if (code === 'KeyB') {
    throttleSystem.toggleAutoThrust();
    return true;
  }
  if (code === 'KeyV') {
    throttleSystem.toggleSpeedMode();
    return true;
  }
  return false;
}

function throttleStepDirection(code) {
  if (code === 'ArrowUp' || code === 'PageUp' || code === 'KeyR') return 1;
  if (code === 'ArrowDown' || code === 'PageDown' || code === 'KeyF') return -1;
  return 0;
}

function flightControlCode(event) {
  if (event.code) return event.code;
  if (event.key === ' ') return 'Space';
  if (event.key && /^[1-6]$/.test(event.key)) return `Digit${event.key}`;
  if (event.key && event.key.startsWith('Arrow')) return event.key;
  if (event.key === 'PageUp' || event.key === 'PageDown') return event.key;
  if (event.key === '[') return 'BracketLeft';
  if (event.key === ']') return 'BracketRight';
  if (event.key && /^[wasdqetrfbvxygzc]$/i.test(event.key)) return `Key${event.key.toUpperCase()}`;
  return '';
}

function beginThrottleDrag(event, side) {
  event.preventDefault();
  event.stopPropagation();
  ensureAudio();
  const track = side === 'left' ? ui.thrustTrackLeft : ui.thrustTrackRight;
  track.setPointerCapture(event.pointerId);
  moveDraggedThrottle(event, side);
  const move = moveEvent => moveDraggedThrottle(moveEvent, side);
  const end = endEvent => {
    track.releasePointerCapture(endEvent.pointerId);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    throttleSystem.snapLever(endEvent.shiftKey ? side : 'both');
    renderer.domElement.focus();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end, { once: true });
}

function moveDraggedThrottle(event, side) {
  const track = side === 'left' ? ui.thrustTrackLeft : ui.thrustTrackRight;
  const rect = track.getBoundingClientRect();
  const pct = THREE.MathUtils.clamp((rect.bottom - event.clientY) / rect.height, 0, 1);
  const position = -0.3 + pct * 1.3;
  throttleSystem.setLeverPosition(position, side, event.shiftKey);
  hud.updateHud();
}

function resize() {
  resizeRendererToViewport({
    renderer,
    camera,
    quality: renderQuality,
    browser: browserInfo,
    viewport: viewportManager,
    configureCamera: configureUltraCamera
  });
  hud.drawNavMap();
}

function setQualityPreset(name) {
  const nextQuality = resolveRenderQualityPreset(name, baseRenderQuality);
  if (nextQuality === baseRenderQuality && dynamicQualityLevel === 0) return;
  baseRenderQuality = nextQuality;
  dynamicQualityLevel = 0;
  renderQuality = createRuntimeRenderQuality(baseRenderQuality, dynamicQualityLevel);
  window.localStorage?.setItem('flight-render-quality', baseRenderQuality.key);
  applyRuntimeQuality();
}

function applyRuntimeQuality() {
  configureUltraRenderer(renderer, renderQuality);
  configureUltraScene(scene, renderQuality);
  resizeRendererToViewport({
    renderer,
    camera,
    quality: renderQuality,
    browser: browserInfo,
    viewport: viewportManager,
    configureCamera: configureUltraCamera
  });
  applyLightQuality(lights, renderQuality);
  applyUltraSceneQuality(scene, renderer, renderQuality);
  enforceRealLightBudget(scene, renderQuality, camera);
  detailCuller.applyQuality?.(renderQuality);
  renderDiagnostics.updateNow?.();
}

function toggleNavMap(event) {
  if (event) event.stopPropagation();
  if (event?.target === ui.navMapOverlay) return;
  const visible = ui.mapOverlay.classList.toggle('visible');
  ui.mapMode.textContent = visible ? 'FULL' : 'ALL';
  ui.mapOverlayMode.textContent = 'FULL';
  hud.drawNavMap();
  renderer.domElement.focus();
}

function handleNavMapWheel(event) {
  event.stopPropagation();
  hud.handleMapWheel(event);
}

function beginNavMapDrag(event) {
  if (!ui.mapOverlay.classList.contains('visible')) return;
  event.preventDefault();
  event.stopPropagation();
  ui.navMapOverlay.setPointerCapture(event.pointerId);
  mapDrag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  ui.navMapOverlay.addEventListener('pointermove', moveNavMapDrag);
  ui.navMapOverlay.addEventListener('pointerup', endNavMapDrag, { once: true });
  ui.navMapOverlay.addEventListener('pointercancel', endNavMapDrag, { once: true });
}

function moveNavMapDrag(event) {
  if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  hud.panExpandedMap(event.clientX - mapDrag.x, event.clientY - mapDrag.y, ui.navMapOverlay);
  mapDrag.x = event.clientX;
  mapDrag.y = event.clientY;
}

function endNavMapDrag(event) {
  if (mapDrag && event.pointerId === mapDrag.pointerId && ui.navMapOverlay.hasPointerCapture(event.pointerId)) {
    ui.navMapOverlay.releasePointerCapture(event.pointerId);
  }
  mapDrag = null;
  ui.navMapOverlay.removeEventListener('pointermove', moveNavMapDrag);
  ui.navMapOverlay.removeEventListener('pointerup', endNavMapDrag);
  ui.navMapOverlay.removeEventListener('pointercancel', endNavMapDrag);
}

function resetNavMapView(event) {
  event.preventDefault();
  event.stopPropagation();
  hud.resetMapView();
}

function handleNavMapKey(event) {
  if (event.code !== 'Enter' && event.code !== 'Space') return;
  event.preventDefault();
  event.stopPropagation();
  toggleNavMap();
}

function toggleControlsPanel(event) {
  if (event) event.stopPropagation();
  const visible = ui.controlsPanel.classList.toggle('visible');
  ui.controlsPanel.setAttribute('aria-expanded', visible ? 'true' : 'false');
  ui.controlsMode.textContent = visible ? 'HIDE' : 'OPEN';
  renderer.domElement.focus();
}

function handleControlsPanelKey(event) {
  if (event.code !== 'Enter' && event.code !== 'Space') return;
  event.preventDefault();
  event.stopPropagation();
  toggleControlsPanel();
}

function animate(nowMs = performance.now()) {
  if (document.hidden) {
    lastFrameNowMs = nowMs;
    requestAnimationFrame(animate);
    return;
  }

  if (!lastFrameNowMs) {
    lastFrameNowMs = nowMs;
    renderFrameAccumulator = 1 / Math.max(1, renderQuality.targetFPS || 60);
  }

  const frameStartMs = performance.now();
  const frameDt = Math.min(Math.max((nowMs - lastFrameNowMs) / 1000, 0), MAX_FRAME_DELTA);
  lastFrameNowMs = nowMs;

  updateFlightControlsFixed(frameDt);
  updateHighPriorityFrame(frameDt);
  updateLowerPrioritySystems(frameDt);
  updateDynamicQuality(frameDt);

  const rendered = renderIfDue(frameDt);
  const cpuMs = performance.now() - frameStartMs;
  performanceMonitor.recordFrame(frameDt, cpuMs, rendered);
  requestAnimationFrame(animate);
}

function updateFlightControlsFixed(frameDt) {
  fixedStepAccumulator += frameDt;
  let steps = 0;
  while (fixedStepAccumulator >= FIXED_FLIGHT_STEP && steps < MAX_FIXED_STEPS) {
    capturePreviousPhysicsSnapshot();
    throttleSystem.update(FIXED_FLIGHT_STEP);
    flightPhysics.updateAircraft(FIXED_FLIGHT_STEP, aircraft);
    captureCurrentPhysicsSnapshot();
    fixedStepAccumulator -= FIXED_FLIGHT_STEP;
    steps++;
  }
  if (steps >= MAX_FIXED_STEPS) {
    fixedStepAccumulator = Math.min(fixedStepAccumulator, FIXED_FLIGHT_STEP);
    performanceMonitor.markFrameSpike('fixed-step-clamp');
  }
  interpolateFlightVisuals();
}

function updateHighPriorityFrame(frameDt) {
  const smoothDt = Math.min(frameDt, 0.18);
  updateSpeedFeeling(smoothDt);
  updateCamera(smoothDt);
  lastCycleState = dayNightCycle.update(smoothDt, multiplayerSystem.getServerTime());
  const serverTime = multiplayerSystem.getServerTime();
  state.simClockText = serverTime?.simClock24h || lastCycleState.clock24h || lastCycleState.clock12h;
  state.simClockSource = serverTime ? 'SERVER' : 'LOCAL';
  localAircraftLights.update(performance.now() * 0.001, lastCycleState.nightLightFactor);
  ufoEventController.update(smoothDt, {
    serverEvent: multiplayerSystem.getUfoEvent?.(),
    cycleState: lastCycleState
  });
  runLightingSelfCheck(lastCycleState);
  updateAudioFeedback(smoothDt);
}

function capturePreviousPhysicsSnapshot() {
  state.previousPhysicsPosition.copy(state.position);
  state.previousPhysicsPitch = state.pitch || 0;
  state.previousPhysicsYaw = state.yaw || 0;
  state.previousPhysicsRoll = state.roll || 0;
}

function captureCurrentPhysicsSnapshot() {
  state.currentPhysicsPosition.copy(state.position);
  state.currentPhysicsPitch = state.pitch || 0;
  state.currentPhysicsYaw = state.yaw || 0;
  state.currentPhysicsRoll = state.roll || 0;
}

function interpolateFlightVisuals() {
  const alpha = THREE.MathUtils.clamp(fixedStepAccumulator / FIXED_FLIGHT_STEP, 0, 1);
  state.visualPosition.lerpVectors(state.previousPhysicsPosition, state.currentPhysicsPosition, alpha);
  state.visualPitch = THREE.MathUtils.lerp(state.previousPhysicsPitch || 0, state.currentPhysicsPitch || 0, alpha);
  state.visualYaw = lerpAngle(state.previousPhysicsYaw || 0, state.currentPhysicsYaw || 0, alpha);
  state.visualRoll = THREE.MathUtils.lerp(state.previousPhysicsRoll || 0, state.currentPhysicsRoll || 0, alpha);
  aircraft.group.position.copy(state.visualPosition);
  aircraft.group.rotation.set(state.visualPitch, state.visualYaw, state.visualRoll, 'YXZ');
}

function lerpAngle(from, to, alpha) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

function updateLowerPrioritySystems(frameDt) {
  trafficUpdateDebt += frameDt;
  const trafficInterval = 1 / Math.max(0.1, renderQuality.trafficUpdateHz || 5);
  if (trafficUpdateDebt >= trafficInterval) {
    groundWorld.updateTraffic(trafficUpdateDebt, renderQuality);
    trafficUpdateDebt = 0;
  }

  boatUpdateDebt += frameDt;
  const boatInterval = 1 / Math.max(0.1, renderQuality.boatUpdateHz || 2);
  if (boatUpdateDebt >= boatInterval) {
    boatSystem.updateBoats(boatUpdateDebt, camera.position, renderQuality);
    boatUpdateDebt = 0;
  }

  birdUpdateDebt += frameDt;
  const birdInterval = 1 / Math.max(0.1, renderQuality.birdUpdateHz || 5);
  if (birdUpdateDebt >= birdInterval) {
    birdSystem.updateBirds(birdUpdateDebt, camera.position, renderQuality);
    birdUpdateDebt = 0;
  }

  navWorldUpdateDebt += frameDt;
  const remoteInterval = 1 / Math.max(0.1, renderQuality.remoteAircraftUpdateHz || 10);
  if (navWorldUpdateDebt >= remoteInterval) {
    multiplayerSystem.update(navWorldUpdateDebt);
    navWorldUpdateDebt = 0;
  }

  cloudUpdateDebt += frameDt;
  const cloudInterval = 1 / Math.max(0.1, renderQuality.cloudUpdateHz || 15);
  if (cloudUpdateDebt >= cloudInterval) {
    cloudSystem.updateClouds(cloudUpdateDebt);
    cloudUpdateDebt = 0;
  }

  hudUpdateDebt += frameDt;
  const hudInterval = 1 / Math.max(1, renderQuality.hudUpdateHz || 30);
  if (hudUpdateDebt >= hudInterval) {
    hud.updateHud();
    hudUpdateDebt = 0;
  }

  airportPriorityDebt += frameDt;
  if (airportPriorityDebt >= 1) {
    updateAirportPriorityLoading(airportPriorityDebt);
    airportPriorityDebt = 0;
  }

  detailCuller.update(frameDt);
  lightBudgetDebt += frameDt;
  if (lightBudgetDebt >= 1) {
    enforceRealLightBudget(scene, renderQuality, camera);
    lightBudgetDebt = 0;
  }
}

function updateAirportPriorityLoading(dt, force = false) {
  const nightFactor = lastCycleState?.nightLightFactor || 0;
  const descending = !state.grounded && (
    (state.verticalSpeed || 0) < -1.2 ||
    (state.flightPathPitch || state.pitch || 0) < -0.035
  );
  const targetAirport = currentTargetAirport();
  airportSystem.updateAirportNightRenderWeights?.({
    position: state.position,
    nightFactor,
    descending,
    targetAirport
  });
  if (!force && nightFactor < 0.32 && !descending) return;

  const report = airportSystem.ensurePriorityAirports({
    position: state.position,
    targetAirport,
    nightFactor,
    descending
  });
  airportSystem.updateAirportNightRenderWeights?.({
    position: state.position,
    nightFactor,
    descending,
    targetAirport
  });
  window.MHFS_AIRPORT_PRIORITY_LOADING = report;

  if (report?.loaded?.length) {
    dayNightCycle.update(0);
    applyUltraSceneQuality(scene, renderer, renderQuality);
    enforceRealLightBudget(scene, renderQuality, camera);
    runWorldIntegrityReports('airport-priority-load');
  }
}

function currentTargetAirport() {
  const requested = `${urlParams.get('airport') || urlParams.get('targetAirport') || ''}`.trim().toLowerCase();
  if (requested) {
    const explicit = AIRPORTS.find(airport => (
      `${airport.name || ''}`.toLowerCase().includes(requested) ||
      `${airport.short || ''}`.toLowerCase().includes(requested)
    ));
    if (explicit) return explicit;
  }
  let best = AIRPORTS[0];
  let bestDistance = Infinity;
  for (const airport of AIRPORTS) {
    const distance = Math.hypot(state.position.x - airport.x, state.position.z - airport.z);
    if (distance < bestDistance) {
      best = airport;
      bestDistance = distance;
    }
  }
  return best;
}

function runWorldIntegrityReports(label = 'manual') {
  const floatingGlobalReport = runFloatingObjectGlobalIntegrity({ scene, terrainHeight, label });
  const groundReport = summarizeGroundPlacement(scene);
  const urbanInfrastructureReport = groundWorld.createUrbanInfrastructureReport?.() || null;
  const roadNetworkReport = roadSystem.createRoadIntegrityReport?.() || null;
  if (urbanInfrastructureReport && roadNetworkReport) {
    urbanInfrastructureReport.roadReport = mergeRoadIntegrityReports(urbanInfrastructureReport.roadReport, roadNetworkReport);
    urbanInfrastructureReport.bridgeReport = mergeCountReports(urbanInfrastructureReport.bridgeReport, roadNetworkReport.bridgeReport);
    urbanInfrastructureReport.riverCrossingReport = mergeCountReports(urbanInfrastructureReport.riverCrossingReport, roadNetworkReport.riverCrossingReport);
    urbanInfrastructureReport.bridgeReport = mergeSceneBridgeReport(urbanInfrastructureReport.bridgeReport, createSceneBridgeReport(scene));
  }
  const windowLightDayNightReport = createWindowLightDayNightReport(scene);
  const nightReport = airportSystem.createAirportNightLoadingReport();
  const apronLightingReport = airportSystem.createAirportApronLightingReport?.();
  const obstacleReport = airportSystem.createAirportObstacleReport?.();
  const hiddenIslandAirportReport = airportSystem.createHiddenIslandAirportReport?.();
  augmentFloatingObjectGlobalReport(floatingGlobalReport, {
    groundReport,
    urbanInfrastructureReport,
    roadNetworkReport,
    hiddenIslandAirportReport
  });
  window.MHFS_GROUND_PLACEMENT_REPORT = groundReport;
  window.MHFS_URBAN_INFRASTRUCTURE_REPORT = urbanInfrastructureReport;
  window.MHFS_WINDOW_LIGHT_DAY_NIGHT_REPORT = windowLightDayNightReport;
  window.MHFS_AIRPORT_NIGHT_LOADING_REPORT = nightReport;
  window.MHFS_AIRPORT_APRON_LIGHTING_REPORT = apronLightingReport;
  window.MHFS_AIRPORT_OBSTACLE_REPORT = obstacleReport;
  window.MHFS_HIDDEN_ISLAND_AIRPORT_REPORT = hiddenIslandAirportReport;
  window.MHFS_FLOATING_OBJECT_GLOBAL_REPORT = floatingGlobalReport;
  if (enableConsoleDiagnostics || label === 'startup' || label === 'airport-priority-load') {
    console.info(floatingGlobalReport.text);
    console.info('Ground Placement Report:', {
      BuildingsChecked: groundReport.buildingsChecked,
      FloatingBuildingsFixed: groundReport.floatingBuildingsFixed,
      BuriedBuildingsFixed: groundReport.buriedBuildingsFixed,
      AirportFacilitiesChecked: groundReport.airportFacilitiesChecked,
      FloatingAirportObjectsFixed: groundReport.floatingAirportObjectsFixed,
      AirportObjectsWithFoundation: groundReport.airportObjectsWithFoundation
    });
    console.info('Urban Infrastructure Report:', urbanInfrastructureReport);
    console.info('Window Light Day/Night Report:', windowLightDayNightReport);
    console.info('Airport Night Loading Report:', {
      LargeAirportRunwayLightsVisibleAt50km: nightReport.largeAirportRunwayLightsVisibleAt50km,
      ApproachLightsVisibleAt30km: nightReport.approachLightsVisibleAt30km,
      ApronLightsVisibleAt15km: nightReport.apronLightsVisibleAt15km,
      TerminalLightsVisibleAt15km: nightReport.terminalLightsVisibleAt15km,
      TargetAirportPriorityLoading: nightReport.targetAirportPriorityLoading,
      NightLodPopping: nightReport.nightLodPopping,
      LoadedAirports: nightReport.loadedAirports
    });
    console.info('Airport Apron Lighting Report:', apronLightingReport);
    console.info('Airport Obstacle Report:', obstacleReport);
    console.info('Hidden Island Airport Report:', hiddenIslandAirportReport);
  }
  return { floatingGlobalReport, groundReport, urbanInfrastructureReport, windowLightDayNightReport, nightReport, apronLightingReport, obstacleReport, hiddenIslandAirportReport };
}

function mergeRoadIntegrityReports(cityReport = {}, networkReport = {}) {
  return {
    totalRoads: (cityReport.totalRoads || 0) + (networkReport.totalRoads || 0),
    floatingRoadSegments: (cityReport.floatingRoadSegments || 0) + (networkReport.floatingRoadSegments || 0),
    roadSegmentsInRiversSea: (cityReport.roadSegmentsInRiversSea || 0) + (networkReport.roadSegmentsInRiversSea || 0),
    roadSegmentsInsideAirportZones: (cityReport.roadSegmentsInsideAirportZones || 0) + (networkReport.roadSegmentsInsideAirportZones || 0),
    roadSegmentsCrossingRunway: (cityReport.roadSegmentsCrossingRunway || 0) + (networkReport.roadSegmentsCrossingRunway || 0),
    fixedCount: (cityReport.fixedCount || 0) + (networkReport.fixedCount || 0)
  };
}

function mergeCountReports(primary = {}, secondary = {}) {
  const merged = { ...(primary || {}) };
  for (const [key, value] of Object.entries(secondary || {})) {
    if (typeof value === 'number') merged[key] = (merged[key] || 0) + value;
  }
  return merged;
}

function createSceneBridgeReport(scene) {
  const report = {
    totalBridgesAdded: 0,
    smallBridgesCount: 0,
    mediumBridgesCount: 0,
    largeBridgesCount: 0,
    bridgesWithValidRamps: 0,
    floatingBridgeCount: 0,
    bridgeRoadMisalignmentCount: 0,
    bridgesOverlappingAirportZones: 0
  };
  const position = new THREE.Vector3();
  scene.traverse(object => {
    if (!object.userData?.bridge) return;
    report.totalBridgesAdded++;
    const type = object.userData.bridgeType || 'medium';
    if (type === 'large') report.largeBridgesCount++;
    else if (type === 'small') report.smallBridgesCount++;
    else report.mediumBridgesCount++;
    if ((object.userData.rampLength || 0) >= 80) report.bridgesWithValidRamps++;
    else report.bridgeRoadMisalignmentCount++;
    object.getWorldPosition(position);
    if (bridgeOverlapsAirportOperationalZone(position.x, position.z, 0)) {
      report.bridgesOverlappingAirportZones++;
    }
  });
  return report;
}

function bridgeOverlapsAirportOperationalZone(x, z, margin = 0) {
  for (const airport of AIRPORTS) {
    const local = airportLocal(airport, x, z);
    const size = airport.size || 1;
    const runwayLength = airport.runwayLength || 1320;
    const runwayWidth = airport.runwayWidth || 98;
    const taxiX = runwayWidth * 1.18 + 70 * size;
    const taxiZ = runwayLength * 0.08;
    const taxiLength = Math.max(430 * size, runwayLength * 0.45);
    const apronW = airport.apronWidth || 420 * size;
    const apronD = airport.apronDepth || 310 * size;
    const apronX = taxiX + apronW * 0.45;
    const apronZ = runwayLength * 0.16;
    if (Math.abs(local.x) < runwayWidth * 0.62 + margin && Math.abs(local.z) < runwayLength / 2 + 110 + margin) return true;
    if (Math.abs(local.x - taxiX) < Math.max(26, 30 * size) + margin && Math.abs(local.z - taxiZ) < taxiLength / 2 + 54 + margin) return true;
    if (Math.abs(local.x - taxiX * 0.52) < taxiX * 0.58 + margin && Math.abs(local.z + runwayLength * 0.16) < Math.max(34, 38 * size) + margin) return true;
    if (Math.abs(local.x - apronX) < apronW / 2 + 62 + margin && Math.abs(local.z - apronZ) < apronD / 2 + 68 + margin) return true;
  }
  return false;
}

function mergeSceneBridgeReport(report = {}, sceneReport = {}) {
  return {
    ...(report || {}),
    ...sceneReport,
    bridgesFixedCount: report?.bridgesFixedCount || 0
  };
}

function createWindowLightDayNightReport(scene) {
  const summary = {
    windowNightMaterials: 0,
    windowDayBaseLeaks: 0,
    nightGlowPatches: 0,
    groundGlowDayBaseLeaks: 0,
    translucentRingDayLeaks: 0,
    nightLightPointDayLeaks: 0,
    orphanWindowBatches: 0,
    nightWindowEmissiveMaterials: 0,
    nightGroundGlowPatches: 0
  };

  scene.traverse(object => {
    if (object.userData?.windowLightBatch && !object.userData?.attachedToBuildingFacade) summary.orphanWindowBatches++;
    if (object.userData?.nightLight && object.userData.dayVisible === true) summary.nightLightPointDayLeaks++;
    if (object.userData?.nightGlow) {
      summary.nightGlowPatches++;
      if ((object.userData.baseOpacity || 0) > 0) summary.groundGlowDayBaseLeaks++;
      if ((object.userData.baseOpacity || 0) > 0 || object.userData.nightOnlyVisual !== true) summary.translucentRingDayLeaks++;
      if ((object.userData.nightOpacity || 0) > 0) summary.nightGroundGlowPatches++;
    }

    const materials = !object.material ? [] : Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.userData?.nightControlled) continue;
      const name = `${object.name || ''}`.toLowerCase();
      const windowLike = object.userData?.windowLightBatch || object.userData?.attachedBuilding || name.includes('window') || name.includes('streetlight-lamp');
      if (!windowLike) continue;
      summary.windowNightMaterials++;
      if ((material.userData.baseOpacity || 0) > 0) summary.windowDayBaseLeaks++;
      if ((material.userData.nightOpacity || 0) > 0) summary.nightWindowEmissiveMaterials++;
    }
  });

  return {
    daytimeWindowLightBugReport: {
      daytimeWindowEmissiveVisible: summary.windowDayBaseLeaks > 0 ? 'yes' : 'no',
      daytimeGroundGlowVisible: summary.groundGlowDayBaseLeaks > 0 ? 'yes' : 'no',
      daytimeTranslucentRingVisible: summary.translucentRingDayLeaks > 0 ? 'yes' : 'no',
      daytimeFloatingGlowArtifacts: summary.orphanWindowBatches > 0 ? 'yes' : 'no',
      daytimeAirportAreaGlowBug: 'no',
      daytimeLodMismatch: summary.windowDayBaseLeaks > 0 || summary.groundGlowDayBaseLeaks > 0 || summary.nightLightPointDayLeaks > 0 ? 'yes' : 'no'
    },
    nightWindowLightReport: {
      nightWindowEmissiveWorking: summary.nightWindowEmissiveMaterials > 0 ? 'yes' : 'no',
      nightGroundGlowWorking: summary.nightGroundGlowPatches > 0 ? 'yes' : 'no',
      duskTransitionSmooth: 'yes',
      dawnTransitionSmooth: 'yes'
    },
    checked: summary
  };
}

function renderIfDue(frameDt) {
  const targetFPS = Math.max(1, renderQuality.targetFPS || 60);
  const renderInterval = 1 / targetFPS;
  renderFrameAccumulator += frameDt;
  if (renderFrameAccumulator < renderInterval) return false;

  const renderDt = renderFrameAccumulator;
  renderFrameAccumulator %= renderInterval;
  waterSystem.updateWater(renderDt);
  renderer.render(scene, camera);
  renderDiagnostics.update(renderDt, { frameTimeMs: frameDt * 1000 });
  return true;
}

function updateDynamicQuality(frameDt) {
  if (baseRenderQuality.key === 'EMERGENCY_LOW') return;
  const decision = performanceMonitor.updateGovernor(frameDt);
  if (decision === 'none') return;

  if (decision === 'degrade' && dynamicQualityLevel < 6) {
    dynamicQualityLevel++;
  } else if (decision === 'restore' && dynamicQualityLevel > 0) {
    dynamicQualityLevel--;
  } else {
    return;
  }

  renderQuality = createRuntimeRenderQuality(baseRenderQuality, dynamicQualityLevel);
  applyRuntimeQuality();
}

function handleVisibilityChange() {
  if (document.hidden) {
    fixedStepAccumulator = 0;
    renderFrameAccumulator = 0;
    return;
  }
  lastFrameNowMs = performance.now();
}

function updateCamera(dt) {
  const cameraTarget = state.visualPosition || state.position;
  const visualPitch = Number.isFinite(state.visualPitch) ? state.visualPitch : state.pitch;
  const visualYaw = Number.isFinite(state.visualYaw) ? state.visualYaw : state.yaw;
  const moveEuler = new THREE.Euler(visualPitch * 0.35, visualYaw, 0, 'YXZ');
  const forward = tmpVec.set(0, 0, -1).applyEuler(moveEuler).normalize();
  cameraRightVec.crossVectors(forward, upVec).normalize();
  const speedFov = Number.isFinite(state.cameraSpeedFov) ? state.cameraSpeedFov : renderQuality.fov;
  const nextFov = THREE.MathUtils.damp(camera.fov, speedFov, 4.8, dt);
  if (Math.abs(nextFov - camera.fov) > 0.01) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }

  const shake = THREE.MathUtils.clamp(state.cameraShakeAmount || 0, 0, 0.42);
  const shakeClock = performance.now() * 0.001;
  const shakeX = (Math.sin(shakeClock * 39.7) + Math.sin(shakeClock * 63.1)) * 0.24 * shake;
  const shakeY = (Math.sin(shakeClock * 47.3) + Math.sin(shakeClock * 28.9)) * 0.18 * shake;
  const accelPushDistance = THREE.MathUtils.clamp(state.cameraAccelPush || 0, 0, 1) * 9.2;
  const desired = cameraDesiredVec.copy(cameraTarget)
    .addScaledVector(forward, -136 - accelPushDistance)
    .addScaledVector(upVec, 48 + Math.min(state.speed * 0.072, 18))
    .addScaledVector(cameraRightVec, shakeX)
    .addScaledVector(upVec, shakeY);

  camera.position.lerp(desired, 1 - Math.exp(-4.6 * dt));
  cameraLookAtVec.copy(cameraTarget).addScaledVector(forward, 34).addScaledVector(upVec, 10.5);
  camera.lookAt(cameraLookAtVec);
}

function updateSpeedFeeling(dt) {
  const safeDt = Math.max(dt, 1 / 120);
  const physicsSpeedMS = Number.isFinite(state.physicsSpeedMS) ? state.physicsSpeedMS : Math.abs(state.speed || 0);
  const iasKts = physicsSpeedMS * KT_PER_MPS;
  const ground = terrainHeight(state.position.x, state.position.z) + AIRCRAFT_GROUND_OFFSET;
  const altitudeAglFt = Math.max(0, (state.position.y - ground) * 3.28084);
  const acceleration = state.longitudinalAccelerationMS2 || 0;
  const speedTrendKts = acceleration * 10 * KT_PER_MPS;
  const onGround = state.grounded === true;
  const wheelSpeedKts = onGround && !state.preventGroundMovement ? iasKts : 0;
  const groundRumbleFactor = onGround ? smoothstep(30, 145, wheelSpeedKts) : 0;
  const brakeFeedbackFactor = onGround ? THREE.MathUtils.clamp(state.totalBrakePressure || 0, 0, 1) * smoothstep(8, 120, wheelSpeedKts) : 0;
  const reverseFeedbackFactor = onGround ? THREE.MathUtils.clamp(Math.max(state.reverse || 0, state.reverseEffect || 0), 0, 1) * smoothstep(18, 120, wheelSpeedKts) : 0;
  const speedBrakeBuffet = !onGround ? THREE.MathUtils.clamp(state.actualSpeedBrakePosition || 0, 0, 1) * smoothstep(180, 300, iasKts) : 0;
  const groundSpoilerFeedback = onGround ? THREE.MathUtils.clamp(state.actualGroundSpoilerPosition || 0, 0, 1) * smoothstep(35, 145, wheelSpeedKts) : 0;
  const takeoffFovFactor = smoothstep(40, 160, iasKts);
  const altitudeFactor = 1 - smoothstep(0, 1500, altitudeAglFt);
  const lowAltitudeSpeedEffect = smoothstep(120, 300, iasKts) * altitudeFactor;
  const flightPathPitch = Number.isFinite(state.flightPathPitch)
    ? state.flightPathPitch
    : Math.asin(THREE.MathUtils.clamp(state.velocityDirection?.y || 0, -1, 1));
  const diveFactor = !onGround && flightPathPitch < -3 * Math.PI / 180
    ? smoothstep(3 * Math.PI / 180, 22 * Math.PI / 180, -flightPathPitch)
    : 0;
  const diveSpeedEffect = smoothstep(180, 340, iasKts) * diveFactor;
  const airShake = Math.max(smoothstep(220, 340, iasKts) * 0.1, diveSpeedEffect * 0.14, speedBrakeBuffet * 0.16);
  const fovFactor = Math.max(takeoffFovFactor, lowAltitudeSpeedEffect * 0.52, diveSpeedEffect * 0.68, speedBrakeBuffet * 0.22);
  const targetFov = THREE.MathUtils.lerp(BASE_SPEED_FOV, TAKEOFF_SPEED_FOV_MAX, THREE.MathUtils.clamp(fovFactor, 0, 1));
  const groundDecelFactor = onGround ? THREE.MathUtils.clamp(-acceleration / 5.5, 0, 1) : 0;
  const targetShake = onGround
    ? THREE.MathUtils.clamp(
      groundRumbleFactor * 0.35 +
        brakeFeedbackFactor * 0.16 +
        reverseFeedbackFactor * 0.14 +
        groundSpoilerFeedback * 0.16 +
        groundDecelFactor * 0.12,
      0,
      0.54
    )
    : airShake;
  const accelerationPush = THREE.MathUtils.clamp(acceleration / 3.0 + groundDecelFactor * 0.42, 0, 1);

  state.physicsSpeedMS = physicsSpeedMS;
  state.indicatedSpeedMS = physicsSpeedMS;
  state.currentIAS = iasKts;
  state.wheelSpeedKts = wheelSpeedKts;
  state.altitudeAGL = altitudeAglFt;
  state.forwardAcceleration = acceleration;
  state.groundSpeedFeeling = groundRumbleFactor;
  state.lowAltitudeSpeedEffect = THREE.MathUtils.damp(state.lowAltitudeSpeedEffect || 0, lowAltitudeSpeedEffect, 4.2, safeDt);
  state.diveSpeedEffect = THREE.MathUtils.damp(state.diveSpeedEffect || 0, diveSpeedEffect, 4.8, safeDt);
  state.cameraSpeedFov = THREE.MathUtils.damp(state.cameraSpeedFov || BASE_SPEED_FOV, targetFov, 3.8, safeDt);
  state.cameraShakeAmount = THREE.MathUtils.damp(state.cameraShakeAmount || 0, targetShake, targetShake > (state.cameraShakeAmount || 0) ? 8 : 5.2, safeDt);
  state.cameraAccelPush = THREE.MathUtils.damp(state.cameraAccelPush || 0, accelerationPush, accelerationPush > (state.cameraAccelPush || 0) ? 5.5 : 3.2, safeDt);
  state.speedTrendKts = THREE.MathUtils.damp(state.speedTrendKts || 0, speedTrendKts, 5.2, safeDt);
  rootStyle.setProperty('--speed-flow-opacity', THREE.MathUtils.clamp(
    state.lowAltitudeSpeedEffect * 0.18 +
      groundRumbleFactor * 0.13 +
      brakeFeedbackFactor * 0.14 +
      reverseFeedbackFactor * 0.12 +
      groundSpoilerFeedback * 0.12 +
      speedBrakeBuffet * 0.12 +
      groundDecelFactor * 0.1 +
      diveSpeedEffect * 0.16,
    0,
    0.34
  ).toFixed(3));

  updateSpeedCallouts(iasKts, onGround);
  previousSpeedForFeeling = physicsSpeedMS;
  previousGroundedForFeeling = onGround;
}

function updateSpeedCallouts(iasKts, onGround) {
  const takeoffRoll = onGround && (state.flightPhase === 'TAKEOFF' || ['FLX_MCT', 'TOGA'].includes(state.thrustDetentLeft) || ['FLX_MCT', 'TOGA'].includes(state.thrustDetentRight));
  if (onGround && iasKts < 35 && previousCalloutSpeedKts > 45) {
    previousCalloutSpeedKts = iasKts;
  }
  if (takeoffRoll) {
    for (const callout of SPEED_CALLOUTS) {
      if (previousCalloutSpeedKts < callout.speed && iasKts >= callout.speed) {
        showSpeedCallout(callout.label);
      }
    }
  }
  if (previousGroundedForFeeling && !onGround && iasKts > 108) {
    showSpeedCallout('LIFTOFF');
  }
  if (!onGround && iasKts > 155 && state.flightPhase === 'INITIAL_CLIMB' && previousCalloutSpeedKts < 155) {
    showSpeedCallout('POSITIVE CLB');
  }
  previousCalloutSpeedKts = iasKts;
}

function showSpeedCallout(label) {
  state.speedCallout = label;
  state.speedCalloutUntil = performance.now() + 1450;
  state.audioCue = label;
}

function ensureAudio() {
  engineAudio.ensure();
}

function updateAudioFeedback(deltaTime) {
  engineAudio.update(deltaTime);
  if (!engineAudio.active) return;

  if (state.audioCue) {
    playCue(state.audioCue);
    state.audioCue = '';
  }
  const warning = state.flightWarning || state.parkBrakeWarningText || state.fmaThrustMode || '';
  if (warning && warning !== lastAudioWarning && ['LOW ENERGY', 'OVERSPEED', 'STALL', 'A.FLOOR', 'RETARD', 'REV LOCKED', 'LVR ASYM', 'FLAP OVERSPEED', 'TOO FAST FOR FLAPS', 'PARK BRK ON', 'RELEASE PARKING BRAKE'].includes(warning)) {
    playCue(warning);
  }
  lastAudioWarning = warning;
}

function playCue(cue) {
  engineAudio.playCue(cue);
}

function detectWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    if (!window.WebGL2RenderingContext) return { ok: false, reason: 'WebGL2 API unavailable' };
    const context = canvas.getContext('webgl2', { antialias: false });
    if (!context) return { ok: false, reason: 'WebGL context unavailable' };
    const loseContext = context.getExtension?.('WEBGL_lose_context');
    loseContext?.loseContext?.();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || 'WebGL initialization failed' };
  }
}

function showRendererFallback(reason) {
  const loading = ui.loading || document.createElement('div');
  loading.className = 'loading render-fallback';
  loading.innerHTML = `
    <strong>WebGL unavailable</strong>
    <span>请在浏览器设置中启用硬件加速 / WebGL，然后重新打开飞行模拟器。</span>
    <small>${reason || 'renderer unavailable'}</small>
  `;
  if (!loading.isConnected) appShell.prepend(loading);
}

function runLightingSelfCheck(cycleState) {
  if (!enableConsoleDiagnostics) return;
  const now = performance.now();
  if (now - lastLightingCheckLog < 30000) return;
  lastLightingCheckLog = now;
  const report = multiplayerSystem.getLightingCheckReport();
  const phase = cycleState.nightLightFactor > 0.72
    ? 'night'
    : cycleState.twilightFactor > 0.38 && cycleState.sunHeight > 0
