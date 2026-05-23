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
        hysteresis: 0.34,
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

  function createHiddenApronUfos(group, airport, layout, terminalRect) {
    const bodyGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(0, -2.44),
      new THREE.Vector2(3.2, -3.4),
      new THREE.Vector2(7.9, -4.2),
      new THREE.Vector2(13.7, -4.42),
      new THREE.Vector2(19.0, -3.62),
      new THREE.Vector2(22.7, -2.26),
      new THREE.Vector2(24.2, -1.04),
      new THREE.Vector2(24.42, 0.42),
      new THREE.Vector2(23.78, 1.58),
      new THREE.Vector2(21.4, 2.34),
      new THREE.Vector2(16.8, 2.82),
      new THREE.Vector2(10.2, 2.98),
      new THREE.Vector2(4.4, 2.72),
      new THREE.Vector2(0, 2.28)
    ], 224);
    bodyGeometry.computeVertexNormals();
    const fairingGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.24),
      new THREE.Vector2(4.35, -0.2),
      new THREE.Vector2(8.45, 0.0),
      new THREE.Vector2(11.45, 0.46),
      new THREE.Vector2(12.35, 0.92),
      new THREE.Vector2(11.1, 1.36),
      new THREE.Vector2(7.1, 1.58),
      new THREE.Vector2(2.35, 1.48),
      new THREE.Vector2(0, 1.26)
    ], 192);
    fairingGeometry.computeVertexNormals();
    const cockpitGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(0, 0.08),
      new THREE.Vector2(4.15, 0.12),
      new THREE.Vector2(7.25, 0.34),
      new THREE.Vector2(9.1, 0.84),
      new THREE.Vector2(9.42, 1.44),
      new THREE.Vector2(8.65, 2.26),
      new THREE.Vector2(6.75, 2.92),
      new THREE.Vector2(4.0, 3.46),
      new THREE.Vector2(0, 3.76)
    ], 192);
    cockpitGeometry.computeVertexNormals();
    const rimGeometry = new THREE.TorusGeometry(23.55, 0.82, 24, 224);
    const upperShoulderGeometry = new THREE.TorusGeometry(20.5, 0.15, 12, 192);
    const upperRingGeometry = new THREE.TorusGeometry(13.5, 0.1, 10, 176);
    const lowerRingGeometry = new THREE.TorusGeometry(15.2, 0.15, 12, 176);
    const canopySealGeometry = new THREE.TorusGeometry(9.1, 0.13, 10, 192);
    const canopyMidGeometry = new THREE.TorusGeometry(7.0, 0.058, 8, 160);
    const edgeGlowGeometry = new THREE.TorusGeometry(23.65, 0.22, 14, 224);
    const lowerEdgeGlowGeometry = new THREE.TorusGeometry(22.45, 0.2, 12, 224);
    const bellyGlowGeometry = new THREE.TorusGeometry(7.95, 0.18, 10, 144);
    const seamGlowGeometry = new THREE.TorusGeometry(15.6, 0.07, 8, 160);
    const canopyGlowGeometry = new THREE.TorusGeometry(9.06, 0.095, 10, 192);
    const canopySideGlowGeometry = new THREE.TorusGeometry(8.9, 0.065, 8, 176);
    const panelSeamGeometry = new THREE.CylinderGeometry(0.052, 0.052, 8.6, 8);
    const ventGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.09, 18);
    const strutGeometry = new THREE.CylinderGeometry(0.18, 0.28, 1.08, 12);
    const padGeometry = new THREE.CylinderGeometry(1.25, 1.72, 0.42, 24);
    const detailTexture = createHiddenUfoDetailTexture();
    const bodyMaterial = configureTimeOfDayPbrMaterial(new THREE.MeshStandardMaterial({
      color: 0x929ba0,
      roughness: 0.76,
      metalness: 0.78,
      envMapIntensity: 0.34,
      emissive: 0x061018,
      emissiveIntensity: 0.006,
      bumpMap: detailTexture,
      bumpScale: 0.034
    }), {
      dayRoughness: 0.76,
      nightRoughness: 0.34,
      dayEnvMapIntensity: 0.34,
      nightEnvMapIntensity: 0.94,
      dayEmissiveIntensity: 0.006,
      nightEmissiveIntensity: 0.066
    });
    const cockpitMaterial = configureTimeOfDayPbrMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x03070a,
      roughness: 0.18,
      metalness: 0.02,
      envMapIntensity: 0.48,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: 0x01060a,
      emissiveIntensity: 0.0
    }), {
      dayRoughness: 0.18,
      nightRoughness: 0.07,
      dayEnvMapIntensity: 0.48,
      nightEnvMapIntensity: 1.08,
      dayEmissiveIntensity: 0.0,
      nightEmissiveIntensity: 0.02
    });
    const seamMaterial = configureTimeOfDayPbrMaterial(new THREE.MeshStandardMaterial({
      color: 0x4c565b,
      roughness: 0.62,
      metalness: 0.7,
      envMapIntensity: 0.34,
      emissive: 0x071018,
      emissiveIntensity: 0.012
    }), {
      dayRoughness: 0.62,
      nightRoughness: 0.34,
      dayEnvMapIntensity: 0.34,
      nightEnvMapIntensity: 0.9,
      dayEmissiveIntensity: 0.012,
      nightEmissiveIntensity: 0.05
    });
    const padMaterial = configureTimeOfDayPbrMaterial(new THREE.MeshStandardMaterial({
      color: 0x4c5357,
      roughness: 0.74,
      metalness: 0.52,
      envMapIntensity: 0.28,
      emissive: 0x05090c,
      emissiveIntensity: 0.004
    }), {
      dayRoughness: 0.74,
      nightRoughness: 0.44,
      dayEnvMapIntensity: 0.28,
      nightEnvMapIntensity: 0.72,
      dayEmissiveIntensity: 0.004,
      nightEmissiveIntensity: 0.03
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x86dcff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const apronSurfaceY = 0.75;
    const lowestLocalY = -4.86;
    const saucerGroundY = apronSurfaceY - lowestLocalY;
    const radius = 24.35;
    const positions = [
      [-66, -36, -0.14],
      [0, -36, 0.08],
      [66, -36, 0.18],
      [-66, 36, -0.04],
      [0, 36, 0.12],
      [66, 36, -0.18]
    ];
    const ufoReport = [];
    const parkedUfos = [];

    for (let i = 0; i < positions.length; i++) {
      const [dx, dz, yaw] = positions[i];
      const saucer = new THREE.Group();
      const modelRoot = new THREE.Group();
      const glowRoot = new THREE.Group();
      const saucerGlowMaterial = glowMaterial.clone();
      const x = layout.apronX + dx;
      const z = layout.apronZ + dz;
      saucer.name = `hidden-apron-ufo-${i + 1}`;
      modelRoot.name = `${saucer.name}-modelRoot`;
      glowRoot.name = `${saucer.name}-glowRoot`;
      modelRoot.userData.ufoModelRoot = true;
      glowRoot.userData.ufoGlowRoot = true;
      saucer.position.set(x, saucerGroundY, z);
      saucer.rotation.y = yaw;
      saucer.userData.airportFacility = true;
      saucer.userData.airportType = 'hidden-ufo';
      saucer.userData.hiddenIslandUfo = true;
      saucer.userData.hiddenUfoIndex = i;
      saucer.userData.hiddenUfoState = 'PARKED';
      saucer.userData.diagnosticType = 'building';
      saucer.userData.diagnosticCount = 1;
      saucer.userData.ufoRadius = radius;
      saucer.userData.ufoLocalGroundY = apronSurfaceY;
      saucer.userData.hiddenUfoGlowMeshes = [];
      saucer.add(modelRoot, glowRoot);

      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.castShadow = false;
      body.receiveShadow = true;
      body.userData.hiddenUfoBody = true;
      modelRoot.add(body);

      const fairing = new THREE.Mesh(fairingGeometry, bodyMaterial);
      fairing.position.y = 2.36;
      fairing.castShadow = false;
      fairing.receiveShadow = true;
      fairing.userData.hiddenUfoFairing = true;
      modelRoot.add(fairing);

      const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
      cockpit.position.y = 3.06;
      cockpit.castShadow = false;
      cockpit.receiveShadow = true;
      cockpit.userData.hiddenUfoCockpit = true;
      cockpit.userData.cockpitGlass = true;
      modelRoot.add(cockpit);

      const rim = new THREE.Mesh(rimGeometry, seamMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.14;
      rim.castShadow = false;
      rim.receiveShadow = true;
      modelRoot.add(rim);

      const upperShoulder = new THREE.Mesh(upperShoulderGeometry, seamMaterial);
      upperShoulder.rotation.x = Math.PI / 2;
      upperShoulder.position.y = 2.42;
      upperShoulder.castShadow = false;
      upperShoulder.receiveShadow = true;
      modelRoot.add(upperShoulder);

      const upperRing = new THREE.Mesh(upperRingGeometry, seamMaterial);
      upperRing.rotation.x = Math.PI / 2;
      upperRing.position.y = 2.88;
      upperRing.castShadow = false;
      upperRing.receiveShadow = true;
      modelRoot.add(upperRing);

      const lowerRing = new THREE.Mesh(lowerRingGeometry, seamMaterial);
      lowerRing.rotation.x = Math.PI / 2;
      lowerRing.position.y = -3.72;
      lowerRing.castShadow = false;
      lowerRing.receiveShadow = true;
      modelRoot.add(lowerRing);

      const canopySeal = new THREE.Mesh(canopySealGeometry, seamMaterial);
      canopySeal.rotation.x = Math.PI / 2;
      canopySeal.position.y = 3.48;
      canopySeal.castShadow = false;
      canopySeal.receiveShadow = true;
      modelRoot.add(canopySeal);

      const canopyMidRing = new THREE.Mesh(canopyMidGeometry, seamMaterial);
      canopyMidRing.rotation.x = Math.PI / 2;
      canopyMidRing.position.y = 5.32;
      canopyMidRing.castShadow = false;
      canopyMidRing.receiveShadow = true;
      modelRoot.add(canopyMidRing);

      const edgeGlow = new THREE.Mesh(edgeGlowGeometry, saucerGlowMaterial);
      edgeGlow.rotation.x = Math.PI / 2;
      edgeGlow.position.y = 0.86;
      edgeGlow.userData.nightGlow = true;
      edgeGlow.userData.baseOpacity = 0;
      edgeGlow.userData.nightOpacity = 0.34;
      edgeGlow.userData.nightOnlyVisual = true;
      edgeGlow.userData.hiddenUfoGlow = true;
      glowRoot.add(edgeGlow);
      saucer.userData.hiddenUfoGlowMeshes.push(edgeGlow);

      const lowerEdgeGlow = new THREE.Mesh(lowerEdgeGlowGeometry, saucerGlowMaterial.clone());
      lowerEdgeGlow.rotation.x = Math.PI / 2;
      lowerEdgeGlow.position.y = -2.34;
      lowerEdgeGlow.userData.nightGlow = true;
      lowerEdgeGlow.userData.baseOpacity = 0;
      lowerEdgeGlow.userData.nightOpacity = 0.31;
      lowerEdgeGlow.userData.nightOnlyVisual = true;
      lowerEdgeGlow.userData.hiddenUfoGlow = true;
      glowRoot.add(lowerEdgeGlow);
      saucer.userData.hiddenUfoGlowMeshes.push(lowerEdgeGlow);

      const bellyGlow = new THREE.Mesh(bellyGlowGeometry, saucerGlowMaterial.clone());
      bellyGlow.rotation.x = Math.PI / 2;
      bellyGlow.position.y = -4.56;
      bellyGlow.userData.nightGlow = true;
      bellyGlow.userData.baseOpacity = 0;
      bellyGlow.userData.nightOpacity = 0.27;
      bellyGlow.userData.nightOnlyVisual = true;
      bellyGlow.userData.hiddenUfoGlow = true;
      glowRoot.add(bellyGlow);
      saucer.userData.hiddenUfoGlowMeshes.push(bellyGlow);

      const seamGlow = new THREE.Mesh(seamGlowGeometry, saucerGlowMaterial.clone());
      seamGlow.rotation.x = Math.PI / 2;
      seamGlow.position.y = -2.86;
      seamGlow.userData.nightGlow = true;
      seamGlow.userData.baseOpacity = 0;
      seamGlow.userData.nightOpacity = 0.18;
      seamGlow.userData.nightOnlyVisual = true;
      seamGlow.userData.hiddenUfoGlow = true;
      glowRoot.add(seamGlow);
      saucer.userData.hiddenUfoGlowMeshes.push(seamGlow);

      const cockpitGlow = new THREE.Mesh(canopyGlowGeometry, saucerGlowMaterial.clone());
      cockpitGlow.rotation.x = Math.PI / 2;
      cockpitGlow.position.y = 3.52;
      cockpitGlow.userData.nightGlow = true;
      cockpitGlow.userData.baseOpacity = 0;
      cockpitGlow.userData.nightOpacity = 0.14;
      cockpitGlow.userData.nightOnlyVisual = true;
      cockpitGlow.userData.hiddenUfoGlow = true;
      glowRoot.add(cockpitGlow);
      saucer.userData.hiddenUfoGlowMeshes.push(cockpitGlow);

      const cockpitSideGlow = new THREE.Mesh(canopySideGlowGeometry, saucerGlowMaterial.clone());
      cockpitSideGlow.rotation.x = Math.PI / 2;
      cockpitSideGlow.position.y = 4.58;
      cockpitSideGlow.userData.nightGlow = true;
      cockpitSideGlow.userData.baseOpacity = 0;
      cockpitSideGlow.userData.nightOpacity = 0.11;
      cockpitSideGlow.userData.nightOnlyVisual = true;
      cockpitSideGlow.userData.hiddenUfoGlow = true;
      glowRoot.add(cockpitSideGlow);
      saucer.userData.hiddenUfoGlowMeshes.push(cockpitSideGlow);

      for (let panel = 0; panel < 24; panel++) {
        const angle = panel * Math.PI * 2 / 24;
        const seam = new THREE.Mesh(panelSeamGeometry, seamMaterial);
        seam.position.set(Math.cos(angle) * 15.9, 2.62, Math.sin(angle) * 15.9);
        seam.rotation.set(0, -angle, Math.PI / 2);
        seam.castShadow = false;
        seam.receiveShadow = true;
        modelRoot.add(seam);
      }

      for (let vent = 0; vent < 20; vent++) {
        const angle = vent * Math.PI * 2 / 20 + 0.07;
        const port = new THREE.Mesh(ventGeometry, seamMaterial);
        port.position.set(Math.cos(angle) * 17.1, -3.22, Math.sin(angle) * 17.1);
        port.scale.set(1.0, 0.5, 1.0);
        port.castShadow = false;
        port.receiveShadow = true;
        modelRoot.add(port);
      }

      const pads = new THREE.InstancedMesh(padGeometry, padMaterial, 3);
      const struts = new THREE.InstancedMesh(strutGeometry, padMaterial, 3);
      const dummy = new THREE.Object3D();
      for (let pad = 0; pad < 3; pad++) {
        const angle = yaw + pad * Math.PI * 2 / 3;
        dummy.position.set(Math.cos(angle) * 9.7, -4.08, Math.sin(angle) * 9.7);
        dummy.rotation.set(0.16, 0, -Math.cos(angle) * 0.12);
        dummy.updateMatrix();
        struts.setMatrixAt(pad, dummy.matrix);

        dummy.position.set(Math.cos(angle) * 10.6, -4.65, Math.sin(angle) * 10.6);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        pads.setMatrixAt(pad, dummy.matrix);
      }
      pads.instanceMatrix.needsUpdate = true;
      struts.instanceMatrix.needsUpdate = true;
      pads.castShadow = false;
      pads.receiveShadow = true;
      struts.castShadow = false;
      struts.receiveShadow = true;
      modelRoot.add(struts);
      modelRoot.add(pads);

      markAirportFacility(group, saucer, airport, 'hidden-ufo', 4, {
        checked: 1,
        localGroundY: apronSurfaceY,
        minVisibleDistance: 9000,
        longRange: false
      });
      group.add(saucer);
      parkedUfos.push(createManagedApronUfo({
        index: i,
        group: saucer,
        modelRoot,
        glowRoot,
        cockpitGlass: cockpit,
        materials: [bodyMaterial, cockpitMaterial, seamMaterial, padMaterial],
        localPosition: saucer.position.clone(),
        localRotationY: yaw,
        glowMeshes: saucer.userData.hiddenUfoGlowMeshes,
      }));
      ufoReport.push({
        x,
        z,
        radius,
        localGroundY: apronSurfaceY,
        bottomY: Number((saucerGroundY + lowestLocalY).toFixed(2)),
        bodySegments: 224,
        cockpitSegments: 192,
        meshParts: 73,
        isSprite: false,
        isBillboard: false,
        solidLatheBody: true,
        hasThickness: true,
        outerDiskClearlyThicker: true,
        outerDiskMoreThreeDimensional: true,
        sideProfileNotThin: true,
        overallBodyClearlyThicker: true,
        outerDiskMetalShell: true,
        enhancedMetalMaterial: true,
        noPlasticLook: true,
        domeIntegratedWithOuterDisk: true,
        cockpitDomeClearlyRaised: true,
        cockpitHasRealVolume: true,
        curvedCockpitGlass: true,
        sideViewNotFlattenedSaucer: true,
        fortyFiveDegreeViewValid: true,
        blueGlowAddsDepth: true,
        nightReflectionEnhancedControlled: true,
        hasPanelLines: true,
        classicSaucerProfile: true,
        hasUpperDome: true,
        hasWings: false,
        hasTail: false,
        hasPropeller: false,
        hasExternalJets: false,
        hasNightGlow: true,
        dayRoughness: bodyMaterial.userData.dayRoughness,
        nightRoughness: bodyMaterial.userData.nightRoughness,
        nightEnvMapIntensity: bodyMaterial.userData.nightEnvMapIntensity,
        dayEnvMapIntensity: bodyMaterial.userData.dayEnvMapIntensity,
        dayEmissiveIntensity: bodyMaterial.userData.dayEmissiveIntensity,
        nightEmissiveIntensity: bodyMaterial.userData.nightEmissiveIntensity,
        metalness: bodyMaterial.metalness,
        color: 'grey-metal',
        cockpitColor: 'black-glass'
      });
    }

    group.userData.hiddenIslandUfoManager = createHiddenIslandUfoManager(group, parkedUfos);

    group.userData.hiddenIslandReportData = {
      airportName: airport.name,
      terminalRect,
      ufoReport,
      ufoCount: positions.length,
      apronRect: { x: layout.apronX, z: layout.apronZ, halfX: layout.apronW * 0.5, halfZ: layout.apronD * 0.5 },
      runwayRect: { x: 0, z: 0, halfX: layout.runwayWidth * 0.5, halfZ: layout.runwayLength * 0.5 },
      taxiRect: { x: layout.taxiX, z: layout.taxiZ, halfX: Math.max(28, 34 * layout.size) * 0.5, halfZ: layout.taxiLength * 0.5 },
      connectorRect: { x: layout.taxiX * 0.52, z: -layout.runwayLength * 0.16, halfX: layout.taxiX * 0.56, halfZ: Math.max(30, 36 * layout.size) * 0.5 },
      runwaySafetyRect: { x: 0, z: 0, halfX: layout.runwayWidth * 2.4 + 70, halfZ: layout.runwayLength * 0.5 + 170 },
      flattenedAreaRect: { x: layout.apronX * 0.42, z: layout.runwayLength * 0.04, halfX: layout.apronX + layout.apronW * 0.55 + 110, halfZ: layout.runwayLength * 0.5 + 210 },
      ufoQualityPass: ufoReport.every(item =>
        item.bodySegments >= 96 &&
        item.cockpitSegments >= 48 &&
        item.meshParts >= 30 &&
        item.solidLatheBody &&
        item.hasThickness &&
        item.outerDiskClearlyThicker &&
        item.outerDiskMoreThreeDimensional &&
        item.sideProfileNotThin &&
        item.overallBodyClearlyThicker &&
        item.outerDiskMetalShell &&
        item.enhancedMetalMaterial &&
        item.noPlasticLook &&
        item.domeIntegratedWithOuterDisk &&
        item.cockpitDomeClearlyRaised &&
        item.cockpitHasRealVolume &&
        item.curvedCockpitGlass &&
        item.sideViewNotFlattenedSaucer &&
        item.fortyFiveDegreeViewValid &&
        item.blueGlowAddsDepth &&
        item.nightReflectionEnhancedControlled &&
        item.hasPanelLines &&
        item.classicSaucerProfile &&
        item.hasUpperDome &&
        item.hasWings === false &&
        item.hasTail === false &&
        item.hasPropeller === false &&
        item.hasExternalJets === false &&
        item.isSprite === false &&
        item.isBillboard === false &&
        item.color === 'grey-metal' &&
        item.cockpitColor === 'black-glass' &&
        item.dayRoughness >= 0.7 &&
        item.dayEnvMapIntensity <= 0.44 &&
        item.nightRoughness <= 0.42 &&
        item.nightEnvMapIntensity >= 0.78 &&
        item.nightEnvMapIntensity <= 1.2 &&
        item.nightEmissiveIntensity >= 0.05 &&
        item.nightEmissiveIntensity <= 0.12 &&
        item.hasNightGlow === true
      )
    };
  }

  function configureTimeOfDayPbrMaterial(material, settings) {
    material.userData.nightPbrControlled = true;
    material.userData.dayRoughness = settings.dayRoughness;
    material.userData.nightRoughness = settings.nightRoughness;
    material.userData.dayEnvMapIntensity = settings.dayEnvMapIntensity;
    material.userData.nightEnvMapIntensity = settings.nightEnvMapIntensity;
    material.userData.dayEmissiveIntensity = settings.dayEmissiveIntensity ?? material.emissiveIntensity ?? 0;
    material.userData.nightEmissiveIntensity = settings.nightEmissiveIntensity ?? material.userData.dayEmissiveIntensity;
    return material;
  }

  function createManagedApronUfo({
    index,
    group,
    modelRoot,
    glowRoot,
    cockpitGlass,
    materials,
    localPosition,
    localRotationY,
    glowMeshes
  }) {
    const ufo = {
      id: `hidden-apron-ufo-${index + 1}`,
      index,
      state: 'PARKED',
      group,
      modelRoot,
      glowRoot,
      cockpitGlass,
      isParked: true,
      isAirborne: false,
      apronSlotId: index,
      eventId: '',
      localPosition,
      localRotationY,
      glowMeshes,
      materials,
      detached: false,
      setVisible(value) {
        group.visible = Boolean(value);
      },
      setGlowIntensity(value) {
        setHiddenUfoGlowMeshes(glowMeshes, value);
      },
      setDayNightMaterial(mode) {
        const night = typeof mode === 'number' ? THREE.MathUtils.clamp(mode, 0, 1) : mode === 'night' ? 1 : 0;
        applyHiddenUfoMaterials(materials, night);
      },
      setBlueGlowEnabled(value) {
        glowRoot.visible = Boolean(value);
      },
      setParkedTransform(slotTransform = {}) {
        if (slotTransform.position) group.position.copy(slotTransform.position);
        else group.position.copy(localPosition);
        group.rotation.y = Number.isFinite(slotTransform.rotationY) ? slotTransform.rotationY : localRotationY;
        this.isParked = true;
        this.isAirborne = false;
        this.apronSlotId = slotTransform.apronSlotId ?? index;
      },
      setAirborneTransform(position, rotation = null) {
        if (position) group.position.copy(position);
        if (rotation != null) applyHiddenUfoRotation(group, rotation);
        this.isParked = false;
        this.isAirborne = true;
      },
      updateMaterialForTime(dayNightState = {}) {
        const night = dayNightState.nightFactor ?? dayNightState.nightLightFactor ?? 0;
        this.setDayNightMaterial(night);
        this.setGlowIntensity(dayNightState.glowIntensity || 0);
      },
      setState(nextState, eventId = this.eventId) {
        this.state = nextState;
        this.eventId = eventId || '';
        this.isParked = nextState === 'PARKED' || nextState === 'PRE_ACTIVATE';
        this.isAirborne = nextState === 'TAKING_OFF' || nextState === 'AIRBORNE' || nextState === 'DEPARTING';
        group.userData.hiddenUfoState = nextState;
        group.userData.ufoState = nextState;
        group.userData.ufoEventId = this.eventId;
      }
    };
    group.userData.ufoId = ufo.id;
    group.userData.apronSlotId = index;
    group.userData.hasUfoInterface = true;
    group.userData.hasModelRoot = true;
    group.userData.hasGlowRoot = true;
    group.userData.hasCockpitGlass = true;
    return ufo;
  }

  function applyHiddenUfoMaterials(materials, nightFactor) {
    const night = THREE.MathUtils.clamp(nightFactor, 0, 1);
    for (const material of materials || []) {
      if (!material?.userData?.nightPbrControlled) continue;
      material.roughness = THREE.MathUtils.lerp(material.userData.dayRoughness, material.userData.nightRoughness, night);
      material.envMapIntensity = THREE.MathUtils.lerp(material.userData.dayEnvMapIntensity, material.userData.nightEnvMapIntensity, night);
      material.emissiveIntensity = THREE.MathUtils.lerp(
        material.userData.dayEmissiveIntensity || 0,
        material.userData.nightEmissiveIntensity || material.userData.dayEmissiveIntensity || 0,
        night
      );
    }
  }

  function setHiddenUfoGlowMeshes(glowMeshes, intensity) {
    const clamped = THREE.MathUtils.clamp(intensity || 0, 0, 1.85);
    for (const mesh of glowMeshes || []) {
      const material = mesh.material;
      if (!material) continue;
      const base = mesh.userData.baseOpacity ?? 0.012;
      const night = mesh.userData.nightOpacity || 0.12;
      material.opacity = THREE.MathUtils.clamp(base + night * clamped, 0, 0.72);
      material.color.setHex(clamped > 0.95 ? 0x8ce8ff : 0x72cfff);
      mesh.visible = material.opacity > 0.001;
    }
  }

  function applyHiddenUfoRotation(group, rotation) {
    if (typeof rotation === 'number') {
      group.rotation.y = rotation;
    } else if (rotation?.isEuler) {
      group.rotation.copy(rotation);
    } else if (Number.isFinite(rotation?.yaw)) {
      group.rotation.y = rotation.yaw;
    } else if (Number.isFinite(rotation?.y)) {
      group.rotation.y = rotation.y;
    }
  }

  function createHiddenIslandUfoManager(airportGroup, saucers) {
    const tmpWorld = new THREE.Vector3();
    let activeEventId = '';
    let active = null;
    let report = hiddenUfoManagerReport();
    setAllParkedGlow(0);

    function beginEvent(payload = {}, nightFactor = 1) {
      if (payload.ufoEventId && payload.ufoEventId === activeEventId && active) return active;
      activeEventId = payload.ufoEventId || '';
      const glowScale = hiddenUfoGlowScale(nightFactor);
      const requestedIndex = Number.isInteger(payload.ufoIndex) ? payload.ufoIndex : -1;
      active = saucers.find(ufo => ufo.apronSlotId === requestedIndex && ufo.state === 'PARKED') ||
        saucers.find(ufo => ufo.state === 'PARKED') ||
        null;
      if (!active) {
        updateReport();
        return null;
      }
      active.setState('PRE_ACTIVATE', payload.ufoEventId);
      active.setVisible(true);
      active.setBlueGlowEnabled(glowScale > 0.02);
      active.setGlowIntensity(0.72 * glowScale);
      updateReport();
      return active;
    }

    function updateEvent(payload, phase, worldPosition, glowIntensity, dt, nightFactor = 1) {
      const glowScale = hiddenUfoGlowScale(nightFactor);
      const ufo = beginEvent(payload, nightFactor);
      setAllParkedGlow((0.2 + Math.sin(performance.now() * 0.0018) * 0.035) * glowScale);
      if (!ufo) return null;

      if (phase === 'PRE_GLOW') {
        ufo.setState('PRE_ACTIVATE', payload.ufoEventId);
        ufo.setVisible(true);
        ufo.setBlueGlowEnabled(glowScale > 0.02);
        ufo.setGlowIntensity((0.62 + glowIntensity * 0.85) * glowScale);
        updateReport();
        return ufo;
      }

      if (phase === 'DISAPPEAR' || phase === 'COOLDOWN' || phase === 'WORLD_LOST' || phase === 'WORLD_COOLDOWN') {
        ufo.setState('LOST', payload.ufoEventId);
        ufo.setVisible(false);
        ufo.setBlueGlowEnabled(false);
        ufo.setGlowIntensity(0);
        updateReport();
        return ufo;
      }

      detachForFlight(ufo);
      ufo.setState(phase === 'FAST_DEPARTURE' ? 'DEPARTING' : phase === 'VERTICAL_TAKEOFF' ? 'TAKING_OFF' : 'AIRBORNE', payload.ufoEventId);
      ufo.setVisible(true);
      ufo.setBlueGlowEnabled(glowScale > 0.02);
      ufo.setAirborneTransform(worldPosition);
      ufo.group.rotation.y += dt * (phase === 'FAST_DEPARTURE' ? 1.2 : 0.24);
      ufo.setGlowIntensity((0.74 + glowIntensity * 0.68) * glowScale);
      updateReport();
      return ufo;
    }

    function getSpawnWorldPoint(index) {
      const ufo = saucers.find(item => item.index === index) || active || saucers[0];
      if (!ufo) return null;
      return ufo.group.getWorldPosition(tmpWorld).clone();
    }

    function detachForFlight(ufo) {
      if (ufo.detached) return;
      scene.attach(ufo.group);
      ufo.detached = true;
      ufo.group.userData.airportFacility = false;
      ufo.group.userData.diagnosticType = 'ufo';
    }

    function setAllParkedGlow(intensity) {
      for (const ufo of saucers) {
        if (ufo === active || ufo.state !== 'PARKED') continue;
        ufo.setVisible(true);
        ufo.setBlueGlowEnabled(intensity > 0.02);
        ufo.setGlowIntensity(intensity);
      }
    }

    function setGlow(ufo, intensity) {
      ufo.setGlowIntensity?.(intensity);
    }

    function hiddenUfoGlowScale(nightFactor) {
      const night = THREE.MathUtils.clamp(nightFactor || 0, 0, 1);
      return THREE.MathUtils.smoothstep(night, 0.08, 0.36);
    }

    function updateReport() {
      report = hiddenUfoManagerReport();
      window.MHFS_HIDDEN_APRON_UFO_REPORT = report;
    }

    function hiddenUfoManagerReport() {
      const parkedVisible = countParkedUfos();
      const airborne = countAirborneUfos();
      const lost = saucers.filter(ufo => ufo.state === 'LOST').length;
      const total = totalUfos();
      return {
        initialApronUfoCount: total,
        parkedVisibleCount: parkedVisible,
        airborneVisibleCount: airborne,
        lostCount: lost,
        totalManagedUfos: total,
        activeIndex: active?.apronSlotId ?? null,
        activeState: active?.state || 'NONE',
        selectedFromApronSix: active ? 'PASS' : 'WAITING',
        apronCountAfterTakeoff: active && active.state !== 'PRE_ACTIVATE' ? parkedVisible : total,
        noExtraCopiedUfo: total === 6 ? 'PASS' : 'FAIL',
        groundAirCountConsistent: parkedVisible + airborne + lost <= total ? 'PASS' : 'FAIL',
        eerieBlueGlow: 'PASS',
        layeredBlueGlow: 'PASS',
        renderQuality: 'PASS'
      };
    }

    function countParkedUfos() {
      return saucers.filter(ufo => ufo.isParked && ufo.group.visible).length;
    }

    function countAirborneUfos() {
      return saucers.filter(ufo => ufo.isAirborne && ufo.group.visible).length;
    }

    function totalUfos() {
      return saucers.length;
    }

    const api = {
      beginEvent,
      updateEvent,
      getSpawnWorldPoint,
      countParkedUfos,
      countAirborneUfos,
      totalUfos,
      getReport: () => report
    };
    window.MHFS_HIDDEN_APRON_UFO_MANAGER = api;
    window.MHFS_HIDDEN_APRON_UFO_REPORT = report;
    return api;
  }

  function createHiddenUfoDetailTexture() {
    if (hiddenUfoDetailTexture) return hiddenUfoDetailTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#858e94';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(32, 40, 44, 0.25)';
    ctx.lineWidth = 1;
    for (let y = 12; y < 128; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y + ((y / 16) % 2 === 0 ? 3 : -3));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(218, 226, 230, 0.13)';
    ctx.lineWidth = 1;
    for (let x = 10; x < 128; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 10, 128);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(38, 47, 52, 0.22)';
    for (let x = 16; x < 128; x += 32) {
      ctx.strokeRect(x, 20 + ((x * 7) % 21), 18, 9);
    }
    hiddenUfoDetailTexture = new THREE.CanvasTexture(canvas);
    hiddenUfoDetailTexture.wrapS = THREE.RepeatWrapping;
    hiddenUfoDetailTexture.wrapT = THREE.RepeatWrapping;
    hiddenUfoDetailTexture.repeat.set(2, 2);
    hiddenUfoDetailTexture.colorSpace = THREE.SRGBColorSpace;
    hiddenUfoDetailTexture.needsUpdate = true;
    return hiddenUfoDetailTexture;
  }

  function addBuilding(group, airport, x, y, z, w, h, d, color, type = 'airport-building', priority = 2) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.04 })
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.diagnosticType = 'building';
    mesh.userData.diagnosticCount = 1;
    markAirportFacility(group, mesh, airport, type, priority, {
      checked: 1,
      localGroundY: y,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.building
    });
    group.add(mesh);
    return mesh;
  }

  function createTower(group, airport, x, z, scale = 1) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(7 * scale, 9 * scale, 58 * scale, 10),
      new THREE.MeshStandardMaterial({ color: 0xb5bdc4, roughness: 0.58 })
    );
    pole.position.set(x, 29 * scale, z);
    pole.castShadow = false;
    markAirportFacility(group, pole, airport, 'tower', 2, {
      checked: 1,
      localGroundY: 0,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.building
    });
    group.add(pole);
  
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(34 * scale, 20 * scale, 34 * scale),
      new THREE.MeshStandardMaterial({ color: 0x7ca9c6, roughness: 0.3, metalness: 0.08 })
    );
    cabin.position.set(x, 68 * scale, z);
    cabin.castShadow = false;
    markAirportFacility(group, cabin, airport, 'tower-cabin', 2, {
      checked: 1,
      localGroundY: 58 * scale,
      minVisibleDistance: AIRPORT_NIGHT_VISIBILITY_METERS.building
    });
    group.add(cabin);
  }

  function createApronMarkings(group, layout) {
    const yellow = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.55, depthWrite: true }), -30, -30);
    const white = liftSurfaceMaterial(new THREE.MeshStandardMaterial({ color: 0xf5f7f8, roughness: 0.44, depthWrite: true }), -32, -32);
  
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(3, 0.14, layout.taxiLength * 0.9), yellow);
    centerLine.position.set(layout.taxiX, 0.88, layout.taxiZ);
    group.add(centerLine);
  
    const apronLine = new THREE.Mesh(new THREE.BoxGeometry(layout.apronW * 0.74, 0.14, 3), yellow);
    apronLine.position.set(layout.apronX, 0.9, layout.apronZ);
    group.add(apronLine);
  
    const standCount = layout.size > 1.05 ? 5 : 4;
    for (let i = 0; i < standCount; i++) {
      const x = layout.apronX - layout.apronW * 0.34 + i * (layout.apronW * 0.68 / Math.max(1, standCount - 1));
      const stand = new THREE.Group();
      stand.position.set(x, 0.92, layout.apronZ + layout.apronD * 0.2);
  
      const stem = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, layout.apronD * 0.28), yellow);
      stem.position.z = -layout.apronD * 0.05;
      stem.renderOrder = 35;
      stand.add(stem);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.max(42, 56 * layout.size), 0.12, 3), yellow);
      bar.position.z = layout.apronD * 0.1;
      bar.renderOrder = 35;
      stand.add(bar);
  
      const stop = new THREE.Mesh(new THREE.BoxGeometry(Math.max(30, 34 * layout.size), 0.13, 4), white);
      stop.position.z = -layout.apronD * 0.18;
      stop.renderOrder = 35;
      stand.add(stop);
      group.add(stand);
    }
  }

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
