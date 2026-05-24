import * as THREE from '../../three.module.min.js?v=202605050057';
import { createParkedAircraft } from '../aircraft/A320.js?v=202605061100';
import { AIRPORTS, FOREST_CLUSTERS, ISLANDS, MOUNTAINS } from '../data/worldData.js?v=202605070100';
import {
  airportWorld,
  liftSurfaceMaterial,
  markGroundPlacement,
  waterBodyNormalized
} from './spatial.js?v=202605056000';

let airportLightSpriteTexture = null;
let hiddenUfoDetailTexture = null;

const AIRPORT_LIGHT_PROFILES = Object.freeze({
  A: {
    edgeSpacing: 60,
    thresholdCount: 14,
    edgeYellowEndMeters: 600,
    centerline: true,
    touchdown: true,
    approachLength: 900,
    approachCrossbarSpacing: 150,
    taxiEdgeSpacing: 30,
    taxiCenterline: true,
    stopBarCount: 9,
    apronMastSpacing: 78,
    apronMastMin: 12,
    apronMastMax: 24,
    standCount: 20,
    standLightsPerStand: 2,
    windowLitRatio: 0.82,
    facadeLightSpacing: 28,
    roadLightSpacing: 24,
    apronMastHeight: 48,
    papiDistance: 235,
    papiSideOffset: 23
  },
  B: {
    edgeSpacing: 70,
    thresholdCount: 12,
    edgeYellowEndMeters: 0,
    centerline: true,
    touchdown: false,
    approachLength: 600,
    approachCrossbarSpacing: 150,
    taxiEdgeSpacing: 40,
    taxiCenterline: true,
    stopBarCount: 7,
    apronMastSpacing: 92,
    apronMastMin: 6,
    apronMastMax: 14,
    standCount: 10,
    standLightsPerStand: 1,
    windowLitRatio: 0.72,
    facadeLightSpacing: 34,
    roadLightSpacing: 30,
    apronMastHeight: 40,
    papiDistance: 210,
    papiSideOffset: 20
  },
  C: {
    edgeSpacing: 85,
    thresholdCount: 8,
    edgeYellowEndMeters: 0,
    centerline: false,
    touchdown: false,
    approachLength: 300,
    approachCrossbarSpacing: 150,
    taxiEdgeSpacing: 50,
    taxiCenterline: false,
    stopBarCount: 5,
    apronMastSpacing: 115,
    apronMastMin: 2,
    apronMastMax: 6,
    standCount: 4,
    standLightsPerStand: 1,
    windowLitRatio: 0.62,
    facadeLightSpacing: 28,
    roadLightSpacing: 34,
    apronMastHeight: 30,
    papiDistance: 170,
    papiSideOffset: 17
  }
});

const AIRPORT_LIGHT_COLORS = Object.freeze({
  runwayWhite: 0xf3fbff,
  runwayYellow: 0xffd85c,
  thresholdGreen: 0x34ff80,
  runwayRed: 0xff3348,
  taxiBlue: 0x2f72ff,
  taxiGreen: 0x40ff82,
  papiWhite: 0xffffff,
  papiRed: 0xff2638,
  apronWarm: 0xffdf9b,
  terminalWindow: 0xffefbf,
  facadeWarm: 0xffd78a,
  roadWarm: 0xffc778,
  towerRed: 0xff2438
});

const RUNWAY_SURFACE_Y = 0.5;
const RUNWAY_MARKING_Y = RUNWAY_SURFACE_Y + 0.015;
const AIRPORT_GROUP_GROUND_OFFSET = 0.58;
const AIRPORT_NIGHT_VISIBILITY_METERS = Object.freeze({
  runway: 50000,
  approach: 30000,
  taxi: 18000,
  apron: 15000,
  building: 15000,
  road: 12000
});

export function createAirportSystem({ scene, terrainHeight, getRenderQuality = () => null }) {
  const createdAirports = new Map();
  let priorityLoadingEnabled = false;
  let lastPriorityLoadReport = null;

  function createAirport(airport, options = {}) {
    const key = airportKey(airport);
    const existing = createdAirports.get(key);
    if (existing) {
      applyAirportLoadPriority(existing, options);
      return existing.group;
    }

    const size = airport.size || 1;
    const runwayLength = airport.runwayLength || 1320 * size;
    const runwayWidth = airport.runwayWidth || 98 * Math.max(0.86, size);
    const runwayHalf = runwayLength / 2;
    const taxiX = runwayWidth * 1.18 + 70 * size;
    const taxiZ = runwayLength * 0.08;
    const taxiLength = Math.max(430 * size, runwayLength * 0.45);
    const apronW = airport.apronWidth || 420 * size;
    const apronD = airport.apronDepth || 310 * size;
    const apronX = taxiX + apronW * 0.45;
    const apronZ = runwayLength * 0.16;
    const layout = { size, runwayLength, runwayWidth, taxiX, taxiZ, taxiLength, apronX, apronZ, apronW, apronD };
    const airportPlacement = airportGroundPlacement(airport, layout);
    const unlitAirstrip = isUnlitAirstrip(airport);
    const group = new THREE.Group();
    group.name = `airport-${airport.short || airport.name || 'field'}`;
    group.position.set(airport.x, airportPlacement.objectY, airport.z);
    group.rotation.y = airport.heading;
    group.userData.longRangeVisual = true;
    group.userData.renderTier = 'airport-core';
    group.userData.diagnosticType = 'chunk';
    group.userData.diagnosticCount = 1;
    group.userData.airportFacility = true;
    group.userData.airportName = airport.name;
    group.userData.airportTier = airport.tier || 'local';
    group.userData.airportNightPriority = 1;
    group.userData.airportGroundY = airportPlacement.groundY;
    group.userData.airportPriorityReason = options.priorityReason || 'startup';
    markGroundPlacement(group, airportPlacement, {
      category: 'airportFacility',
      name: `${airport.name || 'airport'} ground plane`,
      reference: 'airport-flattened-pavement'
    });
    scene.add(group);
    const airportRecord = { airport, group, layout, placement: airportPlacement, priorityReason: options.priorityReason || 'startup' };
    createdAirports.set(key, airportRecord);
    const airportClass = airportLightClass(airport);
    const lightProfile = AIRPORT_LIGHT_PROFILES[airportClass];
    const denseAirport = getRenderQuality?.()?.denseScenery === true;
  
    createAirportFoundation(group, airport, layout, denseAirport);
  
    const runwayMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: unlitAirstrip ? 0x4a4033 : 0x1d2227, roughness: unlitAirstrip ? 0.94 : 0.78, depthWrite: true }), -24, -24);
    const runway = new THREE.Mesh(new THREE.BoxGeometry(runwayWidth, 1, runwayLength), runwayMaterial);
    runway.receiveShadow = true;
    runway.renderOrder = 32;
    markAirportFacility(group, runway, airport, 'runway-geometry', 1, {
      checked: 1,
      localGroundY: -0.5,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.runway
    });
    group.add(runway);
  
    const stripeMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.42, depthWrite: true }), -28, -28);
    if (denseAirport) {
      createRunwayCenterlineMarkings(group, layout, stripeMaterial);
      createRunwaySpeedReferences(group, layout);
    }
  
    for (const z of [-runwayHalf + 36, runwayHalf - 36]) {
      const threshold = new THREE.Mesh(new THREE.BoxGeometry(runwayWidth * 0.78, 0.18, 6), stripeMaterial);
      threshold.position.set(0, 0.68, z);
      threshold.renderOrder = 35;
      markAirportFacility(group, threshold, airport, 'runway-threshold-marking', 1, {
        checked: 1,
        localGroundY: RUNWAY_MARKING_Y,
        minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.runway
      });
      group.add(threshold);
  
      const number = createRunwayNumber(airport.runway);
      number.position.set(0, 0.72, z > 0 ? z - 54 * size : z + 54 * size);
      number.rotation.x = -Math.PI / 2;
      number.rotation.z = z > 0 ? Math.PI : 0;
      number.scale.setScalar(Math.max(0.82, size));
      group.add(number);
    }
  
    const taxiMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: unlitAirstrip ? 0x5a503f : 0x3b4145, roughness: unlitAirstrip ? 0.94 : 0.82, depthWrite: true }), -24, -24);
    const taxiway = new THREE.Mesh(new THREE.BoxGeometry(Math.max(28, 34 * size), 0.75, taxiLength), taxiMaterial);
    taxiway.position.set(taxiX, 0.3, taxiZ);
    taxiway.receiveShadow = true;
    taxiway.renderOrder = 32;
    markAirportFacility(group, taxiway, airport, 'taxiway', 2, {
      checked: 1,
      localGroundY: -0.08,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.taxi
    });
    group.add(taxiway);
  
    const connector = new THREE.Mesh(new THREE.BoxGeometry(taxiX * 1.12, 0.72, Math.max(30, 36 * size)), taxiMaterial);
    connector.position.set(taxiX * 0.52, 0.34, -runwayLength * 0.16);
    connector.receiveShadow = true;
    connector.renderOrder = 32;
    markAirportFacility(group, connector, airport, 'taxiway-connector', 2, {
      checked: 1,
      localGroundY: -0.02,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.taxi
    });
    group.add(connector);
  
    const apron = new THREE.Mesh(new THREE.BoxGeometry(apronW, 0.8, apronD), taxiMaterial);
    apron.position.set(apronX, 0.35, apronZ);
    apron.receiveShadow = true;
    apron.renderOrder = 32;
    markAirportFacility(group, apron, airport, 'apron', 2, {
      checked: 1,
      localGroundY: -0.05,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.apron
    });
    group.add(apron);
  
    const terminal = {
      x: apronX - apronW * 0.2,
      y: 0.62,
      z: apronZ - apronD * 0.33,
      w: Math.max(96, 142 * size),
      h: Math.max(28, 34 * size),
      d: Math.max(44, 52 * size)
    };
    const concourse = {
      x: apronX + apronW * 0.25,
      y: 0.62,
      z: apronZ + apronD * 0.04,
      w: Math.max(58, 76 * size),
      h: Math.max(24, 28 * size),
      d: Math.max(82, 112 * size)
    };
    const cargo = {
      x: apronX - apronW * 0.38,
      y: 0.62,
      z: apronZ + apronD * 0.34,
      w: Math.max(62, 82 * size),
      h: Math.max(18, 21 * size),
      d: Math.max(42, 54 * size)
    };
    const tower = { x: apronX + apronW * 0.43, z: apronZ - apronD * 0.35, scale: size };
    if (unlitAirstrip) {
      createRemoteAirstripFacilities(group, airport, layout);
    } else {
      addBuilding(group, airport, terminal.x, terminal.y, terminal.z, terminal.w, terminal.h, terminal.d, 0xd8dde2, 'terminal', 2);
      addBuilding(group, airport, concourse.x, concourse.y, concourse.z, concourse.w, concourse.h, concourse.d, 0xa6b4be, 'concourse', 2);
      addBuilding(group, airport, cargo.x, cargo.y, cargo.z, cargo.w, cargo.h, cargo.d, 0xc65f52, 'cargo', 3);
      createTower(group, airport, tower.x, tower.z, tower.scale);
      if (denseAirport) createApronMarkings(group, layout);
      createAirportLighting(group, airport, layout, {
        airportClass,
        profile: lightProfile,
        terminal,
        concourse,
        cargo,
        tower
      });
    }
  
    if (denseAirport && !unlitAirstrip) {
      const parkedCount = airport.tier === 'local' ? 1 : airport.tier === 'special' ? 2 : size > 1.35 ? 5 : 3;
      for (let i = 0; i < parkedCount; i++) {
        const standX = apronX - apronW * 0.34 + (i + 0.5) * (apronW * 0.68 / parkedCount);
        const standZ = apronZ + apronD * (i % 2 === 0 ? -0.02 : 0.18);
        const planeScale = airport.tier === 'local'
          ? Math.max(0.68, size * 0.82)
          : Math.max(0.9, 0.92 + size * 0.32 - i * 0.035);
        const colors = [0xf0f4f8, 0xfff2c2, 0xe6eef7, 0xd9eaf5];
        createParkedAircraft(group, standX, standZ, -Math.PI / 2, planeScale, colors[i % colors.length]);
      }
    }
  }

  function airportGroundPlacement(airport, layout) {
    const samples = [];
    const addLocal = (x, z) => {
      const world = airportWorld(airport, x, z);
      samples.push({ x: world.x, z: world.z, y: terrainHeight(world.x, world.z) });
    };
    const runwayHalf = layout.runwayLength / 2;
    const runwayEdge = layout.runwayWidth / 2;
    for (const z of [-runwayHalf, -runwayHalf * 0.5, 0, runwayHalf * 0.5, runwayHalf]) {
      addLocal(0, z);
      addLocal(-runwayEdge, z);
      addLocal(runwayEdge, z);
    }
    for (const x of [-layout.taxiX, 0, layout.taxiX, layout.apronX]) {
      addLocal(x, layout.taxiZ);
    }
    for (const x of [-0.5, 0, 0.5]) {
      for (const z of [-0.5, 0, 0.5]) {
        addLocal(layout.apronX + x * layout.apronW, layout.apronZ + z * layout.apronD);
      }
    }

    let minH = Infinity;
    let maxH = -Infinity;
    let sum = 0;
    for (const sample of samples) {
      minH = Math.min(minH, sample.y);
      maxH = Math.max(maxH, sample.y);
      sum += sample.y;
    }
    const avgH = sum / Math.max(1, samples.length);
    const groundY = Number.isFinite(airport.elevation) ? airport.elevation : avgH;
    return {
      samples,
      minH,
      maxH,
      avgH,
      slope: maxH - minH,
      tolerance: 0.2,
      mode: 'airport-flat-plane',
      groundY,
      objectY: groundY + AIRPORT_GROUP_GROUND_OFFSET,
      needsFoundation: maxH - minH > 0.2,
      foundationDepth: Math.max(0.35, maxH - minH + 0.3)
    };
  }

  function markAirportFacility(group, object, airport, type, priority, options = {}) {
    object.userData.airportFacility = true;
    object.userData.airportName = airport.name;
    object.userData.airportType = type;
    object.userData.airportNightPriority = priority;
    object.userData.airportRenderPriority = priorityWeight(priority);
    object.userData.minVisibleDistance = options.minVisibleDistance || AIRPORT_NIGHT_VISIBILITY_METERS.apron;
    if (priority <= 2 || options.longRange !== false) {
      object.userData.longRangeVisual = true;
      object.frustumCulled = false;
    }
    if (options.minVisibleDistance) {
      object.userData.stableLod = {
        distance: options.minVisibleDistance,
        hysteresis: 0.42,
        fadeSeconds: 0
      };
    }

    const localGroundY = options.localGroundY ?? 0;
    const groundY = group.userData.airportGroundY ?? terrainHeight(airport.x, airport.z);
    markGroundPlacement(object, {
      minH: groundY,
      maxH: groundY,
      avgH: groundY,
      slope: 0,
      tolerance: 0.2,
      mode: 'airport-flat-plane',
      groundY,
      objectY: group.position.y + localGroundY,
      needsFoundation: false,
      foundationDepth: 0.35
    }, {
      category: 'airportFacility',
      checked: options.checked || 1,
      name: `${airport.short || airport.name} ${type}`,
      reference: options.lightLayer ? 'airport-emissive-light-layer' : 'airport-flattened-pavement'
    });
  }

  function priorityWeight(priority) {
    if (priority <= 1) return 1000;
    if (priority === 2) return 700;
    if (priority === 3) return 420;
    return 100;
  }

  function isUnlitAirstrip(airport) {
    return airport.isNightCapable === false ||
      airport.airportCategory === 'REMOTE_AIRSTRIP' ||
      airport.airportCategory === 'HIDDEN_REMOTE_AIRFIELD' ||
      (
        airport.hasRunwayLights === false &&
        airport.hasTaxiwayLights === false &&
        airport.hasApronLights === false &&
        airport.hasApproachLights === false &&
        airport.hasPAPI === false
      );
  }

  function airportKey(airport) {
    return airport.id || airport.icao || airport.short || airport.name;
  }

  function applyAirportLoadPriority(record, options = {}) {
    if (!record) return;
    const reason = options.priorityReason || record.priorityReason || 'loaded';
    record.priorityReason = reason;
    record.group.userData.airportPriorityReason = reason;
    if (options.target) record.group.userData.targetAirport = true;
  }

  function createAirportFoundation(group, airport, layout, denseAirport = true) {
    const elevation = airport.elevation || 0;
  
    const earth = new THREE.MeshStandardMaterial({ color: 0x756f55, roughness: 0.94, metalness: 0.02, depthWrite: true });
    const rock = new THREE.MeshStandardMaterial({ color: 0x6e736e, roughness: 0.88, metalness: 0.02, depthWrite: true });
    const gravel = new THREE.MeshStandardMaterial({ color: 0x69695b, roughness: 0.96, metalness: 0.01, depthWrite: true });
    const padHeight = elevation > 0
      ? Math.min(22, 6.5 + elevation * 0.055)
      : 4.8;
  
    const runwayShoulder = new THREE.Mesh(
      new THREE.BoxGeometry(layout.runwayWidth + Math.max(54, 72 * layout.size), 0.28, layout.runwayLength + Math.max(64, 84 * layout.size)),
      gravel
    );
    runwayShoulder.position.set(0, -0.08, 0);
    runwayShoulder.receiveShadow = true;
    runwayShoulder.renderOrder = 30;
    markAirportFacility(group, runwayShoulder, airport, 'runway-foundation', 1, {
      checked: 1,
      localGroundY: -0.22,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.runway
    });
    group.add(runwayShoulder);
  
    const taxiShoulder = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(54, 66 * layout.size), 0.24, layout.taxiLength + Math.max(58, 78 * layout.size)),
      gravel
    );
    taxiShoulder.position.set(layout.taxiX, -0.02, layout.taxiZ);
    taxiShoulder.receiveShadow = true;
    taxiShoulder.renderOrder = 30;
    markAirportFacility(group, taxiShoulder, airport, 'taxiway-foundation', 2, {
      checked: 1,
      localGroundY: -0.16,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.taxi
    });
    group.add(taxiShoulder);
  
    const apronShoulder = new THREE.Mesh(
      new THREE.BoxGeometry(layout.apronW + Math.max(46, 58 * layout.size), 0.24, layout.apronD + Math.max(46, 58 * layout.size)),
      gravel
    );
    apronShoulder.position.set(layout.apronX, -0.02, layout.apronZ);
    apronShoulder.receiveShadow = true;
    apronShoulder.renderOrder = 30;
    markAirportFacility(group, apronShoulder, airport, 'apron-foundation', 2, {
      checked: 1,
      localGroundY: -0.16,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.apron
    });
    group.add(apronShoulder);

    if (!denseAirport) return;
  
    const runwayPad = new THREE.Mesh(
      new THREE.BoxGeometry(layout.runwayWidth * 2.45, padHeight, layout.runwayLength + 260),
      earth
    );
    runwayPad.position.set(0, -padHeight / 2 - 0.16, 0);
    runwayPad.receiveShadow = true;
    runwayPad.renderOrder = 29;
    group.add(runwayPad);
  
    const apronPad = new THREE.Mesh(
      new THREE.BoxGeometry(layout.apronW + 210, padHeight * 0.82, layout.apronD + 210),
      earth
    );
    apronPad.position.set(layout.apronX, -padHeight * 0.41 - 0.2, layout.apronZ);
    apronPad.receiveShadow = true;
    apronPad.renderOrder = 29;
    group.add(apronPad);
  
    const taxiPad = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(96, 96 * layout.size), padHeight * 0.72, layout.taxiLength + 180),
      earth
    );
    taxiPad.position.set(layout.taxiX, -padHeight * 0.36 - 0.22, layout.taxiZ);
    taxiPad.receiveShadow = true;
    taxiPad.renderOrder = 29;
    group.add(taxiPad);
  
    for (const z of [-layout.runwayLength / 2 - 150, layout.runwayLength / 2 + 150]) {
      const face = new THREE.Mesh(new THREE.BoxGeometry(layout.runwayWidth * 2.55, padHeight * 0.95, 24), rock);
      face.position.set(0, -padHeight * 0.45 - 0.15, z);
      face.castShadow = false;
      face.receiveShadow = true;
      face.renderOrder = 29;
      group.add(face);
    }
  }

  function createRunwayNumber(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f2f6f8';
    ctx.font = '900 118px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 128);
  
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    material.polygonOffset = true;
    material.polygonOffsetFactor = -36;
    material.polygonOffsetUnits = -36;
    return new THREE.Mesh(new THREE.PlaneGeometry(58, 58), material);
  }

  function createRunwayCenterlineMarkings(group, layout, material) {
    const runwayHalf = layout.runwayLength / 2;
    const dashLength = THREE.MathUtils.clamp(layout.runwayLength / 140, 16, 26);
    const dashGap = THREE.MathUtils.clamp(dashLength * 0.86, 14, 21);
    const dashStep = dashLength + dashGap;
    const endClearance = Math.max(128, 118 * layout.size);
    const minZ = -runwayHalf + endClearance;
    const maxZ = runwayHalf - endClearance;
    const usableLength = Math.max(0, maxZ - minZ);
    const dashCount = Math.max(1, Math.floor((usableLength + dashGap) / dashStep));
    const actualStep = dashCount > 1 ? usableLength / (dashCount - 1) : 0;
    const dashGeometry = new THREE.PlaneGeometry(5.2, dashLength);
    dashGeometry.rotateX(-Math.PI / 2);

    for (let i = 0; i < dashCount; i++) {
      const z = dashCount > 1 ? minZ + i * actualStep : 0;
      const dashStart = z - dashLength / 2;
      const dashEnd = z + dashLength / 2;
      if (dashStart < -runwayHalf + 18 || dashEnd > runwayHalf - 18) continue;

      const stripe = new THREE.Mesh(dashGeometry, material);
      stripe.name = 'runway-centerline-short-dash';
      stripe.position.set(0, RUNWAY_MARKING_Y, z);
      stripe.renderOrder = 36;
      group.add(stripe);
    }
  }

  function createRemoteAirstripFacilities(group, airport, layout) {
    const hiddenAirfield = airport.airportCategory === 'HIDDEN_REMOTE_AIRFIELD';
    const hutMaterial = new THREE.MeshStandardMaterial({ color: 0x9a8765, roughness: 0.92, metalness: 0.01 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x5e4b3a, roughness: 0.94, metalness: 0.0 });
    const apronEdgeX = hiddenAirfield ? layout.apronX - layout.apronW * 0.56 : layout.apronX - layout.apronW * 0.32;
    const hutZ = hiddenAirfield ? layout.apronZ - layout.apronD * 0.62 : layout.apronZ - layout.apronD * 0.24;
    const hutW = hiddenAirfield ? Math.max(18, 24 * layout.size) : Math.max(22, 34 * layout.size);
    const hutH = hiddenAirfield ? Math.max(7, 9 * layout.size) : Math.max(9, 12 * layout.size);
    const hutD = hiddenAirfield ? Math.max(12, 15 * layout.size) : Math.max(14, 18 * layout.size);
    const hut = addBuilding(
      group,
      airport,
      apronEdgeX,
      0.6,
      hutZ,
      hutW,
      hutH,
      hutD,
      0x9a8765,
      'remote-duty-hut',
      4
    );
    hut.material = hutMaterial;

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(18, 25 * layout.size), Math.max(6, 8 * layout.size), 4),
      roofMaterial
    );
    roof.position.set(apronEdgeX, 0.6 + hutH + Math.max(3.4, 4.5 * layout.size), hutZ);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = false;
    roof.receiveShadow = true;
    markAirportFacility(group, roof, airport, 'remote-hut-roof', 4, {
      checked: 1,
      localGroundY: 0.6 + hutH,
      minVisibleDistance: 9000,
      longRange: false
    });
    group.add(roof);

    const windsockPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 9 * layout.size, 7),
      new THREE.MeshStandardMaterial({ color: 0x7d8177, roughness: 0.86 })
    );
    windsockPole.position.set(layout.runwayWidth * 0.72, 4.5 * layout.size, -layout.runwayLength * 0.36);
    markAirportFacility(group, windsockPole, airport, 'unlit-windsock-pole', 4, {
      checked: 1,
      localGroundY: 0,
      minVisibleDistance: 7000,
      longRange: false
    });
    group.add(windsockPole);

    const windsock = new THREE.Mesh(
      new THREE.ConeGeometry(1.1 * layout.size, 5.2 * layout.size, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd85d3d, roughness: 0.72, side: THREE.DoubleSide })
    );
    windsock.position.set(layout.runwayWidth * 0.72 + 2.6 * layout.size, 8.7 * layout.size, -layout.runwayLength * 0.36);
    windsock.rotation.z = Math.PI / 2;
    windsock.rotation.y = -0.24;
    markAirportFacility(group, windsock, airport, 'unlit-windsock', 4, {
      checked: 1,
      localGroundY: 8 * layout.size,
      minVisibleDistance: 7000,
      longRange: false
    });
    group.add(windsock);

    if (hiddenAirfield) {
      const terminalRect = {
        x: apronEdgeX,
        z: hutZ,
        halfX: hutW * 0.5 + 7,
        halfZ: hutD * 0.5 + 7
      };
      createHiddenApronUfos(group, airport, layout, terminalRect);
    }

    group.userData.airportLightSummary = {
      airport: airport.name,
      class: hiddenAirfield ? 'HIDDEN_REMOTE_AIRFIELD' : 'REMOTE_AIRSTRIP',
      runwayEdgeSpacingMeters: 0,
      thresholdLightsPerEnd: 0,
      approachLengthMeters: 0,
      taxiEdgeSpacingMeters: 0,
      apronStandLights: 0,
      runwayVisibleMeters: 0,
      approachVisibleMeters: 0,
      apronVisibleMeters: 0,
      terminalVisibleMeters: 0,
      papiLights: 0,
      noLightAirport: true
    };
  }
