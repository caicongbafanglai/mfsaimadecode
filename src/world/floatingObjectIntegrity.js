import * as THREE from '../../three.module.min.js?v=202605050057';
import {
  AIRPORTS,
  BAYS,
  EDGE_OCEAN_WIDTH,
  ISLANDS,
  LAKES,
  MAP_SIZE,
  RIVER_SURFACE_Y,
  WATER_LEVEL
} from '../data/worldData.js?v=202605070100';
import {
  airportLocal,
  closestLandSignedDistance,
  closestWaterBodyNormalized,
  distanceToMapEdge,
  distanceToRiver,
  isInAirportExclusionZone,
  isInAirportPavementLocal,
  isInRunwayProtectedArea,
  sampleFootprintHeights,
  waterBodyNormalized
} from './spatial.js?v=202605056000';

const FLOATING_TOLERANCE = Object.freeze({
  building: 0.15,
  natural: 0.1,
  tree: 0.1,
  smallObject: 0.1,
  streetlight: 0.05,
  airportLight: 0.05,
  road: 0.05,
  airportPavement: 0.03,
  vehicle: 0.1,
  boat: 1.35,
  ufoParked: 0.08
});

const AIRBORNE_UFO_STATES = new Set([
  'AIRBORNE',
  'TAKING_OFF',
  'DEPARTING',
  'VERTICAL_TAKEOFF',
  'HOVER',
  'TRACK_PLAYER',
  'FAST_DEPARTURE',
  'WORLD_VISIBLE',
  'WORLD_TRACKING',
  'WORLD_DEPARTING'
]);

const STATIC_UFO_STATES = new Set(['PARKED', 'PRE_ACTIVATE']);
const tmpBox = new THREE.Box3();
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpWorldPosition = new THREE.Vector3();
const tmpParentScale = new THREE.Vector3();

export function runFloatingObjectGlobalIntegrity({
  scene,
  terrainHeight,
  label = 'manual',
  maxRounds = 4
} = {}) {
  const aggregate = createGlobalReport(label);
  let finalRound = null;

  for (let round = 1; round <= maxRounds; round++) {
    const roundReport = createRoundReport(round);
    scanSceneRound(scene, terrainHeight, roundReport);
    aggregate.rounds.push(roundReport);
    aggregate.fixedObjects += roundReport.fixedObjects;
    aggregate.deletedInvalidObjects += roundReport.deletedInvalidObjects;
    aggregate.airportReport.airportFloatingIssuesFixed += roundReport.airportReport.airportFloatingIssuesFixed;
    aggregate.cityLightReport.fixedDeleted += roundReport.cityLightReport.fixedDeleted;
    aggregate.boatReport.fixedBoats += roundReport.boatReport.fixedBoats;
    aggregate.boatReport.deletedInvalidBoats += roundReport.boatReport.deletedInvalidBoats;
    finalRound = roundReport;

    if (round >= 2 && roundReport.floatingObjectsFound === 0 && roundReport.buriedObjectsFound === 0 && roundReport.unresolvedObjects.length === 0) {
      break;
    }
  }

  finalizeGlobalReport(aggregate, finalRound || createRoundReport(0));
  return aggregate;
}

export function augmentFloatingObjectGlobalReport(report, {
  groundReport = null,
  urbanInfrastructureReport = null,
  roadNetworkReport = null,
  hiddenIslandAirportReport = null
} = {}) {
  if (!report) return report;
  const urban = urbanInfrastructureReport || {};
  const roadReport = mergeCounts(urban.roadReport, roadNetworkReport);
  const bridgeReport = mergeCounts(urban.bridgeReport, roadNetworkReport?.bridgeReport);
  const vehicleReport = urban.vehicleReport || {};
  const windowLightReport = urban.windowLightReport || {};
  const streetlightReport = urban.streetlightReport || {};

  report.byCategory.roadsFloating += roadReport.floatingRoadSegments || 0;
  report.byCategory.bridgesInvalid += (bridgeReport.floatingBridgeCount || 0) + (bridgeReport.bridgeRoadMisalignmentCount || 0);
  report.byCategory.streetlightsFloating += (streetlightReport.floatingStreetlights || 0) + (streetlightReport.buriedStreetlights || 0);
  report.byCategory.windowLightsOrphanFloating += (windowLightReport.orphanWindowLights || 0) + (windowLightReport.floatingWindowLights || 0);
  report.byCategory.vehiclesFloatingOffRoad += (vehicleReport.vehiclesOffRoadCount || 0) + (vehicleReport.vehiclesEnteringAirportZones || 0);

  if (hiddenIslandAirportReport?.ufoGroundClipping === 'yes') report.byCategory.ufoStateLocationErrors++;
  if (hiddenIslandAirportReport?.airportFlattenedAreaIntact === 'no') report.byCategory.airportRunwayTaxiwayApronIssues++;

  report.airportReport.runwaysChecked = Math.max(report.airportReport.runwaysChecked, report.airportReport.runwayObjectsChecked);
  report.airportReport.taxiwaysChecked = Math.max(report.airportReport.taxiwaysChecked, report.airportReport.taxiwayObjectsChecked);
  report.airportReport.apronChecked = Math.max(report.airportReport.apronChecked, report.airportReport.apronObjectsChecked);
  report.airportReport.airportFloatingIssuesFixed += groundReport?.floatingAirportObjectsFixed || 0;
  report.cityLightReport.orphanWindowLights += windowLightReport.orphanWindowLights || 0;
  report.cityLightReport.floatingCityLights += windowLightReport.floatingWindowLights || 0;
  report.cityLightReport.airportZoneGhostLights += windowLightReport.windowLightsInAirportZones || 0;
  report.cityLightReport.fixedDeleted += windowLightReport.fixedCount || 0;
  report.vehicleReport.offRoadVehicles += vehicleReport.vehiclesOffRoadCount || 0;
  report.vehicleReport.vehiclesInAirportZones += vehicleReport.vehiclesEnteringAirportZones || 0;
  report.vehicleReport.fixedDeleted += vehicleReport.vehiclesFixedCount || 0;
  report.supportReports = {
    groundPlacement: groundReport,
    urbanInfrastructure: urbanInfrastructureReport,
    roadNetwork: roadNetworkReport,
    hiddenIslandAirport: hiddenIslandAirportReport
  };
  report.text = formatFloatingObjectGlobalReport(report);
  return report;
}

function scanSceneRound(scene, terrainHeight, report) {
  const objects = [];
  scene.updateMatrixWorld(true);
  scene.traverse(object => objects.push(object));

  for (const object of objects) {
    if (!object || object.parent === null && object !== scene) continue;
    const scannedCount = objectInstanceCount(object);
    report.totalObjectsScanned += scannedCount;
    if (object === scene) continue;
    if (isAllowedAirborneObject(object)) {
      report.allowedFloatingObjects += scannedCount;
      continue;
    }

    if (object.userData?.windowLightBatch) {
      inspectWindowLightBatch(object, report);
      continue;
    }

    if (object.userData?.bridge) {
      inspectBridge(object, terrainHeight, report);
      continue;
    }

    if (object.userData?.groundPlacement) {
      inspectGroundPlacementObject(object, report);
      continue;
    }

    if (object.userData?.airportLightLayer) {
      inspectAirportLightObject(object, report);
      continue;
    }

    if (object.isInstancedMesh && object.userData?.terrainConformingPatch) {
      continue;
    }

    if (object.isInstancedMesh && object.userData?.diagnosticType) {
      inspectInstancedDiagnosticObject(object, terrainHeight, report);
      continue;
    }

    if (object.userData?.diagnosticType === 'ship' || object.name?.includes('waterway-traffic-boats')) {
      inspectBoatObject(object, report);
      continue;
    }

    if (object.userData?.ufoEvent || object.userData?.hiddenIslandUfo || object.userData?.ufoState) {
      inspectUfoObject(object, report);
      continue;
    }

    if (object.userData?.terrainConformingPatch) {
      inspectTerrainPatch(object, terrainHeight, report);
      continue;
    }

    if (hasSupportedAncestor(object)) continue;
    inspectGenericGroundObject(object, terrainHeight, report);
  }
}

function inspectGroundPlacementObject(object, report) {
  const placement = object.userData.groundPlacement;
  const category = placementCategory(object, placement);
  const tolerance = toleranceForGroundPlacement(object, placement);
  const baseY = groundPlacedBaseY(object);
  if (!Number.isFinite(baseY) || !Number.isFinite(placement.objectY)) return;

  incrementCategoryChecked(report, category, placement.checked || 1, object);
  if (object.userData?.airportLightLayer) recordAirportLightCount(report, object);
  if (object.userData?.airportLightSummary) {
    report.airportReport.runwaysChecked++;
    report.airportReport.taxiwaysChecked++;
    report.airportReport.apronChecked++;
    report.airportReport.papiChecked += object.userData.airportLightSummary.papiLights || 0;
  }
  const delta = baseY - placement.objectY;
  if (delta > tolerance) {
    moveObjectByWorldY(object, -delta);
    markIssue(report, category, 'floating', object, `base ${delta.toFixed(2)}m above support`, true);
  } else if (delta < -tolerance) {
    moveObjectByWorldY(object, -delta);
    markIssue(report, category, 'buried', object, `base ${Math.abs(delta).toFixed(2)}m below support`, true);
  }
}

function inspectAirportLightObject(object, report) {
  const count = recordAirportLightCount(report, object);
  if (object.userData.renderedAsPhysicalFixtures || object.userData.airportFixtureSupport) return;
  const airportParent = closestAirportAncestor(object);
  if (!airportParent) {
    markIssue(report, 'airportFacilities', 'floating', object, 'airport light has no airport parent/support', false);
  }
}

function recordAirportLightCount(report, object) {
  const count = finiteCount(object.userData?.lightPointCount || object.userData?.airportFixtureCount, objectInstanceCount(object));
  const layer = object.userData.airportLightLayer || 'airport';
  report.airportReport.airportLightsChecked += count;
  if (layer === 'runway') report.airportReport.runwayLightsChecked += count;
  if (layer === 'approach') report.airportReport.approachLightsChecked += count;
  if (layer === 'taxi') report.airportReport.taxiwayLightsChecked += count;
  if (/papi/.test(object.name || object.userData.airportType || '')) report.airportReport.papiChecked += count;
  return count;
}

function inspectInstancedDiagnosticObject(object, terrainHeight, report) {
  const type = object.userData.diagnosticType;
  if (type === 'building') {
    if ((object.userData.diagnosticCount || 0) <= 0 || /foundation|roof/i.test(object.name || '')) return;
    inspectInstancedGroundBatch(object, terrainHeight, report, {
      category: 'buildings',
      tolerance: FLOATING_TOLERANCE.building,
      targetY: (x, z, scale) => terrainMaxForFootprint(x, z, Math.max(1, scale.x), Math.max(1, scale.z), terrainHeight)
    });
    return;
  }
  if (type === 'tree') {
    if ((object.userData.diagnosticCount || 0) <= 0) return;
    inspectInstancedGroundBatch(object, terrainHeight, report, {
      category: 'trees',
      tolerance: FLOATING_TOLERANCE.tree,
      targetY: (x, z) => terrainHeight(x, z)
    });
    return;
  }
  if (type === 'streetlight') {
    inspectStreetlightBatch(object, terrainHeight, report);
    return;
  }
  if (type === 'vehicle') {
    inspectVehicleBatch(object, report);
    return;
  }
  if (type === 'ship') {
    inspectBoatObject(object, report);
  }
}

function inspectInstancedGroundBatch(object, terrainHeight, report, { category, tolerance, targetY }) {
  ensureGeometryBoundingBox(object.geometry);
  const bounds = object.geometry.boundingBox;
  const parentScaleY = getParentWorldScaleY(object);
  const count = Math.min(object.count || object.instanceMatrix.count || 0, object.userData.diagnosticCount || object.count || 0);
  let dirty = false;

  for (let i = 0; i < count; i++) {
    object.getMatrixAt(i, tmpMatrix);
    tmpMatrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
    tmpWorldPosition.copy(tmpPosition);
    object.localToWorld(tmpWorldPosition);
    const bottomY = tmpWorldPosition.y + bounds.min.y * tmpScale.y * parentScaleY;
    const supportY = targetY(tmpWorldPosition.x, tmpWorldPosition.z, tmpScale, i);
    const delta = bottomY - supportY;
    incrementCategoryChecked(report, category, 1, object);
    if (delta > tolerance || delta < -tolerance) {
      tmpPosition.y -= delta / parentScaleY;
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      object.setMatrixAt(i, tmpMatrix);
      dirty = true;
      markIssue(report, category, delta > 0 ? 'floating' : 'buried', object, `instance ${i} base delta ${delta.toFixed(2)}m`, true, tmpWorldPosition);
    }
  }

  if (dirty) {
    object.instanceMatrix.needsUpdate = true;
    object.computeBoundingSphere?.();
  }
}

function inspectStreetlightBatch(object, terrainHeight, report) {
  const count = object.userData.diagnosticCount || object.count || 0;
  report.byCategory.streetlightsChecked += count;
  if (!object.userData.hasRoadSegmentIds) {
    markIssue(report, 'streetlights', 'floating', object, 'streetlight batch missing roadSegmentId bindings', false);
    return;
  }
  inspectInstancedGroundBatch(object, terrainHeight, report, {
    category: 'streetlights',
    tolerance: FLOATING_TOLERANCE.streetlight,
    targetY: (x, z) => terrainHeight(x, z)
  });
}

function inspectVehicleBatch(object, report) {
  const count = object.userData.diagnosticCount || object.count || 0;
  report.vehicleReport.vehiclesChecked += count;
  report.byCategory.vehiclesChecked += count;
}

function inspectTerrainPatch(object, terrainHeight, report) {
  if (!object.geometry?.attributes?.position) return;
  const positions = object.geometry.attributes.position;
  const offset = object.userData.groundOffset ?? 0;
  const category = object.userData.roadSurface ? 'roads' : 'natural';
  const tolerance = category === 'roads' ? FLOATING_TOLERANCE.road : FLOATING_TOLERANCE.natural;
  let dirty = false;

  for (let i = 0; i < positions.count; i++) {
    tmpWorldPosition.set(positions.getX(i), positions.getY(i), positions.getZ(i));
    object.localToWorld(tmpWorldPosition);
    const supportY = terrainHeight(tmpWorldPosition.x, tmpWorldPosition.z) + offset;
    const delta = tmpWorldPosition.y - supportY;
    if (delta > tolerance || delta < -tolerance) {
      positions.setY(i, positions.getY(i) - delta);
      dirty = true;
      markIssue(report, category, delta > 0 ? 'floating' : 'buried', object, `terrain patch vertex ${i} delta ${delta.toFixed(2)}m`, true, tmpWorldPosition);
    }
  }

  incrementCategoryChecked(report, category, 1, object);
  if (dirty) {
    positions.needsUpdate = true;
    object.geometry.computeVertexNormals?.();
    object.geometry.computeBoundingSphere?.();
  }
}

function inspectWindowLightBatch(object, report) {
  const count = object.userData.windowLightCount || object.userData.sourceWindowLights || objectInstanceCount(object);
  report.cityLightReport.windowLightsChecked += count;
  if (!object.userData.attachedToBuildingFacade || object.userData.hasParentBuildingIds === false) {
    removeInvalidObject(object);
    report.cityLightReport.orphanWindowLights += count;
    report.cityLightReport.fixedDeleted += count;
    report.deletedInvalidObjects += count;
    return;
  }

  if (windowLightBatchTouchesAirportZone(object)) {
    removeInvalidObject(object);
    report.cityLightReport.airportZoneGhostLights += count;
    report.cityLightReport.fixedDeleted += count;
    report.deletedInvalidObjects += count;
  }
}

function windowLightBatchTouchesAirportZone(object) {
  const geometry = object.geometry;
  if (!geometry?.attributes?.position && !object.isInstancedMesh) return false;
  const maxSamples = 16;
  if (object.isInstancedMesh) {
    const count = Math.min(object.count || 0, maxSamples);
    for (let i = 0; i < count; i++) {
      object.getMatrixAt(i, tmpMatrix);
      tmpMatrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
      tmpWorldPosition.copy(tmpPosition);
      object.localToWorld(tmpWorldPosition);
      if (isInAirportExclusionZone(tmpWorldPosition.x, tmpWorldPosition.z, 10) || isInRunwayProtectedArea(tmpWorldPosition.x, tmpWorldPosition.z, 12)) return true;
    }
    return false;
  }

  const positions = geometry.attributes.position;
  const step = Math.max(1, Math.floor(positions.count / maxSamples));
  for (let i = 0; i < positions.count; i += step) {
    tmpWorldPosition.set(positions.getX(i), positions.getY(i), positions.getZ(i));
    object.localToWorld(tmpWorldPosition);
    if (isInAirportExclusionZone(tmpWorldPosition.x, tmpWorldPosition.z, 10) || isInRunwayProtectedArea(tmpWorldPosition.x, tmpWorldPosition.z, 12)) return true;
  }
  return false;
}

function inspectBridge(object, terrainHeight, report) {
  report.bridgeReport.bridgesChecked++;
  const position = object.getWorldPosition(tmpWorldPosition).clone();
  const deckLength = object.userData.deckLength || 0;
  const rampLength = object.userData.rampLength || 0;
  const centerTerrainY = terrainHeight(position.x, position.z);
  const clearance = position.y - WATER_LEVEL;
  const localDeckClearance = position.y - centerTerrainY;
  let invalid = false;
  let reason = '';

  if (rampLength < 80) {
    invalid = true;
    reason = 'ramp length below grounded-road minimum';
  } else if (centerTerrainY < WATER_LEVEL + 28 && (clearance < 8 || clearance > 92)) {
    invalid = true;
    reason = `deck clearance ${clearance.toFixed(1)}m outside valid range`;
  } else if (centerTerrainY >= WATER_LEVEL + 28 && (localDeckClearance < 4 || localDeckClearance > 42)) {
    invalid = true;
    reason = `deck clearance ${localDeckClearance.toFixed(1)}m outside local terrain support range`;
  } else if (deckLength > 0 && bridgeEndSlopeTooHigh(object, terrainHeight)) {
    invalid = true;
    reason = 'bridge ramp endpoint not naturally aligned with terrain';
  }

  if (invalid) {
    markIssue(report, 'bridges', 'floating', object, reason, false, position);
  }
}

function bridgeEndSlopeTooHigh(object, terrainHeight) {
  const deckLength = object.userData.deckLength || 0;
  const rampLength = object.userData.rampLength || 0;
  const roadWidth = object.userData.roadWidth || 50;
  if (deckLength <= 0 || rampLength <= 0) return false;
  const deckY = object.position.y + 4.08;
  for (const end of [-1, 1]) {
    const far = localToWorldXZ(object, 0, end * (deckLength / 2 + rampLength + roadWidth));
    const ground = terrainHeight(far.x, far.z) + 1.05;
    if (Math.abs(deckY - ground) / Math.max(1, rampLength) > 0.22) return true;
  }
  return false;
}

function inspectBoatObject(object, report) {
  if (object.name === 'waterway-traffic-boats') return;
  if (object.userData?.diagnosticType !== 'ship' && !/boat|cargo|ferry|fishing|waterway/.test(object.name || '')) return;

  const count = objectInstanceCount(object);
  report.boatReport.boatsChecked += count;
  if (object.isPoints && object.geometry?.attributes?.position) {
    inspectSimpleBoatPoints(object, report);
    return;
  }

  object.getWorldPosition(tmpWorldPosition);
  const x = tmpWorldPosition.x;
  const z = tmpWorldPosition.z;
  if (!isValidBoatWaterPoint(x, z)) {
    removeInvalidObject(object);
    report.boatReport.deletedInvalidBoats += count;
    report.deletedInvalidObjects += count;
    return;
  }

  const desiredY = boatSurfaceY(x, z);
  const delta = tmpWorldPosition.y - desiredY;
  if (Math.abs(delta) > FLOATING_TOLERANCE.boat) {
    moveObjectByWorldY(object, -delta);
    markIssue(report, 'boats', delta > 0 ? 'floating' : 'buried', object, `boat waterline delta ${delta.toFixed(2)}m`, true);
  }
}

function inspectSimpleBoatPoints(object, report) {
  const positions = object.geometry.attributes.position;
  let dirty = false;
  for (let i = 0; i < object.geometry.drawRange.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    if (!isValidBoatWaterPoint(x, z)) {
      report.boatReport.invalidBoats++;
      continue;
    }
    const desiredY = boatSurfaceY(x, z) + 0.14;
    const delta = positions.getY(i) - desiredY;
    if (Math.abs(delta) > FLOATING_TOLERANCE.boat) {
      positions.setY(i, desiredY);
      dirty = true;
      markIssue(report, 'boats', delta > 0 ? 'floating' : 'buried', object, `simple boat ${i} waterline delta ${delta.toFixed(2)}m`, true, { x, y: desiredY, z });
    }
  }
  if (dirty) {
    positions.needsUpdate = true;
    object.geometry.computeBoundingSphere?.();
  }
}

function inspectUfoObject(object, report) {
  const state = object.userData?.ufoState || object.userData?.hiddenUfoState || '';
  report.ufoReport.ufoChecked++;
  if (AIRBORNE_UFO_STATES.has(state) || object.userData?.ufoEvent) {
    report.ufoReport.airborneUfoCount++;
    return;
  }
  if (STATIC_UFO_STATES.has(state) || object.userData?.hiddenIslandUfo) {
    report.ufoReport.parkedUfoCount++;
    const placement = object.userData?.groundPlacement;
    if (placement) inspectGroundPlacementObject(object, report);
    return;
  }
  if (state) markIssue(report, 'ufos', 'floating', object, `unknown UFO state ${state}`, false);
}

function inspectGenericGroundObject(object, terrainHeight, report) {
  if (!object.isMesh || object.isInstancedMesh || !object.geometry) return;
  if (object.userData?.optionalGroundDetail === true) return;
  if (isLandscapeScaleObject(object)) return;
  const worldBox = objectWorldBox(object);
  if (!worldBox) return;
  object.getWorldPosition(tmpWorldPosition);
  if (!Number.isFinite(tmpWorldPosition.x) || !Number.isFinite(tmpWorldPosition.z)) return;
  if (tmpWorldPosition.y > terrainHeight(tmpWorldPosition.x, tmpWorldPosition.z) + 420) return;

  const supportY = terrainHeight(tmpWorldPosition.x, tmpWorldPosition.z);
  const delta = worldBox.min.y - supportY;
  if (delta > FLOATING_TOLERANCE.smallObject || delta < -FLOATING_TOLERANCE.smallObject) {
    moveObjectByWorldY(object, -delta);
    markIssue(report, 'natural', delta > 0 ? 'floating' : 'buried', object, `generic object base delta ${delta.toFixed(2)}m`, true);
  }
  incrementCategoryChecked(report, 'natural', 1, object);
}

function markIssue(report, category, issueKind, object, reason, fixed, positionOverride = null) {
  if (issueKind === 'floating') report.floatingObjectsFound++;
  if (issueKind === 'buried') report.buriedObjectsFound++;
  incrementCategoryIssue(report, category, issueKind);
  if (fixed) {
    report.fixedObjects++;
    incrementFixed(report, category);
    return;
  }
  const point = positionOverride || object.getWorldPosition?.(tmpWorldPosition) || { x: 0, y: 0, z: 0 };
  report.unresolvedObjects.push({
    type: category,
    name: object.name || object.type || 'object',
    x: Number((point.x || 0).toFixed(2)),
    y: Number((point.y || 0).toFixed(2)),
    z: Number((point.z || 0).toFixed(2)),
    reason
  });
}

function incrementCategoryChecked(report, category, amount, object) {
  if (category === 'buildings') report.byCategory.buildingsChecked += amount;
  else if (category === 'airportFacilities') {
    report.byCategory.airportFacilitiesChecked += amount;
    const type = object.userData?.airportType || object.userData?.groundPlacement?.name || '';
    if (/runway/.test(type)) report.airportReport.runwayObjectsChecked += amount;
    if (/taxi/.test(type)) report.airportReport.taxiwayObjectsChecked += amount;
    if (/apron/.test(type)) report.airportReport.apronObjectsChecked += amount;
    if (/papi/.test(type)) report.airportReport.papiChecked += amount;
  } else if (category === 'roads') report.byCategory.roadsChecked += amount;
  else if (category === 'trees') report.byCategory.treesChecked += amount;
  else if (category === 'streetlights') report.byCategory.streetlightsChecked += amount;
  else if (category === 'natural') report.byCategory.naturalChecked += amount;
}

function incrementCategoryIssue(report, category, issueKind) {
  const floating = issueKind === 'floating';
  if (category === 'buildings' && floating) report.byCategory.buildingsFloating++;
  else if (category === 'buildings') report.byCategory.buildingsBuried++;
  else if (category === 'roads') report.byCategory.roadsFloating++;
  else if (category === 'bridges') report.byCategory.bridgesInvalid++;
  else if (category === 'airportFacilities') {
    report.byCategory.airportFacilitiesFloating++;
    report.byCategory.airportRunwayTaxiwayApronIssues++;
  } else if (category === 'trees') report.byCategory.treesFloating++;
  else if (category === 'streetlights') report.byCategory.streetlightsFloating++;
  else if (category === 'boats') report.byCategory.boatsInvalid++;
  else if (category === 'ufos') report.byCategory.ufoStateLocationErrors++;
}

function incrementFixed(report, category) {
  if (category === 'airportFacilities') report.airportReport.airportFloatingIssuesFixed++;
  if (category === 'boats') report.boatReport.fixedBoats++;
  if (category === 'streetlights') report.cityLightReport.fixedDeleted++;
}

function finalizeGlobalReport(report, finalRound) {
  const airportFloatingIssuesFixed = report.airportReport.airportFloatingIssuesFixed;
  const cityLightFixedDeleted = report.cityLightReport.fixedDeleted;
  const fixedBoats = report.boatReport.fixedBoats;
  const deletedInvalidBoats = report.boatReport.deletedInvalidBoats;
  report.byCategory = finalRound.byCategory;
  report.airportReport = finalRound.airportReport;
  report.cityLightReport = finalRound.cityLightReport;
  report.vehicleReport = finalRound.vehicleReport;
  report.boatReport = finalRound.boatReport;
  report.bridgeReport = finalRound.bridgeReport;
  report.ufoReport = finalRound.ufoReport;
  report.airportReport.airportFloatingIssuesFixed = airportFloatingIssuesFixed;
  report.cityLightReport.fixedDeleted = cityLightFixedDeleted;
  report.boatReport.fixedBoats = fixedBoats;
  report.boatReport.deletedInvalidBoats = deletedInvalidBoats;
  report.totalObjectsScanned = finalRound.totalObjectsScanned;
  report.floatingObjectsFound = finalRound.unresolvedObjects.length ? finalRound.floatingObjectsFound : 0;
  report.buriedObjectsFound = finalRound.unresolvedObjects.length ? finalRound.buriedObjectsFound : 0;
  report.unresolvedObjects = finalRound.unresolvedObjects;
  report.allowedFloatingObjects = finalRound.allowedFloatingObjects;
  report.status = report.floatingObjectsFound === 0 && report.buriedObjectsFound === 0 && report.unresolvedObjects.length === 0 ? 'PASS' : 'FAIL';
  report.text = formatFloatingObjectGlobalReport(report);
}

function formatFloatingObjectGlobalReport(report) {
  const unresolved = report.unresolvedObjects.length
    ? report.unresolvedObjects.map(item => `  - ${item.type} ${item.name} @ (${item.x}, ${item.y}, ${item.z}): ${item.reason}`).join('\n')
    : '  - none';
  return [
    'Floating Object Global Report:',
    `- total objects scanned: ${report.totalObjectsScanned}`,
    `- floating objects found: ${report.floatingObjectsFound}`,
    `- buried objects found: ${report.buriedObjectsFound}`,
    `- fixed objects: ${report.fixedObjects}`,
    `- deleted invalid objects: ${report.deletedInvalidObjects}`,
    `- unresolved objects: ${report.unresolvedObjects.length}`,
    '',
    'By Category:',
    `- buildings floating: ${report.byCategory.buildingsFloating}`,
    `- roads floating: ${report.byCategory.roadsFloating}`,
    `- bridges invalid: ${report.byCategory.bridgesInvalid}`,
    `- airport facilities floating: ${report.byCategory.airportFacilitiesFloating}`,
    `- trees floating: ${report.byCategory.treesFloating}`,
    `- streetlights floating: ${report.byCategory.streetlightsFloating}`,
    `- window lights orphan/floating: ${report.byCategory.windowLightsOrphanFloating}`,
    `- vehicles floating/off-road: ${report.byCategory.vehiclesFloatingOffRoad}`,
    `- boats invalid: ${report.byCategory.boatsInvalid}`,
    `- UFO state/location errors: ${report.byCategory.ufoStateLocationErrors}`,
    `- airport runway/taxiway/apron issues: ${report.byCategory.airportRunwayTaxiwayApronIssues}`,
    '',
    'Airport Report:',
    `- runways checked: ${report.airportReport.runwaysChecked}`,
    `- taxiways checked: ${report.airportReport.taxiwaysChecked}`,
    `- apron checked: ${report.airportReport.apronChecked}`,
    `- runway lights checked: ${report.airportReport.runwayLightsChecked}`,
    `- approach lights checked: ${report.airportReport.approachLightsChecked}`,
    `- PAPI checked: ${report.airportReport.papiChecked}`,
    `- airport floating issues fixed: ${report.airportReport.airportFloatingIssuesFixed}`,
    '',
    'City Light Report:',
    `- orphan window lights: ${report.cityLightReport.orphanWindowLights}`,
    `- floating city lights: ${report.cityLightReport.floatingCityLights}`,
    `- airport-zone ghost lights: ${report.cityLightReport.airportZoneGhostLights}`,
    `- fixed/deleted: ${report.cityLightReport.fixedDeleted}`,
    '',
    'Vehicle Report:',
    `- off-road vehicles: ${report.vehicleReport.offRoadVehicles}`,
    `- vehicles in airport zones: ${report.vehicleReport.vehiclesInAirportZones}`,
    `- fixed/deleted: ${report.vehicleReport.fixedDeleted}`,
    '',
    'Unresolved Objects:',
    unresolved
  ].join('\n');
}

function createGlobalReport(label) {
  return {
    label,
    status: 'PENDING',
    totalObjectsScanned: 0,
    floatingObjectsFound: 0,
    buriedObjectsFound: 0,
    fixedObjects: 0,
    deletedInvalidObjects: 0,
    unresolvedObjects: [],
    allowedFloatingObjects: 0,
    rounds: [],
    byCategory: {
      buildingsChecked: 0,
      buildingsFloating: 0,
      buildingsBuried: 0,
      roadsChecked: 0,
      roadsFloating: 0,
      bridgesInvalid: 0,
      airportFacilitiesChecked: 0,
      airportFacilitiesFloating: 0,
      treesChecked: 0,
      treesFloating: 0,
      naturalChecked: 0,
      streetlightsChecked: 0,
      streetlightsFloating: 0,
      windowLightsOrphanFloating: 0,
      vehiclesChecked: 0,
      vehiclesFloatingOffRoad: 0,
      boatsInvalid: 0,
      ufoStateLocationErrors: 0,
      airportRunwayTaxiwayApronIssues: 0
    },
    airportReport: {
      runwaysChecked: 0,
      taxiwaysChecked: 0,
      apronChecked: 0,
      runwayObjectsChecked: 0,
      taxiwayObjectsChecked: 0,
      apronObjectsChecked: 0,
      runwayLightsChecked: 0,
      taxiwayLightsChecked: 0,
      approachLightsChecked: 0,
      airportLightsChecked: 0,
      papiChecked: 0,
      airportFloatingIssuesFixed: 0
    },
    cityLightReport: {
      windowLightsChecked: 0,
      orphanWindowLights: 0,
      floatingCityLights: 0,
      airportZoneGhostLights: 0,
      fixedDeleted: 0
    },
    vehicleReport: {
      vehiclesChecked: 0,
      offRoadVehicles: 0,
      vehiclesInAirportZones: 0,
      fixedDeleted: 0
    },
    boatReport: {
      boatsChecked: 0,
      invalidBoats: 0,
      fixedBoats: 0,
      deletedInvalidBoats: 0
    },
    bridgeReport: {
      bridgesChecked: 0
    },
    ufoReport: {
      ufoChecked: 0,
      parkedUfoCount: 0,
      airborneUfoCount: 0
    }
  };
}

function createRoundReport(round) {
  return {
    round,
    totalObjectsScanned: 0,
    floatingObjectsFound: 0,
    buriedObjectsFound: 0,
    fixedObjects: 0,
    deletedInvalidObjects: 0,
    unresolvedObjects: [],
    allowedFloatingObjects: 0,
    byCategory: createGlobalReport('round').byCategory,
    airportReport: createGlobalReport('round').airportReport,
    cityLightReport: createGlobalReport('round').cityLightReport,
    vehicleReport: createGlobalReport('round').vehicleReport,
    boatReport: createGlobalReport('round').boatReport,
    bridgeReport: createGlobalReport('round').bridgeReport,
    ufoReport: createGlobalReport('round').ufoReport
  };
}

function mergeCounts(primary = {}, secondary = {}) {
  const merged = { ...(primary || {}) };
  for (const [key, value] of Object.entries(secondary || {})) {
    if (typeof value === 'number') merged[key] = (merged[key] || 0) + value;
  }
  return merged;
}

function placementCategory(object, placement) {
  if (object.userData?.hiddenIslandUfo || object.userData?.ufoState || object.userData?.hiddenUfoState) return 'ufos';
  if (placement.category === 'airportFacility' || placement.airportFacility || object.userData?.airportFacility) return 'airportFacilities';
  if (object.userData?.bridge) return 'bridges';
  return 'buildings';
}

function toleranceForGroundPlacement(object, placement) {
  const name = `${object.userData?.airportType || placement.name || object.name || ''}`.toLowerCase();
  if (object.userData?.hiddenIslandUfo || object.userData?.hiddenUfoState) return FLOATING_TOLERANCE.ufoParked;
  if (/runway|taxiway|apron|pavement/.test(name)) return FLOATING_TOLERANCE.airportPavement;
  if (/light|papi|lamp/.test(name)) return FLOATING_TOLERANCE.airportLight;
  if (placement.category === 'airportFacility' || placement.airportFacility || object.userData?.airportFacility) return 0.2;
  return FLOATING_TOLERANCE.building;
}

function groundPlacedBaseY(object) {
  if ((object.isGroup && object.userData?.airportFacility && !object.userData?.hiddenIslandUfo) || object.userData?.lightPointCount) {
    return object.getWorldPosition(tmpWorldPosition).y;
  }
  const box = objectWorldBox(object);
  if (box) return box.min.y;
  return object.getWorldPosition(tmpWorldPosition).y;
}

function objectWorldBox(object) {
  try {
    tmpBox.setFromObject(object);
    if (tmpBox.isEmpty()) return null;
    return tmpBox.clone();
  } catch {
    return null;
  }
}

function moveObjectByWorldY(object, worldDeltaY) {
  const parentScaleY = getParentWorldScaleY(object);
  object.position.y += worldDeltaY / parentScaleY;
  object.updateMatrixWorld(true);
}

function getParentWorldScaleY(object) {
  if (!object.parent) return 1;
  object.parent.getWorldScale(tmpParentScale);
  return Math.max(0.0001, Math.abs(tmpParentScale.y || 1));
}

function ensureGeometryBoundingBox(geometry) {
  if (geometry && !geometry.boundingBox) geometry.computeBoundingBox();
}

function terrainMaxForFootprint(x, z, width, depth, terrainHeight) {
  const samples = sampleFootprintHeights({ x, z, width, depth, rotation: 0 }, terrainHeight);
  return samples.reduce((max, sample) => Math.max(max, sample.y), -Infinity);
}

function objectInstanceCount(object) {
  if (object.isInstancedMesh) return finiteCount(object.userData?.diagnosticCount || object.count, 1);
  if (object.isPoints) {
    const drawCount = object.geometry?.drawRange?.count;
    const positionCount = object.geometry?.attributes?.position?.count;
    return finiteCount(drawCount, finiteCount(positionCount, 1));
  }
  return finiteCount(object.userData?.diagnosticCount || object.userData?.lightPointCount || object.userData?.windowLightCount, 1);
}

function finiteCount(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isAllowedAirborneObject(object) {
  const diagnostic = object.userData?.diagnosticType;
  if (diagnostic === 'bird' || diagnostic === 'cloud') return true;
  if (diagnostic === 'aircraft') return true;
  if (object.userData?.aircraftLight) return true;
  if (object.userData?.ufoEvent) return true;
  const state = object.userData?.ufoState || object.userData?.hiddenUfoState;
  if (AIRBORNE_UFO_STATES.has(state)) return true;
  const name = `${object.name || ''}`.toLowerCase();
  return name.includes('sky') || name.includes('cloud') || name.includes('star') || name.includes('sun') || name.includes('moon');
}

function hasSupportedAncestor(object) {
  let parent = object.parent;
  while (parent) {
    const data = parent.userData || {};
    if (
      data.groundPlacement ||
      data.bridge ||
      data.airportFacility ||
      data.hiddenIslandUfo ||
      data.ufoEvent ||
      data.diagnosticType === 'aircraft' ||
      data.diagnosticType === 'ship' ||
      data.diagnosticType === 'building' ||
      data.diagnosticType === 'tree' ||
      data.diagnosticType === 'vehicle' ||
      data.diagnosticType === 'streetlight'
    ) return true;
    parent = parent.parent;
  }
  return false;
}

function closestAirportAncestor(object) {
  let parent = object.parent;
  while (parent) {
    if (parent.userData?.airportFacility || parent.userData?.airportName) return parent;
    parent = parent.parent;
  }
  return null;
}

function isLandscapeScaleObject(object) {
  const box = objectWorldBox(object);
  if (!box) return false;
  const sx = box.max.x - box.min.x;
  const sz = box.max.z - box.min.z;
  return sx > MAP_SIZE * 0.35 || sz > MAP_SIZE * 0.35 || sx * sz > MAP_SIZE * MAP_SIZE * 0.08;
}

function localToWorldXZ(object, x, z) {
  tmpWorldPosition.set(x, 0, z);
  object.localToWorld(tmpWorldPosition);
  return { x: tmpWorldPosition.x, z: tmpWorldPosition.z };
}

function isValidBoatWaterPoint(x, z) {
  if (distanceToRiver(x, z) < 108) return true;
  if (distanceToMapEdge(x, z) < EDGE_OCEAN_WIDTH - 12) return true;
  if (closestLandSignedDistance(x, z) < -18) return true;
  if (LAKES.some(lake => waterBodyNormalized(lake, x, z) < 0.96)) return true;
  const inBay = closestWaterBodyNormalized(BAYS, x, z) < 1.02;
  const onIsland = closestWaterBodyNormalized(ISLANDS, x, z) < 1.04;
  return inBay && !onIsland;
}

function boatSurfaceY(x, z) {
  for (const lake of LAKES) {
    if (waterBodyNormalized(lake, x, z) < 0.96) return (lake.level ?? WATER_LEVEL) + 0.78;
  }
  if (distanceToRiver(x, z) < 108) return RIVER_SURFACE_Y + 0.22;
  return WATER_LEVEL + 0.78;
}

function removeInvalidObject(object) {
  object.parent?.remove(object);
  disposeObject(object);
}

function disposeObject(object) {
  object.traverse?.(child => {
    child.geometry?.dispose?.();
    const materials = !child.material ? [] : Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose?.();
  });
}
