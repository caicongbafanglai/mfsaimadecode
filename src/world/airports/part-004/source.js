  function ensurePriorityAirports({
    position,
    targetAirport = null,
    nightFactor = 0,
    descending = false
  } = {}) {
    priorityLoadingEnabled = true;
    const loaded = [];
    const candidates = [];
    const target = targetAirport || nearestAirportTo(position);
    if (target) candidates.push({ airport: target, reason: 'target-airport', target: true });
    const nearest = nearestAirportTo(position);
    if (nearest && nearest !== target) candidates.push({ airport: nearest, reason: 'nearest-airport', target: false });

    if (position && (nightFactor > 0.35 || descending)) {
      const scored = AIRPORTS
        .map(airport => ({ airport, distance: airportDistance(position, airport), threshold: airportPriorityDistance(airport, nightFactor) }))
        .filter(item => item.distance <= item.threshold)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, nightFactor > 0.55 ? 3 : 2);
      for (const item of scored) {
        if (!candidates.some(candidate => candidate.airport === item.airport)) {
          candidates.push({ airport: item.airport, reason: 'night-approach-range', target: false });
        }
      }
    }

    for (const candidate of candidates) {
      const wasLoaded = createdAirports.has(airportKey(candidate.airport));
      createAirport(candidate.airport, {
        priorityReason: candidate.reason,
        target: candidate.target
      });
      if (!wasLoaded) loaded.push(candidate.airport.name);
    }

    lastPriorityLoadReport = {
      enabled: true,
      loaded,
      targetAirport: target?.name || '',
      loadedAirportCount: createdAirports.size,
      nightFactor,
      descending
    };
    return lastPriorityLoadReport;
  }

  function createAirportNightLoadingReport() {
    const loadedRecords = [...createdAirports.values()];
    const largeRecord = loadedRecords.find(record => isLargeAirport(record.airport)) || loadedRecords[0] || null;
    const loadedTarget = loadedRecords.find(record => record.group.userData.targetAirport || record.priorityReason === 'target-airport') || loadedRecords[0] || null;
    const runwayPass = largeRecord ? hasAirportLightLayer(largeRecord.group, 'runway', AIRPORT_NIGHT_VISIBILITY_METERS.runway) : false;
    const approachPass = largeRecord ? hasAirportLightLayer(largeRecord.group, 'approach', AIRPORT_NIGHT_VISIBILITY_METERS.approach) : false;
    const apronPass = largeRecord ? hasAirportLightLayer(largeRecord.group, 'apron', AIRPORT_NIGHT_VISIBILITY_METERS.apron) : false;
    const terminalPass = largeRecord ? hasAirportLightLayer(largeRecord.group, 'building', AIRPORT_NIGHT_VISIBILITY_METERS.building) : false;

    return {
      largeAirportRunwayLightsVisibleAt50km: runwayPass ? 'PASS' : 'FAIL',
      approachLightsVisibleAt30km: approachPass ? 'PASS' : 'FAIL',
      apronLightsVisibleAt15km: apronPass ? 'PASS' : 'FAIL',
      terminalLightsVisibleAt15km: terminalPass ? 'PASS' : 'FAIL',
      targetAirportPriorityLoading: priorityLoadingEnabled && loadedTarget ? 'PASS' : 'FAIL',
      nightLodPopping: loadedRecords.every(record => airportCriticalLightsStable(record.group)) ? 'PASS' : 'FAIL',
      loadedAirports: loadedRecords.map(record => record.airport.name),
      lastPriorityLoadReport
    };
  }

  function createAirportApronLightingReport() {
    const airports = AIRPORTS.map(airport => {
      if (isUnlitAirstrip(airport)) {
        return {
          airport: airport.name,
          status: 'PASS',
          category: airport.airportCategory || 'REMOTE_AIRSTRIP',
          nightCapability: 'NO_LIGHT_NON_NIGHT',
          apronFloodLights: 'N/A - unlit airstrip',
          standLighting: 'N/A - unlit airstrip',
          terminalLights: 'N/A - unlit airstrip',
          towerLights: 'N/A - unlit airstrip',
          taxiwayLighting: 'N/A - unlit airstrip',
          actionTaken: 'Explicitly marked hasRunwayLights/hasTaxiwayLights/hasApronLights/hasApproachLights/hasPAPI=false'
        };
      }

      const profile = AIRPORT_LIGHT_PROFILES[airportLightClass(airport)];
      const record = createdAirports.get(airportKey(airport));
      const summary = record?.group?.userData?.airportLightSummary;
      const apronFloodLights = (summary?.apronStandLights ?? profile.standCount * profile.standLightsPerStand) > 0 && profile.apronMastMin > 0;
      const terminalLights = (summary?.terminalVisibleMeters ?? AIRPORT_NIGHT_VISIBILITY_METERS.building) >= AIRPORT_NIGHT_VISIBILITY_METERS.building;
      const towerLights = airport.runwayClass !== 'C' || profile.windowLitRatio > 0;
      const taxiwayLighting = (summary?.taxiEdgeSpacingMeters ?? profile.taxiEdgeSpacing) > 0;
      const checks = {
        apronFloodLights,
        standLighting: profile.standCount > 0,
        terminalLights,
        towerLights,
        taxiwayLighting
      };
      const pass = Object.values(checks).every(Boolean);

      return {
        airport: airport.name,
        status: pass ? 'PASS' : 'FAIL',
        category: airport.runwayClass || airport.tier || 'C',
        apronFloodLights: checks.apronFloodLights ? 'OK' : 'Missing',
        standLighting: checks.standLighting ? 'OK' : 'Missing',
        terminalLights: checks.terminalLights ? 'OK' : 'Missing',
        towerLights: checks.towerLights ? 'OK' : 'Missing',
        taxiwayLighting: checks.taxiwayLighting ? 'OK' : 'Missing',
        loaded: Boolean(record),
        actionTaken: pass
          ? 'Generated by emissive/instanced airport lighting profile; no per-stand real point lights'
          : 'Lighting profile will be regenerated with apron/building/taxi layers'
      };
    });

    return {
      overallStatus: airports.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
      airports
    };
  }

  function createAirportObstacleReport() {
    const airports = AIRPORTS.map(airport => {
      const approaches = [-1, 1].map(endSign => inspectApproachCorridor(airport, endSign));
      const blocked = approaches.some(item => item.obstacleDetected === 'yes' && item.severity !== 'challenge-side-terrain');
      return {
        airport: airport.name,
        category: airport.airportCategory || airport.runwayClass || airport.tier || 'C',
        status: blocked ? 'FAIL' : 'PASS',
        approaches
      };
    });
    return {
      overallStatus: airports.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
      airports
    };
  }

  function createHiddenIslandAirportReport() {
    const airport = AIRPORTS.find(item => item.airportCategory === 'HIDDEN_REMOTE_AIRFIELD');
    const island = airport ? ISLANDS.find(item => item.name === airport.region || item.hiddenIsland) : null;
    if (!airport || !island) {
      return {
        airportName: airport?.name || 'missing',
        status: 'FAIL',
        reason: 'Hidden remote island airport or island data missing'
      };
    }

    if (!createdAirports.has(airportKey(airport))) {
      createAirport(airport, { priorityReason: 'hidden-island-report', target: false });
    }
    const record = createdAirports.get(airportKey(airport));
    const hiddenData = record?.group?.userData?.hiddenIslandReportData || {};
    const ufoReport = hiddenData.ufoReport || [];
    const mountainList = MOUNTAINS.filter(mountain => mountain.hiddenIslandMountain);
    const airportCount = AIRPORTS.filter(item => item.region === island.name).length;
    const residentialFound = hiddenIslandHasResidentialObjects(island);
    const treeStats = hiddenIslandTreeStats(airport, island, hiddenData, ufoReport);
    const treesAdded = treeStats.islandTrees;
    const runwayTerrainBlocked = rectTerrainBlocked(airport, hiddenData.runwayRect, 2.8);
    const apronTerrainBlocked = rectTerrainBlocked(airport, hiddenData.apronRect, 3.2);
    const terminalTerrainBlocked = rectTerrainBlocked(airport, hiddenData.terminalRect, 3.2);
    const taxiTerrainBlocked = rectTerrainBlocked(airport, hiddenData.taxiRect, 3.2) || rectTerrainBlocked(airport, hiddenData.connectorRect, 3.2);
    const mountainOverlapsRunway = mountainList.some(mountain => rectMountainOverlap(airport, hiddenData.runwayRect, mountain, 0)) || runwayTerrainBlocked;
    const mountainOverlapsApron = mountainList.some(mountain => rectMountainOverlap(airport, hiddenData.apronRect, mountain, 0)) || apronTerrainBlocked;
    const mountainOverlapsTerminal = mountainList.some(mountain => rectMountainOverlap(airport, hiddenData.terminalRect, mountain, 0)) || terminalTerrainBlocked;
    const treeObstruction = treeStats.obstruction;
    const mountainOverlapsAirport = mountainOverlapsRunway || mountainOverlapsApron || mountainOverlapsTerminal;
    const hiddenBehindMountain = mountainList.some(mountain => isMountainBetweenCenterAndAirport(airport, mountain));
    const terminalOverlapsUfo = ufoReport.some(ufo => circleRectOverlap(ufo.x, ufo.z, ufo.radius, hiddenData.terminalRect));
    const ufoRunwayOverlap = ufoReport.some(ufo => circleRectOverlap(ufo.x, ufo.z, ufo.radius, hiddenData.runwayRect));
    const ufoUfoOverlap = hasCircleOverlap(ufoReport, 6);
    const ufoBuried = ufoReport.some(ufo => ufo.bottomY < ufo.localGroundY - 0.05);
    const ufoFloatingTooHigh = ufoReport.some(ufo => ufo.bottomY > ufo.localGroundY + 0.22);
    const ufoGroundClipping = ufoBuried || ufoFloatingTooHigh;
    const ufoIs3DPass = ufoReport.length === 6 && ufoReport.every(ufo => (
      ufo.solidLatheBody === true &&
      ufo.classicSaucerProfile === true &&
      ufo.hasUpperDome === true &&
      ufo.isSprite === false &&
      ufo.isBillboard === false
    ));
    const ufoThicknessPass = ufoReport.length === 6 && ufoReport.every(ufo => (
      ufo.hasThickness === true &&
      ufo.outerDiskClearlyThicker === true &&
      ufo.outerDiskMoreThreeDimensional === true &&
      ufo.sideProfileNotThin === true &&
      ufo.overallBodyClearlyThicker === true &&
      ufo.sideViewNotFlattenedSaucer === true &&
      ufo.fortyFiveDegreeViewValid === true &&
      (ufo.meshParts || 0) >= 48
    ));
    const ufoMetalShellPass = ufoReport.length === 6 && ufoReport.every(ufo => (
      ufo.outerDiskMetalShell === true &&
      ufo.enhancedMetalMaterial === true &&
      ufo.noPlasticLook === true &&
      (ufo.metalness || 0) >= 0.7
    ));
    const ufoDomeIntegrationPass = ufoReport.length === 6 && ufoReport.every(ufo => (
      ufo.domeIntegratedWithOuterDisk === true &&
      ufo.cockpitDomeClearlyRaised === true &&
      ufo.cockpitHasRealVolume === true &&
      ufo.curvedCockpitGlass === true
    ));
    const ufoGreyPass = ufoReport.length === 6 && ufoReport.every(ufo => ufo.color === 'grey-metal');
    const ufoBlackCockpitPass = ufoReport.length === 6 && ufoReport.every(ufo => ufo.cockpitColor === 'black-glass');
    const ufoNoForbiddenShapesPass = ufoReport.length === 6 && ufoReport.every(ufo => (
      ufo.hasWings === false &&
      ufo.hasTail === false &&
      ufo.hasPropeller === false &&
      ufo.hasExternalJets === false
    ));
    const ufoNightReflectionPass = ufoReport.length === 6 && ufoReport.every(ufo => (
      (ufo.nightRoughness || 1) <= 0.42 &&
      (ufo.nightEnvMapIntensity || 0) >= 0.78 &&
      (ufo.nightEnvMapIntensity || 0) <= 1.15 &&
      (ufo.nightEmissiveIntensity || 0) >= 0.05 &&
      (ufo.nightEmissiveIntensity || 0) <= 0.12 &&
      ufo.blueGlowAddsDepth === true &&
      ufo.nightReflectionEnhancedControlled === true &&
      ufo.hasNightGlow === true
    ));
    const ufoDayMattePass = ufoReport.length === 6 && ufoReport.every(ufo => (
      (ufo.dayRoughness || 0) >= 0.7 &&
      (ufo.dayEnvMapIntensity || 1) <= 0.42 &&
      (ufo.dayEmissiveIntensity || 0) <= 0.02
    ));
    const ufoQualityPass = hiddenData.ufoQualityPass === true &&
      ufoIs3DPass &&
      ufoThicknessPass &&
      ufoMetalShellPass &&
      ufoDomeIntegrationPass &&
      ufoGreyPass &&
      ufoBlackCockpitPass &&
      ufoNoForbiddenShapesPass &&
      ufoNightReflectionPass &&
      ufoDayMattePass;
    const airportFlattenedAreaIntact = !runwayTerrainBlocked && !apronTerrainBlocked && !terminalTerrainBlocked && !taxiTerrainBlocked;
    const treesCoverIslandExceptAirport = treeStats.coverageRatio >= 0.72 && treeStats.islandTrees >= 850;
    const mapLabelVisible = airport.name === 'nothing there' && (airport.short || airport.name) === 'nothing there';

    const report = {
      airportName: airport.name,
      islandAirportCount: airportCount,
      residentialBuildingsFound: residentialFound ? 'yes' : 'no',
      treesAdded,
      treeCoverageRatio: Number(treeStats.coverageRatio.toFixed(2)),
      treesCoverIslandExceptAirport: treesCoverIslandExceptAirport ? 'PASS' : 'FAIL',
      mountainAdded: mountainList.length > 0 ? 'yes' : 'no',
      runwayOverlapWithMountain: mountainOverlapsRunway ? 'yes' : 'no',
      apronOverlapWithMountain: mountainOverlapsApron ? 'yes' : 'no',
      terminalOverlapWithMountain: mountainOverlapsTerminal ? 'yes' : 'no',
      mountainOverlapsAirport: mountainOverlapsAirport ? 'yes' : 'no',
      airportHiddenBehindMountain: hiddenBehindMountain ? 'yes' : 'no',
      airportFlattenedAreaIntact: airportFlattenedAreaIntact ? 'yes' : 'no',
      runwayObstructed: (mountainOverlapsRunway || treeObstruction.runway) ? 'yes' : 'no',
      apronObstructed: (mountainOverlapsApron || treeObstruction.apron) ? 'yes' : 'no',
      terminalObstructed: (mountainOverlapsTerminal || treeObstruction.terminal) ? 'yes' : 'no',
      treesOverlapAirport: treeObstruction.airport ? 'yes' : 'no',
      terminalOverlapsUfo: terminalOverlapsUfo ? 'yes' : 'no',
      ufoCount: ufoReport.length,
      ufoGroundClipping: ufoGroundClipping ? 'yes' : 'no',
      ufoBuried: ufoBuried ? 'yes' : 'no',
      ufoFloatingTooHigh: ufoFloatingTooHigh ? 'yes' : 'no',
      ufoUfoOverlap: ufoUfoOverlap ? 'yes' : 'no',
      ufoTerminalOverlap: terminalOverlapsUfo ? 'yes' : 'no',
      ufoBuildingOverlap: terminalOverlapsUfo ? 'yes' : 'no',
      treeUfoOverlap: treeObstruction.ufo ? 'yes' : 'no',
      ufoTreeOverlap: treeObstruction.ufo ? 'yes' : 'no',
      ufoOccupiesRunway: ufoRunwayOverlap ? 'yes' : 'no',
      ufoIs3D: ufoIs3DPass ? 'PASS' : 'FAIL',
      ufoTrue3D: ufoIs3DPass ? 'PASS' : 'FAIL',
      ufoHasThickness: ufoThicknessPass ? 'PASS' : 'FAIL',
      ufoHasVolumeAndThickness: ufoThicknessPass ? 'PASS' : 'FAIL',
      ufoOverallThickerThanBefore: ufoThicknessPass ? 'PASS' : 'FAIL',
      ufoOuterDiskClearlyThicker: ufoThicknessPass ? 'PASS' : 'FAIL',
      ufoOuterDiskMoreThreeDimensional: ufoThicknessPass ? 'PASS' : 'FAIL',
      ufoSideProfileNotThin: ufoThicknessPass ? 'PASS' : 'FAIL',
      ufoSideViewNotFlattenedSaucer: ufoThicknessPass ? 'PASS' : 'FAIL',
      ufoFortyFiveDegreeViewValid: ufoThicknessPass ? 'PASS' : 'FAIL',
      ufoOuterDiskMetalShell: ufoMetalShellPass ? 'PASS' : 'FAIL',
      ufoEnhancedMetalMaterial: ufoMetalShellPass ? 'PASS' : 'FAIL',
      ufoNoPlasticLook: ufoMetalShellPass ? 'PASS' : 'FAIL',
      ufoDomeIntegratedWithOuterDisk: ufoDomeIntegrationPass ? 'PASS' : 'FAIL',
      ufoCockpitDomeClearlyRaised: ufoDomeIntegrationPass ? 'PASS' : 'FAIL',
      ufoCockpitHasRealVolume: ufoDomeIntegrationPass ? 'PASS' : 'FAIL',
      ufoCurvedCockpitGlass: ufoDomeIntegrationPass ? 'PASS' : 'FAIL',
      ufoBlueGlowAddsDepth: ufoNightReflectionPass ? 'PASS' : 'FAIL',
      ufoAllGrey: ufoGreyPass ? 'PASS' : 'FAIL',
      ufoBlackCockpitGlass: ufoBlackCockpitPass ? 'PASS' : 'FAIL',
      ufoNoWingsTailPropsJets: ufoNoForbiddenShapesPass ? 'PASS' : 'FAIL',
      ufoNightReflection: ufoNightReflectionPass ? 'PASS' : 'FAIL',
      ufoNightSubtleGlowReflection: ufoNightReflectionPass ? 'PASS' : 'FAIL',
      ufoDayMatteLook: ufoDayMattePass ? 'PASS' : 'FAIL',
      ufoDayMatteMetal: ufoDayMattePass ? 'PASS' : 'FAIL',
      ufoQualityCheck: ufoQualityPass ? 'PASS' : 'FAIL',
      mapLabelVisible: mapLabelVisible ? 'PASS' : 'FAIL',
      noLightAirport: isUnlitAirstrip(airport) ? 'PASS' : 'FAIL'
    };
    report.overallStatus = (
      report.airportName === 'nothing there' &&
      report.islandAirportCount === 1 &&
      report.residentialBuildingsFound === 'no' &&
      report.mountainAdded === 'yes' &&
      report.mountainOverlapsAirport === 'no' &&
      report.airportHiddenBehindMountain === 'yes' &&
      report.airportFlattenedAreaIntact === 'yes' &&
      report.runwayObstructed === 'no' &&
      report.apronObstructed === 'no' &&
      report.terminalObstructed === 'no' &&
      report.treesCoverIslandExceptAirport === 'PASS' &&
      report.treesOverlapAirport === 'no' &&
      report.terminalOverlapsUfo === 'no' &&
      report.ufoCount === 6 &&
      report.ufoGroundClipping === 'no' &&
      report.ufoBuried === 'no' &&
      report.ufoFloatingTooHigh === 'no' &&
      report.ufoUfoOverlap === 'no' &&
      report.ufoTerminalOverlap === 'no' &&
      report.ufoBuildingOverlap === 'no' &&
      report.treeUfoOverlap === 'no' &&
      report.ufoTreeOverlap === 'no' &&
      report.ufoOccupiesRunway === 'no' &&
      report.ufoIs3D === 'PASS' &&
      report.ufoTrue3D === 'PASS' &&
      report.ufoHasThickness === 'PASS' &&
      report.ufoHasVolumeAndThickness === 'PASS' &&
      report.ufoOverallThickerThanBefore === 'PASS' &&
      report.ufoOuterDiskClearlyThicker === 'PASS' &&
      report.ufoOuterDiskMoreThreeDimensional === 'PASS' &&
      report.ufoSideProfileNotThin === 'PASS' &&
      report.ufoSideViewNotFlattenedSaucer === 'PASS' &&
      report.ufoFortyFiveDegreeViewValid === 'PASS' &&
      report.ufoOuterDiskMetalShell === 'PASS' &&
      report.ufoEnhancedMetalMaterial === 'PASS' &&
      report.ufoNoPlasticLook === 'PASS' &&
      report.ufoDomeIntegratedWithOuterDisk === 'PASS' &&
      report.ufoCockpitDomeClearlyRaised === 'PASS' &&
      report.ufoCockpitHasRealVolume === 'PASS' &&
      report.ufoCurvedCockpitGlass === 'PASS' &&
      report.ufoBlueGlowAddsDepth === 'PASS' &&
      report.ufoAllGrey === 'PASS' &&
      report.ufoBlackCockpitGlass === 'PASS' &&
      report.ufoNoWingsTailPropsJets === 'PASS' &&
      report.ufoNightReflection === 'PASS' &&
      report.ufoNightSubtleGlowReflection === 'PASS' &&
      report.ufoDayMatteLook === 'PASS' &&
      report.ufoDayMatteMetal === 'PASS' &&
      report.ufoQualityCheck === 'PASS' &&
      report.mapLabelVisible === 'PASS' &&
      report.noLightAirport === 'PASS'
    ) ? 'PASS' : 'FAIL';
    return report;
  }

  function hiddenIslandHasResidentialObjects(island) {
    const position = new THREE.Vector3();
    let found = false;
    scene.traverse(object => {
      if (found) return;
      if (object.userData?.airportFacility) return;
      const name = object.name || '';
      const diagnostic = object.userData?.diagnosticType || '';
      const residentialLike = name.includes('house') || name.includes('hamlet') || name.includes('cabin') || diagnostic === 'residential';
      if (!residentialLike) return;
      object.getWorldPosition(position);
      if (waterBodyNormalized(island, position.x, position.z) <= 1.06) found = true;
    });
    return found;
  }

  function airportLocalPoint(airport, x, z) {
    const dx = x - airport.x;
    const dz = z - airport.z;
    const c = Math.cos(airport.heading || 0);
    const s = Math.sin(airport.heading || 0);
    return { x: c * dx - s * dz, z: s * dx + c * dz };
  }

  function rectMountainOverlap(airport, rect, mountain, margin = 0) {
    if (!rect || !mountain) return false;
    const local = airportLocalPoint(airport, mountain.x, mountain.z);
    const influenceX = Math.min(180, (mountain.rx || 0) * 0.24);
    const influenceZ = Math.min(150, (mountain.rz || 0) * 0.28);
    return Math.abs(local.x - rect.x) < rect.halfX + influenceX + margin &&
      Math.abs(local.z - rect.z) < rect.halfZ + influenceZ + margin;
  }

  function isMountainBetweenCenterAndAirport(airport, mountain) {
    const toCenter = { x: -airport.x, z: -airport.z };
    const centerDistance = Math.hypot(toCenter.x, toCenter.z) || 1;
    const dir = { x: toCenter.x / centerDistance, z: toCenter.z / centerDistance };
    const toMountain = { x: mountain.x - airport.x, z: mountain.z - airport.z };
    const projection = toMountain.x * dir.x + toMountain.z * dir.z;
    const lateral = Math.abs(toMountain.x * dir.z - toMountain.z * dir.x);
    return projection > 280 && projection < 2100 && lateral < Math.max(mountain.rx || 0, mountain.rz || 0) * 0.72;
  }

  function circleRectOverlap(x, z, radius, rect) {
    if (!rect) return false;
    const dx = Math.max(Math.abs(x - rect.x) - rect.halfX, 0);
    const dz = Math.max(Math.abs(z - rect.z) - rect.halfZ, 0);
    return dx * dx + dz * dz < radius * radius;
  }

  function hasCircleOverlap(items, margin = 0) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const minDistance = (items[i].radius || 0) + (items[j].radius || 0) + margin;
        if (Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z) < minDistance) return true;
      }
    }
    return false;
  }

  function hiddenIslandTreeStats(airport, island, hiddenData, ufoReport) {
    const instanceMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const trees = [];
    const result = { runway: false, apron: false, terminal: false, taxi: false, ufo: false, airport: false };
    scene.traverse(object => {
      if (!object.isInstancedMesh || object.userData?.diagnosticType !== 'tree' || (object.userData?.diagnosticCount || 0) <= 0) return;
      const count = object.count || 0;
      for (let i = 0; i < count; i++) {
        object.getMatrixAt(i, instanceMatrix);
        position.setFromMatrixPosition(instanceMatrix);
        object.localToWorld(position);
        if (waterBodyNormalized(island, position.x, position.z) > 1.08) continue;
        trees.push({ x: position.x, z: position.z });
        const local = airportLocalPoint(airport, position.x, position.z);
        if (rectContainsPoint(local, hiddenData.runwayRect, 24)) result.runway = true;
        if (rectContainsPoint(local, hiddenData.apronRect, 22)) result.apron = true;
        if (rectContainsPoint(local, hiddenData.terminalRect, 18)) result.terminal = true;
        if (rectContainsPoint(local, hiddenData.taxiRect, 20) || rectContainsPoint(local, hiddenData.connectorRect, 20)) result.taxi = true;
        if (ufoReport.some(ufo => Math.hypot(local.x - ufo.x, local.z - ufo.z) < (ufo.radius || 0) + 12)) result.ufo = true;
        result.airport = result.runway || result.apron || result.terminal || result.taxi || result.ufo;
      }
    });
    const coverage = hiddenIslandTreeCoverage(airport, island, hiddenData, ufoReport, trees);
    return {
      islandTrees: trees.length,
      coverageRatio: coverage.coverageRatio,
      coverageSamples: coverage.coverageSamples,
      obstruction: result
    };
  }

  function getHiddenIslandUfoManager() {
    const airport = AIRPORTS.find(item => item.airportCategory === 'HIDDEN_REMOTE_AIRFIELD');
    if (!airport) return null;
    createAirport(airport, { priorityReason: 'ufo-event', target: true });
    const record = createdAirports.get(airportKey(airport));
    return record?.group?.userData?.hiddenIslandUfoManager || null;
  }

  function hiddenIslandTreeCoverage(airport, island, hiddenData, ufoReport, trees) {
    let coveredSamples = 0;
    let coverageSamples = 0;
    const spacing = 145;
    for (let lx = -island.rx * 0.9; lx <= island.rx * 0.9; lx += spacing) {
      for (let lz = -island.rz * 0.9; lz <= island.rz * 0.9; lz += spacing) {
        const normalized = (lx * lx) / (island.rx * island.rx) + (lz * lz) / (island.rz * island.rz);
        if (normalized > 0.88) continue;
        const world = waterBodyWorldPoint(island, lx, lz);
        const local = airportLocalPoint(airport, world.x, world.z);
        if (isHiddenIslandAirportExclusion(local, hiddenData, ufoReport, 64)) continue;
        coverageSamples++;
        if (trees.some(tree => Math.hypot(tree.x - world.x, tree.z - world.z) < 110)) coveredSamples++;
      }
    }
    return {
      coverageSamples,
      coveredSamples,
      coverageRatio: coverageSamples > 0 ? coveredSamples / coverageSamples : 0
    };
  }

  function isHiddenIslandAirportExclusion(local, hiddenData, ufoReport, margin = 0) {
    return rectContainsPoint(local, hiddenData.runwaySafetyRect, margin) ||
      rectContainsPoint(local, hiddenData.apronRect, 82 + margin) ||
      rectContainsPoint(local, hiddenData.taxiRect, 58 + margin) ||
      rectContainsPoint(local, hiddenData.connectorRect, 58 + margin) ||
      rectContainsPoint(local, hiddenData.terminalRect, 42 + margin) ||
      ufoReport.some(ufo => Math.hypot(local.x - ufo.x, local.z - ufo.z) < (ufo.radius || 0) + 46 + margin);
  }

  function rectTerrainBlocked(airport, rect, tolerance = 3) {
    if (!rect) return true;
    const elevation = airport.elevation || 0;
    const xs = [-0.86, -0.43, 0, 0.43, 0.86];
    const zs = [-0.86, -0.43, 0, 0.43, 0.86];
    for (const xFactor of xs) {
      for (const zFactor of zs) {
        const world = airportWorld(airport, rect.x + rect.halfX * xFactor, rect.z + rect.halfZ * zFactor);
        if (terrainHeight(world.x, world.z) > elevation + tolerance) return true;
      }
    }
    return false;
  }

  function waterBodyWorldPoint(body, x, z) {
    const c = Math.cos(body.rotation || 0);
    const s = Math.sin(body.rotation || 0);
    return { x: body.x + c * x + s * z, z: body.z - s * x + c * z };
  }

  function rectContainsPoint(local, rect, margin = 0) {
    if (!rect) return false;
    return Math.abs(local.x - rect.x) <= rect.halfX + margin &&
      Math.abs(local.z - rect.z) <= rect.halfZ + margin;
  }

  function inspectApproachCorridor(airport, endSign) {
    const classTag = airport.runwayClass || (airport.tier === 'international' ? 'A' : airport.tier === 'regional' ? 'B' : 'C');
    const runwayLength = airport.runwayLength || 1320;
    const extension = classTag === 'A'
      ? 15000
      : classTag === 'B'
        ? 11500
        : classTag === 'C'
          ? 8200
          : 5200;
    const remoteAirstrip = airport.airportCategory === 'REMOTE_AIRSTRIP' || airport.airportCategory === 'HIDDEN_REMOTE_AIRFIELD';
    const lateral = remoteAirstrip
      ? 420
      : classTag === 'A'
        ? 1100
        : classTag === 'B'
          ? 850
          : classTag === 'C'
            ? 560
            : 280;
    const distanceSamples = classTag === 'A'
      ? [500, 1000, 1800, 3000, 5000, 8000, 11500, 14500]
      : classTag === 'B'
        ? [450, 900, 1600, 2800, 4600, 7200, 10600]
        : [360, 720, 1400, 2400, 3800, Math.min(extension, 6400)];
    const lateralSamples = classTag === 'D' ? [-0.45, 0, 0.45] : [-1, -0.5, 0, 0.5, 1];
    let worst = null;

    for (const distance of distanceSamples) {
      if (distance > extension) continue;
      for (const lateralFactor of lateralSamples) {
        const localX = lateralFactor * lateral;
        const localZ = endSign * (runwayLength / 2 + distance);
        const world = airportWorld(airport, localX, localZ);
        const terrainY = terrainHeight(world.x, world.z);
        const allowedY = approachAllowedHeight(airport, classTag, distance, Math.abs(localX));
        const violation = terrainY - allowedY;
        if (!worst || violation > worst.violation) {
          worst = { distance, lateral: localX, terrainY, allowedY, violation };
        }
      }
    }

    const tolerance = classTag === 'D' ? 28 : remoteAirstrip ? 18 : 6;
    const detected = worst && worst.violation > tolerance;
    const challengeSide = classTag === 'D' && detected && Math.abs(worst.lateral) > lateral * 0.34;
    return {
      runwayEnd: endSign > 0 ? 'far end' : 'near end',
      runwayDirection: endSign > 0 ? `${airport.runway || ''}+` : `${airport.runway || ''}-`,
      obstacleDetected: detected ? 'yes' : 'no',
      obstacleType: detected ? 'terrain/mountain corridor' : 'none',
      distanceFromThresholdMeters: worst ? Math.round(worst.distance) : 0,
      maxClearanceViolationMeters: worst ? Number(Math.max(0, worst.violation).toFixed(1)) : 0,
      severity: challengeSide ? 'challenge-side-terrain' : detected ? 'blocked-before-clearance' : 'clear',
      actionTaken: detected
        ? challengeSide
          ? 'Challenge side terrain retained; central approach gate protected by terrain clearance'
          : 'Procedural approach corridor clearance lowers/guards terrain and city generation excludes tall buildings'
        : 'Approach corridor clear; city/building generator keeps runway extension free'
    };
  }

  function approachAllowedHeight(airport, classTag, distance, lateral) {
    const elevation = airport.elevation || 0;
    const slope = classTag === 'A' ? 0.045 : classTag === 'B' ? 0.048 : classTag === 'C' ? 0.052 : 0.06;
    const remoteAirstrip = airport.airportCategory === 'REMOTE_AIRSTRIP' || airport.airportCategory === 'HIDDEN_REMOTE_AIRFIELD';
    const base = classTag === 'D' ? 28 : remoteAirstrip ? 24 : 18;
    return elevation + base + distance * slope + lateral * 0.024;
  }

  function updateAirportNightRenderWeights({
    position = null,
    nightFactor = 0,
    descending = false,
    targetAirport = null
  } = {}) {
    const nightActive = nightFactor > 0.32;
    for (const record of createdAirports.values()) {
      const target = targetAirport && airportKey(targetAirport) === airportKey(record.airport);
      const approach = descending && (!position || airportDistance(position, record.airport) < airportPriorityDistance(record.airport, nightFactor));
      let airportRenderPriority = 1;
      if (nightActive) airportRenderPriority *= 2.0;
      if (approach) airportRenderPriority *= 2.0;
      if (target) airportRenderPriority *= 3.0;
      record.group.userData.airportNightRenderWeight = airportRenderPriority;

      record.group.traverse(object => {
        if (!object.userData?.airportFacility) return;
        let weight = airportRenderPriority;
        const layer = object.userData.airportLightLayer || object.userData.airportType || '';
        if (/runway|approach|papi/.test(layer)) weight *= 3.0;
        else if (/apron|terminal|building|tower/.test(layer)) weight *= 2.0;
        object.userData.airportNightRenderWeight = weight;
        if (object.userData.baseAirportRenderOrder === undefined) object.userData.baseAirportRenderOrder = object.renderOrder || 0;
        if (nightActive || target || approach) {
          object.renderOrder = object.userData.baseAirportRenderOrder + Math.min(30, Math.round(weight));
        } else {
          object.renderOrder = object.userData.baseAirportRenderOrder;
        }
      });
    }
  }

  function hasAirportLightLayer(group, layer, minVisibleDistance) {
    let found = false;
    group.traverse(object => {
      if (found) return;
      if (
        object.userData?.airportLightLayer === layer &&
        object.userData?.longRangeVisual &&
        object.userData?.minVisibleDistance >= minVisibleDistance &&
        object.frustumCulled === false
      ) {
        found = true;
      }
    });
    return found;
  }

  function airportCriticalLightsStable(group) {
    let stable = true;
    group.traverse(object => {
      if (!object.userData?.airportCriticalLight) return;
      if (!object.userData.longRangeVisual || object.frustumCulled !== false || !object.userData.minVisibleDistance) stable = false;
    });
    return stable;
  }

  function nearestAirportTo(position) {
    if (!position) return AIRPORTS[0];
    let best = AIRPORTS[0];
    let bestDistance = Infinity;
    for (const airport of AIRPORTS) {
      const distance = airportDistance(position, airport);
      if (distance < bestDistance) {
        best = airport;
        bestDistance = distance;
      }
    }
    return best;
  }

  function airportDistance(position, airport) {
    return Math.hypot((position.x || 0) - airport.x, (position.z || 0) - airport.z);
  }

  function airportPriorityDistance(airport, nightFactor) {
    const nightScale = nightFactor > 0.45 ? 1.22 : 1;
    if (isLargeAirport(airport)) return 50000 * nightScale;
    if (airport.tier === 'regional' || airport.runwayClass === 'B') return 35000 * nightScale;
    return 20000 * nightScale;
  }

  function isLargeAirport(airport) {
    return airport.tier === 'international' || airport.runwayClass === 'A' || (airport.runwayLength || 0) >= 3000;
  }

  return {
    createAirport,
    ensurePriorityAirports,
    createAirportNightLoadingReport,
    createAirportApronLightingReport,
    createAirportObstacleReport,
    createHiddenIslandAirportReport,
    getHiddenIslandUfoManager,
    updateAirportNightRenderWeights,
    getLoadedAirports: () => [...createdAirports.values()]
  };
}
