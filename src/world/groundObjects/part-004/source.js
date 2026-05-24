  function createForests() {
    const rng = mulberry32(92410);
    const trunkGeometry = new THREE.CylinderGeometry(1.4, 1.8, 10, 7);
    const crownGeometry = new THREE.ConeGeometry(8, 22, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, vertexColors: true });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true });
    const trunkColors = [0x665034, 0x73583c, 0x59462f];
    const crownColors = [0x245f39, 0x2f6f3b, 0x3d7740, 0x1f5136, 0x4f7f45];
    const trunkColor = new THREE.Color();
    const crownColor = new THREE.Color();
    const hiddenIslandTreeCapacity = 1800;
    const treeCapacity = FOREST_CLUSTERS.reduce((sum, cluster) => sum + cluster.count, 0) + hiddenIslandTreeCapacity;
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCapacity);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, treeCapacity);
    const dummy = new THREE.Object3D();
    let treeCount = 0;

    const addTree = (x, z, scale, angle) => {
      if (treeCount >= treeCapacity) return false;
      if (isTreePlacementBlocked(x, z, scale)) return false;
      const y = terrainHeight(x, z);
      const widthScale = 0.86 + 0.2 * Math.sin(x * 0.013 + z * 0.011);
      const depthScale = 0.88 + 0.18 * Math.cos(x * 0.009 - z * 0.014);

      dummy.position.set(x, y + 5 * scale, z);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(scale * widthScale, scale, scale * depthScale);
      dummy.updateMatrix();
      trunks.setMatrixAt(treeCount, dummy.matrix);

      dummy.position.set(x, y + 17 * scale, z);
      dummy.rotation.set(0, angle * 1.7, 0);
      dummy.scale.set(scale * (0.9 + widthScale * 0.16), scale * (0.92 + rng() * 0.16), scale * (0.9 + depthScale * 0.16));
      dummy.updateMatrix();
      crowns.setMatrixAt(treeCount, dummy.matrix);
      trunks.setColorAt(treeCount, trunkColor.setHex(trunkColors[treeCount % trunkColors.length]));
      crowns.setColorAt(treeCount, crownColor.setHex(crownColors[(treeCount + Math.floor(angle * 10)) % crownColors.length]));
      treeCount++;
      return true;
    };
  
    for (const cluster of FOREST_CLUSTERS) {
      for (let i = 0; i < cluster.count; i++) {
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * cluster.radius;
        const x = cluster.x + Math.cos(angle) * radius;
        const z = cluster.z + Math.sin(angle) * radius;
        if (
          isWaterSurface(x, z) ||
          isUrbanAirportExcluded(x, z, 64) ||
          isNearRunwaySafety(x, z, 310, 930) ||
          isInRunwayApproach(x, z, 330, 1300) ||
          isHiddenAirportTreeExcluded(x, z, 20)
        ) continue;
        const scale = 0.72 + rng() * 1.1;
        addTree(x, z, scale, angle);
      }
    }

    createHiddenIslandDenseForest(addTree, rng);

    if (treeCount > 0) {
      trunks.count = treeCount;
      crowns.count = treeCount;
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      trunks.castShadow = false;
      crowns.castShadow = false;
      trunks.receiveShadow = false;
      crowns.receiveShadow = false;
      trunks.userData.diagnosticType = 'tree';
      trunks.userData.diagnosticCount = treeCount;
      crowns.userData.diagnosticType = 'tree';
      crowns.userData.diagnosticCount = 0;
      trunks.instanceColor.needsUpdate = true;
      crowns.instanceColor.needsUpdate = true;
      trunks.computeBoundingSphere();
      crowns.computeBoundingSphere();
      scene.add(trunks);
      scene.add(crowns);
    }
  }

  function isTreePlacementBlocked(x, z, scale = 1) {
    const buffer = 10 + scale * 8;
    if (isStructureFootprintBlocked(x, z, buffer)) return true;
    if (isGroundOverlayPointBlocked(x, z, 6 + scale * 4)) return true;
    for (const village of VILLAGES) {
      const coreRadius = Math.min(86, Math.max(34, village.radius * 0.26)) + buffer;
      if (Math.hypot(x - village.x, z - village.z) < coreRadius) return true;
    }
    return false;
  }

  function createHiddenIslandDenseForest(addTree, rng) {
    for (const island of ISLANDS) {
      if (!(island.hiddenIsland || island.noResidential)) continue;

      const spacing = 43;
      for (let lx = -island.rx * 0.93; lx <= island.rx * 0.93; lx += spacing) {
        for (let lz = -island.rz * 0.93; lz <= island.rz * 0.93; lz += spacing) {
          const jitterX = (rng() - 0.5) * spacing * 0.72;
          const jitterZ = (rng() - 0.5) * spacing * 0.72;
          const localX = lx + jitterX;
          const localZ = lz + jitterZ;
          const normalized = (localX * localX) / (island.rx * island.rx) + (localZ * localZ) / (island.rz * island.rz);
          if (normalized > 0.9) continue;

          const world = waterBodyWorld(island, localX, localZ);
          if (waterBodyNormalized(island, world.x, world.z) > 0.96) continue;
          if (isHiddenAirportTreeExcluded(world.x, world.z, 24)) continue;
          if (isWaterSurface(world.x, world.z)) continue;
          const y = terrainHeight(world.x, world.z);
          if (y < WATER_LEVEL + 2 || y > WATER_LEVEL + 170) continue;

          const interior = 1 - THREE.MathUtils.clamp(normalized / 0.9, 0, 1);
          const density = THREE.MathUtils.lerp(0.58, 0.9, Math.pow(interior, 0.34));
          if (rng() > density) continue;

          const angle = rng() * Math.PI * 2;
          const scale = 0.64 + rng() * 1.18 + interior * 0.18;
          addTree(world.x, world.z, scale, angle);
        }
      }

      for (let i = 0; i < 220; i++) {
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * 0.9;
        const localX = Math.cos(angle) * island.rx * radius;
        const localZ = Math.sin(angle) * island.rz * radius;
        const world = waterBodyWorld(island, localX, localZ);
        if (waterBodyNormalized(island, world.x, world.z) > 0.97) continue;
        if (isHiddenAirportTreeExcluded(world.x, world.z, 26) || isWaterSurface(world.x, world.z)) continue;
        const y = terrainHeight(world.x, world.z);
        if (y < WATER_LEVEL + 2 || y > WATER_LEVEL + 170) continue;
        addTree(world.x, world.z, 0.7 + rng() * 1.24, angle);
      }
    }
  }

  function isHiddenAirportTreeExcluded(x, z, crownRadius = 0) {
    for (const airport of AIRPORTS) {
      if (airport.airportCategory !== 'HIDDEN_REMOTE_AIRFIELD') continue;
      const layout = hiddenAirportLayout(airport);
      const local = airportLocal(airport, x, z);
      const margin = Math.max(34, crownRadius + 26);

      if (rectContainsLocal(local, 0, 0, layout.runwayWidth * 2.55 + margin, layout.runwayLength * 0.5 + 190 + margin)) return true;
      if (rectContainsLocal(local, layout.taxiX, layout.taxiZ, Math.max(28, 34 * layout.size) * 0.5 + 52 + margin, layout.taxiLength * 0.5 + 96 + margin)) return true;
      if (rectContainsLocal(local, layout.taxiX * 0.52, -layout.runwayLength * 0.16, layout.taxiX * 0.62 + margin, Math.max(30, 36 * layout.size) * 0.5 + 54 + margin)) return true;
      if (rectContainsLocal(local, layout.apronX, layout.apronZ, layout.apronW * 0.5 + 78 + margin, layout.apronD * 0.5 + 82 + margin)) return true;
      if (rectContainsLocal(local, layout.terminalX, layout.terminalZ, layout.terminalHalfX + 34 + margin, layout.terminalHalfZ + 34 + margin)) return true;

      for (const stand of hiddenUfoStandPositions(layout)) {
        if (Math.hypot(local.x - stand.x, local.z - stand.z) < 34 + margin) return true;
      }

      const threshold = layout.runwayLength * 0.5;
      const beyond = Math.max(local.z - threshold, -local.z - threshold);
      if (beyond > 0 && beyond < 430) {
        const halfWidth = layout.runwayWidth * 4.2 + beyond * 0.24 + margin;
        if (Math.abs(local.x) < halfWidth) return true;
      }
    }
    return false;
  }

  function hiddenAirportLayout(airport) {
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
    const hutW = Math.max(18, 24 * size);
    const hutD = Math.max(12, 15 * size);
    return {
      size,
      runwayLength,
      runwayWidth,
      taxiX,
      taxiZ,
      taxiLength,
      apronW,
      apronD,
      apronX,
      apronZ,
      terminalX: apronX - apronW * 0.56,
      terminalZ: apronZ - apronD * 0.62,
      terminalHalfX: hutW * 0.5 + 7,
      terminalHalfZ: hutD * 0.5 + 7
    };
  }

  function hiddenUfoStandPositions(layout) {
    return [
      { x: layout.apronX - 66, z: layout.apronZ - 36 },
      { x: layout.apronX, z: layout.apronZ - 36 },
      { x: layout.apronX + 66, z: layout.apronZ - 36 },
      { x: layout.apronX - 66, z: layout.apronZ + 36 },
      { x: layout.apronX, z: layout.apronZ + 36 },
      { x: layout.apronX + 66, z: layout.apronZ + 36 }
    ];
  }

  function rectContainsLocal(local, x, z, halfX, halfZ) {
    return Math.abs(local.x - x) <= halfX && Math.abs(local.z - z) <= halfZ;
  }

  function createWoodlandCabins() {
    const rng = mulberry32(53513);
    const houseColors = [0xc9d1d0, 0xd7c3a3, 0xb8c8bd, 0xd0b29d, 0xc7d5bc];
    const roofColors = [0x72473c, 0x4b5662, 0x365b49, 0x6b5941];
  
    for (const cluster of FOREST_CLUSTERS) {
      let placed = 0;
      for (let i = 0; i < cluster.cabins * 8 && placed < cluster.cabins; i++) {
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * cluster.radius * 0.92;
        const x = cluster.x + Math.cos(angle) * radius;
        const z = cluster.z + Math.sin(angle) * radius;
        const y = terrainHeight(x, z);
        if (Math.abs(x) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 80 || Math.abs(z) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 80) continue;
        if (isWaterSurface(x, z) || isUrbanAirportExcluded(x, z, 70) || isNearRunwaySafety(x, z, 300, 900) || isInRunwayApproach(x, z, 320, 1300)) continue;
        if (y < WATER_LEVEL + 3 || y > 230) continue;
        createSmallHouse(
          x,
          z,
          houseColors[Math.floor(rng() * houseColors.length)],
          roofColors[Math.floor(rng() * roofColors.length)],
          0.62 + rng() * 0.95
        );
        placed++;
      }
    }
  }

  function createVillages() {
    const rng = mulberry32(44519);
    const houseColors = [0xcfd7dd, 0xd7c2a0, 0xbacbbf, 0xd9b8a8, 0xc7d2b6, 0xded2aa];
    const roofColors = [0x74483d, 0x4d5863, 0x355e4e, 0x725942, 0x6b4238];
    const barnMaterial = new THREE.MeshStandardMaterial({ color: 0xa94f44, roughness: 0.74 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5964, roughness: 0.78 });
  
    for (const village of VILLAGES) {
      let placed = 0;
      for (let i = 0; i < village.houses * 8 && placed < village.houses; i++) {
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * village.radius;
        const x = village.x + Math.cos(angle) * radius;

        const z = village.z + Math.sin(angle) * radius;
        const y = terrainHeight(x, z);
        if (Math.abs(x) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 80 || Math.abs(z) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 80) continue;
        if (isWaterSurface(x, z) || isUrbanAirportExcluded(x, z, 70) || isNearRunwaySafety(x, z, 260, 860) || isInRunwayApproach(x, z, 320, 1250)) continue;
        if (y < WATER_LEVEL + 3 || y > 245) continue;
        createSmallHouse(
          x,
          z,
          houseColors[Math.floor(rng() * houseColors.length)],
          roofColors[Math.floor(rng() * roofColors.length)],
          0.48 + rng() * 0.62
        );
        placed++;
      }
  
      for (let i = 0; i < 2; i++) {
        const x = village.x + (rng() - 0.5) * village.radius * 0.65;
        const z = village.z + (rng() - 0.5) * village.radius * 0.65;
        if (isWaterSurface(x, z) || isUrbanAirportExcluded(x, z, 70) || isNearRunwaySafety(x, z, 260, 860) || isInRunwayApproach(x, z, 320, 1250)) continue;
        const barn = new THREE.Group();
        barn.name = 'terrain-placed-village-barn';
        const rotation = rng() * Math.PI;
        const barnScale = 0.72 + rng() * 0.32;
        const placement = placeStructureGroupOnTerrain(barn, x, z, 34, 26, rotation, barnScale, {
          slopeTolerance: 0.5,
          name: 'village-barn'
        });
        barn.scale.setScalar(barnScale);
        barn.userData.diagnosticType = 'building';
        barn.userData.diagnosticCount = 1;
        registerStructureFootprint(x, z, 34 * barnScale + 12);
        scene.add(barn);
        addStructureFoundation(barn, 34, 26, placement, barnScale, { maxDepth: 5.5 });
  
        const body = new THREE.Mesh(new THREE.BoxGeometry(34, 18, 26), barnMaterial);
        body.position.y = 9;
        body.castShadow = false;
        body.receiveShadow = true;
        barn.add(body);
  
        const roof = new THREE.Mesh(new THREE.ConeGeometry(24, 12, 4), roofMaterial);
        roof.position.y = 24;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = false;
        barn.add(roof);
      }
    }
  }

  function createAirfieldLowHomes() {
    const rng = mulberry32(60617);
    const houseColors = [0xd5d9d5, 0xd9c4a5, 0xbfd0c1, 0xd1b6a0, 0xcdd6b7];
    const roofColors = [0x705042, 0x4e5964, 0x3f604f, 0x75513e];
  
    for (const airport of AIRPORTS) {
      if (airport.isNightCapable === false || airport.airportCategory === 'HIDDEN_REMOTE_AIRFIELD') continue;
      const runwayLength = airport.runwayLength || 1320;
      const runwayWidth = airport.runwayWidth || 98;
      for (const end of [-1, 1]) {
        const challengeSide = isChallengeEnd(airport, end);
        const endPoint = airportWorld(airport, 0, end * (runwayLength / 2 + 650));
        const urbanEnd = isNearCityZone(endPoint.x, endPoint.z, 1900);
        const targetPerEnd = urbanEnd ? (airport.size > 1.05 ? 36 : 26) : (airport.size > 1.05 ? 18 : 14);
        let placed = 0;
        const spots = [];
        for (let i = 0; i < targetPerEnd * 16 && placed < targetPerEnd; i++) {
          const side = rng() > 0.5 ? 1 : -1;
          const spread = urbanEnd ? 1.35 : 1;
          const localX = side * (runwayWidth * (3.9 + Math.pow(rng(), 0.7) * (challengeSide ? 7.8 : 5.4) * spread) + rng() * (challengeSide ? 560 : 320));
          const localZ = end * (runwayLength / 2 + (challengeSide ? 360 : 260) + Math.pow(rng(), 1.25) * (urbanEnd ? 1220 : 620) + (rng() - 0.5) * 170);
          const world = airportWorld(airport, localX, localZ);
          if (Math.abs(world.x) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 80 || Math.abs(world.z) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 80) continue;
          if (isWaterSurface(world.x, world.z) || isUrbanAirportExcluded(world.x, world.z, 70) || isNearRunwaySafety(world.x, world.z, 230, 780) || isInRunwayApproach(world.x, world.z, 260, 920)) continue;
          if (spots.some(spot => Math.hypot(world.x - spot.x, world.z - spot.z) < 34)) continue;
          const y = terrainHeight(world.x, world.z);
          const maxHouseTerrain = (airport.elevation || 0) + (airport.challenge ? 260 : 118);
          if (y < WATER_LEVEL + 3 || y > maxHouseTerrain) continue;
          createSmallHouse(
            world.x,
            world.z,
            houseColors[Math.floor(rng() * houseColors.length)],
            roofColors[Math.floor(rng() * roofColors.length)],
            0.2 + rng() * 0.18
          );
          spots.push(world);
          placed++;
        }
      }
    }
  }

  function createRunwayEndScatterHomes() {
    const rng = mulberry32(92245);
    const houseColors = [0xd7dbd5, 0xd9c6ad, 0xc8d4ca, 0xe1d2af, 0xd0c5bd, 0xc4d1d8];
    const roofColors = [0x6f4d42, 0x4e5964, 0x385f51, 0x74513c, 0x6b443e];
  
    for (const airport of AIRPORTS) {
      if (airport.isNightCapable === false || airport.airportCategory === 'HIDDEN_REMOTE_AIRFIELD') continue;
      const runwayLength = airport.runwayLength || 1320;
      const runwayWidth = airport.runwayWidth || 98;
      const size = airport.size || 1;
      const target = size > 1.05 ? 64 : 42;
  
      for (const end of [-1, 1]) {
        const endPoint = airportWorld(airport, 0, end * (runwayLength / 2 + 620));
        if (!isNearCityZone(endPoint.x, endPoint.z, 2200)) continue;
  
        let placed = 0;
        const spots = [];
        for (let i = 0; i < target * 24 && placed < target; i++) {
          const side = rng() > 0.5 ? 1 : -1;
          const nearCluster = rng() < 0.68;
          const along = runwayLength / 2 + (nearCluster ? 260 + Math.pow(rng(), 1.45) * 1020 : 1100 + rng() * 1050);
          const lateral = runwayWidth * (2.8 + Math.pow(rng(), 0.62) * (nearCluster ? 7.2 : 10.8)) + 55 + rng() * 420;
          const jitterX = (rng() - 0.5) * runwayWidth * 1.35;
          const jitterZ = (rng() - 0.5) * 180;
          const localX = side * lateral + jitterX;
          const localZ = end * (along + jitterZ);
          const world = airportWorld(airport, localX, localZ);
          if (Math.abs(world.x) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 95 || Math.abs(world.z) > MAP_SIZE / 2 - EDGE_OCEAN_WIDTH - 95) continue;
          if (isWaterSurface(world.x, world.z) || isUrbanAirportExcluded(world.x, world.z, 80) || isNearRunwaySafety(world.x, world.z, 250, 900) || isInRunwayApproach(world.x, world.z, 390, 1450)) continue;
          if (spots.some(spot => Math.hypot(world.x - spot.x, world.z - spot.z) < 26 + rng() * 18)) continue;
          const y = terrainHeight(world.x, world.z);
          if (y < WATER_LEVEL + 3 || y > (airport.elevation || 0) + 110) continue;
  
          createSmallHouse(
            world.x,
            world.z,
            houseColors[Math.floor(rng() * houseColors.length)],
            roofColors[Math.floor(rng() * roofColors.length)],
            0.14 + rng() * 0.2
          );
          spots.push(world);
          placed++;
        }
      }
    }
  }

  function isNearCityZone(x, z, extra = 0) {
    for (const zone of CITY_ZONES) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + extra) return true;
    }
    return false;
  }

  function createFarmlandRegions() {
    createFarmlandRegionsModule({
      scene,
      terrainHeight,
      mulberry32,
      createTerrainConformingPatch,
      createSmallHouse,
      placeStructureGroupOnTerrain,
      addStructureFoundation,
      registerStructureFootprint,
      registerGroundOverlayRect,
      isStructureFootprintBlocked,
      doesPatchOverlapStructure,
      isRoadWaterBlocked,
      isInCityCore
    });
  }

  function isInCityCore(x, z) {
    for (const zone of CITY_ZONES) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius * 0.72) return true;
    }
    return false;
  }

  function createLowGrassMeadows() {
    createLowGrassMeadowsModule({
      scene,
      terrainHeight,
      mulberry32,
      createTerrainConformingPatch,
      isWaterSurface,
      isRoadWaterBlocked,
      isAirportHardSurface,
      isInCityCore,
      isStructureFootprintBlocked,
      doesPatchOverlapStructure,
      groundOverlayRects
    });
  }

  function isAirportHardSurface(x, z, margin = 22) {
    if (isUrbanAirportExcluded(x, z, margin)) return true;
    for (const airport of AIRPORTS) {
      if (isInAirportPavementLocal(airport, airportLocal(airport, x, z), margin)) return true;
    }
    return false;
  }

  function createGroundDetails() {
    const rng = mulberry32(18371);
    const detailGroup = new THREE.Group();
    detailGroup.name = 'near-ground-detail-lod';
    detailGroup.userData.optionalGroundDetail = true;
    detailGroup.userData.stableLod = {
      distanceByQuality: { LOW: 4200, MEDIUM: 6200, HIGH: 8200, ULTRA: 12000 },
      hysteresis: 0.25,
      fadeSeconds: 0.55
    };
    scene.add(detailGroup);
    const fieldMaterials = [
      liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x7e9f4e, roughness: 0.95 }), -10, -10),
      liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x9f9a58, roughness: 0.95 }), -10, -10),
      liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0x6f8f49, roughness: 0.95 }), -10, -10)
    ];
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x73776f, roughness: 0.9 });
    const scrubMaterial = new THREE.MeshStandardMaterial({ color: 0x315f35, roughness: 0.95 });
  
    for (const village of VILLAGES) {
      for (let i = 0; i < 5; i++) {
        const x = village.x + (rng() - 0.5) * village.radius * 2.2;
        const z = village.z + (rng() - 0.5) * village.radius * 2.2;
        if (isWaterSurface(x, z) || isUrbanAirportExcluded(x, z, 70) || isNearRunwaySafety(x, z, 260, 860) || isInRunwayApproach(x, z, 320, 1250)) continue;
        const width = 82 + rng() * 90;
        const depth = 54 + rng() * 70;
        const rotation = rng() * Math.PI;
        if (doesPatchOverlapStructure(x, z, width, depth, rotation, 24) || isGroundOverlayPointBlocked(x, z, 14)) continue;
        createTerrainConformingPatch(
          x,
          z,
          width,
          depth,
          rotation,
          fieldMaterials[Math.floor(rng() * fieldMaterials.length)],
          0.28,
          4,
          3,
          1
        );
        registerGroundOverlayRect(createPatchRect(x, z, width, depth, rotation));
      }
    }
  
    for (let i = 0; i < 240; i++) {
      const x = -MAP_SIZE / 2 + EDGE_OCEAN_WIDTH + rng() * (MAP_SIZE - EDGE_OCEAN_WIDTH * 2);
      const z = -MAP_SIZE / 2 + EDGE_OCEAN_WIDTH + rng() * (MAP_SIZE - EDGE_OCEAN_WIDTH * 2);
      if (isWaterSurface(x, z) || isUrbanAirportExcluded(x, z, 70) || isNearRunwaySafety(x, z, 270, 920) || isInRunwayApproach(x, z, 280, 1150)) continue;
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 2) continue;
  
      if (rng() > 0.58) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.8 + rng() * 5.8, 0), rockMaterial);
        rock.position.set(x, y + 2.4, z);
        rock.scale.set(1.2 + rng() * 1.6, 0.7 + rng() * 0.8, 1 + rng() * 1.4);
        rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
        rock.castShadow = false;
        detailGroup.add(rock);
      } else {
        const scrub = new THREE.Mesh(new THREE.ConeGeometry(4 + rng() * 4, 7 + rng() * 7, 7), scrubMaterial);
        scrub.position.set(x, y + 3.8, z);
        scrub.scale.setScalar(0.65 + rng() * 0.75);
        scrub.castShadow = false;
        detailGroup.add(scrub);
      }
    }
  }

  return {
    createCity,
    createVillageRoads,
    createIslandSettlements,
    createMountainHamlets,
    createForests,
    createWoodlandCabins,
    createVillages,
    createAirfieldLowHomes,
    createRunwayEndScatterHomes,
    createFarmlandRegions,
    createGroundDetails,
    createLowGrassMeadows,
    createUrbanInfrastructureReport,
    updateTraffic
  };
}
