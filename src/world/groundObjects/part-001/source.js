import * as THREE from '../../three.module.min.js?v=202605050057';
import {
  AIRPORTS,
  BAYS,
  CITY_ZONES,
  EDGE_OCEAN_WIDTH,
  FOREST_CLUSTERS,
  ISLANDS,
  MAP_SIZE,
  MOUNTAINS,
  RIVER_SURFACE_Y,
  VILLAGES,
  WATER_LEVEL
} from '../data/worldData.js?v=202605070100';
import {
  airportLocal,
  airportWorld,
  closestLakeNormalized,
  closestWaterBodyNormalized,
  distanceToMapEdge,
  distanceToRiver,
  isChallengeEnd,
  isInAirportExclusionZone,
  isInAirportPavementLocal,
  isInRunwayApproach,
  isInRunwayProtectedArea,
  isNearRunwaySafety,
  isRunwayEndUrbanRoadZone,
  liftSurfaceMaterial,
  markGroundPlacement,
  smoothstep,
  terrainPlacementHeight,
  waterBodyBoundaryPoint,
  waterBodyNormalized,
  waterBodyWorld
} from './spatial.js?v=202605056000';
import { createFarmlandRegions as createFarmlandRegionsModule } from './groundObjects/farmland.js?v=202605060300';
import { createLowGrassMeadows as createLowGrassMeadowsModule } from './groundObjects/grass.js?v=202605060300';
import { createPatchRect, createTerrainPatchFactory, rotatedOffset } from './groundObjects/shared.js?v=202605056000';

const TRAFFIC_CAR_CAPACITY = 768;
const WINDOW_LIGHT_WALL_OFFSET = 0.055;
const WINDOW_LIGHT_GLOW_OFFSET = 0.08;
const CITY_ROAD_PRIMARY_WIDTH = 38;
const CITY_ROAD_SECONDARY_WIDTH = 24;
const STREETLIGHT_HEIGHT = 11.5;
const STREETLIGHT_EDGE_OFFSET = 7.5;
const CITY_WINDOW_NEAR_FADE_START = 2600;
const CITY_WINDOW_NEAR_FADE_END = 6200;
const CITY_WINDOW_FAR_FADE_START = 2200;
const CITY_WINDOW_FAR_FADE_END = 6200;
const CITY_FAR_WINDOW_DOT_STRIDE = 2;
const CITY_BRIDGE_DECK_SURFACE_Y = 3.08;
const CITY_BRIDGE_EDGE_HEIGHT = 2.8;
const CITY_BRIDGE_MIN_RAMP_LENGTH = 92;
const VEHICLE_ROAD_SURFACE_CLEARANCE = 0.28;
const VILLAGE_VEHICLE_TERRAIN_Y_OFFSET = 1.38;
const VEHICLE_COLOR_ORDER = [
  'white',
  'black',
  'silver',
  'gray',
  'dark gray',
  'blue',
  'dark blue',
  'red',
  'burgundy',
  'green',
  'dark green',
  'brown',
  'beige',
  'pale yellow'
];
const VEHICLE_COLOR_PROFILES = {
  city: [
    { name: 'white', hex: 0xf2f4f2, weight: 20 },
    { name: 'black', hex: 0x15181c, weight: 14 },
    { name: 'silver', hex: 0xc7ccd0, weight: 16 },
    { name: 'gray', hex: 0x777d82, weight: 14 },
    { name: 'dark gray', hex: 0x3f454a, weight: 10 },
    { name: 'blue', hex: 0x315f98, weight: 6 },
    { name: 'dark blue', hex: 0x18395f, weight: 5 },
    { name: 'red', hex: 0xaa3834, weight: 5 },
    { name: 'burgundy', hex: 0x6e2931, weight: 3 },
    { name: 'green', hex: 0x496f4a, weight: 3 },
    { name: 'dark green', hex: 0x264633, weight: 2 },
    { name: 'brown', hex: 0x73543c, weight: 2 },
    { name: 'beige', hex: 0xc7b995, weight: 2 },
    { name: 'pale yellow', hex: 0xd7c87b, weight: 1 }
  ],
  rural: [
    { name: 'white', hex: 0xeff1ed, weight: 22 },
    { name: 'black', hex: 0x17191b, weight: 12 },
    { name: 'silver', hex: 0xbfc4c6, weight: 16 },
    { name: 'gray', hex: 0x70777a, weight: 14 },
    { name: 'dark gray', hex: 0x45484a, weight: 12 },
    { name: 'blue', hex: 0x3a638b, weight: 4 },
    { name: 'dark blue', hex: 0x203a58, weight: 4 },
    { name: 'red', hex: 0x9c4036, weight: 3 },
    { name: 'burgundy', hex: 0x642f35, weight: 2 },
    { name: 'green', hex: 0x4c6b45, weight: 3 },
    { name: 'dark green', hex: 0x2f4a34, weight: 3 },
    { name: 'brown', hex: 0x73553d, weight: 4 },
    { name: 'beige', hex: 0xc7b896, weight: 4 },
    { name: 'pale yellow', hex: 0xd2c47b, weight: 1 }
  ]
};
let farCityWindowSpriteTexture = null;

function createEmptyVehicleColorDistribution() {
  return Object.fromEntries(VEHICLE_COLOR_ORDER.map(name => [name, 0]));
}

function weightedVehicleColor(profile, rng) {
  const totalWeight = profile.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * totalWeight;
  for (const entry of profile) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return profile[profile.length - 1];
}

export function createGroundWorld({ scene, trafficCars, terrainHeight, mulberry32, getRenderQuality = () => null }) {
  const createTerrainConformingPatch = createTerrainPatchFactory({ scene, terrainHeight });
  const structureFootprints = [];
  const groundOverlayRects = [];
  let trafficUpdateDebt = 0;
  let vehicleFixCount = 0;
  const vehicleLastColorByArea = new Map();
  const houseWindowGeometry = new THREE.PlaneGeometry(4.2, 3.2);
  const houseWindowGlowGeometry = new THREE.PlaneGeometry(8.6, 6.2);
  const buildingWindowGeometry = new THREE.PlaneGeometry(1, 1);
  const streetlightPoleGeometry = new THREE.CylinderGeometry(0.42, 0.56, 1, 8);
  const streetlightLampGeometry = new THREE.SphereGeometry(1, 8, 6);
  const foundationMaterial = new THREE.MeshStandardMaterial({ color: 0x6e6854, roughness: 0.94, metalness: 0.01 });
  const streetlightPoleMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5658, roughness: 0.62, metalness: 0.16 });
  const warmWindowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd68a, transparent: true, opacity: 0.0, depthWrite: false });
  const coolWindowMaterial = new THREE.MeshBasicMaterial({ color: 0xb9dcff, transparent: true, opacity: 0.0, depthWrite: false });
  const warmWindowGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffb967, transparent: true, opacity: 0.0, depthWrite: false });
  const coolWindowGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xb9dcff, transparent: true, opacity: 0.0, depthWrite: false });
  const streetlightLampMaterial = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.0, depthWrite: false });
  const trafficRenderer = createTrafficRenderer();
  const urbanIntegrityReport = createUrbanIntegrityReport();
  warmWindowMaterial.userData.nightControlled = true;
  warmWindowMaterial.userData.nightOnlyVisual = true;
  warmWindowMaterial.userData.baseOpacity = 0.0;
  warmWindowMaterial.userData.nightOpacity = 0.86;
  coolWindowMaterial.userData.nightControlled = true;
  coolWindowMaterial.userData.nightOnlyVisual = true;
  coolWindowMaterial.userData.baseOpacity = 0.0;
  coolWindowMaterial.userData.nightOpacity = 0.46;
  warmWindowGlowMaterial.userData.nightControlled = true;
  warmWindowGlowMaterial.userData.nightOnlyVisual = true;
  warmWindowGlowMaterial.userData.baseOpacity = 0.0;
  warmWindowGlowMaterial.userData.nightOpacity = 0.34;
  coolWindowGlowMaterial.userData.nightControlled = true;
  coolWindowGlowMaterial.userData.nightOnlyVisual = true;
  coolWindowGlowMaterial.userData.baseOpacity = 0.0;
  coolWindowGlowMaterial.userData.nightOpacity = 0.18;
  streetlightLampMaterial.userData.nightControlled = true;
  streetlightLampMaterial.userData.nightOnlyVisual = true;
  streetlightLampMaterial.userData.baseOpacity = 0.0;
  streetlightLampMaterial.userData.nightOpacity = 0.92;
  for (const material of [warmWindowMaterial, coolWindowMaterial, warmWindowGlowMaterial, coolWindowGlowMaterial, streetlightLampMaterial]) {
    material.blending = THREE.AdditiveBlending;
    material.toneMapped = false;
  }

  function createUrbanIntegrityReport() {
    return {
      windowLightReport: {
        totalWindowLights: 0,
        orphanWindowLights: 0,
        floatingWindowLights: 0,
        windowLightsOnRoads: 0,
        windowLightsInAirportZones: 0,
        windowLightsOnRunway: 0,
        fixedCount: 0
      },
      roadReport: {
        totalRoads: 0,
        floatingRoadSegments: 0,
        roadSegmentsInRiversSea: 0,
        roadSegmentsInsideAirportZones: 0,
        roadSegmentsCrossingRunway: 0,
        fixedCount: 0
      },
      streetlightReport: {
        totalStreetlights: 0,
        floatingStreetlights: 0,
        buriedStreetlights: 0,
        streetlightsIntersectingBuildings: 0,
        streetlightsIntersectingTrees: 0,
        streetlightsInAirportZones: 0,
        streetlightsOnRunwayTaxiwayApron: 0,
        fixedCount: 0
      },
      bridgeReport: {
        totalBridgesAdded: 0,
        smallBridgesCount: 0,
        mediumBridgesCount: 0,
        largeBridgesCount: 0,
        bridgesWithValidRamps: 0,
        floatingBridgeCount: 0,
        bridgeRoadMisalignmentCount: 0,
        bridgesOverlappingAirportZones: 0,
        bridgesFixedCount: 0,
        plannedBridgeCandidatesSkipped: 0,
        secondaryBridgeCandidatesSkipped: 0,
        spacingBridgeCandidatesSkipped: 0
      },
      vehicleReport: {
        totalActiveVehicles: 0,
        vehiclesOnValidRoads: 0,
        vehiclesOnBridges: 0,
        vehiclesOffRoadCount: 0,
        vehiclesEnteringAirportZones: 0,
        vehiclesOnRunways: 0,
        vehiclesOnTaxiways: 0,
        vehiclesOnAprons: 0,
        vehiclesFixedCount: 0,
        vehicleColorsAdded: VEHICLE_COLOR_ORDER.length,
        vehicleColorDistribution: createEmptyVehicleColorDistribution()
      },
      riverCrossingReport: {
        riverRoadCrossingsDetected: 0,
        crossingsConvertedToBridges: 0,
        unresolvedCrossings: 0
      }
    };
  }

  function createUrbanInfrastructureReport() {
    refreshVehicleIntegrityReport();
    return JSON.parse(JSON.stringify(urbanIntegrityReport));
  }

  function registerStructureFootprint(x, z, radius) {
    structureFootprints.push({ x, z, radius });
  }

  function isStructureFootprintBlocked(x, z, margin = 0) {
    return structureFootprints.some(footprint => Math.hypot(x - footprint.x, z - footprint.z) < footprint.radius + margin);
  }

  function placeStructureGroupOnTerrain(group, x, z, width, depth, rotation, scale = 1, options = {}) {
    const placement = terrainPlacementHeight(
      {
        x,
        z,
        width: Math.max(0.1, width * scale),
        depth: Math.max(0.1, depth * scale),
        rotation,
        large: options.large === true
      },
      terrainHeight,
      {
        slopeTolerance: options.slopeTolerance,
        mode: options.mode || 'max',
        groundOffset: options.groundOffset || 0
      }
    );
    group.position.set(x, placement.objectY, z);
    group.rotation.y = rotation;
    markGroundPlacement(group, placement, {
      category: 'building',
      name: options.name || group.name || 'ground-structure',
      floatingFixed: placement.needsFoundation ? 1 : 0,
      buriedFixed: 0
    });
    return placement;
  }

  function addStructureFoundation(group, width, depth, placement, scale = 1, options = {}) {
    const foundationHeight = Math.max(0.8, Math.min(options.maxDepth || 6.5, placement.foundationDepth || 1.2));
    const localHeight = foundationHeight / Math.max(0.001, scale);
    const topLift = (options.topLift ?? 0.16) / Math.max(0.001, scale);
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.08, localHeight, depth * 1.08),
      options.material || foundationMaterial
    );
    foundation.position.y = topLift - localHeight / 2;
    foundation.castShadow = false;
    foundation.receiveShadow = true;
    foundation.renderOrder = 3;
    group.add(foundation);
    return foundation;
  }

  function doesPatchOverlapStructure(cx, cz, width, depth, rotation, margin = 0) {
    const rect = createPatchRect(cx, cz, width, depth, rotation);
    return structureFootprints.some(footprint => {
      const dx = footprint.x - rect.x;
      const dz = footprint.z - rect.z;
      const localX = dx * rect.axisX.x + dz * rect.axisX.z;
      const localZ = dx * rect.axisZ.x + dz * rect.axisZ.z;
      return Math.abs(localX) < rect.halfWidth + footprint.radius + margin &&
        Math.abs(localZ) < rect.halfDepth + footprint.radius + margin;
    });
  }

  function registerGroundOverlayRect(rect) {
    groundOverlayRects.push(rect);
  }

  function isGroundOverlayPointBlocked(x, z, margin = 0) {
    return groundOverlayRects.some(rect => {
      const dx = x - rect.x;
      const dz = z - rect.z;
      const localX = dx * rect.axisX.x + dz * rect.axisX.z;
      const localZ = dx * rect.axisZ.x + dz * rect.axisZ.z;
      return Math.abs(localX) < rect.halfWidth + margin &&
        Math.abs(localZ) < rect.halfDepth + margin;
    });
  }

  function chooseVehicleColor(profileName, rng, areaKey = 'global') {
    const profile = VEHICLE_COLOR_PROFILES[profileName] || VEHICLE_COLOR_PROFILES.city;
    const last = vehicleLastColorByArea.get(areaKey);
    let entry = weightedVehicleColor(profile, rng);
    for (let attempt = 0; attempt < 4 && entry.name === last && profile.length > 1; attempt++) {
      entry = weightedVehicleColor(profile, rng);
    }
    vehicleLastColorByArea.set(areaKey, entry.name);
    recordVehicleColor(entry.name);
    return entry.hex;
  }

  function recordVehicleColor(name) {
    const distribution = urbanIntegrityReport.vehicleReport.vehicleColorDistribution;
    distribution[name] = (distribution[name] || 0) + 1;
  }

  function isWaterSurface(x, z) {
    if (isAirportHardSurface(x, z, 42)) return false;
    if (closestLakeNormalized(x, z) < 0.92) return true;
    if (distanceToRiver(x, z) < 72) return true;
    if (isRiverMouthClearance(x, z, 180)) return true;
    if (distanceToMapEdge(x, z) < EDGE_OCEAN_WIDTH - 24) return true;
    const inBay = closestWaterBodyNormalized(BAYS, x, z) < 0.96;
    const onIsland = closestWaterBodyNormalized(ISLANDS, x, z) < 1.04;
    return inBay && !onIsland;
  }

  function isRoadWaterBlocked(x, z, riverClearance = 112) {
    if (isAirportHardSurface(x, z, 42)) return false;
    if (isRiverMouthClearance(x, z, Math.max(190, riverClearance + 70))) return true;
    if (distanceToRiver(x, z) < riverClearance) return true;
    if (closestLakeNormalized(x, z) < 0.98) return true;
    if (distanceToMapEdge(x, z) < EDGE_OCEAN_WIDTH + 8) return true;
    const inBay = closestWaterBodyNormalized(BAYS, x, z) < 1.02;
    const onIsland = closestWaterBodyNormalized(ISLANDS, x, z) < 1.08;
    return inBay && !onIsland;
  }

  function roadSegmentWaterBlocked(a, b, riverClearance = 104, samples = 12) {
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = THREE.MathUtils.lerp(a.x, b.x, t);
      const z = THREE.MathUtils.lerp(a.z, b.z, t);
      if (isRoadWaterBlocked(x, z, riverClearance)) return true;
    }
    return false;
  }

  function isUrbanAirportExcluded(x, z, margin = 0) {
    return isInAirportExclusionZone(x, z, margin);
  }

  function isWindowLightForbidden(x, z) {
    return isUrbanAirportExcluded(x, z, 12) || isInRunwayProtectedArea(x, z, 16);
  }

  function countBlockedWindowLight(x, z) {
    const report = urbanIntegrityReport.windowLightReport;
    report.fixedCount++;
  }

  function reportAttachedWindowLight() {
    urbanIntegrityReport.windowLightReport.totalWindowLights++;
  }

  function isRiverMouthClearance(x, z, clearance = 190) {
    if (distanceToRiver(x, z) > clearance) return false;
    const nearEdgeMouth = distanceToMapEdge(x, z) < EDGE_OCEAN_WIDTH + 620;
    const nearBayMouth = closestWaterBodyNormalized(BAYS, x, z) < 1.64 &&
      closestWaterBodyNormalized(ISLANDS, x, z) > 1.08;
    return nearEdgeMouth || nearBayMouth;
  }

  function isUrbanFootprintWaterBlocked(x, z, width, depth, clearance = 120) {
    const halfW = width / 2 + 18;
    const halfD = depth / 2 + 18;
    const samples = [
      [x, z],
      [x - halfW, z - halfD],
      [x + halfW, z - halfD],
      [x - halfW, z + halfD],
      [x + halfW, z + halfD],
      [x - halfW, z],
      [x + halfW, z],
      [x, z - halfD],
      [x, z + halfD]
    ];

    return samples.some(([sx, sz]) => isRoadWaterBlocked(sx, sz, clearance));
  }

  function isUrbanFootprintAirportBlocked(x, z, width, depth, margin = 80) {
    const halfW = width / 2 + margin;
    const halfD = depth / 2 + margin;
    const samples = [
      [x, z],
      [x - halfW, z - halfD],
      [x + halfW, z - halfD],
      [x - halfW, z + halfD],
      [x + halfW, z + halfD],
      [x - halfW, z],
      [x + halfW, z],
      [x, z - halfD],
      [x, z + halfD]
    ];

    return samples.some(([sx, sz]) => isUrbanAirportExcluded(sx, sz, margin));
  }

  function createVillageRoads() {
    const roadMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x4d5147, roughness: 0.92 }), -1, -1);
    const dustMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x8e815f, roughness: 0.95 }), -1, -1);
    const stripeMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0xded6b9, roughness: 0.7 }), -2, -2);
    const rng = mulberry32(91627);
  
    for (const village of VILLAGES) {
      for (let i = 0; i < village.road.length - 1; i++) {
        const a = { x: village.road[i][0], z: village.road[i][1] };
        const b = { x: village.road[i + 1][0], z: village.road[i + 1][1] };
        createVillageRoadSegment(a, b, roadMaterial, dustMaterial, stripeMaterial, 20 + (i % 2) * 4);
  
        if (rng() > 0.28) {
          const t = 0.18 + rng() * 0.64;
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          if (!isWaterSurface(x, z) && !isRunwayEndUrbanRoadZone(x, z) && !isUrbanAirportExcluded(x, z, 20)) {
            const angle = Math.atan2(-(b.z - a.z), b.x - a.x);
            const y = terrainHeight(x, z) + VILLAGE_VEHICLE_TERRAIN_Y_OFFSET;
            const color = chooseVehicleColor('rural', rng, `village-road:${village.name}`);
            createCar(scene, x, y, z, angle - Math.PI / 2, color);
          }
        }
      }
    }
  }

  function createVillageRoadSegment(a, b, roadMaterial, dustMaterial, stripeMaterial, width) {
    for (const range of roadSafeRanges(a, b, width)) {
      const start = {
        x: THREE.MathUtils.lerp(a.x, b.x, range.start),
        z: THREE.MathUtils.lerp(a.z, b.z, range.start)
      };
      const end = {
        x: THREE.MathUtils.lerp(a.x, b.x, range.end),
        z: THREE.MathUtils.lerp(a.z, b.z, range.end)
      };
      createVillageRoadMesh(start, end, roadMaterial, dustMaterial, stripeMaterial, width);
    }
  }

  function roadSafeRanges(a, b, width = 34, samples = 32) {
    const ranges = [];
    let start = null;
    let lastSafe = null;
    const waterClearance = Math.max(132, width * 3.2);
  
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = THREE.MathUtils.lerp(a.x, b.x, t);
      const z = THREE.MathUtils.lerp(a.z, b.z, t);
      const safe =
        !isRoadWaterBlocked(x, z, waterClearance) &&
        !isUrbanAirportExcluded(x, z, 40) &&
        !isNearRunwaySafety(x, z, 230, 900) &&
        !isInRunwayApproach(x, z, 280, 980);
  
      if (safe && start === null) start = t;
      if (safe) lastSafe = t;
      if ((!safe || i === samples) && start !== null) {
        const end = safe && i === samples ? t : lastSafe;
        const from = Math.max(0, start + 0.45 / samples);
        const to = Math.min(1, end - 0.45 / samples);
        if (to - from > 0.08) ranges.push({ start: from, end: to });
        start = null;
        lastSafe = null;
      }
    }
  
    return ranges;
  }

  function createVillageRoadMesh(a, b, roadMaterial, dustMaterial, stripeMaterial, width) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 70) return;
    const angle = Math.atan2(-dz, dx);
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;

    createTerrainConformingPatch(
      x,
      z,
      length + 30,
      width + 18,
      angle,
      dustMaterial,
      0.9,
      Math.max(2, Math.ceil(length / 95)),
      1,
      1
    );

    createTerrainConformingPatch(
      x,
      z,
      length + 18,
      width,
      angle,
      roadMaterial,
      1.1,
      Math.max(2, Math.ceil(length / 95)),
      1,
      2
    );
    urbanIntegrityReport.roadReport.totalRoads++;
  
    for (let offset = -length / 2 + 42; offset < length / 2 - 42; offset += 92) {
      const center = rotatedOffset(x, z, offset, 0, angle);
      if (isRoadWaterBlocked(center.x, center.z, Math.max(132, width * 3.2))) continue;
      createTerrainConformingPatch(
        center.x,
        center.z,
        18,
        2.4,
        angle,
        stripeMaterial,
        1.34,
        1,
        1,
        3
      );
    }
  }

  function createIslandSettlements() {
    const rng = mulberry32(77411);
    const houseColors = [0xcfd7dd, 0xdcc6a4, 0xbac8d3, 0xd8b7aa, 0xbfd3bd, 0xe2d5a6];
    const roofColors = [0x884a3f, 0x5a6570, 0x3d5f74, 0x74523b];
  
    for (const island of ISLANDS) {
      if (island.hiddenIsland || island.noResidential) continue;
      const anchors = islandSettlementAnchors(island, rng);
      const maxSettlementHeight = WATER_LEVEL + (Math.sqrt(island.rx * island.rz) > 1200 ? 88 : Math.sqrt(island.rx * island.rz) > 720 ? 62 : 42);
      for (let i = 0; i < island.houses; i++) {
        let x = island.x;
        let z = island.z;
        for (let attempt = 0; attempt < 54; attempt++) {
          const anchor = anchors[i % anchors.length];
          const angle = rng() * Math.PI * 2;
          const radius = Math.sqrt(rng()) * (90 + Math.min(island.rx, island.rz) * (0.18 + rng() * 0.18));
          const world = {
            x: anchor.x + Math.cos(angle) * radius,
            z: anchor.z + Math.sin(angle) * radius
          };
          x = world.x;
          z = world.z;
          const y = terrainHeight(x, z);
          if (!isUrbanAirportExcluded(x, z, 70) && !isNearRunwaySafety(x, z, 210, 850) && !isWaterSurface(x, z) && y < maxSettlementHeight) break;
        }
  
        const y = terrainHeight(x, z);
        if (isUrbanAirportExcluded(x, z, 70) || isNearRunwaySafety(x, z, 210, 850) || isWaterSurface(x, z) || y > maxSettlementHeight) continue;
        createSmallHouse(x, z, houseColors[Math.floor(rng() * houseColors.length)], roofColors[Math.floor(rng() * roofColors.length)], 0.68 + rng() * 0.48);
      }
  
      const pierCount = Math.max(18, Math.floor(island.houses * 0.36));
      for (let i = 0; i < pierCount; i++) {
        const angle = rng() * Math.PI * 2;
        const world = waterBodyBoundaryPoint(island, angle, 0.92);
        createPier(world.x, world.z, angle + island.rotation);
      }
    }
  }

  function islandSettlementAnchors(island, rng) {
    const count = Math.sqrt(island.rx * island.rz) > 1150 ? 4 : Math.sqrt(island.rx * island.rz) > 700 ? 3 : 2;
    const anchors = [];
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 18; attempt++) {
        const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.95;
        const radius = 0.46 + rng() * 0.26;
        const local = { x: Math.cos(angle) * island.rx * radius, z: Math.sin(angle) * island.rz * radius };
        const world = waterBodyWorld(island, local.x, local.z);
        const y = terrainHeight(world.x, world.z);
        if (!isWaterSurface(world.x, world.z) && !isUrbanAirportExcluded(world.x, world.z, 70) && !isNearRunwaySafety(world.x, world.z, 230, 880) && y < WATER_LEVEL + 88) {
          anchors.push(world);
          break;
        }
      }
    }
    if (!anchors.length) anchors.push({ x: island.x, z: island.z });
    return anchors;
  }

  function createMountainHamlets() {
    const rng = mulberry32(43172);
    const houseColors = [0xcfd7dd, 0xd9c4a8, 0xb9c8d0, 0xd4baa6, 0xbfd2bd, 0xded6b0];
    const roofColors = [0x7b4a3c, 0x4f5964, 0x355b6e, 0x6d543f];
  
    for (const mountain of MOUNTAINS) {
      if (mountain.hiddenIslandMountain) continue;
      const count = mountain.height > 250 ? 18 : mountain.height > 180 ? 14 : 9;
      let placed = 0;
      for (let i = 0; i < count * 5 && placed < count; i++) {
        const angle = rng() * Math.PI * 2;
        const radius = 0.36 + rng() * 0.56;
        const x = mountain.x + Math.cos(angle) * mountain.rx * radius;
        const z = mountain.z + Math.sin(angle) * mountain.rz * radius;
        const y = terrainHeight(x, z);
        if (Math.abs(x) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 100 || Math.abs(z) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 100) continue;
        if (isWaterSurface(x, z) || isUrbanAirportExcluded(x, z, 80) || isNearRunwaySafety(x, z, 330, 980) || isInRunwayApproach(x, z, 360, 1500)) continue;
        if (y < WATER_LEVEL + 4 || y > 260) continue;
  
        createSmallHouse(
          x,
          z,
          houseColors[Math.floor(rng() * houseColors.length)],
          roofColors[Math.floor(rng() * roofColors.length)],
          0.74 + rng() * 0.9
        );
        placed++;
      }
    }
  }

  function createSmallHouse(x, z, wallColor, roofColor, scale) {
    if (isHiddenIslandArea(x, z, 110)) return null;
    if (isUrbanAirportExcluded(x, z, 70) || isNearRunwaySafety(x, z, 260, 940) || isInRunwayApproach(x, z, 620, 3200)) return null;
    scale = THREE.MathUtils.clamp(scale, 0.52, 1.08);
    const variant = 0.5 + 0.5 * Math.sin(x * 0.017 + z * 0.013);
    const width = 24 + variant * 20;
    const depth = 20 + (1 - variant) * 18;
    const height = 14 + variant * 12;
    const rotation = Math.sin(x * 0.01 + z * 0.008) * Math.PI;
    const group = new THREE.Group();
    group.name = 'terrain-placed-house';
    const placement = placeStructureGroupOnTerrain(group, x, z, width, depth, rotation, scale, {
      slopeTolerance: 0.5,
      name: 'house'
    });
    group.scale.setScalar(scale);
    group.userData.diagnosticType = 'building';
    group.userData.diagnosticCount = 1;
    scene.add(group);

    addStructureFoundation(group, width, depth, placement, scale, { maxDepth: 5.5 });
    registerStructureFootprint(x, z, Math.hypot(width, depth) * 0.56 * scale + 12);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.64 })
    );
    body.position.y = height / 2;
    body.castShadow = false;
    body.receiveShadow = true;
    group.add(body);

    addHouseWindows(group, width, depth, height, variant);
  
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(width, depth) * 0.62, 11 + variant * 6, 4),
      new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.72 })
    );
    roof.position.y = height + 7 + variant * 2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = false;
    group.add(roof);
  
    if (variant > 0.42) {
      const chimney = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 8, 3.2),
        new THREE.MeshStandardMaterial({ color: 0x74665a, roughness: 0.82 })
      );
      chimney.position.set(width * 0.22, height + 7, depth * 0.05);
      chimney.castShadow = false;
      group.add(chimney);
    }
  }

  function isHiddenIslandArea(x, z, padding = 0) {
    for (const island of ISLANDS) {
      if (!(island.hiddenIsland || island.noResidential)) continue;
      const normalizedPadding = padding / Math.max(1, Math.max(island.rx, island.rz));
      if (closestWaterBodyNormalized([island], x, z) <= 1 + normalizedPadding) return true;
    }
    return false;
  }

  function addHouseWindows(group, width, depth, height, variant) {
    const y = height * (0.42 + variant * 0.08);
    const positions = [
      [-width * 0.22, y, depth / 2 + 0.07, 0],
      [width * 0.22, y, depth / 2 + 0.07, 0],
      [-width * 0.2, y, -depth / 2 - 0.07, Math.PI],
      [width * 0.2, y, -depth / 2 - 0.07, Math.PI]
    ];
    for (let i = 0; i < positions.length; i++) {
      if (i > 1 && variant < 0.34) continue;
      const world = houseWindowWorldPosition(group, positions[i][0], positions[i][2]);
      if (isWindowLightForbidden(world.x, world.z)) {
        countBlockedWindowLight(world.x, world.z);
        continue;
      }
      const warm = i % 2 === 0;
      const glow = new THREE.Mesh(houseWindowGlowGeometry, warm ? warmWindowGlowMaterial : coolWindowGlowMaterial);
      glow.position.set(positions[i][0], positions[i][1], positions[i][2] + (positions[i][2] > 0 ? WINDOW_LIGHT_GLOW_OFFSET : -WINDOW_LIGHT_GLOW_OFFSET));
      glow.rotation.y = positions[i][3];
      glow.renderOrder = 7;
      glow.userData.attachedBuilding = group.name;
      group.add(glow);
      const window = new THREE.Mesh(houseWindowGeometry, warm ? warmWindowMaterial : coolWindowMaterial);
      window.position.set(positions[i][0], positions[i][1], positions[i][2]);
      window.rotation.y = positions[i][3];
      window.renderOrder = 8;
      window.userData.attachedBuilding = group.name;
      group.add(window);
      reportAttachedWindowLight();
    }
  }

  function houseWindowWorldPosition(group, localX, localZ) {
    const scale = group.scale?.x || 1;
    const rotation = group.rotation?.y || 0;
    const offset = rotatedOffset(0, 0, localX * scale, localZ * scale, rotation);
    return {
      x: group.position.x + offset.x,
      z: group.position.z + offset.z
    };
  }

  function createPier(x, z, heading) {
    if (isUrbanAirportExcluded(x, z, 50) || isNearRunwaySafety(x, z, 180, 760)) return;
    const y = WATER_LEVEL + 1.1;
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(12, 1.2, 92),
      new THREE.MeshStandardMaterial({ color: 0x8a643f, roughness: 0.82 })
