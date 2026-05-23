  return requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  }, metadata);
}

function tintRemoteAircraft(group, index) {
  const accents = [0x4b8ed6, 0xe0a145, 0x65b76a, 0xd86464, 0x8e7bd8, 0xd7c456];
  const accent = accents[index % accents.length];
  group.traverse(object => {
    if (!object.isMesh || !object.material?.color) return;
    if (object.name.includes('cheatline') || object.name.includes('tail') || object.name.includes('livery')) {
      object.material = object.material.clone();
      object.material.color.setHex(accent);
      object.material.needsUpdate = true;
    }
  });
}

function createAircraftLabel(text) {
  const texture = createLabelTexture(text, 'ALT ----');
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(86, 28, 1);
  sprite.renderOrder = 80;
  sprite.userData.labelTexture = texture;
  return sprite;
}

function updateAircraftLabel(sprite, player) {
  const altitude = Math.round(player.altitude || 0);
  const trend = verticalTrendSymbol(player.verticalSpeed || 0);
  const stale = player.connectionStatus === 'stale';
  const line2 = stale ? 'LOST' : `${trend ? `${trend} ` : ''}ALT ${altitude} FT`;
  const line1 = `${player.aircraftCode || 'A20N'}${stale ? ' STALE' : ''}`;
  const key = `${line1}|${line2}`;
  if (sprite.userData.labelText === key) return;
  sprite.userData.labelText = key;
  sprite.material.map?.dispose?.();
  sprite.material.map = createLabelTexture(line1, line2);
  sprite.material.needsUpdate = true;
}

function createLabelTexture(line1, line2) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(3, 10, 14, 0.74)';
  roundRect(ctx, 8, 8, 240, 64, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(116, 218, 255, 0.86)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#dff7ff';
  ctx.font = '800 25px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(line1, 20, 36);
  ctx.fillStyle = '#ffd166';
  ctx.font = '760 18px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(line2, 20, 59);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function dampAngle(current, target, alpha) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * alpha;
}

function normalizeHeading(value) {
  return ((value % 360) + 360) % 360;
}

function verticalTrendSymbol(verticalSpeed) {
  if (verticalSpeed > 180) return 'UP';
  if (verticalSpeed < -180) return 'DN';
  return '';
}

function pushTrailPoint(trail, position, altitude = 0, heading = 0, nowMs = performance.now(), force = false) {
  const last = trail[trail.length - 1];
  if (
    !force &&
    last &&
    nowMs - last.timeMs < MAP_TRAIL_INTERVAL_MS &&
    Math.hypot(position.x - last.x, position.z - last.z) < MAP_TRAIL_MIN_DISTANCE
  ) {
    return;
  }
  trail.push({
    x: position.x,
    y: position.y,
    z: position.z,
    altitude: Math.round(altitude || 0),
    heading: normalizeHeading(heading || 0),
    timeMs: nowMs
  });
  pruneTrail(trail, nowMs);
}

function pruneTrail(trail, nowMs = performance.now()) {
  while (trail.length > MAP_TRAIL_MAX_POINTS) trail.shift();
  while (trail.length && nowMs - trail[0].timeMs > MAP_TRAIL_MAX_AGE_MS) trail.shift();
}

function trailForMap(trail) {
  const nowMs = performance.now();
  pruneTrail(trail, nowMs);
  return trail.map(point => ({
    x: point.x,
    y: point.y,
    z: point.z,
    altitude: point.altitude,
    heading: point.heading,
    ageMs: nowMs - point.timeMs
  }));
}

function bearingFromSelf(selfX, selfZ, targetX, targetZ) {
  return normalizeHeading(THREE.MathUtils.radToDeg(Math.atan2(targetX - selfX, -(targetZ - selfZ))));
}

function hashPhase(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash % 1000) / 1000;
}
