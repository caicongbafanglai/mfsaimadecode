import * as THREE from '../../three.module.min.js?v=202605050057';
import {
  AIRPORTS,
  BAYS,
  CITY_ZONES,
  ISLANDS,
  LANDMASSES,
  MAP_SIZE,
  RIVER_SYSTEMS,
  WATER_LEVEL
} from '../data/worldData.js?v=202605070100';
import {
  airportLocal,
  closestWaterBodyNormalized,
  distanceToMapEdge,
  smoothstep,
  waterBodyBoundaryPoint
} from './spatial.js?v=202605056000';

export function createBirdSystem({ scene, terrainHeight, mulberry32, getRenderQuality = null }) {
  const birds = [];
  const dummy = new THREE.Object3D();
  let birdMesh = null;
  let updateDebt = 0;

  function createBirds() {
    const rng = mulberry32(71029);
    const geometry = createSeagullGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0xf2f6f1, side: THREE.DoubleSide });
    const targetCount = 96;
    birdMesh = new THREE.InstancedMesh(geometry, material, targetCount);
    birdMesh.frustumCulled = true;
    birdMesh.userData.diagnosticType = 'bird';
    birdMesh.userData.diagnosticCount = 0;
    scene.add(birdMesh);

    for (let i = 0; i < targetCount; i++) {
      const anchor = birdAnchor(rng, i);
      birds.push({
        anchor,
        radiusX: 220 + Math.pow(rng(), 0.72) * 760,
        radiusZ: 140 + Math.pow(rng(), 0.78) * 540,
        altitude: 54 + rng() * 170,
        speed: 0.08 + rng() * 0.22,
        phase: rng() * Math.PI * 2,
        phaseOffset: rng() * Math.PI * 2,
        direction: rng() > 0.5 ? 1 : -1,
        driftAngle: rng() * Math.PI * 2,
        driftSpeed: 0.006 + rng() * 0.018,
        wingRock: 0.06 + rng() * 0.12,
        scale: 0.72 + rng() * 1.08
      });
    }

    updateBirds(0.01, null, getRenderQuality?.());
  }

  function birdAnchor(rng, index) {
    for (let attempt = 0; attempt < 34; attempt++) {
      let point;
      if (index % 5 === 0) {
        point = riverMouthAnchor(rng);
      } else if (index % 4 === 0 && ISLANDS.length) {
        point = coastlineAnchor(ISLANDS[Math.floor(rng() * ISLANDS.length)], rng);
      } else {
        point = coastlineAnchor(LANDMASSES[Math.floor(rng() * LANDMASSES.length)], rng);
      }
      if (point && isGoodBirdHabitat(point.x, point.z)) return point;
    }

    return coastlineAnchor(LANDMASSES[Math.floor(rng() * LANDMASSES.length)], rng);
  }

  function updateBirds(dt, cameraPosition = null, qualityPreset = getRenderQuality?.()) {
    if (!birdMesh) return;
    updateDebt += dt;
    const interval = qualityPreset?.birdUpdateInterval ?? 0.05;
    if (updateDebt < interval) return;
    const stepDt = updateDebt;
    updateDebt = 0;

    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      bird.phase += stepDt * bird.speed * bird.direction;
      bird.driftAngle += stepDt * bird.driftSpeed;
      const localX = Math.cos(bird.phase + bird.phaseOffset) * bird.radiusX;
      const localZ = Math.sin(bird.phase * 0.84) * bird.radiusZ;
      const driftX = Math.cos(bird.driftAngle) * 42;
      const driftZ = Math.sin(bird.driftAngle * 0.8) * 42;
      const x = THREE.MathUtils.clamp(bird.anchor.x + localX + driftX, -MAP_SIZE / 2 + 520, MAP_SIZE / 2 - 520);
      const z = THREE.MathUtils.clamp(bird.anchor.z + localZ + driftZ, -MAP_SIZE / 2 + 520, MAP_SIZE / 2 - 520);
      const coastalLift = smoothstep(2600, 460, Math.min(distanceToMapEdge(x, z), closestWaterBodyNormalized(BAYS, x, z) * 520));
      const viewerDistance = cameraPosition ? Math.hypot(x - cameraPosition.x, z - cameraPosition.z) : 0;
      const farScale = viewerDistance > 12000 ? 1.35 : 1;
      const y = Math.max(
        WATER_LEVEL + 42,
        terrainHeight(x, z) + bird.altitude + coastalLift * 36 + Math.sin(bird.phase * 2.1 + bird.phaseOffset) * 18
      );
      const yaw = Math.atan2(
        -Math.cos(bird.phase * 0.84) * bird.radiusZ,
        -Math.sin(bird.phase + bird.phaseOffset) * bird.radiusX
      );
      dummy.position.set(x, y, z);
      dummy.rotation.set(0.04 * Math.sin(bird.phase * 1.7), yaw, bird.wingRock * Math.sin(bird.phase * 2.6));
      dummy.scale.setScalar(bird.scale * farScale);
      dummy.updateMatrix();
      birdMesh.setMatrixAt(i, dummy.matrix);
    }

    birdMesh.instanceMatrix.needsUpdate = true;
  }

  function createSeagullGeometry() {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, 0, -1.8,
      -4.8, 0.18, 1.6,
      -1.1, 0, 0.8,
      0, 0, -1.8,
      1.1, 0, 0.8,
      4.8, 0.18, 1.6,
      -0.42, -0.04, -1.2,
      0.42, -0.04, -1.2,
      0, 0.08, 2.1
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    geometry.computeVertexNormals();
    return geometry;
  }

  function coastlineAnchor(land, rng) {
    const coast = waterBodyBoundaryPoint(land, rng() * Math.PI * 2, 0.98 + rng() * 0.18);
    return {
      x: THREE.MathUtils.clamp(coast.x + (rng() - 0.5) * 900, -MAP_SIZE / 2 + 620, MAP_SIZE / 2 - 620),
      z: THREE.MathUtils.clamp(coast.z + (rng() - 0.5) * 900, -MAP_SIZE / 2 + 620, MAP_SIZE / 2 - 620)
    };
  }

  function riverMouthAnchor(rng) {
    if (!RIVER_SYSTEMS.length) return null;
    const river = RIVER_SYSTEMS[Math.floor(rng() * RIVER_SYSTEMS.length)];
    if (!river?.length) return null;
    const endpoint = rng() > 0.5 ? river[0] : river[river.length - 1];
    const inside = endpoint === river[0] ? river[1] : river[river.length - 2];
    const dx = endpoint.x - inside.x;
    const dz = endpoint.z - inside.z;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    return {
      x: endpoint.x + dx / length * (180 + rng() * 420) + (rng() - 0.5) * 460,
      z: endpoint.z + dz / length * (180 + rng() * 420) + (rng() - 0.5) * 460
    };
  }

  function isGoodBirdHabitat(x, z) {
    if (Math.abs(x) > MAP_SIZE / 2 - 520 || Math.abs(z) > MAP_SIZE / 2 - 520) return false;
    if (terrainHeight(x, z) > 170 && distanceToMapEdge(x, z) > 1800) return false;
    if (isNearAirport(x, z)) return false;
    for (const zone of CITY_ZONES) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius * 0.7) return false;
    }
    const coastDistance = distanceToMapEdge(x, z);
    const bayDistance = closestWaterBodyNormalized(BAYS, x, z);
    return coastDistance < 2300 || bayDistance < 1.72;
  }

  function isNearAirport(x, z) {
    for (const airport of AIRPORTS) {
      const local = airportLocal(airport, x, z);
      const runwayLength = airport.runwayLength || 1320;
      const runwayWidth = airport.runwayWidth || 98;
      if (Math.abs(local.x) < runwayWidth * 7.2 && Math.abs(local.z) < runwayLength / 2 + 1800) return true;
      if (Math.hypot(x - airport.x, z - airport.z) < 1250) return true;
    }
    return false;
  }

  return {
    createBirds,
    updateBirds
  };
}
