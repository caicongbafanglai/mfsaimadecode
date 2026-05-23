import * as THREE from '../../three.module.min.js?v=202605050057';
import {
  BAYS,
  EDGE_OCEAN_EXTENT,
  EDGE_OCEAN_WIDTH,
  ISLANDS,
  LANDMASSES,
  LAKES,
  MAP_SIZE,
  RIVER_FOAM_Y,
  RIVER_SHORE_Y,
  RIVER_SURFACE_Y,
  RIVER_SYSTEMS,
  WATER_LEVEL
} from '../data/worldData.js?v=202605070100';
import {
  coastlineOffset,
  closestLakeNormalized,
  closestWaterBodyNormalized,
  distanceToMapEdge,
  distanceToRiver,
  isRiverMouthClearancePoint,
  liftSurfaceMaterial,
  smoothstep,
  waterBodyBoundaryLocal,
  waterBodyBoundaryPoint,
  waterBodyNormalized
} from './spatial.js?v=202605056000';

let glossFalloffTexture = null;

export function isRiverGeometryHiddenByWater(x, z, riverDistance = null) {
  if (closestLakeNormalized(x, z) < 0.94) return true;
  if (isRiverMouthClearancePoint(x, z, 230, riverDistance)) return true;
  if (distanceToMapEdge(x, z) < EDGE_OCEAN_WIDTH - 12) return true;
  const inBay = closestWaterBodyNormalized(BAYS, x, z) < 1.04;
  const onIsland = closestWaterBodyNormalized(ISLANDS, x, z) < 1.04;
  return inBay && !onIsland;
}

export function createWaterSystem({ scene, waterBands, mulberry32 }) {
  function createWaterSystems(quality = null) {
    const denseScenery = quality?.denseScenery === true;
    const rng = mulberry32(61830);
    const shoreMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0xe8d68a, roughness: 0.9, metalness: 0.01 }), -1, -1);
    const waterMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({
      color: 0x2f93bf,
      emissive: 0x0a334d,
      emissiveIntensity: 0.15,
      roughness: 0.13,
      metalness: 0.24,
      dithering: true,
      depthWrite: true
    }), -4, -4);
    const glossMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({
      color: 0xb6efff,
      roughness: 0.05,
      metalness: 0.08,
      transparent: true,
      opacity: 0.075,
      alphaMap: createGlossFalloffTexture(),
      depthWrite: false
    }), -3, -3);
  
    for (const lake of LAKES) {
      const group = new THREE.Group();
      group.position.set(lake.x, lake.level, lake.z);
      group.rotation.y = lake.rotation;
      scene.add(group);
  
      const shore = createOpenWaterBodyShore(lake, shoreMaterial, 0.88, 1.1, 160);
      shore.receiveShadow = true;
      shore.renderOrder = 1;
      group.add(shore);
  
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 128), waterMaterial.clone());
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.08;
      water.scale.set(lake.rx * 0.96, lake.rz * 0.96, 1);
      water.renderOrder = 2;
      group.add(water);
  
      const gloss = new THREE.Mesh(new THREE.CircleGeometry(1, 96), glossMaterial.clone());
      gloss.rotation.x = -Math.PI / 2;
      gloss.position.set(-lake.rx * 0.16, 0.1, -lake.rz * 0.08);
      gloss.scale.set(lake.rx * 0.44, lake.rz * 0.2, 1);
      gloss.renderOrder = 3;
      group.add(gloss);
  
      if (denseScenery) {
        const waveMaterial = new THREE.MeshBasicMaterial({ color: 0xc8f6ff, transparent: true, opacity: 0.18, depthWrite: false });
        for (let i = 0; i < 34; i++) {
          let lx = 0;
          let lz = 0;
          for (let attempt = 0; attempt < 12; attempt++) {
            lx = (rng() - 0.5) * lake.rx * 1.55;
            lz = (rng() - 0.5) * lake.rz * 1.55;
            if ((lx / lake.rx) ** 2 + (lz / lake.rz) ** 2 < 0.78) break;
          }
          const width = lake.rx * (0.22 + rng() * 0.48);
          const band = new THREE.Mesh(new THREE.PlaneGeometry(width, 3 + rng() * 5), waveMaterial.clone());
          band.rotation.x = -Math.PI / 2;
          band.rotation.z = (rng() - 0.5) * 0.18;
          band.position.set(lx, 0.14, lz);
          group.add(band);
          waterBands.push({ mesh: band, baseX: lx, phase: rng() * Math.PI * 2, speed: 0.45 + rng() * 0.75, travel: 10 + rng() * 18 });
        }
      }
    }
  
    createWorldOceanWater(rng, waterMaterial, glossMaterial, denseScenery);
    createBayWater(rng, shoreMaterial, waterMaterial, glossMaterial, denseScenery);
    createLandmassShores(shoreMaterial);
    if (denseScenery) {
      for (const river of RIVER_SYSTEMS) createRiverSegments(river, rng, shoreMaterial, waterMaterial);
      createRiverMouths(rng, shoreMaterial, waterMaterial);
      createLakeRiverConfluences(rng, waterMaterial);
    }
  }

  function createWorldOceanWater(rng, waterMaterial, glossMaterial, denseScenery = true) {
    const span = MAP_SIZE + EDGE_OCEAN_EXTENT * 1.74;
    const oceanMaterial = waterMaterial.clone();
    oceanMaterial.color.setHex(0x226f98);
    oceanMaterial.emissive.setHex(0x062d44);
    oceanMaterial.emissiveIntensity = 0.16;
    oceanMaterial.roughness = 0.18;
    oceanMaterial.metalness = 0.28;

    const ocean = new THREE.Mesh(new THREE.BoxGeometry(span, 0.14, span), oceanMaterial);
    ocean.position.set(0, WATER_LEVEL + 0.08, 0);
    ocean.receiveShadow = false;
    ocean.renderOrder = -2;
    ocean.frustumCulled = false;
    scene.add(ocean);

    const horizonMaterial = glossMaterial.clone();
    horizonMaterial.alphaMap = null;
    horizonMaterial.opacity = 0.045;
    const horizon = new THREE.Mesh(new THREE.PlaneGeometry(span * 1.08, span * 1.08, 1, 1), horizonMaterial);
    horizon.rotation.x = -Math.PI / 2;
    horizon.position.set(0, WATER_LEVEL + 0.19, 0);
    horizon.renderOrder = -1;
    horizon.frustumCulled = false;
    scene.add(horizon);

    const farSheenMaterial = glossMaterial.clone();
    farSheenMaterial.alphaMap = null;
    farSheenMaterial.opacity = 0.035;
    const farSheen = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.76, span * 0.76, 1, 1), farSheenMaterial);
    farSheen.rotation.x = -Math.PI / 2;
    farSheen.position.set(-span * 0.05, WATER_LEVEL + 0.24, -span * 0.04);
    farSheen.renderOrder = 0;
    farSheen.frustumCulled = false;
    scene.add(farSheen);

    if (!denseScenery) return;

    const waveMaterial = new THREE.MeshBasicMaterial({
      color: 0xd6fbff,
      transparent: true,
      opacity: 0.105,
      depthWrite: false
    });

    const offshoreBands = [];
    for (const land of LANDMASSES) {
      const count = land.rx > 2500 ? 58 : 24;
      for (let i = 0; i < count; i++) {
        const angle = rng() * Math.PI * 2;
        const radius = 1.055 + rng() * 0.32;
        const point = waterBodyBoundaryPoint(land, angle, radius);
        const tangent = angle + Math.PI / 2 + (land.rotation || 0);
        offshoreBands.push({ point, tangent, length: 130 + rng() * 290 });
      }
    }

    for (const item of offshoreBands) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(item.length, 3 + rng() * 4.5), waveMaterial.clone());
      band.rotation.x = -Math.PI / 2;
      band.rotation.z = -item.tangent + (rng() - 0.5) * 0.18;
      band.position.set(item.point.x, WATER_LEVEL + 0.22, item.point.z);
      band.renderOrder = 0;
      scene.add(band);
      waterBands.push({
        mesh: band,
        baseX: band.position.x,
        phase: rng() * Math.PI * 2,
        speed: 0.22 + rng() * 0.34,
        travel: 5 + rng() * 15,
        worldAxis: true
      });
    }
  }

  function createLandmassShores(shoreMaterial) {
    for (const land of LANDMASSES) {
      const group = new THREE.Group();
      group.position.set(land.x, WATER_LEVEL + 0.11, land.z);
      group.rotation.y = land.rotation || 0;
      scene.add(group);

      const segments = land.rx > 2500 ? 256 : 128;
      const shore = createLandmassShoreRing(land, shoreMaterial, 0.94, 1.055, segments);
      shore.receiveShadow = true;
      shore.renderOrder = 1;
      group.add(shore);
    }
  }

  function createLandmassShoreRing(body, material, innerScale, outerScale, segments) {
    const positions = [];
    const indices = [];
    let vertex = 0;

    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const mid = (a0 + a1) * 0.5;
      const midWorld = waterBodyBoundaryPoint(body, mid, 1.0);
      if (distanceToRiver(midWorld.x, midWorld.z) < 210) continue;

      const inner0 = waterBodyBoundaryLocal(body, a0, innerScale);
      const outer0 = waterBodyBoundaryLocal(body, a0, outerScale);
      const outer1 = waterBodyBoundaryLocal(body, a1, outerScale);
      const inner1 = waterBodyBoundaryLocal(body, a1, innerScale);
      const points = [
        [inner0.x, 0, inner0.z],
        [outer0.x, 0, outer0.z],
        [outer1.x, 0, outer1.z],
        [inner1.x, 0, inner1.z]
      ];
      for (const point of points) positions.push(...point);
      indices.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2);
      vertex += 4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  function createEdgeOceanWater(rng, shoreMaterial, waterMaterial, glossMaterial) {
    const half = MAP_SIZE / 2;
    const oceanMaterial = waterMaterial.clone();
    oceanMaterial.opacity = 0.86;
    const outer = EDGE_OCEAN_EXTENT;
    const middleSpan = MAP_SIZE - EDGE_OCEAN_WIDTH * 2;
    const strips = [
      { x: 0, z: -half + EDGE_OCEAN_WIDTH / 2 - outer / 2, w: MAP_SIZE + outer * 2, d: EDGE_OCEAN_WIDTH + outer, shoreZ: -half + EDGE_OCEAN_WIDTH + 8 },
      { x: 0, z: half - EDGE_OCEAN_WIDTH / 2 + outer / 2, w: MAP_SIZE + outer * 2, d: EDGE_OCEAN_WIDTH + outer, shoreZ: half - EDGE_OCEAN_WIDTH - 8 },
      { x: -half + EDGE_OCEAN_WIDTH / 2 - outer / 2, z: 0, w: EDGE_OCEAN_WIDTH + outer, d: middleSpan, shoreX: -half + EDGE_OCEAN_WIDTH + 8 },
      { x: half - EDGE_OCEAN_WIDTH / 2 + outer / 2, z: 0, w: EDGE_OCEAN_WIDTH + outer, d: middleSpan, shoreX: half - EDGE_OCEAN_WIDTH - 8 }
    ];
  
    for (const strip of strips) {
      const water = new THREE.Mesh(new THREE.BoxGeometry(strip.w, 0.12, strip.d), oceanMaterial.clone());
      water.position.set(strip.x, WATER_LEVEL + 0.12, strip.z);
      scene.add(water);
  
      createSegmentedEdgeShore(strip, shoreMaterial);
    }
  
    const waveMaterial = new THREE.MeshBasicMaterial({ color: 0xd6fbff, transparent: true, opacity: 0.09, depthWrite: false });
    const visibleOffshore = Math.min(14000, EDGE_OCEAN_EXTENT * 0.24);
    for (let i = 0; i < 120; i++) {
      const vertical = rng() > 0.5;
      const edgeSign = rng() > 0.5 ? 1 : -1;
      const offshore = rng() < 0.58
        ? rng() * EDGE_OCEAN_WIDTH * 0.86
        : EDGE_OCEAN_WIDTH * 0.7 + Math.pow(rng(), 1.75) * visibleOffshore;
      const length = 160 + rng() * 260;
      const band = new THREE.Mesh(new THREE.PlaneGeometry(length, 3 + rng() * 4), waveMaterial.clone());
      band.rotation.x = -Math.PI / 2;
      if (vertical) {
        band.rotation.z = Math.PI / 2 + (rng() - 0.5) * 0.16;
        band.position.set(edgeSign * (half - EDGE_OCEAN_WIDTH + offshore), WATER_LEVEL + 0.18, (rng() - 0.5) * middleSpan);
      } else {
        band.rotation.z = (rng() - 0.5) * 0.16;
        band.position.set((rng() - 0.5) * (MAP_SIZE + visibleOffshore * 1.4), WATER_LEVEL + 0.18, edgeSign * (half - EDGE_OCEAN_WIDTH + offshore));
      }
      scene.add(band);
      waterBands.push({ mesh: band, baseX: band.position.x, phase: rng() * Math.PI * 2, speed: 0.24 + rng() * 0.42, travel: 8 + rng() * 18, worldAxis: true });
    }
  }

  function createBayWater(rng, shoreMaterial, waterMaterial, glossMaterial, denseScenery = true) {
    for (const bay of BAYS) {
      const group = new THREE.Group();
      group.position.set(bay.x, bay.level, bay.z);
      group.rotation.y = bay.rotation;
      scene.add(group);
  
      const shore = createOpenWaterBodyShore(bay, shoreMaterial, 0.91, 1.05, 192);
      shore.receiveShadow = true;
      shore.renderOrder = 1;
      group.add(shore);
  
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 160), waterMaterial.clone());
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.08;
      water.scale.set(bay.rx * 0.98, bay.rz * 0.98, 1);
      water.renderOrder = 2;
      group.add(water);
  
      const gloss = new THREE.Mesh(new THREE.CircleGeometry(1, 96), glossMaterial.clone());
      gloss.rotation.x = -Math.PI / 2;
      gloss.position.set(-bay.rx * 0.18, 0.12, -bay.rz * 0.12);
      gloss.scale.set(bay.rx * 0.48, bay.rz * 0.18, 1);
      gloss.renderOrder = 3;
      group.add(gloss);
  
      if (denseScenery) {
        const waveMaterial = new THREE.MeshBasicMaterial({ color: 0xc8f6ff, transparent: true, opacity: 0.14, depthWrite: false });
        for (let i = 0; i < 56; i++) {
          let lx = 0;
          let lz = 0;
          for (let attempt = 0; attempt < 16; attempt++) {
            lx = (rng() - 0.5) * bay.rx * 1.55;
            lz = (rng() - 0.5) * bay.rz * 1.55;
            if ((lx / bay.rx) ** 2 + (lz / bay.rz) ** 2 < 0.82) break;
          }
          const band = new THREE.Mesh(new THREE.PlaneGeometry(90 + rng() * 190, 3 + rng() * 5), waveMaterial.clone());
          band.rotation.x = -Math.PI / 2;
          band.rotation.z = (rng() - 0.5) * 0.22;
          band.position.set(lx, 0.16, lz);
          group.add(band);
          waterBands.push({ mesh: band, baseX: lx, phase: rng() * Math.PI * 2, speed: 0.32 + rng() * 0.55, travel: 12 + rng() * 24 });
        }
      }
    }
  }

  function createIslandShores(shoreMaterial) {
    for (const island of ISLANDS) {
      const group = new THREE.Group();
      group.position.set(island.x, WATER_LEVEL + 0.1, island.z);
      group.rotation.y = island.rotation || 0;
      scene.add(group);

      const shore = createOpenWaterBodyShore(island, shoreMaterial, 0.88, 1.12, 224);
      shore.receiveShadow = true;
      shore.renderOrder = 1;
      group.add(shore);
    }
  }

  function createSegmentedEdgeShore(strip, shoreMaterial) {
    const half = MAP_SIZE / 2;
    const horizontal = strip.shoreX === undefined;
    const samples = 220;
    const sign = Math.sign(horizontal ? strip.shoreZ : strip.shoreX) || 1;
    const segmentLength = MAP_SIZE / samples;
  
    for (let i = 0; i < samples; i++) {
      const t = (i + 0.5) / samples;
      const coord = THREE.MathUtils.lerp(-half, half, t);
      const fixed = sign * (half - EDGE_OCEAN_WIDTH + 8 + coastlineOffset(horizontal, sign, coord));
      const x = horizontal ? coord : fixed;
      const z = horizontal ? fixed : coord;
      if (isEdgeShoreOpening(x, z)) continue;

      const shore = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? segmentLength * 1.12 : 42, 0.1, horizontal ? 42 : segmentLength * 1.12),
        shoreMaterial
      );
      shore.position.set(x, WATER_LEVEL + 0.08, z);
      shore.receiveShadow = true;
      shore.renderOrder = 1;
      scene.add(shore);
    }
  }

  function createOpenWaterBodyShore(body, material, innerScale, outerScale, segments) {
    const positions = [];
    const indices = [];
    let vertex = 0;
  
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const mid = (a0 + a1) * 0.5;
      const midWorld = waterBodyBoundaryPoint(body, mid, (innerScale + outerScale) * 0.5);
      if (isOpenWaterBodyShoreGap(midWorld.x, midWorld.z)) continue;
  
      const inner0 = waterBodyBoundaryLocal(body, a0, innerScale);
      const outer0 = waterBodyBoundaryLocal(body, a0, outerScale);
      const outer1 = waterBodyBoundaryLocal(body, a1, outerScale);
      const inner1 = waterBodyBoundaryLocal(body, a1, innerScale);
      const points = [
        [inner0.x, 0, inner0.z],
        [outer0.x, 0, outer0.z],
        [outer1.x, 0, outer1.z],
        [inner1.x, 0, inner1.z]
      ];
      for (const point of points) positions.push(...point);
      indices.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2);
      vertex += 4;
    }
  
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  function isEdgeShoreOpening(x, z) {
    if (distanceToRiver(x, z) < 260) return true;
    const inBay = closestWaterBodyNormalized(BAYS, x, z) < 1.12;
    const onIsland = closestWaterBodyNormalized(ISLANDS, x, z) < 1.05;
    return inBay && !onIsland;
  }

  function isOpenWaterBodyShoreGap(x, z) {
    if (distanceToMapEdge(x, z) < EDGE_OCEAN_WIDTH + 105) return true;
    return distanceToRiver(x, z) < 230;
  }

  function createRiverSegments(points, rng, shoreMaterial, waterMaterial) {
    const riverWaterMaterial = waterMaterial.clone();
    riverWaterMaterial.color.setHex(0x2f93ba);
    riverWaterMaterial.transparent = false;
    riverWaterMaterial.opacity = 1;
    riverWaterMaterial.depthWrite = true;
    riverWaterMaterial.polygonOffset = true;
    riverWaterMaterial.polygonOffsetFactor = -5;
