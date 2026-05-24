import http from 'node:http';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUfoScheduler } from './ufo/ufoScheduler.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.PORT || process.argv[2] || 4175);
const DAY_DURATION_SECONDS = 600;
const STALE_TIMEOUT_MS = 3000;
const PLAYER_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 64 * 1024;
const GAME_PREFIX = '/game';
const players = new Map();
let nextPlayerNumber = 1;
const ufoSchedulerSystem = createUfoScheduler({ getOnlinePlayers: onlinePlayers });

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.webp', 'image/webp'],
  ['.hdr', 'application/octet-stream']
]);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === GAME_PREFIX) {
      response.writeHead(301, { Location: `${GAME_PREFIX}/${url.search}` });
      response.end();
      return;
    }
    const pathname = publicPath(url.pathname);
    if (request.method === 'GET' && pathname === '/favicon.ico') {
      return sendFavicon(response);
    }
    if (request.method === 'GET' && pathname === '/world') {
      return sendJson(response, worldConfigPayload());
    }
    if (pathname === '/api/session' && request.method === 'POST') {
      return sendJson(response, createSession(await readJson(request)));
    }
    if (pathname === '/api/state' && request.method === 'POST') {
      const payload = await readJson(request);
      updatePlayerState(payload);
      return sendJson(response, worldSnapshot(payload.playerId));
    }
    if (pathname === '/api/world' && (request.method === 'GET' || request.method === 'HEAD')) {
      cleanupPlayers();
      return sendJson(response, worldSnapshot(null), request.method === 'HEAD');
    }
    if (pathname === '/api/leave' && request.method === 'POST') {
      const payload = await readJson(request);
      if (payload?.playerId) players.delete(payload.playerId);
      return sendJson(response, { ok: true, ...serverTimePayload() });
    }
    return serveStatic(request, response, pathname);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error.message || 'server error' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Flight simulator multiplayer server on http://0.0.0.0:${PORT}/`);
});

setInterval(cleanupPlayers, 1500).unref();

function createSession(payload = {}) {
  cleanupPlayers();
  const playerId = crypto.randomUUID();
  const aircraftType = cleanString(payload.aircraftType, 'A20N', 12);
  const aircraftCode = `${aircraftType}-${String(nextPlayerNumber++).padStart(3, '0')}`;
  const now = Date.now();
  const player = {
    playerId,
    callsign: cleanString(payload.callsign, aircraftCode, 24),
    aircraftCode,
    aircraftType,
    connectionStatus: 'online',
    joinedAt: now,
    lastUpdateTime: now,
    state: sanitizeState(payload.state || {})
  };
  players.set(playerId, player);
  return {
    ok: true,
    sessionId: playerId,
    playerId,
    aircraftCode,
    callsign: player.callsign,
    aircraftType,
    multiplayerEnabled: true,
    sessionStatus: 'online',
    ...serverTimePayload(),
    players: publicPlayers()
  };
}

function updatePlayerState(payload = {}) {
  cleanupPlayers();
  if (!payload.playerId || !players.has(payload.playerId)) return;
  const player = players.get(payload.playerId);
  player.lastUpdateTime = Date.now();
  player.connectionStatus = 'online';
  player.state = sanitizeState(payload.state || {});
}

function worldSnapshot(requestingPlayerId) {
  cleanupPlayers();
  return {
    ok: true,
    requestingPlayerId,
    multiplayerEnabled: true,
    sessionStatus: players.has(requestingPlayerId) ? 'online' : 'world',
    ...serverTimePayload(),
    players: publicPlayers()
  };
}

function worldConfigPayload() {
  return {
    ok: true,
    name: 'Microhard Flight Simulator World',
    version: '202605070200',
    worldLoaded: true,
    multiplayerEnabled: true,
    api: {
      session: '/api/session',
      state: '/api/state',
      world: '/api/world',
      leave: '/api/leave'
    },
    assets: {
      worldConfig: '/assets/world/world.json',
      models: '/assets/models/',
      textures: '/assets/textures/',
      audio: '/assets/audio/'
    },
    ...serverTimePayload()
  };
}

function serverTimePayload() {
  const nowMs = Date.now();
  const dayDurationMs = DAY_DURATION_SECONDS * 1000;
  const normalized = ((nowMs % dayDurationMs) / dayDurationMs + 1) % 1;
  const simClock12h = formatSimClock12h(normalized);
  const simClock24h = formatSimClock24h(normalized);
  const sunAngle = normalized * Math.PI * 2;
  const sunHeight = Math.sin(sunAngle);
  const moonHeight = Math.sin(sunAngle + Math.PI);
  const nightLightFactor = clamp(1 - smoothstep(-0.18, 0.12, sunHeight) + horizonFactor(sunHeight) * 0.42, 0, 1);
  const payload = {
    serverNowMs: nowMs,
    dayDurationSeconds: DAY_DURATION_SECONDS,
    serverDayTimeNormalized: normalized,
    serverSimClock12h: simClock12h,
    serverSimClock24h: simClock24h,
    sunDirection: normalize3(Math.cos(sunAngle) * 0.92, sunHeight, Math.sin(sunAngle * 0.72) * 0.22 - 0.2),
    moonVisibility: smoothstep(-0.03, 0.15, moonHeight),
    starVisibility: smoothstep(0.42, 0.78, nightLightFactor),
    nightLightFactor,
    duskFactor: smoothstep(0.38, 0.5, normalized) * (1 - smoothstep(0.5, 0.58, normalized)),
    dawnFactor: smoothstep(0.92, 0.99, normalized) * (1 - smoothstep(0.99, 1.0, normalized))
  };
  ufoSchedulerSystem.update(payload);
  return {
    ...payload,
    ufoEvent: ufoSchedulerSystem.publicEvent(nowMs)
  };
}

function publicPlayers() {
  const now = Date.now();
  return [...players.values()].map(player => {
    const ageMs = now - player.lastUpdateTime;
    const connectionStatus = ageMs > STALE_TIMEOUT_MS ? 'stale' : player.connectionStatus;
    return {
      playerId: player.playerId,
      callsign: player.callsign,
      aircraftCode: player.aircraftCode,
      aircraftType: player.aircraftType,
      connectionStatus,
      joinedAt: player.joinedAt,
      lastUpdateTime: player.lastUpdateTime,
      serverAgeMs: ageMs,
      ...player.state
    };
  });
}

function onlinePlayers() {
  const now = Date.now();
  return [...players.values()].filter(player => now - player.lastUpdateTime <= PLAYER_TIMEOUT_MS);
}

function sanitizeState(state) {
  const position = state.position || {};
  const rotation = state.rotation || {};
  const x = finiteNumber(position.x, 0);
  const y = finiteNumber(position.y, 0);
  const z = finiteNumber(position.z, 0);
  const pseudoGeo = mapCoordinatesToPseudoGeo(x, z);
  return {
    position: {
      x,
      y,
      z
    },
    rotation: {
      yaw: finiteNumber(rotation.yaw, 0),
      pitch: finiteNumber(rotation.pitch, 0),
      roll: finiteNumber(rotation.roll, 0)
    },
    latitude: finiteNumber(state.latitude, pseudoGeo.latitude),
    longitude: finiteNumber(state.longitude, pseudoGeo.longitude),
    heading: normalizeHeading(finiteNumber(state.heading, 0)),
    pitch: finiteNumber(state.pitch, finiteNumber(rotation.pitch, 0)),
    roll: finiteNumber(state.roll, finiteNumber(rotation.roll, 0)),
    altitude: Math.max(0, finiteNumber(state.altitude, 0)),
    altitudeAGL: Math.max(0, finiteNumber(state.altitudeAGL, finiteNumber(state.altitude, 0))),
    speed: Math.max(0, finiteNumber(state.speed, 0)),
    groundSpeedKts: Math.max(0, finiteNumber(state.groundSpeedKts, finiteNumber(state.speed, 0))),
    wheelSpeedKts: Math.max(0, finiteNumber(state.wheelSpeedKts, 0)),
    verticalSpeed: finiteNumber(state.verticalSpeed, 0),
    onGround: Boolean(state.onGround ?? state.grounded ?? false),
    flightPhase: cleanString(state.flightPhase, '', 20),
    stallFactor: clamp(finiteNumber(state.stallFactor, 0), 0, 1),
    gearState: cleanString(state.gearState, 'down', 12),
    flapState: cleanString(state.flapState, 'clean', 12),
    lightsState: {
      navigation: Boolean(state.lightsState?.navigation ?? true),
      antiCollision: Boolean(state.lightsState?.antiCollision ?? true),
      landing: Boolean(state.lightsState?.landing ?? false)
    },
    antiCollisionLightState: Boolean(state.antiCollisionLightState ?? true),
    throttle: clamp(finiteNumber(state.throttle, 0), 0, 1),
    engineState: cleanString(state.engineState, 'running', 16)
  };
}

function mapCoordinatesToPseudoGeo(x, z) {
  return {
    latitude: clamp(z / 111000, -89.9, 89.9),
    longitude: clamp(x / 111000, -179.9, 179.9)
  };
}

function cleanupPlayers() {
  const now = Date.now();
  for (const [playerId, player] of players) {
    if (now - player.lastUpdateTime > PLAYER_TIMEOUT_MS) players.delete(playerId);
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function serveStatic(request, response, publicPathname = null) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(publicPathname || url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(ROOT, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  if (!existsSync(filePath)) {
    const virtualSource = readVirtualSource(safePath);
    if (virtualSource) {
      response.writeHead(200, {
        'Content-Type': virtualSource.contentType,
        'Cache-Control': 'no-store'
      });
      response.end(virtualSource.body);
      return;
    }
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  const stats = statSync(filePath);
  if (stats.isDirectory()) filePath = join(filePath, 'index.html');
  const contentType = mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
}

function publicPath(pathname) {
  if (pathname === GAME_PREFIX) return '/';
  if (pathname.startsWith(`${GAME_PREFIX}/`)) return pathname.slice(GAME_PREFIX.length) || '/';
  return pathname;
}

function readVirtualSource(safePath) {
  const extension = extname(safePath).toLowerCase();
  if (extension !== '.js' && extension !== '.css') return null;
  const sourceDir = join(ROOT, safePath.slice(0, -extension.length));
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) return null;
  const chunkDirs = readdirSync(sourceDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^part-\d+$/.test(entry.name))
    .map(entry => entry.name)
    .sort();
  if (!chunkDirs.length) return null;
  const sourceName = `source${extension}`;
  const body = chunkDirs
    .map(chunkDir => readFileSync(join(sourceDir, chunkDir, sourceName), 'utf8'))
    .join('\n');
  return {
    body,
    contentType: mimeTypes.get(extension) || 'text/plain; charset=utf-8'
  };
}

function sendJson(response, payload, headOnly = false) {
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(headOnly ? undefined : JSON.stringify(payload));
}

function sendFavicon(response) {
  response.writeHead(200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400'
  });
  response.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#07131c"/><path d="M8 36 56 14 41 56 31 39 14 34Z" fill="#72d7ff"/><path d="M31 39 56 14 24 44Z" fill="#ffffff" opacity=".72"/></svg>`);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanString(value, fallback, maxLength) {
  const text = String(value || fallback || '').replace(/[^\w .-]/g, '').trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeHeading(value) {
  return ((value % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function horizonFactor(sunHeight) {
  return (1 - smoothstep(0.04, 0.42, Math.abs(sunHeight))) * smoothstep(-0.24, 0.12, sunHeight);
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function formatSimClock12h(normalized) {
  const totalMinutes = simClockTotalMinutes(normalized);
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatSimClock24h(normalized) {
  const totalMinutes = simClockTotalMinutes(normalized);
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function simClockTotalMinutes(normalized) {
  return Math.floor((((normalized * 24 + 6) % 24) * 60) + 0.5) % (24 * 60);
}
