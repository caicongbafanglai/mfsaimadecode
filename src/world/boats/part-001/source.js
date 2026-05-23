import * as THREE from '../../three.module.min.js?v=202605050057';
import {
  BAYS,
  CONTINENTS,
  ISLANDS,
  RIVER_SURFACE_Y,
  RIVER_SYSTEMS,
  WATER_LEVEL
} from '../data/worldData.js?v=202605070100';
import {
  closestLandSignedDistance,
  closestWaterBodyNormalized,
  distanceToMapEdge,
  distanceToRiver,
  waterBodyBoundaryPoint
} from './spatial.js?v=202605056000';

const TYPE_SPECS = {
  largeCargo: {
    label: '大型远洋货船',
    length: 168,
    beam: 28,
    height: 13,
    speed: 8.2,
    minClearance: 360,
    detailDistance: 26000,
    hull: 0x3b5569,
    deck: 0xd2d8dc,
    accent: 0xc05343,
    containers: true
  },
  coastalCargo: {
    label: '中型沿海货船',
    length: 96,
    beam: 18,
    height: 9,
    speed: 7.4,
    minClearance: 170,
    detailDistance: 22000,
    hull: 0x406675,
    deck: 0xd8ddd9,
    accent: 0xd49a45,
    containers: true
  },
  fishing: {
    label: '小型渔船',
    length: 34,
    beam: 8,
    height: 4.5,
    speed: 4.8,
    minClearance: 34,
    detailDistance: 15500,
    hull: 0x315f74,
    deck: 0xe5e0c8,
    accent: 0x5aa66a,
    workDeck: true
  },
  ferry: {
    label: '小型客船 / 渡船',
    length: 52,
    beam: 12,
    height: 6.4,
    speed: 9.1,
    minClearance: 70,
    detailDistance: 18000,
    hull: 0xf0f2ea,
    deck: 0x2f6f8d,
    accent: 0x4b8ed6,
    cabinDeck: true
  },
  workBoat: {
    label: '港口作业船',
    length: 24,
    beam: 7,
    height: 4.2,
    speed: 3.2,
    minClearance: 24,
    detailDistance: 13500,
    hull: 0xd48a31,
    deck: 0x39444b,
    accent: 0xf1d35c,
    workDeck: true
  }
};

export function createBoatSystem({ scene, mulberry32 }) {
  const root = new THREE.Group();
  root.name = 'waterway-traffic-boats';
  root.userData.longRangeVisual = true;
  root.userData.diagnosticType = 'ship';
  root.userData.diagnosticCount = 0;
  scene.add(root);

  const rng = mulberry32(772024);
  const boats = [];
  let created = false;
  let simpleBoatPoints = null;
  let simpleBoatPositions = null;
  let simpleBoatCapacity = 0;

  function createBoats(options = {}) {
    if (created) return root.userData.boatSummary;
    created = true;
    const simpleMode = options.simple === true;
    const maxBoats = Number.isFinite(options.maxBoats) ? Math.max(0, options.maxBoats) : Infinity;

    const routes = createRoutePlan();
    const summary = {
      largeCargo: 0,
      coastalCargo: 0,
      fishing: 0,
      ferry: 0,
      workBoat: 0,
      routes: routes.length
    };

    if (simpleMode) initSimpleBoatLayer(Math.min(maxBoats, 96));

    let routeIndex = 0;
    for (const route of routes) {
      const routePath = buildRoutePath(route.points, route.loop);
      if (routePath.totalLength < 40) continue;
      for (const placement of route.traffic) {
        for (let i = 0; i < placement.count; i++) {
          if (boats.length >= maxBoats) break;
          const phase = (i + 0.32 + rng() * 0.18) / placement.count;
          const boat = simpleMode
            ? createSimpleBoat(route, routePath, placement.type, phase, routeIndex, i)
            : createBoat(route, routePath, placement.type, phase, routeIndex, i);
          if (!boat) continue;
          boats.push(boat);
          root.userData.diagnosticCount = boats.length;
          summary[placement.type]++;
        }
        if (boats.length >= maxBoats) break;
      }
      if (boats.length >= maxBoats) break;
      routeIndex++;
    }

    if (simpleBoatPoints) {
      simpleBoatPoints.geometry.setDrawRange(0, boats.length);
      simpleBoatPoints.geometry.attributes.position.needsUpdate = true;
      simpleBoatPoints.userData.diagnosticCount = boats.length;
    }
    root.userData.boatSummary = summary;
    return summary;
  }

  function createBoat(route, routePath, type, phase, routeIndex, itemIndex) {
    const spec = TYPE_SPECS[type];
    const sample = samplePath(routePath, phase * routePath.cycleLength, route.loop);
    if (!sample || !isBoatPlacementSafe(sample.x, sample.z, type, route.waterway)) return null;

    const group = buildBoatModel(spec, type, rng);
    group.name = `${type}-${route.name}-${itemIndex}`;
    group.position.set(sample.x, route.surfaceY || WATER_LEVEL + 0.78, sample.z);
    group.rotation.y = Math.atan2(sample.dx, sample.dz);
    group.userData.longRangeVisual = true;
    group.userData.diagnosticType = 'ship';
    group.userData.diagnosticCount = 0;
    root.add(group);

    return {
      group,
      type,
      spec,
      route,
      path: routePath,
      distance: phase * routePath.cycleLength,
      speed: spec.speed * (0.86 + rng() * 0.22) * (route.speedScale || 1),
      updateDebt: routeIndex * 0.037 + itemIndex * 0.019
    };
  }

  function initSimpleBoatLayer(capacity) {
    simpleBoatCapacity = capacity;
    simpleBoatPositions = new Float32Array(simpleBoatCapacity * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(simpleBoatPositions, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({
      color: 0xd7eef4,
      size: 72,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });
    simpleBoatPoints = new THREE.Points(geometry, material);
    simpleBoatPoints.name = 'waterway-traffic-boats-low-lod';
    simpleBoatPoints.frustumCulled = false;
    simpleBoatPoints.userData.longRangeVisual = true;
    simpleBoatPoints.userData.diagnosticType = 'ship';
    simpleBoatPoints.userData.diagnosticCount = 0;
    root.add(simpleBoatPoints);
  }

  function createSimpleBoat(route, routePath, type, phase, routeIndex, itemIndex) {
    if (!simpleBoatPoints || boats.length >= simpleBoatCapacity) return null;
    const spec = TYPE_SPECS[type];
    const sample = samplePath(routePath, phase * routePath.cycleLength, route.loop);
    if (!sample || !isBoatPlacementSafe(sample.x, sample.z, type, route.waterway)) return null;
    const index = boats.length;
    writeSimpleBoatPosition(index, sample.x, route.surfaceY || WATER_LEVEL + 0.92, sample.z);
    return {
      simple: true,
      index,
      type,
      spec,
      route,
      path: routePath,
      distance: phase * routePath.cycleLength,
      speed: spec.speed * (0.86 + rng() * 0.22) * (route.speedScale || 1),
      updateDebt: routeIndex * 0.037 + itemIndex * 0.019
    };
  }

  function updateBoats(dt, cameraPosition, qualityPreset = null) {
    const farUpdateInterval = qualityPreset?.boatFarUpdateInterval ?? 0.42;
    let simpleDirty = false;
    for (const boat of boats) {
      if (boat.simple) {
        boat.updateDebt += dt;
        if (boat.updateDebt < farUpdateInterval) continue;
        const step = boat.updateDebt;
        boat.updateDebt = 0;
        boat.distance = (boat.distance + boat.speed * step) % boat.path.cycleLength;
        const sample = samplePath(boat.path, boat.distance, boat.route.loop);
        if (!sample) continue;
        writeSimpleBoatPosition(boat.index, sample.x, boat.route.surfaceY || WATER_LEVEL + 0.92, sample.z);
        simpleDirty = true;
        continue;
      }
      const dx = cameraPosition ? boat.group.position.x - cameraPosition.x : 0;
      const dz = cameraPosition ? boat.group.position.z - cameraPosition.z : 0;
      const distanceSq = dx * dx + dz * dz;
      const far = distanceSq > 26000 * 26000;
      boat.updateDebt += dt;
      if (far && boat.updateDebt < farUpdateInterval) continue;

      const step = boat.updateDebt;
      boat.updateDebt = 0;
      boat.distance = (boat.distance + boat.speed * step) % boat.path.cycleLength;
      const sample = samplePath(boat.path, boat.distance, boat.route.loop);
      if (!sample) continue;
      boat.group.position.set(sample.x, boat.route.surfaceY || WATER_LEVEL + 0.78, sample.z);
      boat.group.rotation.y = Math.atan2(sample.dx, sample.dz);

      const detailVisible = distanceSq < boat.spec.detailDistance * boat.spec.detailDistance;
      for (const child of boat.group.children) {
        if (child.userData.boatDetail) child.visible = detailVisible;
      }
    }
    if (simpleDirty && simpleBoatPoints) {
      simpleBoatPoints.geometry.attributes.position.needsUpdate = true;
      simpleBoatPoints.geometry.computeBoundingSphere();
    }
  }

  function writeSimpleBoatPosition(index, x, y, z) {
    if (!simpleBoatPositions) return;
    const offset = index * 3;
    simpleBoatPositions[offset] = x;
    simpleBoatPositions[offset + 1] = y;
    simpleBoatPositions[offset + 2] = z;
  }

  return { createBoats, updateBoats, boats, root };
}

function createRoutePlan() {
  const routes = [
    oceanRoute('bluewater-west-main', [
      [-24800, -17700],
      [-18800, -23100],
      [-7800, -23800],
      [6400, -22900],
      [18500, -18400],
      [24600, -10800]
    ], [{ type: 'largeCargo', count: 4 }, { type: 'coastalCargo', count: 2 }]),
    oceanRoute('bluewater-south-main', [
      [-24400, 20400],
      [-16600, 23200],
      [-4200, 22500],
      [8600, 21000],
      [20600, 17600],
      [24700, 11200]
    ], [{ type: 'largeCargo', count: 4 }, { type: 'coastalCargo', count: 3 }]),
    oceanRoute('east-offshore-freight', [
      [22600, -15100],
      [24600, -7200],
      [22600, 1500],
      [21400, 6200],
      [23300, 11600],
      [24800, 16800]
    ], [{ type: 'largeCargo', count: 3 }, { type: 'coastalCargo', count: 4 }]),
    oceanRoute('western-sea-lane', [
      [-25200, -5400],
      [-23600, 1600],
      [-24600, 8600],
      [-22400, 14400],
      [-17600, 20400]
    ], [{ type: 'largeCargo', count: 3 }, { type: 'coastalCargo', count: 3 }])
  ];

  for (const continent of CONTINENTS) {
    routes.push({
      name: `${continent.name}-coastal-clockwise`,
      points: coastalLoopPoints(continent, 1.22, 11),
      loop: true,
      waterway: 'coastal',
      speedScale: 0.86,
      traffic: [{ type: 'coastalCargo', count: continent.rx > 6500 ? 4 : 3 }, { type: 'fishing', count: 2 }]
    });
  }

  for (const bay of BAYS) {
    routes.push({
      name: `${bay.name}-harbor-work`,
      points: coastalLoopPoints(bay, 0.72, 7),
      loop: true,
      waterway: 'bay',
      speedScale: 0.64,
      surfaceY: WATER_LEVEL + 0.86,
      traffic: [{ type: 'workBoat', count: 1 }, { type: 'fishing', count: 1 }]
    });
  }

  routes.push(
    channelRoute('harbor-beacon-ferry', [[13360, 7060], [14740, 7640], [11320, 9560], [10300, 9100]], 3),
    channelRoute('beacon-windward-ferry', [[10840, 10480], [12460, 11180], [14500, 10940], [15160, 10140]], 3),
    channelRoute('farpoint-coastal-ferry', [[21500, -6750], [22600, -6650], [23600, -7850], [22400, -9040]], 2),
    channelRoute('crescent-sound-ferry', [[19480, 12880], [20080, 13420], [20740, 14380], [19640, 15100]], 2),
    channelRoute('northwatch-island-ferry', [[-4200, -13560], [-3380, -12980], [-2280, -13880], [-3040, -14860]], 2),
    channelRoute('cascade-port-service', [[-22900, 5100], [-22300, 6100], [-21400, 7040], [-22380, 8180]], 2)
  );

  for (const island of ISLANDS) {
    const size = Math.sqrt(island.rx * island.rz);
    routes.push({
      name: `${island.name}-fishing-grounds`,
      points: coastalLoopPoints(island, size > 1000 ? 1.24 : 1.32, size > 1000 ? 8 : 6),
      loop: true,
      waterway: 'island',
      speedScale: 0.7,
      traffic: [{ type: 'fishing', count: size > 1000 ? 2 : 1 }]
    });
  }

  for (const route of riverMouthRoutes()) routes.push(route);
  return routes;
}

function oceanRoute(name, points, traffic) {
  return {
    name,
    points: points.map(([x, z]) => ({ x, z })),
    loop: false,
    waterway: 'deep',
    traffic
  };
}

function channelRoute(name, points, ferryCount) {
  return {
    name,
    points: points.map(([x, z]) => ({ x, z })),
    loop: true,
    waterway: 'channel',
    speedScale: 0.82,
    traffic: [{ type: 'ferry', count: ferryCount }, { type: 'fishing', count: 1 }]
  };
}

function coastalLoopPoints(body, radius, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    points.push(waterBodyBoundaryPoint(body, angle, radius));
  }
  return points;
}

function riverMouthRoutes() {
  const routes = [];
  let index = 0;
  for (const river of RIVER_SYSTEMS) {
    if (river.length < 2) continue;
    addMouthRoute(river[0], river[1]);
    addMouthRoute(river[river.length - 1], river[river.length - 2]);
  }
  return routes;

  function addMouthRoute(endpoint, inside) {
    const bayMouth = closestWaterBodyNormalized(BAYS, endpoint.x, endpoint.z) < 1.48;
    const oceanMouth = distanceToMapEdge(endpoint.x, endpoint.z) < 1380;
    if (!bayMouth && !oceanMouth) return;
    const outward = new THREE.Vector2(endpoint.x - inside.x, endpoint.z - inside.z);
    if (outward.lengthSq() < 0.01) return;
    outward.normalize();
    const p0 = {
      x: endpoint.x - outward.x * 420,
      z: endpoint.z - outward.y * 420
    };
    const p1 = {
      x: endpoint.x - outward.x * 120,
      z: endpoint.z - outward.y * 120
    };
    const p2 = {
      x: endpoint.x + outward.x * (bayMouth ? 360 : 520),
      z: endpoint.z + outward.y * (bayMouth ? 360 : 520)
    };
    routes.push({
      name: `river-mouth-${++index}`,
      points: [p0, p1, p2],
      loop: false,
      waterway: 'riverMouth',
      surfaceY: RIVER_SURFACE_Y + 0.22,
      speedScale: 0.58,
      traffic: [{ type: 'fishing', count: 1 }, { type: 'workBoat', count: index % 3 === 0 ? 1 : 0 }]
    });
  }
}

function buildRoutePath(points, loop) {
  const routePoints = points.map(point => ({ x: point.x, z: point.z }));
  if (loop && routePoints.length > 2) routePoints.push({ ...routePoints[0] });
  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    segments.push({ a, b, dx, dz, length, start: totalLength });
    totalLength += length;
  }
  return { points: routePoints, segments, totalLength, cycleLength: loop ? totalLength : totalLength * 2 };
}

function samplePath(path, distance, loop) {
  if (!path.segments.length) return null;
  let d = distance;
  let reverse = false;
  if (!loop) {
    const doubled = path.totalLength * 2;
    d = ((distance % doubled) + doubled) % doubled;
    if (d > path.totalLength) {
      d = doubled - d;
      reverse = true;
    }
  } else {
    d = ((distance % path.totalLength) + path.totalLength) % path.totalLength;
  }

  for (const segment of path.segments) {
    if (d > segment.start + segment.length) continue;
    const t = THREE.MathUtils.clamp((d - segment.start) / segment.length, 0, 1);
    const dx = reverse ? -segment.dx : segment.dx;
    const dz = reverse ? -segment.dz : segment.dz;
    return {
      x: THREE.MathUtils.lerp(segment.a.x, segment.b.x, t),
      z: THREE.MathUtils.lerp(segment.a.z, segment.b.z, t),
      dx,
      dz
    };
  }

  const last = path.segments[path.segments.length - 1];
  return { x: last.b.x, z: last.b.z, dx: last.dx, dz: last.dz };
}

function isBoatPlacementSafe(x, z, type, waterway) {
  const spec = TYPE_SPECS[type];
  const landSigned = closestLandSignedDistance(x, z);
  const inBay = closestWaterBodyNormalized(BAYS, x, z) < 0.98;
  const onIsland = closestWaterBodyNormalized(ISLANDS, x, z) < 1.04;
  const riverDistance = distanceToRiver(x, z);

  if (waterway === 'riverMouth') {
    if (type === 'largeCargo' || type === 'coastalCargo') return false;
    return riverDistance < 96 || (inBay && !onIsland) || landSigned < -24;
  }
  if (waterway === 'bay') {
    return type !== 'largeCargo' && inBay && !onIsland;
  }
  if (waterway === 'deep') {
    return landSigned < -spec.minClearance && !onIsland;
  }
  if (type === 'largeCargo') return landSigned < -spec.minClearance && !onIsland;
  return (landSigned < -spec.minClearance || (inBay && !onIsland)) && riverDistance > (type === 'coastalCargo' ? 130 : 44);
}

function buildBoatModel(spec, type, rng) {
  const group = new THREE.Group();
  const hullMaterial = new THREE.MeshStandardMaterial({ color: spec.hull, roughness: 0.58, metalness: 0.08 });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: spec.deck, roughness: 0.52, metalness: 0.04 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.5, metalness: 0.04 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x9ed4e8, roughness: 0.22, metalness: 0.02 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(spec.beam, spec.height, spec.length), hullMaterial);
  hull.position.y = spec.height * 0.46;
