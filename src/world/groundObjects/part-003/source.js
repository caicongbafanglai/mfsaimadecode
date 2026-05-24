  function createCityRoadSection(city, vertical, offset, start, end, roadMaterial, stripeMaterial, roadSegments, trafficRoutes, width, kind) {
    const length = end - start;
    if (length < 54) return false;
    if (!cityRoadSectionClear(city, vertical, offset, start, end, width)) {
      urbanIntegrityReport.roadReport.fixedCount++;
      return false;
    }

    const center = (start + end) / 2;
    const localX = vertical ? offset : center;
    const localZ = vertical ? center : offset;
    const worldX = city.position.x + localX;
    const worldZ = city.position.z + localZ;
    const angle = vertical ? -Math.PI / 2 : 0;
    createTerrainConformingPatch(worldX, worldZ, length, width, angle, roadMaterial, 1.08, Math.max(2, Math.ceil(length / 95)), 1, 2);
    urbanIntegrityReport.roadReport.totalRoads++;
    const segment = { vertical, offset, start, end, width, kind, bridge: false };
    roadSegments.push(segment);
    trafficRoutes.push(segment);

    for (let p = start + 46; p <= end - 46; p += 94) {
      const stripeX = vertical ? offset : p;
      const stripeZ = vertical ? p : offset;
      const stripeWorldX = city.position.x + stripeX;
      const stripeWorldZ = city.position.z + stripeZ;
      if (cityRoadBlockReason(stripeWorldX, stripeWorldZ, width) !== null) continue;
      createTerrainConformingPatch(
        stripeWorldX,
        stripeWorldZ,
        28,
        3,
        angle,
        stripeMaterial,
        1.36,
        1,
        1,
        3
      );
    }
    return true;
  }

  function cityRoadSectionClear(city, vertical, offset, start, end, width) {
    const length = end - start;
    const samples = Math.max(3, Math.ceil(length / 70));
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i <= samples; i++) {
      const p = THREE.MathUtils.lerp(start, end, i / samples);
      const localX = vertical ? offset : p;
      const localZ = vertical ? p : offset;
      const worldX = city.position.x + localX;
      const worldZ = city.position.z + localZ;
      if (cityRoadBlockReason(worldX, worldZ, width) !== null) return false;
      const y = terrainHeight(worldX, worldZ);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return maxY - minY < 36;
  }

  function createCityStreetlights(city, roadSegments, zone, rng, cityBuildingRects) {
    if (!roadSegments.length) return;
    const entries = [];
    for (const segment of roadSegments) {
      const length = segment.end - segment.start;
      const spacing = segment.kind === 'primary'
        ? Math.max(92, zone.streetlightSpacing || 122)
        : Math.max(135, (zone.streetlightSpacing || 122) * 1.45);
      if (length < spacing * 0.54) continue;
      if (segment.kind !== 'primary' && rng() > 0.62) continue;

      const sides = segment.kind === 'primary'
        ? [-1, 1]
        : [Math.sin(segment.offset * 0.017 + zone.x * 0.001) > 0 ? 1 : -1];
      for (let p = segment.start + spacing * 0.45; p <= segment.end - spacing * 0.35; p += spacing) {
        for (const side of sides) {
          const sideOffset = segment.width / 2 + STREETLIGHT_EDGE_OFFSET;
          const localX = segment.vertical ? segment.offset + side * sideOffset : p;
          const localZ = segment.vertical ? p : segment.offset + side * sideOffset;
          const worldX = city.position.x + localX;
          const worldZ = city.position.z + localZ;
          const baseY = terrainHeight(worldX, worldZ);
          if (!cityStreetlightClear(worldX, worldZ, baseY, cityBuildingRects)) {
            urbanIntegrityReport.streetlightReport.fixedCount++;
            continue;
          }
          entries.push({ x: localX, y: baseY, z: localZ, roadSegmentId: streetlightRoadSegmentId(city, segment) });
        }
      }
    }

    addInstancedStreetlights(city, entries);
  }

  function streetlightRoadSegmentId(city, segment) {
    const cityName = (city.name || 'city').replace(/\s+/g, '-');
    const axis = segment.vertical ? 'vertical' : 'horizontal';
    return `${cityName}:${axis}:${segment.kind}:${Math.round(segment.offset)}:${Math.round(segment.start)}:${Math.round(segment.end)}`;
  }

  function cityStreetlightClear(worldX, worldZ, baseY, cityBuildingRects) {
    if (!Number.isFinite(baseY) || baseY < WATER_LEVEL + 0.35) return false;
    if (isUrbanAirportExcluded(worldX, worldZ, 70) || isInRunwayProtectedArea(worldX, worldZ, 24)) return false;
    if (isRoadWaterBlocked(worldX, worldZ, 118)) return false;
    if (cityBuildingRects.some(rect => Math.abs(worldX - rect.x) < rect.halfW && Math.abs(worldZ - rect.z) < rect.halfD)) return false;
    return true;
  }

  function addInstancedStreetlights(city, entries) {
    if (!entries.length) return;
    const poleMesh = new THREE.InstancedMesh(streetlightPoleGeometry, streetlightPoleMaterial, entries.length);
    const lampMesh = new THREE.InstancedMesh(streetlightLampGeometry, streetlightLampMaterial, entries.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      dummy.position.set(entry.x, entry.y + STREETLIGHT_HEIGHT / 2, entry.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, STREETLIGHT_HEIGHT, 1);
      dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(entry.x, entry.y + STREETLIGHT_HEIGHT + 0.6, entry.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1.35);
      dummy.updateMatrix();
      lampMesh.setMatrixAt(i, dummy.matrix);
    }

    poleMesh.name = 'city-streetlight-pole-batch';
    poleMesh.castShadow = false;
    poleMesh.receiveShadow = true;
    poleMesh.userData.diagnosticType = 'streetlight';
    poleMesh.userData.diagnosticCount = entries.length;
    poleMesh.userData.streetlightBatch = true;
    poleMesh.userData.hasRoadSegmentIds = entries.every(entry => Boolean(entry.roadSegmentId));
    poleMesh.userData.roadSegmentIds = entries.map(entry => entry.roadSegmentId);
    poleMesh.instanceMatrix.needsUpdate = true;
    city.add(poleMesh);

    lampMesh.name = 'city-streetlight-lamp-batch';
    lampMesh.renderOrder = 9;
    lampMesh.userData.streetlightBatch = true;
    lampMesh.userData.attachedToStreetlightPole = true;
    lampMesh.userData.hasRoadSegmentIds = poleMesh.userData.hasRoadSegmentIds;
    lampMesh.userData.roadSegmentIds = poleMesh.userData.roadSegmentIds;
    lampMesh.instanceMatrix.needsUpdate = true;
    city.add(lampMesh);
    urbanIntegrityReport.streetlightReport.totalStreetlights += entries.length;
  }

  function createCityTraffic(city, zone, trafficRoutes, rng, denseCity) {
    const drivableRoutes = trafficRoutes.filter(route => route.end - route.start > (route.bridge ? 95 : 150));
    if (!drivableRoutes.length) return;
    const requested = zone.cars || 44;
    const targetCars = Math.min(
      denseCity ? requested : Math.max(4, Math.round(requested * 0.36)),
      Math.max(4, drivableRoutes.length * (denseCity ? 3 : 2))
    );
    let added = 0;
    let attempts = 0;
    while (added < targetCars && attempts < targetCars * 8) {
      attempts++;
      const route = drivableRoutes[Math.floor(rng() * drivableRoutes.length)];
      const direction = rng() > 0.5 ? 1 : -1;
      const laneOffset = (rng() > 0.5 ? 1 : -1) * Math.min(route.width * 0.26, 9.5);
      const margin = route.bridge ? 18 : 36;
      const routePosition = route.start + margin + rng() * Math.max(1, route.end - route.start - margin * 2);
      if (!isTrafficRoutePointClear(city, route, routePosition, laneOffset)) continue;
      const world = cityRoadWorldPoint(city, route.vertical, route.offset, routePosition, laneOffset);
      const rotation = cityTrafficRotation(route, direction);
      const y = cityTrafficVehicleY(city, route, routePosition);
      const color = chooseVehicleColor('city', rng, `city:${zone.name || city.name}`);
      const renderedCar = trafficRenderer.addCar(world.x, y, world.z, rotation, color);
      const trafficCar = {
        renderedCar,
        city,
        route,
        routePosition,
        laneOffset,
        rotation,
        direction,
        speed: (route.bridge ? 10 : 13) + rng() * (route.kind === 'primary' ? 19 : 13),
        onBridgeRoute: route.bridge === true
      };
      if (!renderedCar) trafficCar.group = createCar(city, world.x - city.position.x, y, world.z - city.position.z, rotation, color);
      trafficCars.push(trafficCar);
      added++;
    }
    refreshVehicleIntegrityReport();
  }

  function cityTrafficRotation(route, direction) {
    if (route.vertical) return direction > 0 ? 0 : Math.PI;
    return direction > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  function cityTrafficVehicleY(city, route, routePosition) {
    return cityTrafficRoadSurfaceY(city, route, routePosition) + VEHICLE_ROAD_SURFACE_CLEARANCE;
  }

  function cityTrafficRoadSurfaceY(city, route, routePosition) {
    if (route.bridge) return cityBridgeRouteSurfaceY(route, routePosition);
    const world = cityRoadWorldPoint(city, route.vertical, route.offset, routePosition);
    return terrainHeight(world.x, world.z) + 1.08;
  }

  function cityBridgeRouteSurfaceY(route, routePosition) {
    if (routePosition <= route.deckStart) {
      const t = smoothstep(0, 1, (routePosition - route.start) / Math.max(1, route.deckStart - route.start));
      return THREE.MathUtils.lerp(route.startGroundY, route.deckSurfaceWorldY, t);
    }
    if (routePosition >= route.deckEnd) {
      const t = smoothstep(0, 1, (routePosition - route.deckEnd) / Math.max(1, route.end - route.deckEnd));
      return THREE.MathUtils.lerp(route.deckSurfaceWorldY, route.endGroundY, t);
    }
    return route.deckSurfaceWorldY;
  }

  function isTrafficRoutePointClear(city, route, routePosition, laneOffset = 0) {
    const world = cityRoadWorldPoint(city, route.vertical, route.offset, routePosition, laneOffset);
    if (isVehicleAirportOperationalBlocked(world.x, world.z, 46)) return false;
    if (!route.bridge && isRoadWaterBlocked(world.x, world.z, Math.max(78, route.width * 1.6))) return false;
    const y = terrainHeight(world.x, world.z);
    return Number.isFinite(y) && (route.bridge || y > WATER_LEVEL + 0.65);
  }

  function advanceTrafficCarOnRoute(car, stepDt) {
    const route = car.route;
    const length = route.end - route.start;
    if (length <= 1) return;
    car.routePosition += car.direction * car.speed * stepDt;
    while (car.routePosition > route.end) car.routePosition = route.start + (car.routePosition - route.end);
    while (car.routePosition < route.start) car.routePosition = route.end - (route.start - car.routePosition);
    let guard = 0;
    while (!isTrafficRoutePointClear(car.city, route, car.routePosition, car.laneOffset) && guard < 18) {
      car.routePosition += car.direction * Math.max(14, route.width * 0.9);
      while (car.routePosition > route.end) car.routePosition = route.start + (car.routePosition - route.end);
      while (car.routePosition < route.start) car.routePosition = route.end - (route.start - car.routePosition);
      guard++;
      vehicleFixCount++;
    }
    const world = cityRoadWorldPoint(car.city, route.vertical, route.offset, car.routePosition, car.laneOffset);
    const y = cityTrafficVehicleY(car.city, route, car.routePosition);
    car.rotation = cityTrafficRotation(route, car.direction);
    if (car.renderedCar) trafficRenderer.setCarTransform(car.renderedCar, world.x, y, world.z, car.rotation);
    else if (car.group) {
      car.group.position.set(world.x - car.city.position.x, y, world.z - car.city.position.z);
      car.group.rotation.y = car.rotation;
    }
  }

  function airportVehicleZoneAt(x, z, margin = 0) {
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
      if (Math.abs(local.x) < runwayWidth * 0.72 + margin && Math.abs(local.z) < runwayLength / 2 + 150 + margin) return 'runway';
      if (Math.abs(local.x - taxiX) < Math.max(28, 34 * size) + margin && Math.abs(local.z - taxiZ) < taxiLength / 2 + 70 + margin) return 'taxiway';
      if (Math.abs(local.x - taxiX * 0.52) < taxiX * 0.62 + margin && Math.abs(local.z + runwayLength * 0.16) < Math.max(38, 42 * size) + margin) return 'taxiway';
      if (Math.abs(local.x - apronX) < apronW / 2 + 86 + margin && Math.abs(local.z - apronZ) < apronD / 2 + 92 + margin) return 'apron';
      if (isInAirportPavementLocal(airport, local, 52 + margin)) return 'operational';
    }
    return null;
  }

  function isVehicleAirportOperationalBlocked(x, z, margin = 0) {
    if (airportVehicleZoneAt(x, z, margin)) return true;
    return isUrbanAirportExcluded(x, z, Math.max(72, margin)) ||
      isRunwayEndUrbanRoadZone(x, z) ||
      isInRunwayApproach(x, z, 360 + margin, 1320 + margin * 4);
  }

  function refreshVehicleIntegrityReport() {
    const report = urbanIntegrityReport.vehicleReport;
    report.totalActiveVehicles = trafficCars.length;
    report.vehiclesOnValidRoads = 0;
    report.vehiclesOnBridges = 0;
    report.vehiclesOffRoadCount = 0;
    report.vehiclesEnteringAirportZones = 0;
    report.vehiclesOnRunways = 0;
    report.vehiclesOnTaxiways = 0;
    report.vehiclesOnAprons = 0;
    report.vehiclesFixedCount = vehicleFixCount;

    for (const car of trafficCars) {
      let worldX;
      let worldZ;
      if (car.route) {
        const world = cityRoadWorldPoint(car.city, car.route.vertical, car.route.offset, car.routePosition, car.laneOffset || 0);
        worldX = world.x;
        worldZ = world.z;
      } else if (car.renderedCar) {
        worldX = car.renderedCar.x;
        worldZ = car.renderedCar.z;
      } else if (car.group && car.city) {
        worldX = car.city.position.x + car.group.position.x;
        worldZ = car.city.position.z + car.group.position.z;
      } else {
        continue;
      }
      const zone = airportVehicleZoneAt(worldX, worldZ, 8);
      if (zone) {
        report.vehiclesEnteringAirportZones++;
        if (zone === 'runway') report.vehiclesOnRunways++;
        if (zone === 'taxiway') report.vehiclesOnTaxiways++;
        if (zone === 'apron') report.vehiclesOnAprons++;
      }
      if (car.route?.bridge) report.vehiclesOnBridges++;
      if (!car.route?.bridge && isRoadWaterBlocked(worldX, worldZ, 56)) report.vehiclesOffRoadCount++;
      if (!zone && (car.route?.bridge || !isRoadWaterBlocked(worldX, worldZ, 56))) report.vehiclesOnValidRoads++;
    }
  }

  function createCar(parent, x, y, z, rotation, color) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    group.userData.diagnosticType = 'vehicle';
    group.userData.diagnosticCount = 1;
    parent.add(group);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.08 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x9ed8f3, roughness: 0.18, metalness: 0.02 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.72 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.65, 10.2), bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = false;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.45, 4.4), glassMaterial);
    cabin.position.set(0, 2.1, -0.7);
    cabin.castShadow = false;
    group.add(cabin);

    for (const wheel of [[-3.1, 0.45, -3.3], [3.1, 0.45, -3.3], [-3.1, 0.45, 3.3], [3.1, 0.45, 3.3]]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.52, 12), tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wheel[0], wheel[1], wheel[2]);
      group.add(tire);
    }

    return group;
  }

  function createTrafficRenderer() {
    const bodyGeometry = new THREE.BoxGeometry(6.2, 1.65, 10.2);
    const cabinGeometry = new THREE.BoxGeometry(4.6, 1.45, 4.4);
    const tireGeometry = new THREE.CylinderGeometry(0.72, 0.72, 0.52, 10);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.08, vertexColors: true });
    const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x9ed8f3, roughness: 0.18, metalness: 0.02 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.72 });
    const bodyMesh = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, TRAFFIC_CAR_CAPACITY);
    const cabinMesh = new THREE.InstancedMesh(cabinGeometry, cabinMaterial, TRAFFIC_CAR_CAPACITY);
    const tireMesh = new THREE.InstancedMesh(tireGeometry, tireMaterial, TRAFFIC_CAR_CAPACITY * 4);
    const colorHelper = new THREE.Color();
    const carDummy = new THREE.Object3D();
    let count = 0;
    let dirty = false;

    for (const mesh of [bodyMesh, cabinMesh, tireMesh]) {
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }

    bodyMesh.userData.diagnosticType = 'vehicle';
    bodyMesh.userData.diagnosticCount = 0;

    function addCar(x, y, z, rotation, color) {
      if (count >= TRAFFIC_CAR_CAPACITY) return null;
      const index = count++;
      const car = { index, x, y, z, rotation };
      bodyMesh.count = count;
      cabinMesh.count = count;
      tireMesh.count = count * 4;
      bodyMesh.setColorAt(index, colorHelper.setHex(color));
      bodyMesh.userData.diagnosticCount = count;
      setCarTransform(car, x, y, z, rotation);
      bodyMesh.instanceColor.needsUpdate = true;
      return car;
    }

    function setCarTransform(car, x, y, z, rotation) {
      car.x = x;
      car.y = y;
      car.z = z;
      car.rotation = rotation;
      setBodyMatrix(car.index, x, y + 0.9, z, rotation);
      setCabinMatrix(car.index, x, y, z, rotation);
      setTireMatrices(car.index, x, y, z, rotation);
      dirty = true;
    }

    function setBodyMatrix(index, x, y, z, rotation) {
      carDummy.position.set(x, y, z);
      carDummy.rotation.set(0, rotation, 0);
      carDummy.scale.set(1, 1, 1);
      carDummy.updateMatrix();
      bodyMesh.setMatrixAt(index, carDummy.matrix);
    }

    function setCabinMatrix(index, x, y, z, rotation) {
      const p = rotatedTrafficOffset(x, z, 0, -0.7, rotation);
      carDummy.position.set(p.x, y + 2.1, p.z);
      carDummy.rotation.set(0, rotation, 0);
      carDummy.scale.set(1, 1, 1);
      carDummy.updateMatrix();
      cabinMesh.setMatrixAt(index, carDummy.matrix);
    }

    function setTireMatrices(index, x, y, z, rotation) {
      const wheels = [[-3.1, -3.3], [3.1, -3.3], [-3.1, 3.3], [3.1, 3.3]];
      for (let i = 0; i < wheels.length; i++) {
        const p = rotatedTrafficOffset(x, z, wheels[i][0], wheels[i][1], rotation);
        carDummy.position.set(p.x, y + 0.45, p.z);
        carDummy.rotation.set(0, rotation, Math.PI / 2);
        carDummy.scale.set(1, 1, 1);
        carDummy.updateMatrix();
        tireMesh.setMatrixAt(index * 4 + i, carDummy.matrix);
      }
    }

    function flush() {
      if (!dirty) return;
      bodyMesh.instanceMatrix.needsUpdate = true;
      cabinMesh.instanceMatrix.needsUpdate = true;
      tireMesh.instanceMatrix.needsUpdate = true;
      dirty = false;
    }

    return { addCar, setCarTransform, flush };
  }

  function rotatedTrafficOffset(x, z, localX, localZ, rotation) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: x + localX * cos + localZ * sin,
      z: z - localX * sin + localZ * cos
    };
  }

  function updateTraffic(dt, qualityPreset = null) {
    trafficUpdateDebt += dt;
    const interval = qualityPreset?.trafficUpdateInterval ?? 0.04;
    if (trafficUpdateDebt < interval) return;
    const stepDt = trafficUpdateDebt;
    trafficUpdateDebt = 0;
    for (const car of trafficCars) {
      if (car.route) {
        advanceTrafficCarOnRoute(car, stepDt);
        continue;
      }
      if (car.renderedCar) {
        if (car.axis === 'x') car.localX += car.direction * car.speed * stepDt;
        else car.localZ += car.direction * car.speed * stepDt;
        if (car.axis === 'x' && car.direction > 0 && car.localX > car.max) car.localX = car.min;
        if (car.axis === 'x' && car.direction < 0 && car.localX < car.min) car.localX = car.max;
        if (car.axis === 'z' && car.direction > 0 && car.localZ > car.max) car.localZ = car.min;
        if (car.axis === 'z' && car.direction < 0 && car.localZ < car.min) car.localZ = car.max;
      } else {
        car.group.position[car.axis] += car.direction * car.speed * stepDt;
        if (car.direction > 0 && car.group.position[car.axis] > car.max) car.group.position[car.axis] = car.min;
        if (car.direction < 0 && car.group.position[car.axis] < car.min) car.group.position[car.axis] = car.max;
      }

      let worldX = car.renderedCar ? car.city.position.x + car.localX : car.city.position.x + car.group.position.x;
      let worldZ = car.renderedCar ? car.city.position.z + car.localZ : car.city.position.z + car.group.position.z;
      let guard = 0;
      while ((isRoadWaterBlocked(worldX, worldZ, 150) || isUrbanAirportExcluded(worldX, worldZ, 40) || isRunwayEndUrbanRoadZone(worldX, worldZ)) && guard < 28) {
        if (car.renderedCar) {
          if (car.axis === 'x') car.localX += car.direction * 44;
          else car.localZ += car.direction * 44;
          if (car.axis === 'x' && car.direction > 0 && car.localX > car.max) car.localX = car.min;
          if (car.axis === 'x' && car.direction < 0 && car.localX < car.min) car.localX = car.max;
          if (car.axis === 'z' && car.direction > 0 && car.localZ > car.max) car.localZ = car.min;
          if (car.axis === 'z' && car.direction < 0 && car.localZ < car.min) car.localZ = car.max;
          worldX = car.city.position.x + car.localX;
          worldZ = car.city.position.z + car.localZ;
        } else {
          car.group.position[car.axis] += car.direction * 44;
          if (car.direction > 0 && car.group.position[car.axis] > car.max) car.group.position[car.axis] = car.min;
          if (car.direction < 0 && car.group.position[car.axis] < car.min) car.group.position[car.axis] = car.max;
          worldX = car.city.position.x + car.group.position.x;
          worldZ = car.city.position.z + car.group.position.z;
        }
        guard++;
      }
      const y = terrainHeight(worldX, worldZ) + VILLAGE_VEHICLE_TERRAIN_Y_OFFSET;
      if (car.renderedCar) trafficRenderer.setCarTransform(car.renderedCar, worldX, y, worldZ, car.rotation);
      else car.group.position.y = y;
    }
    trafficRenderer.flush();
    refreshVehicleIntegrityReport();
  }
