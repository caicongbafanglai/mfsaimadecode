const runtimeConfig = window.MICROHARD_CONFIG || {};
const urlParams = new URLSearchParams(window.location.search);
const basePath = normalizeBasePath(runtimeConfig.BASE_PATH || './');

export const PATHS = Object.freeze({
  apiBaseUrl: normalizeBaseUrl(urlParams.get('apiBase') || runtimeConfig.API_BASE_URL || ''),
  apiSession: runtimeConfig.SESSION_ENDPOINT || withBasePath('api/session'),
  apiState: runtimeConfig.STATE_ENDPOINT || withBasePath('api/state'),
  apiWorld: runtimeConfig.WORLD_ENDPOINT || withBasePath('api/world'),
  apiLeave: runtimeConfig.LEAVE_ENDPOINT || withBasePath('api/leave'),
  worldConfig: runtimeConfig.WORLD_CONFIG || withBasePath('assets/world/world.json'),
  worldAlias: runtimeConfig.WORLD_ALIAS || withBasePath('world'),
  assetManifest: runtimeConfig.ASSET_MANIFEST || withBasePath('assets/polyhaven/manifest.json'),
  models: runtimeConfig.MODELS_PATH || withBasePath('assets/models/'),
  textures: runtimeConfig.TEXTURES_PATH || withBasePath('assets/textures/'),
  audio: runtimeConfig.AUDIO_PATH || withBasePath('assets/audio/'),
  favicon: runtimeConfig.FAVICON || withBasePath('favicon.ico')
});

export const FEATURE_FLAGS = Object.freeze({
  multiplayerEnabled: booleanConfig('multiplayer', runtimeConfig.MULTIPLAYER_ENABLED, true),
  debugLogs: urlParams.has('debug') || urlParams.get('diagnostics') === '1' || runtimeConfig.DEBUG_LOGS === true
});

export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!PATHS.apiBaseUrl) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path.replace(/^\.\//, '')}`;
  return `${PATHS.apiBaseUrl}${normalizedPath}`;
}

function booleanConfig(queryName, runtimeValue, fallback) {
  const queryValue = urlParams.get(queryName);
  if (queryValue != null) return /^(1|true|yes|on|online)$/i.test(queryValue);
  if (runtimeValue != null) return runtimeValue === true || /^(1|true|yes|on|online)$/i.test(String(runtimeValue));
  return fallback;
}

function normalizeBaseUrl(value) {
  const text = `${value || ''}`.trim();
  if (!text || text === '/') return '';
  return text.endsWith('/') ? text.slice(0, -1) : text;
}

function normalizeBasePath(value) {
  const text = `${value || './'}`.trim();
  if (!text || text === '/') return '/';
  return text.endsWith('/') ? text : `${text}/`;
}

function withBasePath(path) {
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('/') || path.startsWith('./') || path.startsWith('../')) return path;
  return `${basePath}${path}`;
}
