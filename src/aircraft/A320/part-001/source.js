import * as THREE from '../../three.module.min.js?v=202605050057';
import { PLAYER_AIRCRAFT_SCALE } from '../data/worldData.js?v=202605070100';
import { A320NEO_CONFIG } from '../simulation/aircraftConfig.js?v=202605061100';

// A320neo dimensional frame. One real metre is converted into the game's visual unit.
// The model origin is close to the fuselage centreline; +Z is aft, -Z is nose.
const U = 1.62;
const LENGTH_M = A320NEO_CONFIG.dimensions.lengthM;
const WINGSPAN_M = A320NEO_CONFIG.dimensions.wingspanM;
const HEIGHT_M = A320NEO_CONFIG.dimensions.heightM;
const FUSELAGE_WIDTH_M = 3.95;
const TRACK_M = 7.59;
const WHEELBASE_M = 12.64;
const FUSELAGE_CENTER_ABOVE_GROUND_M = 4.06;
const GROUND_Y = -FUSELAGE_CENTER_ABOVE_GROUND_M * U;
const HALF_LENGTH = LENGTH_M * 0.5 * U;
const HALF_SPAN = WINGSPAN_M * 0.5 * U;
const HALF_BODY_WIDTH = FUSELAGE_WIDTH_M * 0.5 * U;
const WING_TIP_X = 17.1 * U;
const SHARKLET_TIP_X = HALF_SPAN;

export function createAircraft() {
  return createA320NeoModel({
    scale: PLAYER_AIRCRAFT_SCALE,
    bodyColor: 0xf7f9fb,
    accentColor: 0x1f73b7,
    tailColor: 0x0f3e72,
    interactive: true
  });
}

export function createParkedAircraft(parent, x, z, rotation, scale, color) {
  const parkedScale = scale * 0.72;
  const model = createA320NeoModel({
    scale: parkedScale,
    bodyColor: color,
    accentColor: 0x316fa8,
    tailColor: 0x0f3e72,
    interactive: false,
    parked: true
  });
  model.group.position.set(x, 5.8 * parkedScale + 0.82, z);
  model.group.rotation.y = rotation;
  parent.add(model.group);
}

function createA320NeoModel({
  scale = 1,
  bodyColor = 0xf7f9fb,
  accentColor = 0x1f73b7,
  tailColor = 0x0f3e72,
  parked = false
} = {}) {
  const group = new THREE.Group();
  group.name = 'Airbus_A320neo_real_proportion';
  group.rotation.order = 'YXZ';
  group.scale.setScalar(scale);

  const white = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.36, metalness: 0.12 });
  const airbusBlue = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.34, metalness: 0.1 });
  const deepBlue = new THREE.MeshStandardMaterial({ color: tailColor, roughness: 0.4, metalness: 0.08, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.5, metalness: 0.14, side: THREE.DoubleSide });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0f12, roughness: 0.68, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9c2c9, roughness: 0.34, metalness: 0.34, side: THREE.DoubleSide });
  const panel = new THREE.MeshStandardMaterial({ color: 0xe1e8ec, roughness: 0.5, metalness: 0.08, side: THREE.DoubleSide });
  const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.38, metalness: 0.18, side: THREE.DoubleSide });
  const fairingWhite = white.clone();
  fairingWhite.side = THREE.DoubleSide;
  const fairingWing = wingMaterial.clone();
  fairingWing.side = THREE.DoubleSide;
  const glass = new THREE.MeshStandardMaterial({
    color: 0x122f46,
    roughness: 0.18,
    metalness: 0.08,
    emissive: 0x061522,
    emissiveIntensity: 0.2,
    side: THREE.DoubleSide
  });
  const windshield = new THREE.MeshStandardMaterial({
    color: 0x0b2234,
    roughness: 0.14,
    metalness: 0.08,
    emissive: 0x061522,
    emissiveIntensity: 0.24,
    side: THREE.DoubleSide
  });
  const red = new THREE.MeshStandardMaterial({ color: 0xd34655, roughness: 0.42, metalness: 0.08 });
  const greenLight = new THREE.MeshStandardMaterial({ color: 0x5bff9a, emissive: 0x31e778, emissiveIntensity: parked ? 0.55 : 1.7 });
  const redLight = new THREE.MeshStandardMaterial({ color: 0xff4c61, emissive: 0xff3048, emissiveIntensity: parked ? 0.55 : 1.7 });
  const warmLight = new THREE.MeshStandardMaterial({ color: 0xfff0b4, emissive: 0xffd36a, emissiveIntensity: parked ? 0.45 : 1.8 });

  const ailerons = [];
  let elevator = null;
  let rudder = null;
  let fans = [];
  const highLiftSurfaces = {
    flaps: [],
    slats: [],
    speedBrakeSpoilers: [],
    groundSpoilers: []
  };
  const airfoilProfile = createAirfoilProfile(22);

  addReferenceFrameMetadata();
  addFuselage();
  addCockpitWindows();
  addCabinWindowsAndDoors();
  addWingAssembly();
  addTailAssembly();
  addEngines();
  addLandingGear();
  addLightsAndAntennae();

  return {
    group,
    fans,
    controlSurfaces: {
      aileronLeft: ailerons[0],
      aileronRight: ailerons[1],
      elevator,
      rudder
    },
    highLiftSurfaces
  };

  function addReferenceFrameMetadata() {
    group.userData.reference = {
      type: 'Airbus A320neo',
      lengthM: LENGTH_M,
      wingspanM: WINGSPAN_M,
      heightM: HEIGHT_M,
      fuselageWidthM: FUSELAGE_WIDTH_M,
      trackM: TRACK_M,
      wheelbaseM: WHEELBASE_M,
      unitsPerMeter: U
    };
  }

  function addFuselage() {
    const fuselage = new THREE.Mesh(createFuselageGeometry(), white);
    fuselage.name = 'fuselage_real_a320neo';
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    group.add(fuselage);

    const radomeLine = new THREE.Mesh(new THREE.TorusGeometry(1.34 * U, 0.012 * U, 6, 72), panel);
    radomeLine.name = 'radome_panel_line';
    radomeLine.rotation.y = Math.PI / 2;
    radomeLine.scale.y = 0.78;
    radomeLine.position.set(0, 0.18 * U, -16.98 * U);
    group.add(radomeLine);

    const apu = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * U, 0.13 * U, 0.42 * U, 18), dark);
    apu.name = 'apu_tailpipe';
    apu.rotation.x = Math.PI / 2;
    apu.position.set(0, -0.1 * U, HALF_LENGTH - 0.18 * U);
    group.add(apu);
  }

  function addCockpitWindows() {
    const cockpit = new THREE.Group();
    cockpit.name = 'a320_family_cockpit_windows';

    const panes = [
      [
        [-0.76, 1.06, -17.28],
        [-0.1, 1.09, -17.36],
        [-0.12, 1.55, -16.8],
        [-0.82, 1.48, -16.58]
      ],
      [
        [0.1, 1.09, -17.36],
        [0.76, 1.06, -17.28],
        [0.82, 1.48, -16.58],
        [0.12, 1.55, -16.8]
      ],
      [
        [-0.83, 1.03, -17.02],
        [-1.27, 0.98, -16.62],
        [-1.14, 1.44, -15.98],
        [-0.75, 1.5, -16.45]
      ],
      [
        [0.83, 1.03, -17.02],
        [1.27, 0.98, -16.62],
        [1.14, 1.44, -15.98],
        [0.75, 1.5, -16.45]
      ],
      [
        [-1.31, 0.98, -16.42],
        [-1.5, 0.93, -15.78],
        [-1.28, 1.34, -15.18],
        [-1.07, 1.43, -15.78]
      ],
      [
        [1.31, 0.98, -16.42],
        [1.5, 0.93, -15.78],
        [1.28, 1.34, -15.18],
        [1.07, 1.43, -15.78]
      ]
    ];

    for (const pane of panes) {
      const mesh = createCurvedCockpitPane(pane, windshield);
      mesh.name = 'cockpit_window_pane';
      cockpit.add(mesh);
    }

    addWindowPost(cockpit, [0, 1.26, -17.08], [0, 1.56, -16.76], 0.036, dark);
    addWindowPost(cockpit, [-0.76, 1.18, -16.72], [-0.74, 1.52, -16.46], 0.026, dark);
    addWindowPost(cockpit, [0.76, 1.18, -16.72], [0.74, 1.52, -16.46], 0.026, dark);

    group.add(cockpit);
  }

  function addCabinWindowsAndDoors() {
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? 'left' : 'right';
      const sideX = side * (HALF_BODY_WIDTH + 0.012 * U);

      const cheatline = new THREE.Mesh(new THREE.BoxGeometry(0.035 * U, 0.12 * U, 24.8 * U), airbusBlue);
      cheatline.name = `cheatline_${sideName}`;
      cheatline.position.set(sideX, 0.15 * U, -0.7 * U);
      group.add(cheatline);

      const lowerStripe = new THREE.Mesh(new THREE.BoxGeometry(0.035 * U, 0.08 * U, 18.6 * U), deepBlue);
      lowerStripe.name = `lower_livery_stripe_${sideName}`;
      lowerStripe.position.set(sideX + side * 0.012 * U, -0.42 * U, 2.2 * U);
      group.add(lowerStripe);

      addDoor(side, -13.25, 'forward_main_door');
      addDoor(side, 13.05, 'aft_main_door');
      addDoor(side, -1.0, 'overwing_exit_forward', 0.62, 0.92);
      addDoor(side, 0.72, 'overwing_exit_aft', 0.62, 0.92);

      const windows = 28;
      for (let i = 0; i < windows; i++) {
        const z = -11.7 + i * 0.86;
        if (Math.abs(z + 1.0) < 0.62 || Math.abs(z - 0.72) < 0.62) continue;
        if (z > 12.1) break;
        const window = new THREE.Mesh(new THREE.CircleGeometry(0.12 * U, 18), glass);
        window.name = `cabin_window_${sideName}`;
        window.scale.set(1.0, 0.72, 1);
        window.rotation.y = side * Math.PI / 2;
        window.position.set(sideX, 0.86 * U, z * U);
        group.add(window);
      }
    }
  }

  function addDoor(side, zM, name, widthM = 0.48, heightM = 1.28) {
    const sideX = side * (HALF_BODY_WIDTH + 0.018 * U);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(widthM * U, heightM * U), panel);
    door.name = `${name}_${side < 0 ? 'left' : 'right'}`;
    door.rotation.y = side * Math.PI / 2;
    door.position.set(sideX, 0.03 * U, zM * U);
    group.add(door);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045 * U, 0.035 * U, 0.12 * U), dark);
    handle.name = `${name}_handle_${side < 0 ? 'left' : 'right'}`;
    handle.position.set(sideX + side * 0.024 * U, 0.08 * U, (zM - 0.13) * U);
    group.add(handle);
  }

  function addWingAssembly() {
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? 'left' : 'right';
      const wing = new THREE.Mesh(createWingGeometry(side), wingMaterial);
      wing.name = `real_airfoil_wing_${sideName}`;
      wing.castShadow = true;
      wing.receiveShadow = true;
      group.add(wing);

      group.add(createWingRootFairing(side));
      group.add(createSpoilerPanels(side));
      const highLift = createHighLiftDeviceSet(side, { metal, panel, wingMaterial });
      group.add(highLift.group);
      highLiftSurfaces.slats.push(...highLift.slats);
      highLiftSurfaces.speedBrakeSpoilers.push(...highLift.speedBrakeSpoilers);
      highLiftSurfaces.groundSpoilers.push(...highLift.groundSpoilers);

      const flap = createTrailingControlSurface(side, 3.4, 11.7, 0.56, 0.085, metal, 'flap');
      flap.userData.highLift = {
        basePosition: flap.position.clone(),
        slideZ: 0.56 * U,
        dropY: -0.14 * U,
        angle: 0.48,
        kind: 'flap'
      };
      group.add(flap);
      highLiftSurfaces.flaps.push(flap);

      const aileron = createTrailingControlSurface(side, 12.0, 16.7, 0.48, 0.075, metal, 'aileron');
      group.add(aileron);
      ailerons.push(aileron);

      group.add(createSharklet(side));
    }
    group.add(createCenterBellyFairing());
  }

  function addTailAssembly() {
    const verticalTail = createVerticalTail();
    verticalTail.name = 'real_a320neo_vertical_tail';
    group.add(verticalTail);

    rudder = new THREE.Group();
    rudder.name = 'rudder';
    rudder.position.set(0, 0, 16.78 * U);
    rudder.add(createRudderSurface());
    group.add(rudder);

    for (const side of [-1, 1]) {
      const sideName = side < 0 ? 'left' : 'right';
      const stabilizer = createTailplane(side);
      stabilizer.name = `horizontal_stabilizer_${sideName}`;
      group.add(stabilizer);
    }

    elevator = new THREE.Group();
    elevator.name = 'elevators';
    elevator.position.set(0, 2.36 * U, 16.35 * U);
    for (const side of [-1, 1]) {
      elevator.add(createElevatorSurface(side));
    }
    group.add(elevator);

    const dorsal = new THREE.Mesh(createVerticalTailRootFairingGeometry(), fairingWhite);
    dorsal.name = 'continuous_tail_dorsal_fairing';
    dorsal.castShadow = true;
    dorsal.receiveShadow = true;
    group.add(dorsal);
  }

  function addEngines() {
    fans = [];
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? 'left' : 'right';
      const engineX = side * 6.15 * U;
      const engineY = -2.55 * U;
      const engineZ = -2.55 * U;

      const nacelle = new THREE.Mesh(createNacelleGeometry(), white);
      nacelle.name = `neo_large_bypass_nacelle_${sideName}`;
      nacelle.position.set(engineX, engineY, engineZ);
      nacelle.castShadow = true;
      nacelle.receiveShadow = true;
      group.add(nacelle);

      const lip = new THREE.Mesh(new THREE.TorusGeometry(1.23 * U, 0.105 * U, 14, 60), panel);
      lip.name = `rounded_intake_lip_${sideName}`;
      lip.scale.y = 0.92;
      lip.position.set(engineX, engineY, engineZ - 2.05 * U);
      group.add(lip);

      const fan = new THREE.Group();
      fan.name = `engine_fan_${sideName}`;
      fan.position.set(engineX, engineY, engineZ - 2.08 * U);
      const intakeDisc = new THREE.Mesh(new THREE.CircleGeometry(1.06 * U, 48), dark);
      intakeDisc.name = `intake_shadow_${sideName}`;
      intakeDisc.scale.y = 0.9;
      fan.add(intakeDisc);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * U, 0.17 * U, 0.06 * U, 18), metal);
      hub.rotation.x = Math.PI / 2;
      fan.add(hub);

      for (let i = 0; i < 16; i++) {
        const bladeGeometry = new THREE.BoxGeometry(0.055 * U, 0.78 * U, 0.022 * U);
        bladeGeometry.translate(0, 0.35 * U, 0);
        const blade = new THREE.Mesh(bladeGeometry, metal);
        blade.name = `fan_blade_${sideName}`;
        blade.rotation.z = i * Math.PI / 8 + 0.16;
        fan.add(blade);
      }
      group.add(fan);
      fans.push(fan);

      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.58 * U, 0.75 * U, 0.52 * U, 36), dark);
      exhaust.name = `engine_exhaust_nozzle_${sideName}`;
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(engineX, engineY, engineZ + 1.95 * U);
      group.add(exhaust);

      const coreCone = new THREE.Mesh(new THREE.ConeGeometry(0.48 * U, 1.0 * U, 30), metal);
      coreCone.name = `engine_core_cone_${sideName}`;
      coreCone.rotation.x = -Math.PI / 2;
      coreCone.position.set(engineX, engineY, engineZ + 1.65 * U);
      group.add(coreCone);

      group.add(createPylon(side));
    }
  }

  function addLandingGear() {
    const mainZ = -0.05 * U;
    const mainWheelX = TRACK_M * 0.5 * U;
    const mainWheelCenterY = GROUND_Y + 0.48 * U;

    for (const side of [-1, 1]) {
      const gear = new THREE.Group();
      gear.name = `main_landing_gear_${side < 0 ? 'left' : 'right'}`;
      const bogieX = side * mainWheelX;
      for (const xOffset of [-0.28, 0.28]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.48 * U, 0.48 * U, 0.26 * U, 22), tireMaterial);
        tire.name = 'main_gear_tire';
        tire.rotation.z = Math.PI / 2;
        tire.position.set(bogieX + side * xOffset * U, mainWheelCenterY, mainZ);
        tire.castShadow = true;
        gear.add(tire);

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.21 * U, 0.21 * U, 0.275 * U, 16), metal);
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(tire.position);
        gear.add(hub);
      }

      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * U, 0.055 * U, 0.92 * U, 12), metal);
      axle.name = 'main_gear_axle';
      axle.rotation.z = Math.PI / 2;
      axle.position.set(bogieX, mainWheelCenterY, mainZ);
      gear.add(axle);

      const mainStrutBottom = new THREE.Vector3(bogieX, mainWheelCenterY + 0.18 * U, mainZ);
      const mainStrutTop = new THREE.Vector3(bogieX, -0.82 * U, mainZ);
      const braceJoin = new THREE.Vector3(bogieX, -2.86 * U, mainZ);
      const fuselageBraceSocket = new THREE.Vector3(side * 2.08 * U, -1.08 * U, -0.34 * U);
      addStrut(mainStrutBottom, mainStrutTop, metal, 0.065 * U, gear);
      addStrut(braceJoin, fuselageBraceSocket, metal, 0.042 * U, gear);

      const door = new THREE.Mesh(createOvalGearDoorGeometry({
        center: new THREE.Vector3(side * 4.45 * U, -2.24 * U, -0.02 * U),
        radiusY: 0.42 * U,
        radiusZ: 0.86 * U,
        normalSide: side,
        bow: 0.045 * U,
        sweep: -0.08 * U
      }), panel);
      door.name = 'main_gear_rounded_oval_door';
      gear.add(door);
      group.add(gear);
