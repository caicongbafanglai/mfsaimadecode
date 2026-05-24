  function createCity() {
    const rng = mulberry32(23881);
    CITY_ZONES.forEach((zone, index) => createCityZone(zone, index, rng));
  }

  function createCityZone(zone, index, rng) {
    const denseCity = getRenderQuality?.()?.denseScenery === true;
    const city = new THREE.Group();
    city.name = `city-detail-${zone.name || index}`;
    city.position.set(zone.x, 0, zone.z);
    city.userData.diagnosticType = 'chunk';
    city.userData.diagnosticCount = 1;
    city.userData.stableLod = {
      distanceByQuality: { LOW: 18000, MEDIUM: 24000, HIGH: 31000, ULTRA: 42000 },
      hysteresis: 0.22
    };
    scene.add(city);
  
    const span = zone.span || 1800;
    const roadSpacing = zone.roadSpacing || 150;
    const blocks = zone.blocks || 6;
    const roadPositions = [];
    for (let i = -blocks; i <= blocks; i++) roadPositions.push(i * roadSpacing);
  
    const roadMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x2b3033, roughness: 0.86 }), -1, -1);
    const stripeMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0xd8dee3, roughness: 0.58 }), -2, -2);
    const bridgeMaterials = createCityBridgeMaterials();
    const cityRoadSegments = [];
    const trafficRoutes = [];
    const cityBridgeRegistry = [];
    city.userData.bridgeLimit = zone.radius > 1600 ? 2 : zone.radius > 900 ? 1 : 0;
    const primaryBridgeOrder = cityRoadPositionsByBridgePriority(roadPositions);
  
    for (const x of primaryBridgeOrder) createCityRoadSegments(city, true, x, span, roadMaterial, stripeMaterial, bridgeMaterials, cityRoadSegments, trafficRoutes, CITY_ROAD_PRIMARY_WIDTH, 'primary', cityBridgeRegistry);
    for (const z of primaryBridgeOrder) createCityRoadSegments(city, false, z, span, roadMaterial, stripeMaterial, bridgeMaterials, cityRoadSegments, trafficRoutes, CITY_ROAD_PRIMARY_WIDTH, 'primary', cityBridgeRegistry);

    const secondaryRoadPositions = [];
    for (let i = 0; i < roadPositions.length - 1; i++) {
      const midpoint = (roadPositions[i] + roadPositions[i + 1]) / 2;
      if (denseCity || i % 2 === index % 2) secondaryRoadPositions.push(midpoint);
    }
    const secondaryBridgeOrder = cityRoadPositionsByBridgePriority(secondaryRoadPositions);
    for (const x of secondaryBridgeOrder) {
      if (!denseCity && Math.abs(x) > span * 0.38) continue;
      createCityRoadSegments(city, true, x, span * 0.86, roadMaterial, stripeMaterial, bridgeMaterials, cityRoadSegments, trafficRoutes, CITY_ROAD_SECONDARY_WIDTH, 'secondary', cityBridgeRegistry);
    }
    for (const z of secondaryBridgeOrder) {
      if (!denseCity && Math.abs(z) > span * 0.38) continue;
      createCityRoadSegments(city, false, z, span * 0.86, roadMaterial, stripeMaterial, bridgeMaterials, cityRoadSegments, trafficRoutes, CITY_ROAD_SECONDARY_WIDTH, 'secondary', cityBridgeRegistry);
    }
  
    const palette = denseCity
      ? [0x8fa2b2, 0xd4d0c7, 0x768a96, 0xb9c3ca, 0x9e8074, 0xc8b36e, 0xaab7a4, 0xb78a85, 0x7d9690, 0xb1a889]
      : [0x8fa2b2, 0xb9c3ca, 0x9e8074, 0xaab7a4];
    const buildingBatches = new Map();
    const foundationEntries = [];
    const roofEntries = [];
    const cityBuildingRects = [];
    const windowBatches = { warm: [], cool: [], warmGlow: [], coolGlow: [] };
    let buildingsChecked = 0;
    let floatingBuildingsFixed = 0;
    for (let xi = 0; xi < roadPositions.length - 1; xi++) {
      for (let zi = 0; zi < roadPositions.length - 1; zi++) {
        const cx = (roadPositions[xi] + roadPositions[xi + 1]) / 2;
        const cz = (roadPositions[zi] + roadPositions[zi + 1]) / 2;
        const density = THREE.MathUtils.clamp((zone.density || 0.48) + 0.08, 0.42, 0.88);
        const lots = rng() > density ? (rng() > 0.5 ? 2 : 1) : rng() > 0.55 ? 4 : 3;
  
        for (let lot = 0; lot < lots; lot++) {
          const x = cx + (rng() - 0.5) * 58;
          const z = cz + (rng() - 0.5) * 58;
          const worldX = city.position.x + x;
          const worldZ = city.position.z + z;
          const w = 24 + rng() * (index === 0 ? 54 : 40);
          const d = 24 + rng() * (index === 0 ? 56 : 42);
          if (
            isUrbanFootprintWaterBlocked(worldX, worldZ, w, d, 108) ||
            isUrbanFootprintAirportBlocked(worldX, worldZ, w, d, 96) ||
            isNearRunwaySafety(worldX, worldZ, 210, 820) ||
            isInRunwayApproach(worldX, worldZ, 560, 2300) ||
            isInRunwayApproach(worldX, worldZ, 1050, 8500)
          ) continue;
          const h = 18 + Math.pow(rng(), 1.45) * (zone.maxHeight || 150);
          const placement = terrainPlacementHeight(
            { x: worldX, z: worldZ, width: w, depth: d, rotation: 0, large: h > 82 || w * d > 3200 },
            terrainHeight,
            { slopeTolerance: h > 82 || w * d > 3200 ? 1.0 : 0.5, mode: 'max' }
          );
          const y = placement.groundY;
          buildingsChecked++;
          if (placement.needsFoundation) floatingBuildingsFixed++;
          foundationEntries.push({
            x,
            y: y - Math.min(9, placement.foundationDepth + 0.65) / 2 + 0.14,
            z,
            sx: w * 1.08,
            sy: Math.min(9, placement.foundationDepth + 0.65),
            sz: d * 1.08
          });
          const color = palette[Math.floor(rng() * palette.length)];
          if (!buildingBatches.has(color)) buildingBatches.set(color, []);
          buildingBatches.get(color).push({ x, y: y + h / 2, z, sx: w, sy: h, sz: d });
          cityBuildingRects.push({ x: worldX, z: worldZ, halfW: w / 2 + 4.5, halfD: d / 2 + 4.5 });
          registerStructureFootprint(worldX, worldZ, Math.hypot(w, d) * 0.56 + 10);
          if (h > 24 && rng() > 0.22) addBuildingWindowBands(windowBatches, city, { x, y, z, w, h, d, id: `${zone.name || index}-${xi}-${zi}-${lot}` }, rng);
  
          if (h > 82 && rng() > 0.55) {
            roofEntries.push({ x, y: y + h + 1.8, z, sx: w * 0.46, sy: 3, sz: d * 0.46 });
          }
        }
      }
    }
    addInstancedCityFoundations(city, foundationEntries);
    addInstancedCityBuildings(city, buildingBatches);
    addInstancedCityRoofs(city, roofEntries);
    addInstancedCityWindows(city, windowBatches);
    createCityStreetlights(city, cityRoadSegments, zone, rng, cityBuildingRects);
    city.userData.groundPlacementSummary = {
      buildingsChecked,
      floatingBuildingsFixed,
      buriedBuildingsFixed: 0,
      terrainFootprintsSampled: buildingsChecked
    };
  
    createCityTraffic(city, zone, trafficRoutes, rng, denseCity);
  }

  function cityRoadPositionsByBridgePriority(positions) {
    return [...positions].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  }

  function createCityRoadSegments(city, vertical, offset, span, roadMaterial, stripeMaterial, bridgeMaterials, roadSegments, trafficRoutes, width, kind, cityBridgeRegistry) {
    const half = span / 2 + 120;
    const sampleStep = 70;
    let start = null;
    let lastDry = null;
    let waterRun = null;
    let blockedRun = false;
  
    for (let p = -half; p <= half + sampleStep; p += sampleStep) {
      const clamped = Math.min(p, half);
      const localX = vertical ? offset : clamped;
      const localZ = vertical ? clamped : offset;
      const worldX = city.position.x + localX;
      const worldZ = city.position.z + localZ;
      const blockReason = p <= half ? cityRoadBlockReason(worldX, worldZ, width) : 'end';
      const dry = p <= half && blockReason === null;
  
      if (dry) {
        if (waterRun && waterRun.before !== null) {
          const converted = createCityRoadBridge(
            city,
            vertical,
            offset,
            waterRun.start,
            waterRun.end,
            waterRun.before,
            clamped,
            width,
            kind,
            bridgeMaterials,
            roadMaterial,
            stripeMaterial,
            trafficRoutes,
            cityBridgeRegistry
          );
          if (converted === true) {
            urbanIntegrityReport.riverCrossingReport.riverRoadCrossingsDetected++;
            urbanIntegrityReport.riverCrossingReport.crossingsConvertedToBridges++;
          } else if (converted === 'skipped') {
            urbanIntegrityReport.riverCrossingReport.riverRoadCrossingsDetected++;
          } else if (converted !== 'blocked') {
            urbanIntegrityReport.riverCrossingReport.riverRoadCrossingsDetected++;
            urbanIntegrityReport.riverCrossingReport.unresolvedCrossings++;
          }
          waterRun = null;
        }
        if (start === null) start = clamped;
        lastDry = clamped;
        blockedRun = false;
        continue;
      }

      if (blockReason !== 'end' && !blockedRun) {
        urbanIntegrityReport.roadReport.fixedCount++;
        blockedRun = true;
      }

      if (blockReason === 'water') {
        if (!waterRun) waterRun = { start: clamped, end: clamped, before: lastDry };
        else waterRun.end = clamped;
      } else if (waterRun) {
        waterRun = null;
      }
  
      if (start !== null) {
        const segStart = Math.max(-half, start - sampleStep * 0.42);
        const segEnd = Math.min(half, lastDry + sampleStep * 0.42);
        createCityRoadSection(city, vertical, offset, segStart, segEnd, roadMaterial, stripeMaterial, roadSegments, trafficRoutes, width, kind);
        start = null;
        lastDry = null;
      }
    }
  }

  function cityRoadBlockReason(worldX, worldZ, width) {
    if (isUrbanAirportExcluded(worldX, worldZ, Math.max(46, width * 1.2)) || isRunwayEndUrbanRoadZone(worldX, worldZ)) return 'airport';
    if (isRoadWaterBlocked(worldX, worldZ, Math.max(150, width * 4.2))) return 'water';
    return null;
  }

  function createCityBridgeMaterials() {
    return {
      deck: new THREE.MeshStandardMaterial({ color: 0x6d7780, roughness: 0.68, metalness: 0.05 }),
      edge: new THREE.MeshStandardMaterial({ color: 0x4f5a62, roughness: 0.72, metalness: 0.04 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xc8d1d8, roughness: 0.5, metalness: 0.08 }),
      pier: new THREE.MeshStandardMaterial({ color: 0x8e979d, roughness: 0.78, metalness: 0.02 }),
      cable: new THREE.MeshStandardMaterial({ color: 0xced8de, roughness: 0.46, metalness: 0.12 }),
      water: liftSurfaceMaterial(new THREE.MeshBasicMaterial({ color: 0xb7edf5, transparent: true, opacity: 0.12, depthWrite: false }), -7, -7)
    };
  }

  function createCityRoadBridge(city, vertical, offset, waterStart, waterEnd, beforeDry, afterDry, width, kind, materials, roadMaterial, stripeMaterial, trafficRoutes, cityBridgeRegistry) {
    if (beforeDry === null || afterDry === null) return false;
    const gapStart = Math.min(waterStart, waterEnd);
    const gapEnd = Math.max(waterStart, waterEnd);
    const gapLength = gapEnd - gapStart;
    if (gapLength < 42 || gapLength > 920) return false;

    const centerP = (gapStart + gapEnd) / 2;
    const centerWorld = cityRoadWorldPoint(city, vertical, offset, centerP);
    if (isVehicleAirportOperationalBlocked(centerWorld.x, centerWorld.z, Math.max(90, width * 2.6))) {
      urbanIntegrityReport.bridgeReport.bridgesFixedCount++;
      return 'blocked';
    }

    const bridgeType = cityBridgeType(kind, width, gapLength, centerWorld.x, centerWorld.z);
    const rejection = cityBridgePlanningRejection(city, kind, bridgeType, gapLength, centerWorld, cityBridgeRegistry);
    if (rejection) {
      const report = urbanIntegrityReport.bridgeReport;
      report.plannedBridgeCandidatesSkipped++;
      if (rejection === 'secondary') report.secondaryBridgeCandidatesSkipped++;
      if (rejection === 'spacing') report.spacingBridgeCandidatesSkipped++;
      return 'skipped';
    }

    const deckLength = THREE.MathUtils.clamp(
      gapLength + width * (bridgeType === 'large' ? 4.8 : bridgeType === 'medium' ? 3.8 : 3.0),
      width * 4.2,
      bridgeType === 'large' ? 620 : bridgeType === 'medium' ? 470 : 330
    );
    const bridgeWidth = width + (bridgeType === 'large' ? 24 : bridgeType === 'medium' ? 18 : 14);
    const deckStart = centerP - deckLength / 2;
    const deckEnd = centerP + deckLength / 2;
    const groundStartWorld = cityRoadWorldPoint(city, vertical, offset, deckStart - width * 1.35);
    const groundEndWorld = cityRoadWorldPoint(city, vertical, offset, deckEnd + width * 1.35);
    const groundStartY = terrainHeight(groundStartWorld.x, groundStartWorld.z);
    const groundEndY = terrainHeight(groundEndWorld.x, groundEndWorld.z);
    const bankMax = Math.max(groundStartY, groundEndY);
    const clearance = bridgeType === 'large' ? 17 : bridgeType === 'medium' ? 13 : 9.5;
    const maxLift = bridgeType === 'large' ? 19 : bridgeType === 'medium' ? 15 : 11;
    const deckBaseY = Math.min(
      Math.max(bankMax + 3.2, RIVER_SURFACE_Y + clearance),
      bankMax + maxLift
    );
    const deckSurfaceWorldY = deckBaseY + CITY_BRIDGE_DECK_SURFACE_Y;
    const rampLength = THREE.MathUtils.clamp(
      (deckSurfaceWorldY - Math.min(groundStartY, groundEndY)) * 8.5 + 64,
      CITY_BRIDGE_MIN_RAMP_LENGTH,
      bridgeType === 'large' ? 310 : bridgeType === 'medium' ? 240 : 175
    );
    const routeStart = deckStart - rampLength - 42;
    const routeEnd = deckEnd + rampLength + 42;
    const startWorld = cityRoadWorldPoint(city, vertical, offset, routeStart);
    const endWorld = cityRoadWorldPoint(city, vertical, offset, routeEnd);
    if (isVehicleAirportOperationalBlocked(startWorld.x, startWorld.z, 58) || isVehicleAirportOperationalBlocked(endWorld.x, endWorld.z, 58)) {
      urbanIntegrityReport.bridgeReport.bridgesFixedCount++;
      return 'blocked';
    }

    const group = new THREE.Group();
    group.name = `city-${bridgeType}-river-road-bridge`;
    group.position.set(centerWorld.x, deckBaseY, centerWorld.z);
    group.rotation.y = vertical ? 0 : Math.PI / 2;
    group.userData.bridge = true;
    group.userData.bridgeType = bridgeType;
    group.userData.riverRoadBridge = true;
    group.userData.roadWidth = width;
    group.userData.deckLength = deckLength;
    group.userData.rampLength = rampLength;
    scene.add(group);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(bridgeWidth, 5.6, deckLength), materials.deck);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    const surface = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 0.48, deckLength + 18), roadMaterial);
    surface.position.y = CITY_BRIDGE_DECK_SURFACE_Y;
    surface.receiveShadow = true;
    group.add(surface);

    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.8, deckLength + 20), materials.edge);
      edge.position.set(side * (bridgeWidth / 2 - 2.2), CITY_BRIDGE_DECK_SURFACE_Y + 0.9, 0);
      edge.castShadow = true;
      group.add(edge);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, deckLength + 30), materials.rail);
      rail.position.set(side * (bridgeWidth / 2 - 1.15), CITY_BRIDGE_DECK_SURFACE_Y + CITY_BRIDGE_EDGE_HEIGHT, 0);
      rail.castShadow = true;
      group.add(rail);
    }

    createCityBridgeRamps(group, city, vertical, offset, centerP, routeStart, routeEnd, deckStart, deckEnd, deckBaseY, deckSurfaceWorldY, rampLength, width, bridgeWidth, roadMaterial, stripeMaterial, materials);
    createCityBridgeStructure(group, bridgeType, bridgeWidth, deckLength, deckBaseY, materials);
    createCityBridgeLaneStripes(group, deckLength, stripeMaterial);
    createCityBridgeUnderflow(centerWorld, vertical, deckLength, bridgeWidth, materials.water);

    const rampSlope = Math.max(
      Math.abs(deckSurfaceWorldY - (terrainHeight(startWorld.x, startWorld.z) + 1.08)),
      Math.abs(deckSurfaceWorldY - (terrainHeight(endWorld.x, endWorld.z) + 1.08))
    ) / Math.max(1, rampLength);
    const report = urbanIntegrityReport.bridgeReport;
    report.totalBridgesAdded++;
    if (bridgeType === 'large') report.largeBridgesCount++;
    else if (bridgeType === 'medium') report.mediumBridgesCount++;
    else report.smallBridgesCount++;
    if (rampSlope <= 0.18) report.bridgesWithValidRamps++;
    else report.bridgesFixedCount++;
    if (deckSurfaceWorldY < RIVER_SURFACE_Y + 6 || deckSurfaceWorldY > bankMax + 30) report.floatingBridgeCount++;
    cityBridgeRegistry?.push({
      x: centerWorld.x,
      z: centerWorld.z,
      bridgeType,
      gapLength,
      kind,
      vertical,
      offset
    });

    trafficRoutes.push({
      vertical,
      offset,
      start: routeStart,
      end: routeEnd,
      width,
      kind,
      bridge: true,
      bridgeType,
      deckStart,
      deckEnd,
      deckSurfaceWorldY,
      startGroundY: terrainHeight(startWorld.x, startWorld.z) + 1.08,
      endGroundY: terrainHeight(endWorld.x, endWorld.z) + 1.08
    });
    return true;
  }

  function cityBridgePlanningRejection(city, kind, bridgeType, gapLength, centerWorld, cityBridgeRegistry = []) {
    if (kind !== 'primary') return 'secondary';
    if (bridgeType === 'small' && gapLength < 118) return 'spacing';
    if (cityBridgeRegistry.length >= (city.userData.bridgeLimit ?? 3)) return 'spacing';
    const minSpacing = cityBridgeMinimumSpacing(bridgeType, gapLength);
    for (const existing of cityBridgeRegistry) {
      if (Math.hypot(centerWorld.x - existing.x, centerWorld.z - existing.z) < minSpacing) return 'spacing';
    }
    return null;
  }

  function cityBridgeMinimumSpacing(bridgeType, gapLength) {
    if (bridgeType === 'large' || gapLength >= 260) return 960;
    if (bridgeType === 'medium' || gapLength >= 150) return 620;
    return 380;
  }

  function cityBridgeType(kind, width, gapLength, x, z) {
    const hash = Math.sin(x * 0.0047 + z * 0.0031) * 0.5 + 0.5;
    if (kind === 'primary' && (gapLength > 230 || hash > 0.72)) return 'large';
    if (kind === 'primary' || width >= CITY_ROAD_PRIMARY_WIDTH || gapLength > 150 || hash > 0.46) return 'medium';
    return 'small';
  }

  function createCityBridgeRamps(group, city, vertical, offset, bridgeCenterP, routeStart, routeEnd, deckStart, deckEnd, deckBaseY, deckSurfaceWorldY, rampLength, width, bridgeWidth, roadMaterial, stripeMaterial, materials) {
    const roadWidth = width + 4;
    for (const end of [-1, 1]) {
      const rampDeckP = end < 0 ? deckStart : deckEnd;
      const rampGroundP = end < 0 ? routeStart : routeEnd;
      const rampCenterP = (rampDeckP + rampGroundP) / 2;
      const centerLocalZ = rampCenterP - bridgeCenterP;
      const groundWorld = cityRoadWorldPoint(city, vertical, offset, rampGroundP);
      const groundLocalY = terrainHeight(groundWorld.x, groundWorld.z) + 1.08 - deckBaseY;
      const deckLocalY = CITY_BRIDGE_DECK_SURFACE_Y;
      const slope = Math.atan2(deckLocalY - groundLocalY, rampLength);

      const ramp = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.52, rampLength + 42), roadMaterial);
      ramp.position.set(0, (deckLocalY + groundLocalY) / 2, centerLocalZ);
      ramp.rotation.x = end * slope;
      ramp.receiveShadow = true;
      group.add(ramp);

      const apron = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 12, 0.32, 58), roadMaterial);
      apron.position.set(0, groundLocalY, rampGroundP - bridgeCenterP);
      apron.rotation.x = end * slope * 0.18;
      apron.receiveShadow = true;
      group.add(apron);

      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.2, rampLength + 34), materials.edge);
        curb.position.set(side * (bridgeWidth / 2 - 2.4), (deckLocalY + groundLocalY) / 2 + 1.1, centerLocalZ);
        curb.rotation.x = ramp.rotation.x;
        curb.castShadow = true;
        group.add(curb);
      }

      for (let z = end * (Math.abs(deckEnd - deckStart) / 2 + 36); Math.abs(z) < Math.abs(centerLocalZ) + rampLength * 0.38; z += end * 62) {
        const t = THREE.MathUtils.clamp((Math.abs(z) - Math.abs(deckEnd - deckStart) / 2) / Math.max(1, rampLength), 0, 1);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 22), stripeMaterial);
        stripe.position.set(0, THREE.MathUtils.lerp(deckLocalY + 0.32, groundLocalY + 0.18, t), z);
        stripe.rotation.x = ramp.rotation.x;
        group.add(stripe);
      }
    }
  }

  function createCityBridgeStructure(group, bridgeType, bridgeWidth, deckLength, deckBaseY, materials) {
    const pierHeight = Math.max(7, deckBaseY - WATER_LEVEL + 1.2);
    const pierSpacing = bridgeType === 'large' ? 92 : bridgeType === 'medium' ? 118 : deckLength + 1;
    for (let z = -deckLength / 2 + 48; z <= deckLength / 2 - 48; z += pierSpacing) {
      if (bridgeType === 'small' && Math.abs(z) > 2) continue;
      for (const x of [-bridgeWidth * 0.31, bridgeWidth * 0.31]) {
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 5.1, pierHeight, 10), materials.pier);
        pier.position.set(x, WATER_LEVEL - deckBaseY + pierHeight / 2, z);
        pier.castShadow = true;
        group.add(pier);
      }
    }

    if (bridgeType !== 'small') {
      for (const z of [-deckLength * 0.26, deckLength * 0.26]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(bridgeWidth + 14, 3.2, 5.2), materials.edge);
        beam.position.set(0, CITY_BRIDGE_DECK_SURFACE_Y - 2.8, z);
        beam.castShadow = true;
        group.add(beam);
      }
    }

    if (bridgeType === 'large') {
      for (const z of [-deckLength * 0.28, deckLength * 0.28]) {
        for (const x of [-bridgeWidth * 0.38, bridgeWidth * 0.38]) {
          const tower = new THREE.Mesh(new THREE.BoxGeometry(5.5, 32, 7.2), materials.pier);
          tower.position.set(x, CITY_BRIDGE_DECK_SURFACE_Y + 16, z);
          tower.castShadow = true;
          group.add(tower);
        }
        const cross = new THREE.Mesh(new THREE.BoxGeometry(bridgeWidth + 18, 3.2, 4.4), materials.rail);
        cross.position.set(0, CITY_BRIDGE_DECK_SURFACE_Y + 30, z);
        cross.castShadow = true;
        group.add(cross);
      }
      for (const side of [-1, 1]) {
        const chord = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, deckLength * 0.74), materials.cable);
        chord.position.set(side * bridgeWidth * 0.34, CITY_BRIDGE_DECK_SURFACE_Y + 20, 0);
        chord.rotation.x = side * 0.045;
        chord.castShadow = true;
        group.add(chord);
      }
    }
  }

  function createCityBridgeLaneStripes(group, deckLength, stripeMaterial) {
    for (let z = -deckLength / 2 + 34; z <= deckLength / 2 - 34; z += 62) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 22), stripeMaterial);
      stripe.position.set(0, CITY_BRIDGE_DECK_SURFACE_Y + 0.34, z);
      group.add(stripe);
    }
  }

  function createCityBridgeUnderflow(centerWorld, vertical, deckLength, bridgeWidth, material) {
    const flow = new THREE.Mesh(
      new THREE.BoxGeometry(bridgeWidth * 2.3, 0.08, Math.max(80, deckLength + 42)),
      material.clone()
    );
    flow.name = 'city-bridge-underflow-highlight';
    flow.position.set(centerWorld.x, RIVER_SURFACE_Y + 0.12, centerWorld.z);
    flow.rotation.y = vertical ? Math.PI / 2 : 0;
    flow.renderOrder = 4;
    scene.add(flow);
  }

  function cityRoadWorldPoint(city, vertical, offset, p, laneOffset = 0) {
    const local = cityRouteLocalPoint(vertical, offset, p, laneOffset);
    return { x: city.position.x + local.x, z: city.position.z + local.z };
  }

  function cityRouteLocalPoint(vertical, offset, p, laneOffset = 0) {
    return vertical
      ? { x: offset + laneOffset, z: p }
      : { x: p, z: offset + laneOffset };
  }

  function addInstancedCityBuildings(city, buildingBatches) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const dummy = new THREE.Object3D();
    for (const [color, entries] of buildingBatches) {
      if (!entries.length) continue;
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.03 });
      const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        dummy.position.set(entry.x, entry.y, entry.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(entry.sx, entry.sy, entry.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.name = 'city-building-batch';
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.diagnosticType = 'building';
      mesh.userData.diagnosticCount = entries.length;
      mesh.instanceMatrix.needsUpdate = true;
      city.add(mesh);
    }
  }

  function addInstancedCityFoundations(city, entries) {
    if (!entries.length) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, foundationMaterial, entries.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(entry.sx, entry.sy, entry.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.name = 'city-building-foundation-batch';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 4;
    mesh.userData.diagnosticType = 'building';
    mesh.userData.diagnosticCount = 0;
    mesh.instanceMatrix.needsUpdate = true;
    city.add(mesh);
  }

  function addInstancedCityRoofs(city, entries) {
    if (!entries.length) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x303942, roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(entry.sx, entry.sy, entry.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.name = 'city-roof-batch';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    city.add(mesh);
  }

  function addInstancedCityWindows(city, batches) {
    addWindowBatch(city, batches.warmGlow, warmWindowGlowMaterial, 'city-window-warm-glow-batch');
    addWindowBatch(city, batches.coolGlow, coolWindowGlowMaterial, 'city-window-cool-glow-batch');
    addWindowBatch(city, batches.warm, warmWindowMaterial, 'city-window-warm-batch');
    addWindowBatch(city, batches.cool, coolWindowMaterial, 'city-window-cool-batch');
    addFarCityWindowDots(city, batches);
  }

  function addWindowBatch(city, entries, material, name) {
    if (!entries.length) return;
    const batchMaterial = material.clone();
    batchMaterial.userData = { ...material.userData };
    batchMaterial.userData.cityWindowLod = 'near';
    batchMaterial.userData.nearFadeStart = CITY_WINDOW_NEAR_FADE_START;
    batchMaterial.userData.nearFadeEnd = CITY_WINDOW_NEAR_FADE_END;
    const mesh = new THREE.InstancedMesh(buildingWindowGeometry, batchMaterial, entries.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(0, entry.ry || 0, 0);
      dummy.scale.set(entry.sx, entry.sy, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.name = name;
    mesh.renderOrder = name.includes('glow') ? 7 : 8;
    mesh.frustumCulled = false;
    mesh.userData.windowLightBatch = true;
    mesh.userData.attachedToBuildingFacade = true;
    mesh.userData.cityWindowLod = 'near';
    mesh.userData.windowLightCount = entries.length;
    mesh.userData.hasParentBuildingIds = entries.every(entry => Boolean(entry.buildingId));
    mesh.userData.parentBuildingIds = [...new Set(entries.map(entry => entry.buildingId).filter(Boolean))];
    mesh.userData.windowFacadeDistanceMeters = {
      min: WINDOW_LIGHT_WALL_OFFSET,
      max: WINDOW_LIGHT_GLOW_OFFSET
    };
    mesh.instanceMatrix.needsUpdate = true;
    city.add(mesh);
  }

  function addFarCityWindowDots(city, batches) {
    const positions = [];
    const colors = [];
    collectFarCityWindowDotEntries(batches.warm, positions, colors, 1.0, 0.76, 0.42);
    collectFarCityWindowDotEntries(batches.cool, positions, colors, 0.58, 0.78, 1.0);
    if (!positions.length) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const material = new THREE.PointsMaterial({
      size: 2.35,
      sizeAttenuation: false,
      map: createFarCityWindowSpriteTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.02,
      toneMapped: false
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'city-far-window-light-dots';
    points.frustumCulled = false;
    points.visible = false;
    points.renderOrder = 6;
    points.userData.longRangeVisual = true;
    points.userData.nightLight = true;
    points.userData.cityFarWindowLight = true;
    points.userData.windowLightBatch = true;
    points.userData.attachedToBuildingFacade = true;
    points.userData.hasParentBuildingIds = true;
    points.userData.sourceWindowLights = positions.length / 3;
    points.userData.baseOpacity = 0.78;
    points.userData.baseSize = 2.35;
    points.userData.farFadeStart = CITY_WINDOW_FAR_FADE_START;
    points.userData.farFadeEnd = CITY_WINDOW_FAR_FADE_END;
    city.add(points);
  }

  function collectFarCityWindowDotEntries(entries, positions, colors, r, g, b) {
    for (let i = 0; i < entries.length; i += CITY_FAR_WINDOW_DOT_STRIDE) {
      const entry = entries[i];
      if (!entry) continue;
      positions.push(entry.x, entry.y, entry.z);
      const floorBand = 0.86 + ((i * 17) % 11) * 0.018;
      colors.push(r * floorBand, g * floorBand, b * floorBand);
    }
  }

  function createFarCityWindowSpriteTexture() {
    if (farCityWindowSpriteTexture) return farCityWindowSpriteTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.42, 'rgba(255,245,210,0.58)');
    gradient.addColorStop(0.82, 'rgba(255,210,120,0.12)');
    gradient.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 48, 48);
    farCityWindowSpriteTexture = new THREE.CanvasTexture(canvas);
    farCityWindowSpriteTexture.colorSpace = THREE.SRGBColorSpace;
    farCityWindowSpriteTexture.needsUpdate = true;
    return farCityWindowSpriteTexture;
  }

  function addBuildingWindowBands(windowBatches, city, building, rng) {
    const { x, y, z, w, h, d, id } = building;
    const rows = Math.max(2, Math.min(12, Math.floor((h - 10) / 12)));
    const frontBackColumns = Math.max(2, Math.min(9, Math.floor((w - 8) / 7.5)));
    const sideColumns = Math.max(2, Math.min(8, Math.floor((d - 8) / 7.5)));
    const litChance = THREE.MathUtils.clamp(0.38 + h / 520, 0.38, 0.68);
    const facadeSpecs = [
      { axis: 'z', sign: 1, columns: frontBackColumns, length: w, ry: 0, primary: true },
      { axis: 'z', sign: -1, columns: frontBackColumns, length: w, ry: Math.PI, primary: rng() > 0.42 },
      { axis: 'x', sign: 1, columns: sideColumns, length: d, ry: Math.PI / 2, primary: rows > 3 || rng() > 0.36 },
      { axis: 'x', sign: -1, columns: sideColumns, length: d, ry: -Math.PI / 2, primary: rows > 5 && rng() > 0.48 }
    ];

    for (const facade of facadeSpecs) {
      if (!facade.primary) continue;
      const usableLength = Math.max(5, facade.length - 10);
      const sx = Math.max(2.2, Math.min(4.8, usableLength / Math.max(2.3, facade.columns * 2.45)));
      const sy = Math.max(2.5, Math.min(4.6, (h - 10) / Math.max(3.2, rows * 2.15)));
      for (let row = 0; row < rows; row++) {
        const windowY = y + 6 + (row + 0.5) * ((h - 12) / rows);
        if (windowY > y + h - 5) continue;
        for (let col = 0; col < facade.columns; col++) {
          if (rng() > litChance) continue;
          const along = -usableLength / 2 + (col + 0.5) * (usableLength / facade.columns);
          const entry = {
            x: facade.axis === 'z' ? x + along : x + facade.sign * (w / 2 + WINDOW_LIGHT_WALL_OFFSET),
            y: windowY,
            z: facade.axis === 'z' ? z + facade.sign * (d / 2 + WINDOW_LIGHT_WALL_OFFSET) : z + along,
            sx,
            sy,
            ry: facade.ry,
            buildingId: id
          };
          addBuildingWindowEntry(windowBatches, city, entry, facade, rng);
        }
      }
    }
  }

  function addBuildingWindowEntry(windowBatches, city, entry, facade, rng) {
    const worldX = city.position.x + entry.x;
    const worldZ = city.position.z + entry.z;
    if (isWindowLightForbidden(worldX, worldZ) || isWindowOnCityRoad(city, entry.x, entry.z)) {
      countBlockedWindowLight(worldX, worldZ);
      return;
    }

    const warm = rng() > 0.34;
    const target = warm ? windowBatches.warm : windowBatches.cool;
    const glowTarget = warm ? windowBatches.warmGlow : windowBatches.coolGlow;
    target.push(entry);
    glowTarget.push({
      ...entry,
      x: entry.x + (facade.axis === 'x' ? facade.sign * (WINDOW_LIGHT_GLOW_OFFSET - WINDOW_LIGHT_WALL_OFFSET) : 0),
      z: entry.z + (facade.axis === 'z' ? facade.sign * (WINDOW_LIGHT_GLOW_OFFSET - WINDOW_LIGHT_WALL_OFFSET) : 0),
      sx: entry.sx * 1.6,
      sy: entry.sy * 1.45
    });
    reportAttachedWindowLight();
  }

  function isWindowOnCityRoad(city, localX, localZ) {
    const roadHalfWidth = CITY_ROAD_PRIMARY_WIDTH / 2 + 4;
    const cityName = city.name || '';
    const zone = CITY_ZONES.find(item => cityName.endsWith(item.name || '')) || null;
    const roadSpacing = zone?.roadSpacing || 150;
    const blocks = zone?.blocks || 6;
    for (let i = -blocks; i <= blocks; i++) {
      const road = i * roadSpacing;
      if (Math.abs(localX - road) < roadHalfWidth || Math.abs(localZ - road) < roadHalfWidth) return true;
    }
    return false;
  }
