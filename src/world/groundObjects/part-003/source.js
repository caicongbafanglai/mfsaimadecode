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
        createTerrainConformingPatch(
          x,
          z,
          width,
          depth,
          rotation,
          fieldMaterials[Math.floor(rng() * fieldMaterials.length)],
          0.9,
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
