import * as THREE from '../three.module.min.js?v=202605050057';
import { createAircraft } from './aircraft/A320.js?v=202605061100';
import { createAirportSystem } from './world/airports.js?v=202605070100';
import { createFlightPhysics } from './simulation/flightPhysics.js?v=202605061100';
import { createThrottleSystem } from './simulation/throttleSystem.js?v=202605061100';
import { createHud } from './ui/hud.js?v=202605070200';
import { applyBrowserClasses, detectBrowser } from './platform/browserDetect.js?v=202605060602';
import { createViewportManager } from './platform/viewport.js?v=202605060602';
import { resizeRendererToViewport } from './render/resizeRenderer.js?v=202605060602';
import { createCloudSystem } from './world/clouds.js?v=202605056000';
import { createBirdSystem } from './world/birds.js?v=202605056000';
import { applyLightQuality, createDayNightCycle, createSky, initLights } from './world/lighting.js?v=202605070100';
import { createRoadSystem } from './world/roads.js?v=202605056000';
import { createGroundWorld } from './world/groundObjects.js?v=202605070100';
import { createTerrain, terrainHeight } from './world/terrain.js?v=202605070100';
import { createWaterSystem } from './world/water.js?v=202605060300';
import { createBoatSystem } from './world/boats.js?v=202605060300';
import { createAircraftLightController } from './world/aircraftLights.js?v=202605060300';
import { createMultiplayerSystem } from './network/multiplayer.js?v=202605070200';
import { createUfoEventController } from './world/ufoEvents.js?v=202605070200';
import { createEngineAudioSystem } from './audio/engineAudio.js?v=202605061100';
import {
  DEFAULT_RENDER_QUALITY,
  RENDER_QUALITY_PRESETS,
  applyUltraSceneQuality,
  configureUltraCamera,
  configureUltraRenderer,
  configureUltraScene,
  createRuntimeRenderQuality,
  createDistantWorldVisuals,
  enforceRealLightBudget,
  selectDefaultRenderQuality,
  resolveRenderQualityPreset
} from './world/visualQuality.js?v=202605070100';
import { createRenderDiagnostics } from './ui/renderDiagnostics.js?v=202605060700';
import { getNetworkDiagnosticsSnapshot, markWorldLoaded } from './utils/networkDiagnostics.js?v=202605060600';
import {
  airportLocal,
  airportWorld,
  smoothstep,
  summarizeGroundPlacement
} from './world/spatial.js?v=202605056000';

import {
  AIRCRAFT_GROUND_OFFSET,
  AIRPORTS
} from './data/worldData.js?v=202605070100';

const ui = {
  loading: document.getElementById('loading'),
  speed: document.getElementById('speed'),
  altitude: document.getElementById('altitude'),
  throttle: document.getElementById('throttle'),
  heading: document.getElementById('heading'),
  mode: document.getElementById('mode'),
  throttleBar: document.getElementById('throttleBar'),
  reverseBar: document.getElementById('reverseBar'),
  verticalSpeed: document.getElementById('verticalSpeed'),
  nearestField: document.getElementById('nearestField'),
  fieldDistance: document.getElementById('fieldDistance'),
  pitch: document.getElementById('pitch'),
  flapStatus: document.getElementById('flapStatus'),
  speedBrakeStatus: document.getElementById('speedBrakeStatus'),
  vfeStatus: document.getElementById('vfeStatus'),
  vlsStatus: document.getElementById('vlsStatus'),
  compassStrip: document.getElementById('compassStrip'),
  mapPanel: document.getElementById('mapPanel'),
  mapOverlay: document.getElementById('mapOverlay'),
  mapMode: document.getElementById('mapMode'),
  mapOverlayMode: document.getElementById('mapOverlayMode'),
  navMap: document.getElementById('navMap'),
  navMapOverlay: document.getElementById('navMapOverlay'),
  controlsPanel: document.getElementById('controlsPanel'),
  controlsMode: document.getElementById('controlsMode'),
  fmaThrust: document.getElementById('fmaThrust'),
  fmaVertical: document.getElementById('fmaVertical'),
  fmaLateral: document.getElementById('fmaLateral'),
  athrStatus: document.getElementById('athrStatus'),
  targetSpeed: document.getElementById('targetSpeed'),
  speedMode: document.getElementById('speedMode'),
  speedTrend: document.getElementById('speedTrend'),
  leverDetent: document.getElementById('leverDetent'),
  leverDetentDetail: document.getElementById('leverDetentDetail'),
  simClock: document.getElementById('simClock'),
  simClockSource: document.getElementById('simClockSource'),
  thrustModeSmall: document.getElementById('thrustModeSmall'),
  thrustIas: document.getElementById('thrustIas'),
  thrustLimit: document.getElementById('thrustLimit'),
  targetN1Readout: document.getElementById('targetN1Readout'),
  avgN1: document.getElementById('avgN1'),
  detentToast: document.getElementById('detentToast'),
  leftDetent: document.getElementById('leftDetent'),
  rightDetent: document.getElementById('rightDetent'),
  leftN1: document.getElementById('leftN1'),
  rightN1: document.getElementById('rightN1'),
  thrustLeverLeft: document.getElementById('thrustLeverLeft'),
  thrustLeverRight: document.getElementById('thrustLeverRight'),
  thrustTrackLeft: document.getElementById('thrustTrackLeft'),
  thrustTrackRight: document.getElementById('thrustTrackRight'),
  thrustPanel: document.getElementById('thrustPanel'),
  detentLabels: document.querySelectorAll('[data-detent-label]')
};

const appShell = document.getElementById('app') || document.body;
window.MHFS_BOOT?.setStep?.('Loading renderer...');
const browserInfo = applyBrowserClasses(document.body, detectBrowser());
let rendererReady = false;
const viewportManager = createViewportManager({
  app: appShell,
  onChange: () => {
    if (rendererReady) resize();
  }
});
viewportManager.refresh();
const initialViewport = viewportManager.size();
const webglSupport = detectWebGLSupport();
if (!webglSupport.ok) {
  showRendererFallback(webglSupport.reason);
  await new Promise(() => {});
}

const KT_PER_MPS = 1.94384;
const BASE_SPEED_FOV = 60;
const TAKEOFF_SPEED_FOV_MAX = 66;
const SPEED_CALLOUTS = [
  { speed: 80, label: '80 KT' },
  { speed: 135, label: 'V1' },
  { speed: 140, label: 'ROTATE' },
  { speed: 145, label: 'V2' }
];
const urlParams = new URLSearchParams(window.location.search);
const enableConsoleDiagnostics = urlParams.has('debug') || urlParams.get('diagnostics') === '1';
let baseRenderQuality = resolveRenderQualityPreset(
  urlParams.get('quality') || window.localStorage?.getItem('flight-render-quality'),
  selectDefaultRenderQuality(browserInfo) || DEFAULT_RENDER_QUALITY
);
let renderQuality = createRuntimeRenderQuality(baseRenderQuality);

const renderer = new THREE.WebGLRenderer({
  antialias: renderQuality.antialias !== false,
  powerPreference: renderQuality.key === 'SMOOTH_LOW_POWER' ? 'default' : 'high-performance',
  logarithmicDepthBuffer: true,
  precision: 'highp'
});
configureUltraRenderer(renderer, renderQuality);
renderer.domElement.className = 'webgl';
resizeRendererToViewport({
  renderer,
  camera: { aspect: initialViewport.width / initialViewport.height, updateProjectionMatrix() {} },
  quality: renderQuality,
  browser: browserInfo,
  viewport: viewportManager,
  configureCamera: () => {}
});
appShell.prepend(renderer.domElement);

const scene = new THREE.Scene();
configureUltraScene(scene, renderQuality);
window.MHFS_DEBUG_SCENE = scene;

const camera = new THREE.PerspectiveCamera(renderQuality.fov, initialViewport.width / initialViewport.height, renderQuality.cameraNear, renderQuality.cameraFar);
resizeRendererToViewport({
  renderer,
  camera,
  quality: renderQuality,
  browser: browserInfo,
  viewport: viewportManager,
  configureCamera: configureUltraCamera
});
camera.position.set(0, 42, 92);

const keys = new Set();
const tmpVec = new THREE.Vector3();
const forwardVec = new THREE.Vector3();
const cameraRightVec = new THREE.Vector3();
const upVec = new THREE.Vector3(0, 1, 0);
const waterBands = [];
const trafficCars = [];
const clouds = [];
const cameraDesiredVec = new THREE.Vector3();
const cameraLookAtVec = new THREE.Vector3();
let lastAudioWarning = '';
let mapDrag = null;
let previousSpeedForFeeling = 0;
let previousGroundedForFeeling = true;
let previousCalloutSpeedKts = 0;
let lastLightingCheckLog = 0;
let dynamicQualityLevel = 0;
let lastFrameNowMs = 0;
let fixedStepAccumulator = 0;
let renderFrameAccumulator = 0;
let hudUpdateDebt = 0;
let navWorldUpdateDebt = 0;
let boatUpdateDebt = 0;
let birdUpdateDebt = 0;
let trafficUpdateDebt = 0;
let cloudUpdateDebt = 0;
let lightBudgetDebt = 0;
let airportPriorityDebt = 0;
let lastCycleState = null;
const FIXED_FLIGHT_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.05;
const MAX_FIXED_STEPS = 4;
const state = {
  position: new THREE.Vector3(
    AIRPORTS[0].x,
    terrainHeight(AIRPORTS[0].x, AIRPORTS[0].z + 330) + AIRCRAFT_GROUND_OFFSET,
    AIRPORTS[0].z + 330
  ),
  yaw: 0,
  pitch: 0,
  roll: 0,
  speed: 36,
  physicsVelocity: new THREE.Vector3(0, 0, -36),
  physicsSpeedMS: 36,
  indicatedSpeedMS: 36,
  worldVelocity: new THREE.Vector3(),
  worldTravelScale: 1.25,
  groundTravelScale: 1.25,
  airTravelScale: 1.5,
  maxTravelScale: 1.8,
  visualPosition: new THREE.Vector3(),
  previousPhysicsPosition: new THREE.Vector3(),
  currentPhysicsPosition: new THREE.Vector3(),
  previousPhysicsPitch: 0,
  previousPhysicsYaw: 0,
  previousPhysicsRoll: 0,
  currentPhysicsPitch: 0,
  currentPhysicsYaw: 0,
  currentPhysicsRoll: 0,
  visualPitch: 0,
  visualYaw: 0,
  visualRoll: 0,
  throttle: 0.34,
  reverse: 0,
  parkingBrake: false,
  verticalSpeed: 0,
  grounded: true,
  lawMode: 'NORMAL_LAW',
  flightWarning: '',
  angleOfAttack: 0,
  stallFactor: 0,
  controlAuthority: 1,
  currentIAS: 0,
  altitudeAGL: 0,
  wheelSpeedKts: 0,
  leftBrakeInput: 0,
  rightBrakeInput: 0,
  leftBrakePressure: 0,
  rightBrakePressure: 0,
  totalBrakePressure: 0,
  brakeInput: 0,
  brakeForceN: 0,
  wheelBrakeForceN: 0,
  brakeStatusText: '',
  differentialBrakeYawEnabled: false,
  antiSkidActive: false,
  mainGearCompressed: true,
  speedTrendKts: 0,
  lowAltitudeSpeedEffect: 0,
  cameraSpeedFov: BASE_SPEED_FOV,
  cameraShakeAmount: 0,
  cameraAccelPush: 0,
  selectedFlapIndex: 0,
  selectedFlapConfig: 'CONF_0',
  actualSlatPosition: 0,
  actualFlapPosition: 0,
  speedBrakeCommand: 0,
  actualSpeedBrakePosition: 0,
  groundSpoilersArmed: true,
  actualGroundSpoilerPosition: 0
};
window.MHFS_DEBUG_STATE = state;

const timeOfDayMode = urlParams.get('time') || urlParams.get('tod') || 'day';
const startMode = urlParams.get('start');
if (startMode === 'parked') {
  state.speed = 0;
  state.throttle = 0;
  state.reverse = 0;
  state.parkingBrake = true;
} else if (startMode === 'air' || startMode === 'cruise') {
  const x = AIRPORTS[0].x;
  const z = AIRPORTS[0].z - 720;
  const requestedAltitudeFt = Number(urlParams.get('alt') || urlParams.get('altitude'));
  const cruiseAltitudeFt = startMode === 'cruise' ? 25000 : 680;
  const altitudeMeters = THREE.MathUtils.clamp(
    Number.isFinite(requestedAltitudeFt) && requestedAltitudeFt > 0 ? requestedAltitudeFt / 3.28084 : cruiseAltitudeFt / 3.28084,
    120,
    14500
  );
  state.position.set(x, terrainHeight(x, z) + AIRCRAFT_GROUND_OFFSET + altitudeMeters, z);
  state.speed = (startMode === 'cruise' || altitudeMeters > 650 ? 290 : 175) / KT_PER_MPS;
  state.throttle = startMode === 'cruise' || altitudeMeters > 650 ? 0.62 : 0.56;
  state.pitch = startMode === 'cruise' ? 0 : altitudeMeters > 650 ? -0.025 : -0.05;
  state.grounded = false;
  state.parkingBrake = false;
}

state.physicsSpeedMS = Math.abs(state.speed);
state.indicatedSpeedMS = state.physicsSpeedMS;
state.currentIAS = state.physicsSpeedMS * KT_PER_MPS;
state.physicsVelocity.set(0, 0, -state.speed);
state.worldVelocity.copy(state.physicsVelocity);
state.visualPosition.copy(state.position);
state.previousPhysicsPosition.copy(state.position);
state.currentPhysicsPosition.copy(state.position);
state.previousPhysicsPitch = state.currentPhysicsPitch = state.visualPitch = state.pitch;
state.previousPhysicsYaw = state.currentPhysicsYaw = state.visualYaw = state.yaw;
state.previousPhysicsRoll = state.currentPhysicsRoll = state.visualRoll = state.roll;

previousSpeedForFeeling = state.physicsSpeedMS;
previousGroundedForFeeling = state.grounded;
previousCalloutSpeedKts = state.physicsSpeedMS * KT_PER_MPS;

const engineAudio = createEngineAudioSystem({ state });
window.MHFS_BOOT?.setStep?.('Prewarming audio...');
engineAudio.prewarm?.();
const rootStyle = document.documentElement.style;
window.MHFS_BOOT?.setStep?.('Loading UI...');
const hud = createHud({ ui, state, rootStyle, terrainHeight, airportWorld });
rendererReady = true;
viewportManager.start();
window.MHFS_BOOT?.setStep?.('Loading world...');
const cloudSystem = createCloudSystem({ scene, clouds, mulberry32 });
const birdSystem = createBirdSystem({ scene, terrainHeight, mulberry32, getRenderQuality: () => renderQuality });
const waterSystem = createWaterSystem({ scene, waterBands, mulberry32 });
const airportSystem = createAirportSystem({ scene, terrainHeight, getRenderQuality: () => renderQuality });
const roadSystem = createRoadSystem({ scene, terrainHeight, waterBands });
const groundWorld = createGroundWorld({ scene, trafficCars, terrainHeight, mulberry32, getRenderQuality: () => renderQuality });

const lights = initLights(scene, renderQuality);
const skySystem = createSky(scene);
createTerrain({ scene, waterSystem, quality: renderQuality });
createDistantWorldVisuals({ scene, terrainHeight, mulberry32, quality: renderQuality });
markWorldLoaded(true);
const boatSystem = createBoatSystem({ scene, mulberry32 });
boatSystem.createBoats(renderQuality.denseScenery
  ? {}
  : { simple: true, maxBoats: renderQuality.key === 'SMOOTH_LOW_POWER' ? 36 : 56 });
const dayNightCycle = createDayNightCycle({ scene, renderer, camera, lights, sky: skySystem, initialMode: timeOfDayMode, getRenderQuality: () => renderQuality });
lastCycleState = dayNightCycle.update(0);
airportSystem.createAirport(AIRPORTS[0]);
lastCycleState = dayNightCycle.update(0);
window.MHFS_BOOT?.setStep?.('Loading aircraft...');
const aircraft = createAircraft();
aircraft.group.userData.diagnosticType = 'aircraft';
aircraft.group.userData.diagnosticCount = 1;
const localAircraftLights = createAircraftLightController(aircraft.group, { phase: 0.13 });
const multiplayerSystem = createMultiplayerSystem({ scene, state, terrainHeight });
const ufoEventController = createUfoEventController({
  scene,
  state,
  camera,
  terrainHeight,
  getHiddenIslandUfoManager: () => airportSystem.getHiddenIslandUfoManager?.(),
  getServerTime: () => multiplayerSystem.getServerTime()
});
const throttleSystem = createThrottleSystem({ state, terrainHeight, keys });
const flightPhysics = createFlightPhysics({ keys, state, forwardVec, terrainHeight, smoothstep });
scene.add(aircraft.group);
cleanupMapGuideLines();
let detailCuller = { update() {} };
const performanceMonitor = createFramePerformanceMonitor(() => renderQuality);
const renderDiagnostics = createRenderDiagnostics({
  scene,
  renderer,
  camera,
  state,
  qualityPresets: RENDER_QUALITY_PRESETS,
  getQualityPreset: () => renderQuality,
  getNetworkDiagnostics: getNetworkDiagnosticsSnapshot,
  getPerformanceSnapshot: () => performanceMonitor.snapshot(),
  setQualityPreset,
  container: appShell,
  startVisible: enableConsoleDiagnostics
});
window.MHFS_PERFORMANCE_SNAPSHOT = () => performanceMonitor.snapshot();
window.MHFS_RUN_WORLD_INTEGRITY_REPORTS = () => runWorldIntegrityReports('manual');
updateSpeedFeeling(1 / 60);
updateCamera(1);
multiplayerSystem.connect();

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('pagehide', () => multiplayerSystem.dispose());
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('resize', () => viewportManager.refresh());
window.addEventListener('orientationchange', () => setTimeout(() => viewportManager.refresh(), 120));
ui.mapPanel.addEventListener('click', toggleNavMap);
ui.mapPanel.addEventListener('keydown', handleNavMapKey);
ui.mapOverlay.addEventListener('click', toggleNavMap);
ui.mapOverlay.addEventListener('keydown', handleNavMapKey);
ui.mapOverlay.addEventListener('wheel', handleNavMapWheel, { passive: false });
ui.navMapOverlay.addEventListener('pointerdown', beginNavMapDrag);
ui.navMapOverlay.addEventListener('dblclick', resetNavMapView);
ui.controlsPanel.addEventListener('click', toggleControlsPanel);
ui.controlsPanel.addEventListener('keydown', handleControlsPanelKey);
ui.thrustTrackLeft.addEventListener('pointerdown', event => beginThrottleDrag(event, 'left'));
ui.thrustTrackRight.addEventListener('pointerdown', event => beginThrottleDrag(event, 'right'));
renderer.domElement.tabIndex = 0;
renderer.domElement.focus();

startWorldBuildQueue().then(() => {
  updateAirportPriorityLoading(0, true);
  applyUltraSceneQuality(scene, renderer, renderQuality);
  enforceRealLightBudget(scene, renderQuality, camera);
  runWorldIntegrityReports('startup');
  window.MHFS_BOOT?.setStep?.('Starting game loop...');
  requestAnimationFrame(() => ui.loading.classList.add('hidden'));
  animate();
});

function startWorldBuildQueue() {
  const denseScenery = renderQuality.denseScenery === true;
  const secondaryAirports = renderQuality.secondaryAirportDetail === false ? [] : AIRPORTS.slice(1);
  const criticalTasks = [
    ...secondaryAirports.map(airport => () => {
      airportSystem.createAirport(airport);
      dayNightCycle.update(0);
    }),
    () => groundWorld.createCity(),
    () => groundWorld.createForests(),
    () => cloudSystem.createClouds(),
    () => birdSystem.createBirds(),
    ...(denseScenery ? [
      () => roadSystem.createBridgesAndRoads(),
      () => groundWorld.createVillageRoads(),
      () => groundWorld.createIslandSettlements(),
      () => groundWorld.createMountainHamlets()
    ] : [])
  ];
  const backgroundTasks = denseScenery ? [
    () => groundWorld.createWoodlandCabins(),
    () => groundWorld.createVillages(),
    () => groundWorld.createAirfieldLowHomes(),
    () => groundWorld.createRunwayEndScatterHomes(),
    () => groundWorld.createFarmlandRegions(),
    () => groundWorld.createGroundDetails(),
    () => groundWorld.createLowGrassMeadows()
  ] : [];
  const tasks = [...criticalTasks, ...backgroundTasks];
  let taskIndex = 0;
  let criticalResolved = false;
  const visibleAfterTasks = tasks.length;

  return new Promise(resolve => {
    function processQueue(deadline = null) {
      const startedAt = performance.now();
      let built = 0;
      const criticalPhase = taskIndex < criticalTasks.length;
      const idleBudget = deadline?.timeRemaining?.() || 0;
      const budget = Math.max(criticalPhase ? 6 : 3, Math.min(criticalPhase ? 12 : 6, idleBudget || (criticalPhase ? 8 : 4)));
      while (taskIndex < tasks.length && (built < 1 || performance.now() - startedAt < budget)) {
        tasks[taskIndex++]();
        built++;
        if (!criticalResolved && taskIndex >= visibleAfterTasks) {
          criticalResolved = true;
          applyUltraSceneQuality(scene, renderer, renderQuality);
          enforceRealLightBudget(scene, renderQuality, camera);
          resolve();
          break;
        }
      }

      if (taskIndex < tasks.length) {
        scheduleWorldBuildTask(processQueue);
        return;
      }

      applyUltraSceneQuality(scene, renderer, renderQuality);
      enforceRealLightBudget(scene, renderQuality, camera);
      detailCuller = createDetailCuller(aircraft.group);
      if (!criticalResolved) resolve();
    }

    scheduleWorldBuildTask(processQueue);
  });
}

function scheduleWorldBuildTask(callback) {
  if (renderQuality.mapStreaming && 'requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 160 });
    return;
  }
  requestAnimationFrame(callback);
}

function scheduleIdleStartupTask(callback) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 1800 });
    return;
  }
  setTimeout(callback, 0);
}

function handleKeyDown(event) {
  const code = flightControlCode(event);
  const throttleHandled = handleThrottleKey(code, event);
  const controlled = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyT', 'KeyX', 'KeyY', 'KeyG', 'KeyZ', 'KeyC', 'BracketLeft', 'BracketRight', 'ShiftLeft', 'ShiftRight', 'Space'];
  if (throttleHandled) {
    event.preventDefault();
    ensureAudio();
    return;
  }
  if (controlled.includes(code)) {
    event.preventDefault();
    ensureAudio();
    if (code === 'Space' && !event.repeat) {
      toggleParkingBrake();
    } else if (code === 'KeyT' && !event.repeat) {
      toggleLawMode();
    }
    if (code !== 'KeyT') keys.add(code);
  }
}

function toggleParkingBrake() {
  if (!state.grounded) {
    hud.updateHud();
    return;
  }
  state.parkingBrake = !state.parkingBrake;
  if (state.parkingBrake) throttleSystem.setDetent('IDLE');
  hud.updateHud();
}
