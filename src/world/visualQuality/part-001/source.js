import * as THREE from '../../three.module.min.js?v=202605050057';
import {
  AIRPORTS,
  BAYS,
  CITY_ZONES,
  FARM_REGIONS,
  FOREST_CLUSTERS,
  LANDMASSES,
  LAKES,
  MAP_SIZE,
  RIVER_SYSTEMS,
  VILLAGES,
  WATER_LEVEL
} from '../data/worldData.js?v=202605070100';
import {
  airportWorld,
  closestWaterBodyNormalized,
  distanceToMapEdge,
  smoothstep,
  waterBodyBoundaryPoint
} from './spatial.js?v=202605056000';

let lightSpriteTexture = null;

const COMMON_SMOOTH_60HZ = Object.freeze({
  flightUpdateHz: 60,
  hudUpdateHz: 30,
  throttleUiHz: 30,
  navMapUpdateHz: 10,
  remoteAircraftUpdateHz: 10,
  boatUpdateHz: 2,
  birdUpdateHz: 5,
  trafficUpdateHz: 5,
  cloudUpdateHz: 15,
  cityLightUpdateHz: 1,
  debugUpdateHz: 1,
  mapStreaming: true,
  antialias: true,
  minFPS: 45,
  frameBudgetSoftMs: 22,
  frameBudgetHardMs: 34,
  restoreStableSeconds: 20,
  degradeCheckSeconds: 5
});

export const QUALITY_PRESETS = Object.freeze({
  SMOOTH_LOW_POWER: Object.freeze({
    ...COMMON_SMOOTH_60HZ,
    key: 'SMOOTH_LOW_POWER',
    label: 'SMOOTH 45',
    legacyKey: 'LOW',
    targetFPS: 45,
    pixelRatio: 1.0,
    maxPixelRatio: 1.0,
    cameraNear: 0.8,
    cameraFar: 155000,
    fov: 64,
    fogColor: 0xc2ddf2,
    fogDensity: 0.0000115,
    fogDayDensity: 0.0000095,
    fogNightDensity: 0.0000135,
    shadows: 'minimal',
    shadowMapSize: 768,
    shadowExtent: 3200,
    shadowFar: 7600,
    shadowNormalBias: 0.94,
    realLightsLimit: 12,
    cityLightsMode: 'emissive',
    cityLightDensity: 0.72,
    treesLOD: 'aggressive',
    terrainLOD: 'balanced',
    cityDetailDistance: 20000,
    groundDetailDistance: 4800,
    hysteresis: 0.28,
    boatFarUpdateInterval: 0.5,
    birdUpdateInterval: 0.2,
    trafficUpdateInterval: 0.2,
    distantDetailScale: 0.86,
    materialAnisotropyScale: 0.5,
    denseScenery: false,
    secondaryAirportDetail: false,
    antialias: false
  }),

  BALANCED: Object.freeze({
    ...COMMON_SMOOTH_60HZ,
    key: 'BALANCED',
    label: 'BALANCED',
    legacyKey: 'MEDIUM',
    targetFPS: 60,
    pixelRatio: 1.0,
    maxPixelRatio: 1.25,
    cameraNear: 0.8,
    cameraFar: 170000,
    fov: 64,
    fogColor: 0xc2ddf2,
    fogDensity: 0.0000108,
    fogDayDensity: 0.0000088,
    fogNightDensity: 0.0000128,
    shadows: 'limited',
    shadowMapSize: 1024,
    shadowExtent: 4400,
    shadowFar: 11000,
    shadowNormalBias: 0.86,
    realLightsLimit: 20,
    cityLightsMode: 'emissive+nearLights',
    cityLightDensity: 0.86,
    treesLOD: 'balanced',
    terrainLOD: 'balanced',
    cityDetailDistance: 26000,
    groundDetailDistance: 6600,
    hysteresis: 0.22,
    boatFarUpdateInterval: 0.5,
    birdUpdateInterval: 0.2,
    trafficUpdateInterval: 0.2,
    distantDetailScale: 1.0,
    materialAnisotropyScale: 0.75,
    denseScenery: false,
    secondaryAirportDetail: false
  }),

  HIGH: Object.freeze({
    ...COMMON_SMOOTH_60HZ,
    key: 'HIGH',
    label: 'HIGH',
    legacyKey: 'HIGH',
    targetFPS: 60,
    pixelRatio: 1.25,
    maxPixelRatio: 1.25,
    cameraNear: 0.8,
    cameraFar: 190000,
    fov: 64,
    fogColor: 0xc2ddf2,
    fogDensity: 0.000010,
    fogDayDensity: 0.000008,
    fogNightDensity: 0.000011,
    shadows: 'medium',
    shadowMapSize: 1536,
    shadowExtent: 5600,
    shadowFar: 14000,
    shadowNormalBias: 0.78,
    realLightsLimit: 28,
    cityLightsMode: 'enhanced',
    cityLightDensity: 1.0,
    treesLOD: 'balanced',
    terrainLOD: 'high',
    cityDetailDistance: 33000,
    groundDetailDistance: 8600,
    hysteresis: 0.18,
    boatFarUpdateInterval: 0.42,
    birdUpdateInterval: 0.16,
    trafficUpdateInterval: 0.16,
    distantDetailScale: 1.1,
    materialAnisotropyScale: 0.9,
    denseScenery: true,
    secondaryAirportDetail: true
  }),

  ULTRA: Object.freeze({
    ...COMMON_SMOOTH_60HZ,
    key: 'ULTRA',
    label: 'ULTRA',
    legacyKey: 'ULTRA',
    targetFPS: 60,
    pixelRatio: 1.5,
    maxPixelRatio: 1.5,
    cameraNear: 0.8,
    cameraFar: 220000,
    fov: 64,
    fogColor: 0xc2ddf2,
    fogDensity: 0.000009,
    fogDayDensity: 0.000007,
    fogNightDensity: 0.000010,
    shadows: 'high',
    shadowMapSize: 2048,
    shadowExtent: 6800,
    shadowFar: 17000,
    shadowNormalBias: 0.75,
    realLightsLimit: 40,
    cityLightsMode: 'ultra',
    cityLightDensity: 1.0,
    treesLOD: 'high',
    terrainLOD: 'high',
    cityDetailDistance: 42000,
    groundDetailDistance: 12000,
    hysteresis: 0.15,
    boatFarUpdateInterval: 0.36,
    birdUpdateInterval: 0.14,
    trafficUpdateInterval: 0.14,
    distantDetailScale: 1.22,
    materialAnisotropyScale: 1.0,
    denseScenery: true,
    secondaryAirportDetail: true
  }),

  EMERGENCY_LOW: Object.freeze({
    ...COMMON_SMOOTH_60HZ,
    key: 'EMERGENCY_LOW',
    label: 'EMERGENCY 30',
    legacyKey: 'LOW',
    targetFPS: 30,
    minFPS: 30,
    pixelRatio: 0.9,
    maxPixelRatio: 1.0,
    cameraNear: 0.8,
    cameraFar: 145000,
    fov: 64,
    fogColor: 0xc2ddf2,
    fogDensity: 0.000012,
    fogDayDensity: 0.000010,
    fogNightDensity: 0.000014,
    shadows: 'off',
    shadowMapSize: 0,
    shadowExtent: 2600,
    shadowFar: 6000,
    shadowNormalBias: 1.0,
    realLightsLimit: 8,
    cityLightsMode: 'emissive',
    cityLightDensity: 0.58,
    treesLOD: 'aggressive',
    terrainLOD: 'balanced',
    cityDetailDistance: 16000,
    groundDetailDistance: 3600,
    hysteresis: 0.32,
    boatFarUpdateInterval: 1.0,
    birdUpdateInterval: 0.35,
    trafficUpdateInterval: 0.35,
    distantDetailScale: 0.72,
    materialAnisotropyScale: 0.4,
    denseScenery: false,
    secondaryAirportDetail: false,
    antialias: false
  })
});

export const RENDER_QUALITY_PRESETS = QUALITY_PRESETS;
export const DEFAULT_RENDER_QUALITY = QUALITY_PRESETS.BALANCED;
export const ULTRA_RENDER_QUALITY = QUALITY_PRESETS.ULTRA;

const LEGACY_QUALITY_ALIASES = Object.freeze({
  LOW: 'SMOOTH_LOW_POWER',
  MEDIUM: 'BALANCED',
  DEFAULT: 'BALANCED',
  SMOOTH: 'SMOOTH_LOW_POWER',
  LOW_POWER: 'SMOOTH_LOW_POWER',
  BATTERY: 'SMOOTH_LOW_POWER',
  EMERGENCY: 'EMERGENCY_LOW',
  30: 'EMERGENCY_LOW',
  45: 'SMOOTH_LOW_POWER',
  60: 'BALANCED'
});

export function selectDefaultRenderQuality(browser = {}) {
  if (browser.isSafari || browser.isIOS || browser.isIPadOS || browser.isLikelyMacBookAir) {
    return QUALITY_PRESETS.SMOOTH_LOW_POWER;
  }
  return QUALITY_PRESETS.BALANCED;
}

export function resolveRenderQualityPreset(value, fallback = DEFAULT_RENDER_QUALITY) {
  const requested = `${value || ''}`.trim().toUpperCase();
  const key = LEGACY_QUALITY_ALIASES[requested] || requested;
  return QUALITY_PRESETS[key] || fallback;
}

export function createRuntimeRenderQuality(preset = DEFAULT_RENDER_QUALITY, dynamicLevel = 0) {
  const level = THREE.MathUtils.clamp(Math.floor(dynamicLevel || 0), 0, 6);
  const quality = { ...preset, baseKey: preset.key, dynamicLevel: level };
  if (level >= 1) {
    quality.shadows = lowerShadowTier(quality.shadows);
    quality.shadowMapSize = lowerShadowMapSize(quality.shadowMapSize);
    quality.shadowExtent = Math.max(2400, quality.shadowExtent * 0.78);
    quality.shadowFar = Math.max(6200, quality.shadowFar * 0.72);
  }
  if (level >= 2) {
    quality.boatFarUpdateInterval = Math.max(quality.boatFarUpdateInterval, 0.7);
    quality.birdUpdateInterval = Math.max(quality.birdUpdateInterval, 0.28);
    quality.trafficUpdateInterval = Math.max(quality.trafficUpdateInterval, 0.28);
    quality.boatUpdateHz = Math.min(quality.boatUpdateHz, 1.5);
    quality.birdUpdateHz = Math.min(quality.birdUpdateHz, 4);
    quality.trafficUpdateHz = Math.min(quality.trafficUpdateHz, 4);
    quality.cloudUpdateHz = Math.min(quality.cloudUpdateHz, 10);
  }
  if (level >= 3) {
    quality.cityDetailDistance = Math.max(15000, quality.cityDetailDistance * 0.78);
    quality.groundDetailDistance = Math.max(3400, quality.groundDetailDistance * 0.74);
    quality.treesLOD = 'aggressive';
    quality.distantDetailScale = Math.min(quality.distantDetailScale, 0.82);
  }
  if (level >= 4) {
    quality.cityLightsMode = 'emissive';
    quality.cityLightDensity = Math.min(quality.cityLightDensity, 0.62);
    quality.realLightsLimit = Math.min(quality.realLightsLimit, 12);
  }
  if (level >= 5) {
    quality.pixelRatio = Math.min(quality.pixelRatio, 1.0);
    quality.maxPixelRatio = Math.min(quality.maxPixelRatio, 1.0);
    quality.materialAnisotropyScale = Math.min(quality.materialAnisotropyScale, 0.55);
  }
  if (level >= 6 && quality.targetFPS > 45) {
    quality.targetFPS = 45;
  }
  quality.targetFrameMs = 1000 / Math.max(1, quality.targetFPS || 60);
  quality.softFrameMs = Math.max(quality.targetFrameMs * 1.08, quality.frameBudgetSoftMs || quality.targetFrameMs);
  return quality;
}

function lowerShadowTier(value) {
  if (value === 'high') return 'medium';
  if (value === 'medium') return 'limited';
  if (value === 'limited') return 'minimal';
  return value === 'off' ? 'off' : 'minimal';
}

function lowerShadowMapSize(size = 0) {
  if (size <= 0) return 0;
  return Math.max(512, Math.floor(size * 0.5));
}

export function configureRenderer(renderer, quality = DEFAULT_RENDER_QUALITY) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio ?? quality.maxPixelRatio ?? 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.shadowMap.enabled = quality.shadows !== 'off' && (quality.shadowMapSize || 0) > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function configureUltraRenderer(renderer, quality = DEFAULT_RENDER_QUALITY) {
  configureRenderer(renderer, quality);
}

export function configureScene(scene, quality = DEFAULT_RENDER_QUALITY) {
  scene.background = new THREE.Color(0x9fcbeb);
  scene.fog = new THREE.FogExp2(quality.fogColor, quality.fogDensity);
}

export function configureUltraScene(scene, quality = DEFAULT_RENDER_QUALITY) {
  configureScene(scene, quality);
}

export function configureCamera(camera, width, height, quality = DEFAULT_RENDER_QUALITY) {
  camera.fov = quality.fov;
  camera.aspect = width / height;
  camera.near = quality.cameraNear;
  camera.far = quality.cameraFar;
  camera.updateProjectionMatrix();
}

export function configureUltraCamera(camera, width, height, quality = DEFAULT_RENDER_QUALITY) {
  configureCamera(camera, width, height, quality);
}

export function applySceneQuality(scene, renderer, quality = DEFAULT_RENDER_QUALITY) {
  const anisotropy = Math.max(1, Math.floor((renderer.capabilities?.getMaxAnisotropy?.() || 1) * (quality.materialAnisotropyScale ?? 1)));
  scene.traverse(object => {
    if (isLongRangeVisual(object) || object.isLine || object.isPoints) object.frustumCulled = false;
    if (object.userData.renderTier === 'distant-silhouette') object.frustumCulled = false;
    if (object.userData.optionalGroundDetail) object.visible = quality.key !== 'EMERGENCY_LOW' || object.userData.keepInLow === true;
    applyAircraftLodQuality(object, quality);
    applyShadowQuality(object, quality);
    applyCityLightQuality(object, quality);
    applyMaterialQuality(object.material, anisotropy);
  });
}

export function applyUltraSceneQuality(scene, renderer, quality = DEFAULT_RENDER_QUALITY) {
  applySceneQuality(scene, renderer, quality);
}

export function isLongRangeVisual(object) {
  for (let current = object; current; current = current.parent) {
    if (current.userData?.longRangeVisual) return true;
  }
  return false;
}

export function enforceRealLightBudget(scene, quality = DEFAULT_RENDER_QUALITY, camera = null) {
  const limit = Math.max(0, quality.realLightsLimit ?? DEFAULT_RENDER_QUALITY.realLightsLimit ?? 20);
  const entries = [];
  scene.traverse(object => {
    if (!object.isLight) return;
    if (object.userData.baseLightVisible === undefined) object.userData.baseLightVisible = object.visible !== false;
    const priority = lightPriority(object, camera);
    entries.push({ object, priority });
  });
  entries.sort((a, b) => a.priority - b.priority);
  let active = 0;
  for (const entry of entries) {
    const light = entry.object;
    const keep = light.userData.baseLightVisible !== false && active < limit;
    light.visible = keep;
    if (keep) active++;
    if (!keep && light.castShadow) light.castShadow = false;
    if (light.isPointLight || light.isSpotLight) light.castShadow = false;
  }
  return active;
}

function applyShadowQuality(object, quality) {
  if (!object || (!object.isMesh && !object.isInstancedMesh)) return;
  if (object.userData.baseCastShadow === undefined) object.userData.baseCastShadow = object.castShadow === true;
  if (object.userData.baseReceiveShadow === undefined) object.userData.baseReceiveShadow = object.receiveShadow === true;

  const shadows = quality.shadows || 'limited';
  const aircraft = isAircraftVisual(object);
  if (shadows === 'off') {
    object.castShadow = false;
    object.receiveShadow = aircraft && object.userData.baseReceiveShadow;
    return;
  }
  if (shadows === 'minimal') {
    object.castShadow = aircraft && object.userData.baseCastShadow;
    object.receiveShadow = aircraft && object.userData.baseReceiveShadow;
    return;
  }
  if (shadows === 'limited') {
    object.castShadow = aircraft && object.userData.baseCastShadow;
    object.receiveShadow = object.userData.baseReceiveShadow && !object.userData.longRangeVisual;
    return;
  }
  if (shadows === 'medium') {
    object.castShadow = object.userData.baseCastShadow && (aircraft || !isLongRangeVisual(object));
    object.receiveShadow = object.userData.baseReceiveShadow;
    return;
  }
  object.castShadow = object.userData.baseCastShadow;
  object.receiveShadow = object.userData.baseReceiveShadow;
}

function applyCityLightQuality(object, quality) {
  if (!object?.material) return;
  const density = THREE.MathUtils.clamp(quality.cityLightDensity ?? 1, 0.45, 1);
  if (object.userData.nightLight) {
    if (object.userData.qualityBaseOpacity === undefined) object.userData.qualityBaseOpacity = object.userData.baseOpacity ?? object.material.opacity ?? 1;
    if (object.userData.qualityBaseSize === undefined) object.userData.qualityBaseSize = object.userData.baseSize ?? object.material.size ?? 1;
    if (object.userData.airportCriticalLight) {
      const priorityBoost = object.userData.airportNightPriority <= 1 ? 1.16 : 1.08;
      object.userData.baseOpacity = object.userData.qualityBaseOpacity * priorityBoost;
      object.userData.baseSize = object.userData.qualityBaseSize * priorityBoost;
    } else {
      object.userData.baseOpacity = object.userData.qualityBaseOpacity * density;
      object.userData.baseSize = object.userData.qualityBaseSize * THREE.MathUtils.lerp(0.82, 1, density);
    }
  }

  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (!material?.userData?.nightControlled) continue;
    if (material.userData.qualityBaseOpacity === undefined) material.userData.qualityBaseOpacity = material.userData.baseOpacity ?? material.opacity ?? 1;
    if (material.userData.qualityNightOpacity === undefined) material.userData.qualityNightOpacity = material.userData.nightOpacity ?? material.opacity ?? 1;
    material.userData.baseOpacity = material.userData.qualityBaseOpacity * density;
    material.userData.nightOpacity = material.userData.qualityNightOpacity * density;
  }
}

function nightVisualFactorFor(nightFactor) {
  return smoothstep(0.02, 0.24, nightFactor);
}

function applyAircraftLodQuality(object, quality) {
  if (!isAircraftVisual(object) || object.isLight || object.userData?.aircraftLight) return;
  if (object.userData.baseQualityVisible === undefined) object.userData.baseQualityVisible = object.visible !== false;
  if (quality.denseScenery === true || quality.key === 'HIGH' || quality.key === 'ULTRA') {
    object.visible = object.userData.baseQualityVisible;
    return;
  }

  const name = `${object.name || ''}`.toLowerCase();
  const lowPriorityDetail =
    /window|pane|door|handle|antenna|slat|spoiler|hinge|panel_line|track|rail|fan_blade|cheatline|stripe|strobe_reflector/.test(name) ||
    object.geometry?.type === 'CircleGeometry' ||
    object.geometry?.type === 'PlaneGeometry';
  if (lowPriorityDetail) object.visible = false;
}

function lightPriority(light, camera) {
  if (light.name === 'ultra-sun' || light.name === 'ultra-sky-fill' || light.name === 'ultra-horizon-fill' || light.name === 'ultra-moon-light') {
    return 0;
  }
  if (!camera || !light.getWorldPosition) return isAircraftVisual(light) ? 5 : 50;
  const position = reusableLightPosition;
  light.getWorldPosition(position);
  const distance = position.distanceTo(camera.position);
  return (isAircraftVisual(light) ? 6 : 20) + distance / 1000;
}

const reusableLightPosition = new THREE.Vector3();

function isAircraftVisual(object) {
  for (let current = object; current; current = current.parent) {
    if (current.userData?.diagnosticType === 'aircraft') return true;
    if (current.name && /a320|aircraft/i.test(current.name)) return true;
  }
  return Boolean(object.userData?.aircraftLight);
}

export function createDistantWorldVisuals({ scene, terrainHeight, mulberry32, quality = DEFAULT_RENDER_QUALITY }) {
  const group = new THREE.Group();
  group.name = 'ultra-distant-world-visuals';
  group.userData.longRangeVisual = true;
  group.userData.renderTier = 'distant-silhouette';
  group.userData.diagnosticType = 'chunk';
  group.userData.diagnosticCount = 1;
  scene.add(group);

  const rng = mulberry32(20260505);
  if (quality.denseScenery === true) {
    createMacroLandLayers(group, terrainHeight);
    createSoftWaterReadability(group, terrainHeight);
  }
  createDistantCityLayers(group, terrainHeight, rng);
  createRuralLightScatter(group, terrainHeight, rng);
  createWaterHorizonSheen(group);

  return { group };
}

export function applyTimeOfDay(scene, renderer, mode = 'day') {
  const normalized = `${mode || 'day'}`.toLowerCase();
  const nightFactor = normalized.includes('night') ? 1 : normalized.includes('dusk') || normalized.includes('dawn') ? 0.46 : 0;
  const duskFactor = normalized.includes('dusk') || normalized.includes('dawn') ? 1 : 0;
  const nightVisualFactor = nightVisualFactorFor(nightFactor);

  scene.background = new THREE.Color(0x9fcbeb).lerp(new THREE.Color(0x07111e), nightFactor);
  if (scene.fog) {
    scene.fog.color.set(0xc2ddf2).lerp(new THREE.Color(0x111b2b), nightFactor);
    scene.fog.density = THREE.MathUtils.lerp(DEFAULT_RENDER_QUALITY.fogDayDensity, DEFAULT_RENDER_QUALITY.fogNightDensity, nightFactor);
  }
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.14, 1.0, nightFactor);

  scene.traverse(object => {
    if (object.name === 'ultra-sun') object.intensity = THREE.MathUtils.lerp(4.15, 0.08, nightFactor) * (duskFactor ? 0.62 : 1);
    if (object.name === 'ultra-sky-fill') object.intensity = THREE.MathUtils.lerp(1.9, 0.46, nightFactor);
    if (object.name === 'ultra-horizon-fill') object.intensity = THREE.MathUtils.lerp(0.72, 0.18, nightFactor);
    if (object.name === 'ultra-atmospheric-sky') applySkyTimeOfDay(object.material, nightFactor, duskFactor);
    if (object.material?.userData?.nightPbrControlled) {
      const material = object.material;
      material.roughness = THREE.MathUtils.lerp(material.userData.dayRoughness, material.userData.nightRoughness, nightFactor);
      material.envMapIntensity = THREE.MathUtils.lerp(material.userData.dayEnvMapIntensity, material.userData.nightEnvMapIntensity, nightFactor);
      if (material.emissive && material.userData.dayEmissiveIntensity !== undefined && material.userData.nightEmissiveIntensity !== undefined) {
        material.emissiveIntensity = THREE.MathUtils.lerp(material.userData.dayEmissiveIntensity, material.userData.nightEmissiveIntensity, nightFactor);
      }
      material.needsUpdate = true;
    }
    if (object.userData.nightLight && object.material) {
      object.material.opacity = object.userData.baseOpacity * THREE.MathUtils.lerp(0, 1.42, nightVisualFactor);
      object.material.size = object.userData.baseSize * THREE.MathUtils.lerp(0.78, 1.18, nightVisualFactor);
      object.visible = object.material.opacity > 0.001;
      object.material.needsUpdate = true;
    }
    if (object.userData.nightGlow && object.material) {
      object.material.opacity = THREE.MathUtils.lerp(object.userData.baseOpacity, object.userData.nightOpacity, nightVisualFactor);
      if (object.userData.nightOnlyVisual) object.visible = object.material.opacity > 0.001;
      object.material.needsUpdate = true;
    }
  });
}

function applyMaterialQuality(material, anisotropy) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const item of material) applyMaterialQuality(item, anisotropy);
    return;
  }

  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
    const texture = material[key];
    if (!texture) continue;
    texture.anisotropy = anisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }
  material.dithering = true;
  material.needsUpdate = true;
}

function createMacroLandLayers(group, terrainHeight) {
  const forestMaterial = overlayMaterial(0x1d5e3e, 0.16, THREE.NormalBlending, -42);
  const farmMaterial = overlayMaterial(0x8f9f45, 0.13, THREE.NormalBlending, -44);
  const highlandMaterial = overlayMaterial(0x6f796f, 0.1, THREE.NormalBlending, -46);

  for (const cluster of FOREST_CLUSTERS) {
    const mesh = createConformingEllipse({
      cx: cluster.x,
      cz: cluster.z,
      rx: cluster.radius * 1.05,
      rz: cluster.radius * 0.72,
      rotation: Math.sin(cluster.x * 0.001) * 0.7,
      terrainHeight,
      lift: 1.42,
      material: forestMaterial,
      segments: 96,
      rings: 5,
      renderOrder: 2
    });
    group.add(mesh);
  }

  for (const region of FARM_REGIONS) {
    const mesh = createConformingEllipse({
      cx: region.x,
      cz: region.z,
      rx: region.rx * 1.02,
      rz: region.rz * 1.02,
      rotation: region.rotation || 0,
      terrainHeight,
      lift: 1.26,
      material: farmMaterial,
      segments: 104,
      rings: 5,
      renderOrder: 2
    });
    group.add(mesh);
  }

  for (const land of LANDMASSES) {
    const mesh = createConformingEllipse({
      cx: land.x,
      cz: land.z,
      rx: land.rx * 0.46,
      rz: land.rz * 0.38,
      rotation: land.rotation || 0,
      terrainHeight,
      lift: 1.08,
      material: highlandMaterial,
      segments: land.rx > 2500 ? 144 : 96,
      rings: 5,
      renderOrder: 1
    });
    group.add(mesh);
  }
}

function createSoftWaterReadability(group, terrainHeight) {
  const coastBandMaterial = overlayMaterial(0xd8e0b7, 0.045, THREE.NormalBlending, -64);
  const wetlandMaterial = overlayMaterial(0x74c8bd, 0.075, THREE.NormalBlending, -66);
  const riverMouthMaterial = overlayMaterial(0x78d8ea, 0.18, THREE.AdditiveBlending, -68);
  const riverDeltaMaterial = overlayMaterial(0xcad9b8, 0.04, THREE.NormalBlending, -70);

  for (const land of LANDMASSES) {
    group.add(createBoundaryBand(land, 0.982, 1.032, terrainHeight, coastBandMaterial, land.rx > 2500 ? 288 : 176, 1.38, 3));
  }

  for (const water of [...LAKES, ...BAYS]) {
    group.add(createBoundaryBand(water, 0.94, 1.055, terrainHeight, wetlandMaterial, 176, 1.22, 4));
  }

  for (const river of RIVER_SYSTEMS) {
    if (river.length < 2) continue;
    group.add(createRiverMouthFan(river[0], river[1], terrainHeight, riverMouthMaterial, riverDeltaMaterial, true));
    group.add(createRiverMouthFan(river[river.length - 1], river[river.length - 2], terrainHeight, riverMouthMaterial, riverDeltaMaterial, false));
  }
}

function createDistantCityLayers(group, terrainHeight, rng) {
  const glowMaterial = overlayMaterial(0xffc871, 0.0, THREE.AdditiveBlending, -60);
  const urbanPlateMaterial = overlayMaterial(0x33434c, 0.18, THREE.NormalBlending, -52);
  const lightPositions = [];
  const lightColors = [];

  for (const zone of CITY_ZONES) {
    const urbanPlate = createConformingEllipse({
      cx: zone.x,
      cz: zone.z,
      rx: zone.radius * 0.9,
      rz: zone.radius * 0.74,
      rotation: Math.sin(zone.x * 0.0007 + zone.z * 0.0004) * 0.3,
      terrainHeight,
      lift: 2.0,
      material: urbanPlateMaterial,
      segments: 112,
      rings: 5,
      renderOrder: 4
    });
    group.add(urbanPlate);

    const cityGlow = createConformingEllipse({
      cx: zone.x,
      cz: zone.z,
      rx: zone.radius * 1.02,
      rz: zone.radius * 0.88,
      rotation: Math.sin(zone.z * 0.0008) * 0.34,
      terrainHeight,
      lift: 2.35,
      material: glowMaterial,
      segments: 128,
      rings: 5,
      renderOrder: 7
    });
    cityGlow.userData.nightGlow = true;
    cityGlow.userData.nightOnlyVisual = true;
    cityGlow.userData.baseOpacity = 0.0;
    cityGlow.userData.nightOpacity = 0.18;
    cityGlow.visible = false;
    group.add(cityGlow);

    const target = Math.floor(220 + zone.radius * 0.15 + (zone.cars || 0) * 2.4);
    for (let i = 0; i < target; i++) {
      const laneBias = rng() < 0.55;
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * zone.radius * (laneBias ? 0.98 : 0.76);
      const gridSnap = zone.roadSpacing || 180;
      let x = zone.x + Math.cos(angle) * radius;
      let z = zone.z + Math.sin(angle) * radius;
      if (laneBias) {
        x = zone.x + Math.round((x - zone.x) / gridSnap) * gridSnap + (rng() - 0.5) * 38;
        z = zone.z + Math.round((z - zone.z) / gridSnap) * gridSnap + (rng() - 0.5) * 38;
      }
      const falloff = 1 - smoothstep(zone.radius * 0.7, zone.radius * 1.08, Math.hypot(x - zone.x, z - zone.z));
      if (falloff <= 0) continue;
      lightPositions.push(x, terrainHeight(x, z) + 10 + rng() * 34 + falloff * 22, z);
      pushLightColor(lightColors, rng, 0.78 + falloff * 0.22);
    }
  }

  group.add(createLightPoints(lightPositions, lightColors, 3.1, 0.88));
}

function createRuralLightScatter(group, terrainHeight, rng) {
  const positions = [];
  const colors = [];

  for (const village of VILLAGES) {
    const count = Math.max(16, Math.floor(village.houses * 1.6));
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * village.radius * 1.08;
      const x = village.x + Math.cos(angle) * radius;
      const z = village.z + Math.sin(angle) * radius;
      positions.push(x, terrainHeight(x, z) + 7 + rng() * 9, z);
      pushLightColor(colors, rng, 0.62);
    }
  }

  for (const region of FARM_REGIONS) {
    const count = Math.max(14, Math.floor((region.houses || 10) * 0.9));
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng());
      const localX = Math.cos(angle) * region.rx * radius;
      const localZ = Math.sin(angle) * region.rz * radius;
      const c = Math.cos(region.rotation || 0);
      const s = Math.sin(region.rotation || 0);
      const x = region.x + c * localX + s * localZ;
      const z = region.z - s * localX + c * localZ;
      positions.push(x, terrainHeight(x, z) + 5.8 + rng() * 7, z);
      pushLightColor(colors, rng, 0.44);
    }
  }

  group.add(createLightPoints(positions, colors, 2.25, 0.66));
}
