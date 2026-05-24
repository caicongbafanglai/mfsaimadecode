  function createRunwaySpeedReferences(group, layout) {
    const runwayHalf = layout.runwayLength / 2;
    const dummy = new THREE.Object3D();
    const seamMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({
      color: 0x7d858c,
      roughness: 0.86,
      transparent: true,
      opacity: 0.2,
      depthWrite: true
    }), -34, -34);

    const rubberMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({
      color: 0x080b0e,
      roughness: 0.94,
      transparent: true,
      opacity: 0.34,
      depthWrite: true
    }), -36, -36);
    const seamCount = Math.max(10, Math.floor((layout.runwayLength - 260) / 72));
    const seams = new THREE.InstancedMesh(
      new THREE.BoxGeometry(layout.runwayWidth * 0.92, 0.11, 1.15),
      seamMaterial,
      seamCount
    );
    seams.renderOrder = 34;
    for (let i = 0; i < seamCount; i++) {
      const z = -runwayHalf + 142 + i * ((layout.runwayLength - 284) / Math.max(1, seamCount - 1));
      dummy.position.set(0, 0.72, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      seams.setMatrixAt(i, dummy.matrix);
    }
    group.add(seams);

    const streakRows = Math.max(14, Math.floor((layout.runwayLength - 380) / 92));
    const lateralOffsets = [
      -layout.runwayWidth * 0.22,
      -layout.runwayWidth * 0.13,
      layout.runwayWidth * 0.13,
      layout.runwayWidth * 0.22
    ];
    const rubberMarks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(Math.max(3.4, 4.8 * layout.size), 0.12, Math.max(42, 58 * layout.size)),
      rubberMaterial,
      streakRows * lateralOffsets.length
    );
    rubberMarks.renderOrder = 34;
    let markIndex = 0;
    for (let i = 0; i < streakRows; i++) {
      const z = -runwayHalf + 220 + i * ((layout.runwayLength - 440) / Math.max(1, streakRows - 1));
      for (let j = 0; j < lateralOffsets.length; j++) {
        const drift = Math.sin((i + 1) * (j + 2) * 1.73) * layout.runwayWidth * 0.012;
        dummy.position.set(lateralOffsets[j] + drift, 0.76, z + Math.sin(i * 1.37 + j) * 11);
        dummy.rotation.set(0, Math.sin(i * 0.62 + j * 1.4) * 0.018, 0);
        dummy.updateMatrix();
        rubberMarks.setMatrixAt(markIndex++, dummy.matrix);
      }
    }
    group.add(rubberMarks);

  }

  function createAirportLighting(group, airport, layout, facilities) {
    const { profile, airportClass } = facilities;
    const layers = {
      runway: createLightLayer('runway', 3.05, 0.72, 1, AIRPORT_NIGHT_VISIBILITY_METERS.runway),
      approach: createLightLayer('approach', 3.35, 0.78, 1, AIRPORT_NIGHT_VISIBILITY_METERS.approach),
      taxi: createLightLayer('taxi', 2.45, 0.62, 1, AIRPORT_NIGHT_VISIBILITY_METERS.taxi),
      apron: createLightLayer('apron', 4.4, 0.7, 2, AIRPORT_NIGHT_VISIBILITY_METERS.apron),
      building: createLightLayer('building', 3.2, 0.58, 2, AIRPORT_NIGHT_VISIBILITY_METERS.building),
      road: createLightLayer('road', 2.65, 0.54, 2, AIRPORT_NIGHT_VISIBILITY_METERS.road)
    };
    const fixtures = {
      runwayWhite: [],
      runwayYellow: [],
      thresholdGreen: [],
      runwayRed: [],
      taxiBlue: [],
      taxiGreen: [],
      apronWarm: [],
      roadWarm: []
    };

    createRunwayLighting(layers, fixtures, layout, profile);
    createTaxiwayLighting(layers, fixtures, layout, profile);
    createApronLighting(group, layers, fixtures, layout, profile);
    createBuildingLighting(group, layers, fixtures, facilities, profile);
    createAirportRoadLighting(group, layers, fixtures, layout, facilities, profile);

    for (const layer of Object.values(layers)) {
      const points = createAirportLightPoints(group, airport, layer.positions, layer.colors, layer.size, layer.opacity, layer);
      if (points) group.add(points);
    }
    addFixtureInstances(group, fixtures.runwayWhite, AIRPORT_LIGHT_COLORS.runwayWhite, 0.72, 'runway-white-fixtures');
    addFixtureInstances(group, fixtures.runwayYellow, AIRPORT_LIGHT_COLORS.runwayYellow, 0.72, 'runway-yellow-fixtures');
    addFixtureInstances(group, fixtures.thresholdGreen, AIRPORT_LIGHT_COLORS.thresholdGreen, 0.78, 'threshold-green-fixtures');
    addFixtureInstances(group, fixtures.runwayRed, AIRPORT_LIGHT_COLORS.runwayRed, 0.78, 'runway-red-fixtures');
    addFixtureInstances(group, fixtures.taxiBlue, AIRPORT_LIGHT_COLORS.taxiBlue, 0.62, 'taxi-blue-fixtures');
    addFixtureInstances(group, fixtures.taxiGreen, AIRPORT_LIGHT_COLORS.taxiGreen, 0.64, 'taxi-green-fixtures');
    addFixtureInstances(group, fixtures.apronWarm, AIRPORT_LIGHT_COLORS.apronWarm, 0.58, 'apron-warm-fixtures');
    addFixtureInstances(group, fixtures.roadWarm, AIRPORT_LIGHT_COLORS.roadWarm, 0.48, 'road-warm-fixtures');

    group.userData.airportLightSummary = {
      airport: airport.name,
      class: airportClass,
      runwayEdgeSpacingMeters: profile.edgeSpacing,
      thresholdLightsPerEnd: profile.thresholdCount,
      approachLengthMeters: profile.approachLength,
      taxiEdgeSpacingMeters: profile.taxiEdgeSpacing,
      apronStandLights: profile.standCount * profile.standLightsPerStand,
      runwayVisibleMeters: AIRPORT_NIGHT_VISIBILITY_METERS.runway,
      approachVisibleMeters: AIRPORT_NIGHT_VISIBILITY_METERS.approach,
      apronVisibleMeters: AIRPORT_NIGHT_VISIBILITY_METERS.apron,
      terminalVisibleMeters: AIRPORT_NIGHT_VISIBILITY_METERS.building,
      papiLights: 8
    };
  }

  function createRunwayLighting(layers, fixtures, layout, profile) {
    const half = layout.runwayLength / 2;
    const runwayEdgeX = layout.runwayWidth / 2;
    const edgeOffset = runwayEdgeX + 3.2 * layout.size;
    const edgeSamples = sampleRange(-half, half, profile.edgeSpacing);

    for (const z of edgeSamples) {
      const edgeColorName = profile.edgeYellowEndMeters > 0 && Math.min(z + half, half - z) <= profile.edgeYellowEndMeters
        ? 'runwayYellow'
        : 'runwayWhite';
      const edgeColor = AIRPORT_LIGHT_COLORS[edgeColorName];
      for (const side of [-1, 1]) {
        const x = side * edgeOffset;
        addLightPoint(layers.runway, x, 1.42, z, edgeColor, 1);
        addFixture(fixtures[edgeColorName], x, 0.98, z, 2.2 * layout.size, 0.34, 1.6 * layout.size);
      }
    }

    for (const endSign of [-1, 1]) {
      const endZ = endSign * half;
      const xs = sampleCount(-layout.runwayWidth * 0.42, layout.runwayWidth * 0.42, profile.thresholdCount);
      for (const x of xs) {
        addLightPoint(layers.runway, x, 1.6, endZ + endSign * 4.2, AIRPORT_LIGHT_COLORS.thresholdGreen, 1.06);
        addFixture(fixtures.thresholdGreen, x, 1.05, endZ + endSign * 4.2, 2.0 * layout.size, 0.34, 1.3 * layout.size);
        addLightPoint(layers.runway, x, 1.58, endZ - endSign * 5.4, AIRPORT_LIGHT_COLORS.runwayRed, 1.02);
        addFixture(fixtures.runwayRed, x, 1.04, endZ - endSign * 5.4, 2.0 * layout.size, 0.34, 1.3 * layout.size);
      }
      createPapi(layers, fixtures, layout, profile, endSign);
      createApproachLights(layers, fixtures, layout, profile, endSign);
    }

    if (profile.centerline) {
      for (const z of sampleRange(-half + 45, half - 45, 15)) {
        const distanceToEnd = Math.min(z + half, half - z);
        let colorName = 'runwayWhite';
        if (distanceToEnd < 300) colorName = 'runwayRed';
        else if (distanceToEnd < 900 && Math.round(z / 15) % 2 === 0) colorName = 'runwayRed';
        const color = AIRPORT_LIGHT_COLORS[colorName];
        addLightPoint(layers.runway, 0, 1.36, z, color, colorName === 'runwayRed' ? 0.94 : 0.82);
        addFixture(fixtures[colorName], 0, 0.96, z, 1.2 * layout.size, 0.22, 1.2 * layout.size);
      }
    }

    if (profile.touchdown) {
      for (const endSign of [-1, 1]) {
        const endZ = endSign * half;
        for (let d = 120; d <= 900; d += 30) {
          const z = endZ - endSign * d;
          for (const side of [-1, 1]) {
            for (let j = 0; j < 3; j++) {
              const x = side * (layout.runwayWidth * 0.12 + j * 7.2 * layout.size);
              addLightPoint(layers.runway, x, 1.38, z, AIRPORT_LIGHT_COLORS.runwayWhite, 0.72);
              addFixture(fixtures.runwayWhite, x, 0.94, z, 1.35 * layout.size, 0.22, 1.35 * layout.size);
            }
          }
        }
      }
    }
  }

  function createApproachLights(layers, fixtures, layout, profile, endSign) {
    const half = layout.runwayLength / 2;
    const endZ = endSign * half;
    for (const distance of sampleRange(30, profile.approachLength, 30)) {
      const z = endZ + endSign * distance;
      addLightPoint(layers.approach, 0, 1.55, z, AIRPORT_LIGHT_COLORS.runwayWhite, 0.95);
      addFixture(fixtures.runwayWhite, 0, 1.02, z, 1.45 * layout.size, 0.24, 1.45 * layout.size);
      const crossbar = distance % profile.approachCrossbarSpacing === 0 || distance === 90;
      if (!crossbar) continue;
      const barHalf = distance <= 150 ? 42 : 30;
      for (const x of sampleRange(-barHalf, barHalf, 14)) {
        if (Math.abs(x) < 2) continue;
        addLightPoint(layers.approach, x, 1.5, z, AIRPORT_LIGHT_COLORS.runwayWhite, 0.8);
        addFixture(fixtures.runwayWhite, x, 0.98, z, 1.25 * layout.size, 0.22, 1.25 * layout.size);
      }
    }
  }

  function createPapi(layers, fixtures, layout, profile, endSign) {
    const half = layout.runwayLength / 2;
    const endZ = endSign * half;
    const z = endZ - endSign * profile.papiDistance;
    const side = endSign < 0 ? -1 : 1;
    const edgeX = layout.runwayWidth / 2 + profile.papiSideOffset;
    for (let i = 0; i < 4; i++) {
      const x = side * (edgeX + i * 5.2 * layout.size);
      const colorName = i < 2 ? 'runwayRed' : 'runwayWhite';
      const color = i < 2 ? AIRPORT_LIGHT_COLORS.papiRed : AIRPORT_LIGHT_COLORS.papiWhite;
      addLightPoint(layers.runway, x, 2.3, z, color, 1.15);
      addFixture(fixtures[colorName], x, 1.24, z, 4.2 * layout.size, 1.2 * layout.size, 2.6 * layout.size);
    }
  }

  function createTaxiwayLighting(layers, fixtures, layout, profile) {
    const taxiWidth = Math.max(28, 34 * layout.size);
    const connectorWidth = Math.max(30, 36 * layout.size);
    const connectorZ = -layout.runwayLength * 0.16;
    const taxiStartZ = layout.taxiZ - layout.taxiLength / 2;
    const taxiEndZ = layout.taxiZ + layout.taxiLength / 2;
    const taxiEdgeX = taxiWidth / 2 + 2.4 * layout.size;

    for (const z of sampleRange(taxiStartZ, taxiEndZ, profile.taxiEdgeSpacing)) {
      for (const side of [-1, 1]) {
        const x = layout.taxiX + side * taxiEdgeX;
        addLightPoint(layers.taxi, x, 1.15, z, AIRPORT_LIGHT_COLORS.taxiBlue, 0.78);
        addFixture(fixtures.taxiBlue, x, 0.82, z, 1.45 * layout.size, 0.26, 1.45 * layout.size);
      }
    }

    const connectorStartX = layout.runwayWidth / 2 + 10 * layout.size;
    const connectorEndX = layout.taxiX + taxiWidth * 0.5;
    for (const x of sampleRange(connectorStartX, connectorEndX, profile.taxiEdgeSpacing)) {
      for (const side of [-1, 1]) {
        const z = connectorZ + side * (connectorWidth / 2 + 2.2 * layout.size);
        addLightPoint(layers.taxi, x, 1.12, z, AIRPORT_LIGHT_COLORS.taxiBlue, 0.78);
        addFixture(fixtures.taxiBlue, x, 0.82, z, 1.45 * layout.size, 0.26, 1.45 * layout.size);
      }
    }

    const apronLeadStartX = layout.taxiX;
    const apronLeadEndX = layout.apronX - layout.apronW * 0.38;
    for (const x of sampleRange(apronLeadStartX, apronLeadEndX, profile.taxiEdgeSpacing)) {
      for (const side of [-1, 1]) {
        const z = layout.apronZ + side * (connectorWidth / 2 + 2.2 * layout.size);
        addLightPoint(layers.taxi, x, 1.12, z, AIRPORT_LIGHT_COLORS.taxiBlue, 0.66);
        addFixture(fixtures.taxiBlue, x, 0.82, z, 1.3 * layout.size, 0.24, 1.3 * layout.size);
      }
    }

    if (profile.taxiCenterline) {
      for (const z of sampleRange(taxiStartZ, taxiEndZ, 15)) {
        addLightPoint(layers.taxi, layout.taxiX, 1.2, z, AIRPORT_LIGHT_COLORS.taxiGreen, 0.64);
        addFixture(fixtures.taxiGreen, layout.taxiX, 0.86, z, 1.05 * layout.size, 0.2, 1.05 * layout.size);
      }
      for (const x of sampleRange(connectorStartX, connectorEndX, 15)) {
        addLightPoint(layers.taxi, x, 1.2, connectorZ, AIRPORT_LIGHT_COLORS.taxiGreen, 0.64);
        addFixture(fixtures.taxiGreen, x, 0.86, connectorZ, 1.05 * layout.size, 0.2, 1.05 * layout.size);
      }
      for (const x of sampleRange(apronLeadStartX, apronLeadEndX, 15)) {
        addLightPoint(layers.taxi, x, 1.18, layout.apronZ, AIRPORT_LIGHT_COLORS.taxiGreen, 0.56);
        addFixture(fixtures.taxiGreen, x, 0.84, layout.apronZ, 1.0 * layout.size, 0.18, 1.0 * layout.size);
      }
    }

    const stopBarX = layout.runwayWidth / 2 + 46 * layout.size;
    for (const z of sampleCount(connectorZ - connectorWidth * 0.42, connectorZ + connectorWidth * 0.42, profile.stopBarCount)) {
      addLightPoint(layers.taxi, stopBarX, 1.32, z, AIRPORT_LIGHT_COLORS.runwayRed, 1.08);
      addFixture(fixtures.runwayRed, stopBarX, 0.9, z, 1.55 * layout.size, 0.3, 1.55 * layout.size);
    }
  }

  function createApronLighting(group, layers, fixtures, layout, profile) {
    for (const mast of apronMastPositions(layout, profile)) {
      createFloodlightMast(group, mast.x, mast.z, profile.apronMastHeight * layout.size, layout.size);
      addLightPoint(layers.apron, mast.x, profile.apronMastHeight * layout.size + 3, mast.z, AIRPORT_LIGHT_COLORS.apronWarm, 1.15);
    }

    let standIndex = 0;
    for (const stand of standLightPositions(layout, profile)) {
      standIndex++;
      for (let i = 0; i < profile.standLightsPerStand; i++) {
        const x = stand.x + (i - (profile.standLightsPerStand - 1) * 0.5) * 18 * layout.size;
        const z = stand.z - layout.apronD * 0.1;
        addLightPoint(layers.apron, x, 5.2 * layout.size, z, AIRPORT_LIGHT_COLORS.apronWarm, 0.88);
        addFixture(fixtures.apronWarm, x, 1.16, z, 2.0 * layout.size, 0.42, 2.0 * layout.size);
      }
      const markerColor = standIndex % 2 === 0 ? AIRPORT_LIGHT_COLORS.taxiGreen : AIRPORT_LIGHT_COLORS.facadeWarm;
      addLightPoint(layers.apron, stand.x, 1.5, stand.z + layout.apronD * 0.11, markerColor, 0.62);
      createStandMarker(group, stand.x, stand.z + layout.apronD * 0.11, layout.size);
    }
  }

  function createBuildingLighting(group, layers, fixtures, facilities, profile) {
    createWindowGrid(group, facilities.terminal, profile, 0);
    createWindowGrid(group, facilities.concourse, profile, 1);
    addFacadeLights(layers, fixtures, facilities.terminal, profile);
    addFacadeLights(layers, fixtures, facilities.concourse, profile);
    addServiceBuildingLights(layers, fixtures, facilities.cargo, profile);
    createTowerLighting(group, layers, fixtures, facilities.tower);
  }

  function createAirportRoadLighting(group, layers, fixtures, layout, facilities, profile) {
    const terminalRoadZ = facilities.terminal.z - facilities.terminal.d * 0.78;
    const terminalRoadStart = layout.apronX - layout.apronW * 0.56;
    const terminalRoadEnd = layout.apronX + layout.apronW * 0.5;
    for (const x of sampleRange(terminalRoadStart, terminalRoadEnd, profile.roadLightSpacing)) {
      createRoadLamp(group, x, terminalRoadZ, 12 * layout.size);
      addLightPoint(layers.road, x, 13 * layout.size, terminalRoadZ, AIRPORT_LIGHT_COLORS.roadWarm, 0.62);
    }

    const cargoRoadX = facilities.cargo.x - facilities.cargo.w * 0.72;
    for (const z of sampleRange(facilities.terminal.z, facilities.cargo.z + facilities.cargo.d * 0.75, profile.roadLightSpacing)) {
      createRoadLamp(group, cargoRoadX, z, 10 * layout.size);
      addLightPoint(layers.road, cargoRoadX, 11 * layout.size, z, AIRPORT_LIGHT_COLORS.roadWarm, 0.48);
    }
  }

  function createFloodlightMast(group, x, z, height, scale) {
    if (getRenderQuality?.()?.denseScenery !== true) return;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45 * scale, 0.62 * scale, height, 8),
      new THREE.MeshStandardMaterial({ color: 0x687076, roughness: 0.72 })
    );
    pole.position.set(x, height / 2, z);
    pole.castShadow = false;
    group.add(pole);

    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x777066,
      metalness: 0.18,
      roughness: 0.58,
      emissive: 0x2f2412,
      emissiveIntensity: 0.035
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(9 * scale, 0.55 * scale, 0.8 * scale), headMaterial);
    bar.position.set(x, height + 0.8 * scale, z);
    group.add(bar);
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.3 * scale, 1.2 * scale, 1.2 * scale), headMaterial);
      head.position.set(x + side * 3.4 * scale, height + 0.2 * scale, z + 0.9 * scale);
      head.rotation.x = -0.48;
      group.add(head);
    }
  }

  function createRoadLamp(group, x, z, height) {
    if (getRenderQuality?.()?.denseScenery !== true) return;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, height, 7),
      new THREE.MeshStandardMaterial({ color: 0x5a5f61, roughness: 0.76 })
    );
    pole.position.set(x, height / 2, z);
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.38, 1.1),
      new THREE.MeshStandardMaterial({
        color: 0x6f675b,
        metalness: 0.14,
        roughness: 0.62,
        emissive: 0x2b2112,
        emissiveIntensity: 0.025
      })
    );
    head.position.set(x, height + 0.15, z);
    group.add(head);
  }

  function createStandMarker(group, x, z, scale) {
    if (getRenderQuality?.()?.denseScenery !== true) return;
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(5.2 * scale, 1.6 * scale, 0.4 * scale),
      nightGlowMaterial(0x78ffd6, 0.16, 0.7)
    );
    marker.position.set(x, 1.45 * scale, z);
    marker.renderOrder = 39;
    markNightGlow(marker, 0.16, 0.7);
    group.add(marker);
  }

  function createWindowGrid(group, building, profile, seed) {
    const entries = [];
    const glowEntries = [];
    const rowCount = Math.max(2, Math.floor(building.h / 9));
    const colCount = Math.max(5, Math.floor(building.w / 13));
    const frontZ = building.z - building.d / 2 - 0.08;
    const backZ = building.z + building.d / 2 + 0.08;
    for (let side = 0; side < 2; side++) {
      const z = side === 0 ? frontZ : backZ;
      for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < colCount; col++) {
          if (hash01(row, col, seed + side * 17) > profile.windowLitRatio) continue;
          const entry = {
            x: building.x - building.w * 0.42 + col * (building.w * 0.84 / Math.max(1, colCount - 1)),
            y: building.y + 5 + row * Math.max(6.2, building.h * 0.62 / Math.max(1, rowCount - 1)),
            z,
            sx: building.w / colCount * 0.54,
            sy: 2.6,
            sz: 0.12
          };
          entries.push(entry);
          glowEntries.push({ ...entry, sx: entry.sx * 1.85, sy: entry.sy * 2.25, sz: 0.18 });
        }
      }
    }
    addFixtureInstances(group, glowEntries, AIRPORT_LIGHT_COLORS.terminalWindow, 0.32, 'terminal-window-soft-glow');
    addFixtureInstances(group, entries, AIRPORT_LIGHT_COLORS.terminalWindow, 0.74, 'terminal-window-grid');
  }

  function addFacadeLights(layers, fixtures, building, profile) {
    const z = building.z - building.d / 2 - 4.2;
    for (const x of sampleRange(building.x - building.w * 0.46, building.x + building.w * 0.46, profile.facadeLightSpacing)) {
      addLightPoint(layers.building, x, building.h * 0.62, z, AIRPORT_LIGHT_COLORS.facadeWarm, 0.76);
      addFixture(fixtures.apronWarm, x, building.h * 0.46, z + 1.4, 2.2, 0.48, 0.65);
    }
  }

  function addServiceBuildingLights(layers, fixtures, building, profile) {
    const zFront = building.z - building.d / 2 - 3.5;
    for (const x of sampleRange(building.x - building.w * 0.42, building.x + building.w * 0.42, Math.max(18, profile.facadeLightSpacing))) {
      addLightPoint(layers.building, x, building.h * 0.74, zFront, AIRPORT_LIGHT_COLORS.facadeWarm, 0.66);
      addFixture(fixtures.apronWarm, x, building.h * 0.55, zFront + 1, 2.0, 0.42, 0.62);
    }
  }

  function createTowerLighting(group, layers, fixtures, tower) {
    const scale = tower.scale;
    const topY = 82 * scale;
    addLightPoint(layers.building, tower.x, topY, tower.z, AIRPORT_LIGHT_COLORS.towerRed, 1.2);
    const obstacle = new THREE.Mesh(
      new THREE.SphereGeometry(1.6 * scale, 10, 6),
      new THREE.MeshStandardMaterial({
        color: 0x8a2d36,
        metalness: 0.08,
        roughness: 0.52,
        emissive: 0x3a060b,
        emissiveIntensity: 0.04
      })
    );
    obstacle.position.set(tower.x, topY, tower.z);
    group.add(obstacle);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI * 0.5;
      const x = tower.x + Math.cos(angle) * 14 * scale;
      const z = tower.z + Math.sin(angle) * 14 * scale;
      addLightPoint(layers.building, x, 68 * scale, z, AIRPORT_LIGHT_COLORS.terminalWindow, 0.68);
      addFixture(fixtures.apronWarm, x, 66 * scale, z, 2.6 * scale, 1.0 * scale, 0.5 * scale, angle);
    }
  }

  function apronMastPositions(layout, profile) {
    const positions = [];
    const left = layout.apronX - layout.apronW * 0.46;
    const right = layout.apronX + layout.apronW * 0.46;
    const near = layout.apronZ - layout.apronD * 0.46;
    const far = layout.apronZ + layout.apronD * 0.46;
    for (const z of [near, far]) {
      for (const x of sampleRange(left, right, profile.apronMastSpacing)) positions.push({ x, z });
    }
    if (positions.length < profile.apronMastMin) {
      for (const x of [left, right]) {

        for (const z of sampleRange(near + profile.apronMastSpacing, far - profile.apronMastSpacing, profile.apronMastSpacing)) {
          positions.push({ x, z });
        }
      }
    }
    return positions.slice(0, profile.apronMastMax);
  }

  function standLightPositions(layout, profile) {
    const positions = [];
    const rows = profile.standCount > 6 ? 2 : 1;
    const cols = Math.ceil(profile.standCount / rows);
    for (let row = 0; row < rows; row++) {
      const z = layout.apronZ + layout.apronD * (rows === 1 ? 0.16 : row === 0 ? -0.03 : 0.24);
      for (let col = 0; col < cols && positions.length < profile.standCount; col++) {
        const x = layout.apronX - layout.apronW * 0.34 + col * (layout.apronW * 0.68 / Math.max(1, cols - 1));
        positions.push({ x, z });
      }
    }
    return positions;
  }

  function airportLightClass(airport) {
    if (airport.runwayClass === 'A') return 'A';
    if (airport.runwayClass === 'B' || airport.runwayClass === 'D') return 'B';
    if (airport.runwayClass === 'C') return 'C';
    if (airport.tier === 'international') return 'A';
    if (airport.tier === 'regional') return 'B';
    return 'C';
  }

  function createLightLayer(name, size, opacity, priority, minVisibleDistance) {
    return { name, positions: [], colors: [], size, opacity, priority, minVisibleDistance };
  }

  function addLightPoint(layer, x, y, z, color, intensity = 1) {
    layer.positions.push(x, y, z);
    pushRgb(layer.colors, color, intensity);
  }

  function addFixture(list, x, y, z, sx, sy, sz, ry = 0) {
    list.push({ x, y, z, sx, sy, sz, ry });
  }

  function addFixtureInstances(group, entries, color, opacity, name) {
    if (!entries.length) return;
    const material = nightGlowMaterial(color, 0, opacity);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(0, entry.ry || 0, 0);
      dummy.scale.set(entry.sx, entry.sy, entry.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.name = name;
    mesh.renderOrder = 39;
    mesh.frustumCulled = false;
    mesh.userData.longRangeVisual = true;
    mesh.userData.nightGlow = true;
    mesh.userData.baseOpacity = 0;
    mesh.userData.nightOpacity = opacity;
    mesh.userData.nightOnlyVisual = true;
    mesh.userData.airportFacility = true;
    mesh.userData.airportName = group.userData.airportName || '';
    mesh.userData.airportLightLayer = fixtureLayerForName(name);
    mesh.userData.airportCriticalLight = /runway|approach|taxi/.test(mesh.userData.airportLightLayer);
    mesh.userData.airportFixtureSupport = true;
    mesh.userData.airportFixtureCount = entries.length;
    mesh.userData.fixtureGroundedByBase = true;
    mesh.userData.minVisibleDistance = fixtureVisibleDistanceForLayer(mesh.userData.airportLightLayer);
    mesh.userData.airportNightPriority = fixturePriorityForLayer(mesh.userData.airportLightLayer);
    mesh.visible = false;
    group.add(mesh);
  }

  function createAirportLightPoints(group, airport, positions, colors, size, opacity, layer = {}) {
    if (!positions.length) return null;
    const marker = new THREE.Group();
    marker.name = `airport-${layer.name || 'airport'}-light-layer-metadata`;
    marker.visible = false;
    marker.frustumCulled = false;
    marker.userData.longRangeVisual = true;
    marker.userData.airportFacility = true;
    marker.userData.airportCriticalLight = (layer.priority || 2) <= 2;
    marker.userData.airportNightPriority = layer.priority || 2;
    marker.userData.airportLightLayer = layer.name || 'airport';
    marker.userData.minVisibleDistance = layer.minVisibleDistance || AIRPORT_NIGHT_VISIBILITY_METERS.apron;
    marker.userData.lightPointCount = positions.length / 3;
    marker.userData.renderedAsPhysicalFixtures = true;
    marker.userData.stableLod = {
      distance: Math.max(layer.minVisibleDistance || 0, AIRPORT_NIGHT_VISIBILITY_METERS.apron),
      hysteresis: 0.36,
      fadeSeconds: 0
    };
    markAirportFacility(group, marker, airport, `${layer.name || 'airport'}-light-layer`, layer.priority || 2, {
      checked: positions.length / 3,
      localGroundY: 0,
      minVisibleDistance: layer.minVisibleDistance || AIRPORT_NIGHT_VISIBILITY_METERS.apron,
      lightLayer: true
    });
    return marker;
  }

  function createAirportLightSpriteTexture() {
    if (airportLightSpriteTexture) return airportLightSpriteTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.78)');
    gradient.addColorStop(0.68, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    airportLightSpriteTexture = new THREE.CanvasTexture(canvas);
    airportLightSpriteTexture.colorSpace = THREE.SRGBColorSpace;
    airportLightSpriteTexture.needsUpdate = true;
    return airportLightSpriteTexture;
  }

  function nightGlowMaterial(color, baseOpacity, nightOpacity) {
    const dayOpacity = 0;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: dayOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    material.userData.baseOpacity = dayOpacity;
    material.userData.nightOpacity = nightOpacity;
    material.userData.nightOnlyVisual = true;
    return material;
  }

  function markNightGlow(object, baseOpacity, nightOpacity) {
    object.userData.nightGlow = true;
    object.userData.baseOpacity = 0;
    object.userData.nightOpacity = nightOpacity;
    object.userData.nightOnlyVisual = true;
    object.userData.longRangeVisual = true;
    object.frustumCulled = false;
    object.visible = false;
    const materials = !object.material ? [] : Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.opacity = 0;
      material.userData.baseOpacity = 0;
      material.userData.nightOnlyVisual = true;
    }
  }

  function fixtureLayerForName(name = '') {
    if (/threshold|runway/.test(name)) return 'runway';
    if (/taxi/.test(name)) return 'taxi';
    if (/terminal|tower|building|window/.test(name)) return 'building';
    if (/road/.test(name)) return 'road';
    if (/apron|stand/.test(name)) return 'apron';
    return 'airport';
  }

  function fixtureVisibleDistanceForLayer(layer) {
    if (layer === 'runway') return AIRPORT_NIGHT_VISIBILITY_METERS.runway;
    if (layer === 'approach') return AIRPORT_NIGHT_VISIBILITY_METERS.approach;
    if (layer === 'taxi') return AIRPORT_NIGHT_VISIBILITY_METERS.taxi;
    if (layer === 'building') return AIRPORT_NIGHT_VISIBILITY_METERS.building;
    if (layer === 'road') return AIRPORT_NIGHT_VISIBILITY_METERS.road;
    return AIRPORT_NIGHT_VISIBILITY_METERS.apron;
  }

  function fixturePriorityForLayer(layer) {
    if (layer === 'runway' || layer === 'approach') return 1;
    if (layer === 'taxi' || layer === 'apron' || layer === 'building') return 2;
    return 3;
  }

  function pushRgb(colors, color, intensity) {
    const c = new THREE.Color(color);
    colors.push(c.r * intensity, c.g * intensity, c.b * intensity);
  }

  function sampleRange(start, end, spacing) {
    const distance = Math.max(0.001, Math.abs(end - start));
    const count = Math.max(2, Math.floor(distance / spacing) + 1);
    const values = [];
    for (let i = 0; i < count; i++) values.push(THREE.MathUtils.lerp(start, end, i / (count - 1)));
    return values;
  }

  function sampleCount(start, end, count) {
    const values = [];
    for (let i = 0; i < count; i++) values.push(THREE.MathUtils.lerp(start, end, count === 1 ? 0.5 : i / (count - 1)));
    return values;
  }

  function hash01(a, b, c) {
    const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
