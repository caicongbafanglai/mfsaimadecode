import * as THREE from '../../../three.module.min.js?v=202605050057';
import {
  AIRPORTS,
  CITY_ZONES,
  CONNECTING_ROADS,
  MAP_SIZE,
  VILLAGES,
  WATER_LEVEL
} from '../../data/worldData.js?v=202605070100';
import {
  airportWorld,
  distanceToSegment,
  liftSurfaceMaterial,
  rotatedPatchOverlapsAirportPavement
} from '../spatial.js?v=202605056000';
import {
  createPatchRect,
  patchOverlapsPlaced,
  patchRectsOverlap
} from './shared.js?v=202605056000';

const MAP_INSET = 130;
const CAR_HALF_HEIGHT = 1.42;
const GRASS_SURFACE_LIFT = 1.28;
const GRASS_TUFT_LIFT = 0.16;

export function createLowGrassMeadows({
  scene,
  terrainHeight,
  mulberry32,
  createTerrainConformingPatch,
  isWaterSurface,
  isRoadWaterBlocked,
  isAirportHardSurface,
  isInCityCore,
  isStructureFootprintBlocked = () => false,
  doesPatchOverlapStructure = () => false,
  groundOverlayRects = []
}) {
  const rng = mulberry32(120539);
  const grassGroup = new THREE.Group();
  grassGroup.name = '草地';
  scene.add(grassGroup);
  const placedGrassRects = [];
  const meadowMaterials = [
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x1f9d5c, roughness: 0.99, metalness: 0.01 }), -30, -30),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x39b85f, roughness: 0.99, metalness: 0.01 }), -30, -30),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x8ccf2d, roughness: 0.99, metalness: 0.01 }), -30, -30),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x28b59d, roughness: 0.99, metalness: 0.01 }), -30, -30)
  ];
  const tuftMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x2ccb63, roughness: 0.98, metalness: 0.01 }),
    new THREE.MeshStandardMaterial({ color: 0x75dd35, roughness: 0.98, metalness: 0.01 }),
    new THREE.MeshStandardMaterial({ color: 0xa9d83b, roughness: 0.98, metalness: 0.01 }),
    new THREE.MeshStandardMaterial({ color: 0x22c69b, roughness: 0.98, metalness: 0.01 })
  ];
  const tuftData = tuftMaterials.map(() => []);

  createApproachGrassPatches(rng, meadowMaterials, tuftData, placedGrassRects, grassGroup);
  createOpenGrassPatches(rng, meadowMaterials, tuftData, placedGrassRects, grassGroup);
  createLowGrassInstances(tuftMaterials, tuftData, grassGroup);

  function createApproachGrassPatches(rng, materials, tuftData, placedGrassRects, grassGroup) {
    for (const airport of AIRPORTS) {
      const runwayLength = airport.runwayLength || 1320;
      const runwayWidth = airport.runwayWidth || 98;
      const patchTarget = airport.size > 1.05 ? 10 : 8;

      for (const end of [-1, 1]) {
        let patches = 0;
        for (let attempt = 0; attempt < patchTarget * 10 && patches < patchTarget; attempt++) {
          const beyond = 150 + Math.pow(rng(), 0.76) * 2850;
          const spread = runwayWidth * 2.7 + beyond * 0.26;
          const localX = (rng() - 0.5) * spread * 1.95;
          const localZ = end * (runwayLength / 2 + beyond);
          const center = airportWorld(airport, localX, localZ);
          const width = 420 + Math.pow(rng(), 0.66) * 1180;
          const depth = 320 + Math.pow(rng(), 0.72) * 900;
          const rotation = airport.heading + (rng() - 0.5) * 0.78;
          if (!isLowGrassPatchClear(center.x, center.z, width, depth, rotation, true, placedGrassRects)) continue;
          createGrassPatch(center.x, center.z, width, depth, rotation, materials[Math.floor(rng() * materials.length)], placedGrassRects, grassGroup);
          patches++;
        }

        const tuftTarget = airport.size > 1.05 ? 220 : 170;
        let tufts = 0;
        for (let attempt = 0; attempt < tuftTarget * 8 && tufts < tuftTarget; attempt++) {
          const beyond = 105 + Math.pow(rng(), 0.82) * 3000;
          const spread = runwayWidth * 3.0 + beyond * 0.3;
          const localX = (rng() - 0.5) * spread * 2.05;
          const localZ = end * (runwayLength / 2 + beyond);
          const point = airportWorld(airport, localX, localZ);
          if (!isLowGrassSpotClear(point.x, point.z, true)) continue;
          addLowGrassTuftData(tuftData, point.x, point.z, rng);
          tufts++;
        }
      }
    }
  }

  function createOpenGrassPatches(rng, materials, tuftData, placedGrassRects, grassGroup) {
    let patches = createRegionalGrassPatches(rng, materials, placedGrassRects, grassGroup);
    for (let attempt = 0; attempt < 3200 && patches < 136; attempt++) {
      const x = randomMapCoordinate(rng);
      const z = randomMapCoordinate(rng);
      const broad = rng() < 0.58;
      const width = broad ? 620 + Math.pow(rng(), 0.68) * 1220 : 300 + Math.pow(rng(), 0.72) * 760;
      const depth = broad ? 430 + Math.pow(rng(), 0.74) * 980 : 220 + Math.pow(rng(), 0.82) * 620;
      const rotation = rng() * Math.PI;
      if (!isLowGrassPatchClear(x, z, width, depth, rotation, false, placedGrassRects)) continue;
      createGrassPatch(x, z, width, depth, rotation, materials[Math.floor(rng() * materials.length)], placedGrassRects, grassGroup);
      patches++;
    }

    let tufts = 0;
    for (let attempt = 0; attempt < 14000 && tufts < 3600; attempt++) {
      const x = randomMapCoordinate(rng);
      const z = randomMapCoordinate(rng);
      if (!isLowGrassSpotClear(x, z, false)) continue;
      addLowGrassTuftData(tuftData, x, z, rng);
      tufts++;
    }
  }

  function createRegionalGrassPatches(rng, materials, placedGrassRects, grassGroup) {
    let patches = 0;
    const cells = 7;
    const span = MAP_SIZE - MAP_INSET * 2;
    const cellSize = span / cells;
    const origin = -MAP_SIZE / 2 + MAP_INSET;

    for (let gx = 0; gx < cells; gx++) {
      for (let gz = 0; gz < cells; gz++) {
        if (rng() < 0.22) continue;
        const x = origin + (gx + 0.18 + rng() * 0.64) * cellSize;
        const z = origin + (gz + 0.18 + rng() * 0.64) * cellSize;
        const width = 720 + Math.pow(rng(), 0.74) * 1360;
        const depth = 520 + Math.pow(rng(), 0.78) * 1080;
        const rotation = rng() * Math.PI;
        if (!isLowGrassPatchClear(x, z, width, depth, rotation, false, placedGrassRects)) continue;
        createGrassPatch(x, z, width, depth, rotation, materials[Math.floor(rng() * materials.length)], placedGrassRects, grassGroup);
        patches++;
      }
    }

    return patches;
  }

  function createGrassPatch(x, z, width, depth, rotation, material, placedGrassRects, grassGroup) {
    createTerrainConformingPatch(
      x,
      z,
      width,
      depth,
      rotation,
      material,
      GRASS_SURFACE_LIFT,
      Math.max(5, Math.ceil(width / 150)),
      Math.max(4, Math.ceil(depth / 140)),
      3,
      grassGroup
    );
    placedGrassRects.push(createPatchRect(x, z, width, depth, rotation));
  }

  function addLowGrassTuftData(tuftData, x, z, rng) {
    const colorIndex = Math.min(tuftData.length - 1, Math.floor(rng() * tuftData.length));
    const height = CAR_HALF_HEIGHT * (0.78 + rng() * 0.28);
    tuftData[colorIndex].push({
      x,
      z,
      y: terrainHeight(x, z),
      height,
      radius: 0.42 + rng() * 0.72,
      rotation: rng() * Math.PI * 2,
      leanX: (rng() - 0.5) * 0.12,
      leanZ: (rng() - 0.5) * 0.12
    });
  }

  function createLowGrassInstances(materials, tuftData, grassGroup) {
    const geometry = new THREE.ConeGeometry(0.42, 1, 5, 1);
    geometry.translate(0, 0.5, 0);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < tuftData.length; i++) {
      const data = tuftData[i];
      if (!data.length) continue;
      const mesh = new THREE.InstancedMesh(geometry, materials[i], data.length);
      mesh.receiveShadow = false;
      mesh.castShadow = false;

      for (let j = 0; j < data.length; j++) {
        const tuft = data[j];
        dummy.position.set(tuft.x, tuft.y + GRASS_TUFT_LIFT, tuft.z);
        dummy.rotation.set(tuft.leanX, tuft.rotation, tuft.leanZ);
        dummy.scale.set(tuft.radius, tuft.height, tuft.radius * (0.72 + (j % 5) * 0.07));
        dummy.updateMatrix();
        mesh.setMatrixAt(j, dummy.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      grassGroup.add(mesh);
    }
  }

  function isLowGrassPatchClear(cx, cz, width, depth, rotation, allowApproach, placedGrassRects = []) {
    if (rotatedPatchOverlapsAirportPavement(cx, cz, width, depth, rotation, 66)) return false;
    if (patchOverlapsPlaced({ x: cx, z: cz, width, depth, rotation }, placedGrassRects, 22)) return false;
    if (patchOverlapsGroundOverlay(cx, cz, width, depth, rotation, 12)) return false;
    if (doesPatchOverlapStructure(cx, cz, width, depth, rotation, 36)) return false;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const sx of [-0.5, -0.25, 0, 0.25, 0.5]) {
      for (const sz of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const c = Math.cos(rotation);
        const s = Math.sin(rotation);
        const point = {
          x: cx + c * sx * width + s * sz * depth,
          z: cz - s * sx * width + c * sz * depth
        };
        if (!isLowGrassSpotClear(point.x, point.z, allowApproach, 36)) return false;
        const y = terrainHeight(point.x, point.z);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    return maxY - minY < 56;
  }

  function isLowGrassSpotClear(x, z, allowApproach, structureMargin = 30) {
    if (Math.abs(x) > MAP_SIZE / 2 - MAP_INSET || Math.abs(z) > MAP_SIZE / 2 - MAP_INSET) return false;
    if (isWaterSurface(x, z) || isRoadWaterBlocked(x, z, 134) || isAirportHardSurface(x, z, 46)) return false;
    if (isNearGroundRoad(x, z, 34)) return false;
    if (isInCityFootprint(x, z)) return false;
    if (isStructureFootprintBlocked(x, z, structureMargin)) return false;
    if (pointOverlapsGroundOverlay(x, z, 14)) return false;
    const y = terrainHeight(x, z);
    if (y < WATER_LEVEL + 4 || y > 230) return false;
    return true;
  }

  function isInCityFootprint(x, z) {
    if (isInCityCore(x, z)) return true;
    for (const zone of CITY_ZONES) {
      const span = zone.span || zone.radius * 1.6 || 1500;
      const half = span / 2 + 180;
      const dx = Math.abs(x - zone.x);
      const dz = Math.abs(z - zone.z);
      if (dx < half && dz < half) return true;
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + 130) return true;
    }
    return false;
  }

  function pointOverlapsGroundOverlay(x, z, margin = 0) {
    for (const rect of groundOverlayRects) {
      const bound = Math.max(rect.halfWidth, rect.halfDepth) + margin;
      if (Math.abs(x - rect.x) > bound || Math.abs(z - rect.z) > bound) continue;
      const dx = x - rect.x;
      const dz = z - rect.z;
      const localX = dx * rect.axisX.x + dz * rect.axisX.z;
      const localZ = dx * rect.axisZ.x + dz * rect.axisZ.z;
      if (Math.abs(localX) < rect.halfWidth + margin && Math.abs(localZ) < rect.halfDepth + margin) return true;
    }
    return false;
  }

  function isNearGroundRoad(x, z, clearance) {
    for (const road of CONNECTING_ROADS) {
      if (distanceToSegment(x, z, { x: road.x1, z: road.z1 }, { x: road.x2, z: road.z2 }) < clearance + road.width * 0.5) return true;
    }
    for (const village of VILLAGES) {
      for (let i = 0; i < village.road.length - 1; i++) {
        const a = { x: village.road[i][0], z: village.road[i][1] };
        const b = { x: village.road[i + 1][0], z: village.road[i + 1][1] };
        if (distanceToSegment(x, z, a, b) < clearance + 18) return true;
      }
    }
    return false;
  }

  function patchOverlapsGroundOverlay(cx, cz, width, depth, rotation, margin = 0) {
    const candidate = createPatchRect(cx, cz, width, depth, rotation);
    const candidateBound = Math.hypot(candidate.halfWidth, candidate.halfDepth) + margin;
    for (const rect of groundOverlayRects) {
      const rectBound = Math.hypot(rect.halfWidth, rect.halfDepth) + margin;
      if (Math.abs(candidate.x - rect.x) > candidateBound + rectBound ||
        Math.abs(candidate.z - rect.z) > candidateBound + rectBound) continue;
      if (patchRectsOverlap(candidate, rect, margin)) return true;
    }
    return false;
  }

  function randomMapCoordinate(rng) {
    return -MAP_SIZE / 2 + MAP_INSET + rng() * (MAP_SIZE - MAP_INSET * 2);
  }
}
