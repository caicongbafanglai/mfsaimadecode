import * as THREE from '../../../three.module.min.js?v=202605050057';
import {
  CONNECTING_ROADS,
  EDGE_OCEAN_WIDTH,
  FARM_REGIONS,
  MAP_SIZE,
  VILLAGES,
  WATER_LEVEL
} from '../../data/worldData.js?v=202605070100';
import {
  distanceToSegment,
  isInAirportExclusionZone,
  isInRunwayApproach,
  isNearRunwaySafety,
  liftSurfaceMaterial,
  rotatedPatchOverlapsAirportPavement
} from '../spatial.js?v=202605056000';
import {
  createPatchRect,
  patchOverlapsPlaced,
  patchRectsOverlap,
  rotatedOffset
} from './shared.js?v=202605056000';

export function createFarmlandRegions({
  scene,
  terrainHeight,
  mulberry32,
  createTerrainConformingPatch,
  createSmallHouse,
  placeStructureGroupOnTerrain,
  addStructureFoundation,
  registerStructureFootprint = () => {},
  registerGroundOverlayRect = () => {},
  isStructureFootprintBlocked = () => false,
  doesPatchOverlapStructure = () => false,
  isRoadWaterBlocked,
  isInCityCore
}) {
  const rng = mulberry32(35874);
  const placedFieldRects = [];
  const fieldMaterials = [
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x789a43, roughness: 0.97, metalness: 0.01 }), -10, -10),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x9c9b4f, roughness: 0.97, metalness: 0.01 }), -10, -10),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x6d8d3f, roughness: 0.97, metalness: 0.01 }), -10, -10),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0xb0a85c, roughness: 0.97, metalness: 0.01 }), -10, -10),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x587c43, roughness: 0.97, metalness: 0.01 }), -10, -10)
  ];
  const rowMaterials = [
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x405e2f, roughness: 0.98, metalness: 0.01 }), -14, -14),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0xc6b96b, roughness: 0.98, metalness: 0.01 }), -14, -14),
    liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x7f9451, roughness: 0.98, metalness: 0.01 }), -14, -14)
  ];
  const houseColors = [0xd6d7cb, 0xd8c29f, 0xc5d0bf, 0xd3b29c, 0xc8d5b3, 0xded0ab];
  const roofColors = [0x70483d, 0x4b5661, 0x365d49, 0x76523c, 0x623d36];
  const barnMaterial = new THREE.MeshStandardMaterial({ color: 0xa64c3f, roughness: 0.76 });
  const barnRoofMaterial = new THREE.MeshStandardMaterial({ color: 0x49535e, roughness: 0.82 });

  for (const region of FARM_REGIONS) {
    const regionRotation = region.rotation || 0;
    let placedFields = 0;
    for (let attempt = 0; attempt < region.fields * 18 && placedFields < region.fields; attempt++) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * 0.92;
      const localX = Math.cos(angle) * region.rx * radius;
      const localZ = Math.sin(angle) * region.rz * radius;
      const center = rotatedOffset(region.x, region.z, localX, localZ, regionRotation);
      const width = 100 + rng() * 230;
      const depth = 72 + rng() * 168;
      const rotation = regionRotation + (rng() - 0.5) * 0.48;
      const placement = resolveFarmPatchPlacement(region, {
        x: center.x,
        z: center.z,
        width,
        depth,
        rotation
      }, placedFieldRects, rng);
      if (!placement) continue;

      createTerrainConformingPatch(
        placement.x,
        placement.z,
        placement.width,
        placement.depth,
        placement.rotation,
        fieldMaterials[Math.floor(rng() * fieldMaterials.length)],
        0.26,
        Math.max(3, Math.ceil(placement.width / 115)),
        Math.max(2, Math.ceil(placement.depth / 105)),
        1
      );

      const rowCount = 4 + Math.floor(rng() * 4);
      const rowsAcrossWidth = rng() > 0.45;
      for (let row = 0; row < rowCount; row++) {
        const t = (row + 1) / (rowCount + 1) - 0.5;
        const offset = rowsAcrossWidth ? t * placement.depth * 0.82 : t * placement.width * 0.82;
        const rowCenter = rowsAcrossWidth
          ? rotatedOffset(placement.x, placement.z, 0, offset, placement.rotation)
          : rotatedOffset(placement.x, placement.z, offset, 0, placement.rotation);
        createTerrainConformingPatch(
          rowCenter.x,
          rowCenter.z,
          rowsAcrossWidth ? placement.width * 0.88 : 5.5,
          rowsAcrossWidth ? 5.5 : placement.depth * 0.88,
          placement.rotation,
          rowMaterials[Math.floor(rng() * rowMaterials.length)],
          0.42,
          rowsAcrossWidth ? Math.max(2, Math.ceil(placement.width / 150)) : 1,
          rowsAcrossWidth ? 1 : Math.max(2, Math.ceil(placement.depth / 150)),
          2
        );
      }

      const fieldRect = createPatchRect(placement.x, placement.z, placement.width, placement.depth, placement.rotation);
      placedFieldRects.push(fieldRect);
      registerGroundOverlayRect(fieldRect);
      placedFields++;
    }

    const totalHomes = region.houses || 20;
    const hamlets = Math.max(2, Math.min(4, Math.round(totalHomes / 11)));
    const baseHomes = Math.floor(totalHomes / hamlets);
    const extraHomes = totalHomes % hamlets;
    for (let hamlet = 0; hamlet < hamlets; hamlet++) {
      const anchor = findFarmHamletAnchor(region, rng, hamlet / hamlets);
      if (!anchor) continue;
      const targetHomes = baseHomes + (hamlet < extraHomes ? 1 : 0);
      let placedHomes = 0;
      for (let attempt = 0; attempt < targetHomes * 12 && placedHomes < targetHomes; attempt++) {
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * (110 + rng() * 150);
        const x = anchor.x + Math.cos(angle) * radius;
        const z = anchor.z + Math.sin(angle) * radius;
        if (!isFarmVillageSpotClear(x, z)) continue;
        createSmallHouse(
          x,
          z,
          houseColors[Math.floor(rng() * houseColors.length)],
          roofColors[Math.floor(rng() * roofColors.length)],
          0.3 + rng() * 0.3
        );
        placedHomes++;
      }

      const barns = rng() > 0.42 ? 2 : 1;
      for (let barn = 0; barn < barns; barn++) {
        const angle = rng() * Math.PI * 2;
        const radius = 70 + rng() * 150;
        const x = anchor.x + Math.cos(angle) * radius;
        const z = anchor.z + Math.sin(angle) * radius;
        if (!isFarmVillageSpotClear(x, z)) continue;
        createFarmBarn(x, z, rng() * Math.PI, 0.62 + rng() * 0.32, barnMaterial, barnRoofMaterial);
      }
    }
  }

  function findFarmHamletAnchor(region, rng, bias) {
    const rotation = region.rotation || 0;
    for (let attempt = 0; attempt < 28; attempt++) {
      const angle = bias * Math.PI * 2 + (rng() - 0.5) * 1.9;
      const ring = 0.56 + rng() * 0.34;
      const localX = Math.cos(angle) * region.rx * ring;
      const localZ = Math.sin(angle) * region.rz * ring;
      const point = rotatedOffset(region.x, region.z, localX, localZ, rotation);
      if (isFarmVillageSpotClear(point.x, point.z)) return point;
    }
    return null;
  }

  function createFarmBarn(x, z, rotation, scale, bodyMaterial, roofMaterial) {
    const barn = new THREE.Group();
    barn.name = 'terrain-placed-farm-barn';
    const placement = placeStructureGroupOnTerrain
      ? placeStructureGroupOnTerrain(barn, x, z, 42, 30, rotation, scale, {
        slopeTolerance: 0.5,
        name: 'farm-barn'
      })
      : null;
    if (!placement) {
      barn.position.set(x, terrainHeight(x, z), z);
      barn.rotation.y = rotation;
    }
    barn.scale.setScalar(scale);
    barn.userData.diagnosticType = 'building';
    barn.userData.diagnosticCount = 1;
    registerStructureFootprint(x, z, Math.hypot(42, 30) * 0.56 * scale + 16);
    scene.add(barn);
    if (placement && addStructureFoundation) addStructureFoundation(barn, 42, 30, placement, scale, { maxDepth: 6 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(42, 19, 30), bodyMaterial);
    body.position.y = 9.5;
    body.castShadow = false;
    body.receiveShadow = true;
    barn.add(body);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(27, 14, 4), roofMaterial);
    roof.position.y = 26;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = false;
    barn.add(roof);
  }

  function isFarmPatchClear(cx, cz, width, depth, rotation) {
    const samples = [];
    for (const sx of [-0.5, -0.25, 0, 0.25, 0.5]) {
      for (const sz of [-0.5, -0.25, 0, 0.25, 0.5]) {
        samples.push([sx, sz]);
      }
    }
    let minY = Infinity;
    let maxY = -Infinity;

    if (rotatedPatchOverlapsAirportPavement(cx, cz, width, depth, rotation, 180)) return false;
    if (doesPatchOverlapStructure(cx, cz, width, depth, rotation, 32)) return false;

    for (const sample of samples) {
      const point = rotatedOffset(cx, cz, sample[0] * width, sample[1] * depth, rotation);
      if (!isFarmGroundClear(point.x, point.z, 168, 520, 1850)) return false;
      const y = terrainHeight(point.x, point.z);
      if (y < WATER_LEVEL + 3 || y > 185) return false;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    return maxY - minY < 46;
  }

  function resolveFarmPatchPlacement(region, candidate, placedFieldRects, rng) {
    if (!farmPatchInsideRegion(region, candidate.x, candidate.z, candidate.width, candidate.depth, candidate.rotation)) return null;
    if (!isFarmPatchClear(candidate.x, candidate.z, candidate.width, candidate.depth, candidate.rotation)) return null;
    if (!patchOverlapsPlaced(candidate, placedFieldRects, 10)) return candidate;

    for (let attempt = 1; attempt < 7; attempt++) {
      const patch = disperseFarmPatch(region, candidate, placedFieldRects, rng, attempt);
      if (!farmPatchInsideRegion(region, patch.x, patch.z, patch.width, patch.depth, patch.rotation)) continue;
      if (!isFarmPatchClear(patch.x, patch.z, patch.width, patch.depth, patch.rotation)) continue;
      if (patchOverlapsPlaced(patch, placedFieldRects, 10)) continue;
      return patch;
    }
    return null;
  }

  function disperseFarmPatch(region, candidate, placedFieldRects, rng, attempt) {
    const overlap = nearestOverlappingFarmPatch(candidate, placedFieldRects, 16);
    let dx = candidate.x - (overlap ? overlap.x : region.x);
    let dz = candidate.z - (overlap ? overlap.z : region.z);
    const length = Math.hypot(dx, dz);
    if (length < 0.001) {
      const angle = region.rotation + attempt * 1.618 + (rng() - 0.5) * 0.46;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
    } else {
      dx /= length;
      dz /= length;
      const jitter = (rng() - 0.5) * 0.5;
      const c = Math.cos(jitter);
      const s = Math.sin(jitter);
      const rx = dx * c + dz * s;
      dz = -dx * s + dz * c;
      dx = rx;
    }

    const baseSpacing = overlap
      ? Math.max(candidate.width, candidate.depth, overlap.width, overlap.depth) * 0.42
      : Math.max(candidate.width, candidate.depth) * 0.34;
    const distance = baseSpacing + 32 + attempt * 18;
    return {
      ...candidate,
      x: candidate.x + dx * distance,
      z: candidate.z + dz * distance
    };
  }

  function nearestOverlappingFarmPatch(candidate, placedFieldRects, margin) {
    let nearest = null;
    let nearestDistance = Infinity;
    const candidateRect = createPatchRect(candidate.x, candidate.z, candidate.width, candidate.depth, candidate.rotation);
    for (const rect of placedFieldRects) {
      if (!patchRectsOverlap(candidateRect, rect, margin)) continue;
      const distance = Math.hypot(candidate.x - rect.x, candidate.z - rect.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = rect;
      }
    }
    return nearest;
  }

  function farmPatchInsideRegion(region, cx, cz, width, depth, rotation) {
    const regionRotation = region.rotation || 0;
    const c = Math.cos(regionRotation);
    const s = Math.sin(regionRotation);
    for (const sx of [-0.5, 0, 0.5]) {
      for (const sz of [-0.5, 0, 0.5]) {
        const point = rotatedOffset(cx, cz, sx * width, sz * depth, rotation);
        const dx = point.x - region.x;
        const dz = point.z - region.z;
        const localX = c * dx - s * dz;
        const localZ = s * dx + c * dz;
        if ((localX / (region.rx * 1.08)) ** 2 + (localZ / (region.rz * 1.08)) ** 2 > 1) return false;
      }
    }
    return true;
  }

  function isFarmVillageSpotClear(x, z) {
    if (!isFarmGroundClear(x, z, 142, 300, 1240)) return false;
    if (isStructureFootprintBlocked(x, z, 34)) return false;
    const y = terrainHeight(x, z);
    return y >= WATER_LEVEL + 3 && y <= 175;
  }

  function isFarmGroundClear(x, z, waterClearance, runwayLateral, approachDistance) {
    if (Math.abs(x) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 120 || Math.abs(z) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 120) return false;
    if (isRoadWaterBlocked(x, z, waterClearance)) return false;
    if (isNearFarmRoad(x, z, 44)) return false;
    if (isInAirportExclusionZone(x, z, 90)) return false;
    if (isNearRunwaySafety(x, z, runwayLateral, 1080) || isInRunwayApproach(x, z, 380, approachDistance)) return false;
    if (isInCityCore(x, z)) return false;
    return true;
  }

  function isNearFarmRoad(x, z, margin) {
    for (const road of CONNECTING_ROADS) {
      if (distanceToSegment(x, z, { x: road.x1, z: road.z1 }, { x: road.x2, z: road.z2 }) < margin + road.width * 0.5) return true;
    }
    for (const village of VILLAGES) {
      for (let i = 0; i < village.road.length - 1; i++) {
        const a = { x: village.road[i][0], z: village.road[i][1] };
        const b = { x: village.road[i + 1][0], z: village.road[i + 1][1] };
        if (distanceToSegment(x, z, a, b) < margin) return true;
      }
    }
    return false;
  }
}
