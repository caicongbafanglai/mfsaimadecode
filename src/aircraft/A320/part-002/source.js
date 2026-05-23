    }

    const noseGear = new THREE.Group();
    noseGear.name = 'nose_landing_gear';
    const noseZ = (mainZ / U - WHEELBASE_M) * U;
    const noseCenterY = GROUND_Y + 0.34 * U;
    for (const x of [-0.19, 0.19]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * U, 0.34 * U, 0.2 * U, 18), tireMaterial);
      tire.name = 'nose_gear_tire';
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x * U, noseCenterY, noseZ);
      tire.castShadow = true;
      noseGear.add(tire);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.145 * U, 0.145 * U, 0.21 * U, 12), metal);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(tire.position);
      noseGear.add(hub);
    }
    addStrut(new THREE.Vector3(0, noseCenterY + 0.16 * U, noseZ), new THREE.Vector3(0, -1.04 * U, -11.62 * U), metal, 0.052 * U, noseGear);
    addStrut(new THREE.Vector3(-0.16 * U, noseCenterY + 0.14 * U, noseZ), new THREE.Vector3(0, -2.4 * U, -11.95 * U), metal, 0.03 * U, noseGear);
    addStrut(new THREE.Vector3(0.16 * U, noseCenterY + 0.14 * U, noseZ), new THREE.Vector3(0, -2.4 * U, -11.95 * U), metal, 0.03 * U, noseGear);

    const doorLeft = new THREE.Mesh(createOvalGearDoorGeometry({
      center: new THREE.Vector3(-0.45 * U, -2.45 * U, -11.82 * U),
      radiusY: 0.38 * U,
      radiusZ: 0.48 * U,
      normalSide: -1,
      bow: 0.028 * U,
      sweep: 0.03 * U
    }), panel);
    doorLeft.name = 'nose_gear_door_left';
    noseGear.add(doorLeft);
    const doorRight = new THREE.Mesh(createOvalGearDoorGeometry({
      center: new THREE.Vector3(0.45 * U, -2.45 * U, -11.82 * U),
      radiusY: 0.38 * U,
      radiusZ: 0.48 * U,
      normalSide: 1,
      bow: 0.028 * U,
      sweep: -0.03 * U
    }), panel);
    doorRight.name = 'nose_gear_door_right';
    noseGear.add(doorRight);
    group.add(noseGear);
  }

  function addLightsAndAntennae() {
    const whiteLight = new THREE.MeshStandardMaterial({ color: 0xf7fbff, emissive: 0xdff6ff, emissiveIntensity: parked ? 0.7 : 2.3 });
    addLightPod(-SHARKLET_TIP_X, 3.48 * U, 0.1 * U, redLight, 0xff3048, 0.16 * U, 'nav');
    addLightPod(SHARKLET_TIP_X, 3.48 * U, 0.1 * U, greenLight, 0x31e778, 0.16 * U, 'nav');
    addLightPod(-WING_TIP_X, 0.72 * U, 1.68 * U, whiteLight, 0xdff6ff, 0.15 * U, 'strobe');
    addLightPod(WING_TIP_X, 0.72 * U, 1.68 * U, whiteLight, 0xdff6ff, 0.15 * U, 'strobe');
    addLightPod(0, 1.9 * U, -1.0 * U, redLight, 0xff3048, 0.18 * U, 'beacon');
    addLightPod(0, -1.72 * U, -0.6 * U, redLight, 0xff3048, 0.14 * U, 'beacon');
    addLightPod(0, -0.06 * U, HALF_LENGTH - 0.35 * U, whiteLight, 0xdff6ff, 0.13 * U, 'nav');
    addLightPod(-0.62 * U, -1.2 * U, -16.25 * U, warmLight, 0xffd36a, 0.13 * U, 'landing');
    addLightPod(0.62 * U, -1.2 * U, -16.25 * U, warmLight, 0xffd36a, 0.13 * U, 'landing');

    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.06 * U, 0.34 * U, 0.6 * U), dark);
    antenna.name = 'vhf_antenna';
    antenna.position.set(0, 2.18 * U, 4.2 * U);
    antenna.rotation.x = 0.28;
    group.add(antenna);

    function addLightPod(x, y, z, material, color, radius, kind) {
      const podMaterial = material.clone();
      podMaterial.transparent = true;
      const light = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), podMaterial);
      light.userData.aircraftLight = { kind };
      light.position.set(x, y, z);
      group.add(light);
      if (!parked) {
        const baseIntensity = kind === 'beacon' ? 0.84 : kind === 'strobe' ? 0.72 : radius > 0.24 * U ? 0.8 : 0.45;
        const baseDistance = kind === 'beacon' || kind === 'strobe' ? 58 : 30;
        const point = new THREE.PointLight(color, baseIntensity, baseDistance);
        point.userData.aircraftLight = { kind, baseIntensity, baseDistance };
        point.position.copy(light.position);
        group.add(point);
      }
    }
  }

  function createFuselageGeometry() {
    const radial = parked ? 54 : 88;
    const sections = [
      { z: -18.78, rx: 0.045, ry: 0.035, cy: -0.04 },
      { z: -18.58, rx: 0.28, ry: 0.2, cy: -0.02 },
      { z: -18.24, rx: 0.58, ry: 0.42, cy: 0.02 },
      { z: -17.72, rx: 0.9, ry: 0.69, cy: 0.075 },
      { z: -17.02, rx: 1.18, ry: 0.95, cy: 0.12 },
      { z: -16.22, rx: 1.46, ry: 1.24, cy: 0.13 },
      { z: -15.2, rx: 1.68, ry: 1.48, cy: 0.1 },
      { z: -13.9, rx: 1.86, ry: 1.72, cy: 0.045 },
      { z: -12.15, rx: 1.965, ry: 1.9, cy: 0.008 },
      { z: -8.4, rx: 1.985, ry: 1.955, cy: 0.0 },
      { z: -3.8, rx: 1.985, ry: 1.965, cy: 0.0 },
      { z: 2.6, rx: 1.985, ry: 1.965, cy: -0.005 },
      { z: 8.9, rx: 1.965, ry: 1.94, cy: -0.012 },
      { z: 11.6, rx: 1.9, ry: 1.86, cy: -0.028 },
      { z: 13.55, rx: 1.66, ry: 1.58, cy: -0.045 },
      { z: 15.15, rx: 1.24, ry: 1.14, cy: -0.052 },
      { z: 16.45, rx: 0.78, ry: 0.68, cy: -0.045 },
      { z: 17.55, rx: 0.42, ry: 0.32, cy: -0.032 },
      { z: 18.3, rx: 0.18, ry: 0.12, cy: -0.02 },
      { z: 18.785, rx: 0.035, ry: 0.026, cy: -0.012 }
    ];
    return createClosedLoftGeometry(sections, section => {
      const ring = [];
      const forwardBlend = 1 - smootherStep(-17.6, -13.6, section.z);
      const tailBlend = smootherStep(10.5, 18.2, section.z);
      for (let i = 0; i < radial; i++) {
        const a = i / radial * Math.PI * 2;
        const sin = Math.sin(a);
        const cos = Math.cos(a);
        const crown = Math.max(0, sin);
        const belly = Math.max(0, -sin);
        const sideShoulder = Math.pow(Math.abs(cos), 4) * (0.018 + 0.015 * (1 - forwardBlend));
        const crownLift = crown * (0.025 + 0.04 * (1 - forwardBlend)) - forwardBlend * crown * 0.025;
        const bellyFullness = belly * (0.055 + 0.028 * smootherStep(-4.5, 4.2, section.z));
        const nosePinch = 1 - forwardBlend * crown * 0.07 - tailBlend * 0.025;
        const x = cos * section.rx * nosePinch * U;
        const y = (section.cy + sin * section.ry + crownLift - bellyFullness + sideShoulder) * U;
        ring.push([x, y, section.z * U]);
      }
      return ring;
    });
  }

  function createWingGeometry(side) {
    return createClosedLoftGeometry(getWingStations(), station => (
      airfoilProfile.map(point => airfoilSectionPoint(side, station, point))
    ));
  }

  function createSpoilerPanels(side) {
    const panels = new THREE.Group();
    panels.name = `spoiler_panel_lines_${side < 0 ? 'left' : 'right'}`;
    for (const x of [4.8, 6.6, 8.4, 10.2, 12.0]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.2 * U, 0.012 * U, 0.03 * U), metal);
      strip.position.set(side * x * U, 0.22 * U, -0.18 * U);
      strip.rotation.y = side * -0.08;
      panels.add(strip);
    }
    return panels;
  }

  function createWingRootFairing(side) {
    const fairing = new THREE.Group();
    fairing.name = `real_wing_body_fairing_${side < 0 ? 'left' : 'right'}`;

    const upper = new THREE.Mesh(createWingBodyBlendGeometry(side, false), fairingWing);
    upper.name = `upper_wing_body_saddle_${side < 0 ? 'left' : 'right'}`;
    upper.castShadow = true;
    upper.receiveShadow = true;
    fairing.add(upper);

    const lower = new THREE.Mesh(createWingBodyBlendGeometry(side, true), fairingWhite);
    lower.name = `lower_wing_body_belly_blend_${side < 0 ? 'left' : 'right'}`;
    lower.castShadow = true;
    lower.receiveShadow = true;
    fairing.add(lower);
    return fairing;
  }

  function createCenterBellyFairing() {
    const fairing = new THREE.Mesh(createBellyFairingGeometry(), fairingWhite);
    fairing.name = 'continuous_center_belly_wing_fairing';
    fairing.castShadow = true;
    fairing.receiveShadow = true;
    return fairing;
  }

  function createTrailingControlSurface(side, innerM, outerM, chordM, thicknessM, material, name) {
    const inner = wingTrailingPoint(side, innerM);
    const outer = wingTrailingPoint(side, outerM);
    const hingeInner = { x: inner.x, y: inner.y - 0.02 * U, z: inner.z - chordM * U };
    const hingeOuter = { x: outer.x, y: outer.y - 0.02 * U, z: outer.z - chordM * U };
    const origin = {
      x: (hingeInner.x + hingeOuter.x) * 0.5,
      y: (hingeInner.y + hingeOuter.y) * 0.5 - thicknessM * U * 0.5,
      z: (hingeInner.z + hingeOuter.z) * 0.5
    };
    const pivot = new THREE.Group();
    pivot.name = `${name}_${side < 0 ? 'left' : 'right'}`;
    pivot.position.set(origin.x, origin.y, origin.z);
    const control = new THREE.Mesh(createControlAirfoilGeometry(side, innerM, outerM, chordM, thicknessM, origin), material);
    control.name = `${name}_curved_skin_${side < 0 ? 'left' : 'right'}`;
    control.castShadow = true;
    control.receiveShadow = true;
    pivot.add(control);
    return pivot;
  }

  function wingTrailingPoint(side, spanM) {
    const station = wingStationAtSpan(spanM);
    return {
      x: side * spanM * U,
      y: station.y * U,
      z: station.te * U
    };
  }

  function createSharklet(side) {
    const sideName = side < 0 ? 'left' : 'right';
    const sharklet = new THREE.Mesh(createSharkletGeometry(side), deepBlue);
    sharklet.name = `a320neo_tall_sharklet_${sideName}`;
    sharklet.castShadow = true;
    sharklet.receiveShadow = true;
    return sharklet;
  }

  function createNacelleGeometry() {
    const radial = parked ? 44 : 68;
    const sections = [
      { z: -2.22, rx: 1.12, ry: 1.0, cy: 0.0 },
      { z: -2.04, rx: 1.34, ry: 1.19, cy: 0.005 },
      { z: -1.66, rx: 1.31, ry: 1.16, cy: -0.005 },
      { z: -0.65, rx: 1.34, ry: 1.2, cy: -0.025 },
      { z: 0.72, rx: 1.22, ry: 1.1, cy: -0.04 },
      { z: 1.52, rx: 0.98, ry: 0.88, cy: -0.035 },
      { z: 2.12, rx: 0.66, ry: 0.58, cy: -0.025 }
    ];
    return createClosedLoftGeometry(sections, section => {
      const ring = [];
      for (let i = 0; i < radial; i++) {
        const a = i / radial * Math.PI * 2;
        const sin = Math.sin(a);
        const lowerFullness = Math.max(0, -sin) * 0.045;
        const crownFlatten = Math.max(0, sin) * 0.018;
        ring.push([
          Math.cos(a) * section.rx * U,
          (section.cy + sin * section.ry - lowerFullness + crownFlatten) * U,
          section.z * U
        ]);
      }
      return ring;
    }, { capStart: false, capEnd: false });
  }

  function createPylon(side) {
    const pylon = new THREE.Group();
    pylon.name = `structural_engine_pylon_${side < 0 ? 'left' : 'right'}`;

    const strake = new THREE.Mesh(createPylonGeometry(side), metal);
    strake.name = 'streamlined_pylon_body';
    strake.castShadow = true;
    strake.receiveShadow = true;
    pylon.add(strake);

    const wingBlend = new THREE.Mesh(createPylonWingBlendGeometry(side), fairingWing);
    wingBlend.name = 'pylon_upper_wing_blend';
    wingBlend.castShadow = true;
    wingBlend.receiveShadow = true;
    pylon.add(wingBlend);

    const nacelleBlend = new THREE.Mesh(createPylonNacelleBlendGeometry(side), fairingWhite);
    nacelleBlend.name = 'pylon_lower_nacelle_blend';
    nacelleBlend.castShadow = true;
    nacelleBlend.receiveShadow = true;
    pylon.add(nacelleBlend);
    return pylon;
  }

  function createVerticalTail() {
    const stations = [
      { y: 1.18, le: 12.1, te: 17.65, th: 0.72 },
      { y: 1.8, le: 12.35, te: 17.45, th: 0.58 },
      { y: 3.25, le: 13.05, te: 17.25, th: 0.44 },
      { y: 5.3, le: 14.05, te: 17.0, th: 0.29 },
      { y: 7.1, le: 15.0, te: 16.82, th: 0.16 },
      { y: 7.65, le: 15.42, te: 16.72, th: 0.08 }
    ];
    const mesh = new THREE.Mesh(createVerticalAirfoilGeometry(stations), deepBlue);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function createRudderSurface() {
    const stations = [
      { y: 1.45, le: 0.0, te: 0.92, th: 0.08 },
      { y: 3.8, le: 0.02, te: 0.62, th: 0.065 },
      { y: 6.95, le: 0.0, te: 0.26, th: 0.04 }
    ];
    const mesh = new THREE.Mesh(createVerticalAirfoilGeometry(stations), deepBlue);
    mesh.name = 'curved_rudder_skin';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function createTailplane(side) {
    const tail = new THREE.Group();
    tail.name = `horizontal_stabilizer_continuous_${side < 0 ? 'left' : 'right'}`;

    const stabilizer = new THREE.Mesh(createTailplaneGeometry(side), wingMaterial);
    stabilizer.name = 'airfoil_tailplane_skin';
    stabilizer.castShadow = true;
    stabilizer.receiveShadow = true;
    tail.add(stabilizer);

    const rootFairing = new THREE.Mesh(createTailplaneRootFairingGeometry(side), fairingWhite);
    rootFairing.name = 'horizontal_tail_root_fillet';
    rootFairing.castShadow = true;
    rootFairing.receiveShadow = true;
    tail.add(rootFairing);
    return tail;
  }

  function createElevatorSurface(side) {
    const stations = [
      { x: 0.75, le: 0.0, te: 0.84, y: 0.0, th: 0.075, twist: -0.02 },
      { x: 3.6, le: 0.02, te: 0.7, y: -0.02, th: 0.062, twist: -0.02 },
      { x: 5.85, le: 0.02, te: 0.52, y: -0.045, th: 0.04, twist: -0.03 }
    ];
    const geometry = createClosedLoftGeometry(stations, station => (
      airfoilProfile.map(point => airfoilSectionPoint(side, station, point))
    ));
    const mesh = new THREE.Mesh(geometry, metal);
    mesh.name = `curved_elevator_${side < 0 ? 'left' : 'right'}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function createAirfoilProfile(steps = 18) {
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const thickness = Math.pow(Math.sin(Math.PI * t), 0.58) * (1 - 0.18 * t);
      const camber = 0.075 * Math.sin(Math.PI * t) * (1 - 0.35 * t);
      points.push({ t, h: camber + thickness * 0.5 });
    }
    for (let i = steps - 1; i > 0; i--) {
      const t = i / steps;
      const thickness = Math.pow(Math.sin(Math.PI * t), 0.58) * (1 - 0.12 * t);
      const camber = 0.075 * Math.sin(Math.PI * t) * (1 - 0.35 * t);
      points.push({ t, h: camber - thickness * 0.38 });
    }
    return points;
  }

  function getWingStations() {
    return [
      { x: 0.82, le: -4.95, te: 4.35, y: -0.48, th: 0.78, twist: -0.03 },
      { x: 1.55, le: -4.66, te: 4.23, y: -0.42, th: 0.72, twist: -0.025 },
      { x: 2.45, le: -4.32, te: 4.08, y: -0.34, th: 0.64, twist: -0.015 },
      { x: 4.8, le: -3.82, te: 3.78, y: -0.18, th: 0.53, twist: -0.025 },
      { x: 8.6, le: -3.14, te: 3.3, y: 0.06, th: 0.42, twist: -0.045 },
      { x: 12.3, le: -2.38, te: 2.78, y: 0.31, th: 0.3, twist: -0.07 },
      { x: 15.5, le: -1.68, te: 2.22, y: 0.52, th: 0.21, twist: -0.09 },
      { x: 17.1, le: -1.34, te: 1.92, y: 0.66, th: 0.16, twist: -0.11 }
    ];
  }

  function wingStationAtSpan(spanM) {
    const stations = getWingStations();
    if (spanM <= stations[0].x) return { ...stations[0], x: spanM };
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i];
      const b = stations[i + 1];
      if (spanM >= a.x && spanM <= b.x) {
        const t = (spanM - a.x) / (b.x - a.x);
        return interpolateStation(a, b, t, spanM);
      }
    }
    return { ...stations[stations.length - 1], x: spanM };
  }

  function interpolateStation(a, b, t, x = THREE.MathUtils.lerp(a.x, b.x, t)) {
    return {
      x,
      le: THREE.MathUtils.lerp(a.le, b.le, t),
      te: THREE.MathUtils.lerp(a.te, b.te, t),
      y: THREE.MathUtils.lerp(a.y, b.y, t),
      th: THREE.MathUtils.lerp(a.th, b.th, t),
      twist: THREE.MathUtils.lerp(a.twist || 0, b.twist || 0, t)
    };
  }

  function airfoilSectionPoint(side, station, point) {
    const chord = station.te - station.le;
    const quarter = station.le + chord * 0.25;
    const zRel = chord * (point.t - 0.25);
    const yRel = point.h * station.th;
    const twist = station.twist || 0;
    const y = station.y + yRel * Math.cos(twist) - zRel * Math.sin(twist);
    const z = quarter + zRel * Math.cos(twist) + yRel * Math.sin(twist);
    return [side * station.x * U, y * U, z * U];
  }

  function createWingBodyBlendGeometry(side, lower) {
    const chordSegments = parked ? 18 : 30;
    const crossSegments = parked ? 8 : 12;
    return createGridGeometry(chordSegments, crossSegments, (v, u) => {
      const chordT = v;
      const spanT = smootherStep(0, 1, u);
      const chordBell = Math.pow(Math.sin(Math.PI * chordT), 0.52);
      const z = THREE.MathUtils.lerp(-4.9, 4.58, chordT);
      const innerSpan = 1.1 + 0.22 * chordBell;
      const outerSpan = lower ? 3.55 + 0.2 * chordBell : 4.08 - 0.3 * Math.abs(chordT - 0.5);
      const span = THREE.MathUtils.lerp(innerSpan, outerSpan, spanT);
      const wing = wingStationAtSpan(span);
      const bodyY = lower ? -1.14 + 0.08 * chordBell : -0.79 + 0.18 * chordBell;
      const wingY = wing.y + (lower ? -0.2 : 0.02);
      const filletBulge = Math.sin(Math.PI * spanT) * chordBell * (lower ? -0.11 : 0.17);
      const y = THREE.MathUtils.lerp(bodyY, wingY, spanT) + filletBulge;
      return [side * span * U, y * U, z * U];
    });
  }

  function createBellyFairingGeometry() {
    const radial = parked ? 28 : 40;
    const sections = [
      { z: -5.35, rx: 0.08, ry: 0.025, cy: -1.1 },
      { z: -4.65, rx: 0.7, ry: 0.18, cy: -1.18 },
      { z: -3.1, rx: 1.55, ry: 0.34, cy: -1.25 },
      { z: -0.7, rx: 2.08, ry: 0.48, cy: -1.3 },
      { z: 1.55, rx: 1.78, ry: 0.42, cy: -1.26 },
      { z: 3.35, rx: 1.05, ry: 0.26, cy: -1.18 },