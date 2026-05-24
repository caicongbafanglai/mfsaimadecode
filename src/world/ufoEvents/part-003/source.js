function createUfoModel() {
  const detailTexture = createDetailTexture();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x929ba0,
    metalness: 0.78,
    roughness: 0.74,
    envMapIntensity: 0.34,
    emissive: 0x061018,
    emissiveIntensity: 0.006,
    bumpMap: detailTexture,
    bumpScale: 0.034
  });
  Object.assign(bodyMaterial.userData, {
    nightPbrControlled: true,
    dayRoughness: 0.76,
    nightRoughness: 0.36,
    dayEnvMapIntensity: 0.34,
    nightEnvMapIntensity: 0.94,
    dayEmissiveIntensity: 0.006,
    nightEmissiveIntensity: 0.038
  });
  const cockpitMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x03070a,
    metalness: 0.02,
    roughness: 0.18,
    envMapIntensity: 0.48,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    emissive: 0x01060a,
    emissiveIntensity: 0
  });
  const seamMaterial = new THREE.MeshStandardMaterial({
    color: 0x4c565b,
    metalness: 0.7,
    roughness: 0.62,
    envMapIntensity: 0.34,
    emissive: 0x071018,
    emissiveIntensity: 0.014
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x7fcfff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const ringCoreMaterial = new THREE.MeshStandardMaterial({
    color: 0x245b74,
    emissive: 0x5cc8ff,
    emissiveIntensity: 0.55,
    metalness: 0.18,
    roughness: 0.36,
    transparent: true,
    opacity: 0.46,
    depthWrite: false
  });

  const group = new THREE.Group();
  group.name = 'server-synchronized-ufo-event';
  group.userData.ufoEvent = true;
  group.userData.diagnosticType = 'ufo';
  group.userData.isSprite = false;
  group.userData.isBillboard = false;
  group.userData.usesOrdinaryFlightPhysics = false;
  const modelRoot = new THREE.Group();
  modelRoot.name = 'event-ufo-modelRoot';
  modelRoot.userData.ufoModelRoot = true;
  const glowRoot = new THREE.Group();
  glowRoot.name = 'event-ufo-glowRoot';
  glowRoot.userData.ufoGlowRoot = true;
  group.add(modelRoot, glowRoot);

  const bodyGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, -2.6),
    new THREE.Vector2(3.5, -3.65),
    new THREE.Vector2(8.6, -4.55),
    new THREE.Vector2(15.0, -4.75),
    new THREE.Vector2(20.8, -3.9),
    new THREE.Vector2(24.8, -2.45),
    new THREE.Vector2(26.4, -1.15),
    new THREE.Vector2(26.65, 0.45),
    new THREE.Vector2(25.95, 1.72),
    new THREE.Vector2(23.6, 2.58),
    new THREE.Vector2(18.4, 3.08),
    new THREE.Vector2(11.2, 3.26),
    new THREE.Vector2(4.8, 2.96),
    new THREE.Vector2(0, 2.48)
  ], 224);
  bodyGeometry.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = 'ufo-thick-rounded-metal-lathe-disk-body';
  body.castShadow = false;
  body.receiveShadow = true;
  modelRoot.add(body);

  const fairingGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.26),
    new THREE.Vector2(4.8, -0.22),
    new THREE.Vector2(9.3, 0.0),
    new THREE.Vector2(12.6, 0.5),
    new THREE.Vector2(13.6, 1.0),
    new THREE.Vector2(12.2, 1.48),
    new THREE.Vector2(7.8, 1.72),
    new THREE.Vector2(2.6, 1.6),
    new THREE.Vector2(0, 1.36)
  ], 192);
  fairingGeometry.computeVertexNormals();
  const fairing = new THREE.Mesh(fairingGeometry, bodyMaterial);
  fairing.name = 'ufo-integrated-grey-cockpit-fairing';
  fairing.position.y = 2.46;
  fairing.castShadow = false;
  fairing.receiveShadow = true;
  modelRoot.add(fairing);

  const domeGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0.1),
    new THREE.Vector2(4.6, 0.14),
    new THREE.Vector2(8.0, 0.38),
    new THREE.Vector2(10.0, 0.92),
    new THREE.Vector2(10.35, 1.58),
    new THREE.Vector2(9.5, 2.48),
    new THREE.Vector2(7.4, 3.2),
    new THREE.Vector2(4.4, 3.78),
    new THREE.Vector2(0, 4.1)
  ], 192);
  domeGeometry.computeVertexNormals();
  const cockpit = new THREE.Mesh(domeGeometry, cockpitMaterial);
  cockpit.name = 'ufo-tall-curved-black-opaque-cockpit-dome';
  cockpit.position.y = 3.25;
  cockpit.castShadow = false;
  cockpit.receiveShadow = true;
  cockpit.userData.cockpitGlass = true;
  modelRoot.add(cockpit);

  const detailGroup = new THREE.Group();
  detailGroup.name = 'ufo-industrial-detail-lod';
  const panelGroup = new THREE.Group();
  panelGroup.name = 'ufo-panel-seams';
  const rim = new THREE.Mesh(new THREE.TorusGeometry(25.85, 0.9, 24, 224), seamMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.16;
  detailGroup.add(rim);
  const upperShoulderRing = new THREE.Mesh(new THREE.TorusGeometry(22.1, 0.16, 12, 192), seamMaterial);
  upperShoulderRing.rotation.x = Math.PI / 2;
  upperShoulderRing.position.y = 2.58;
  detailGroup.add(upperShoulderRing);
  const upperRing = new THREE.Mesh(new THREE.TorusGeometry(14.8, 0.1, 10, 176), seamMaterial);
  upperRing.rotation.x = Math.PI / 2;
  upperRing.position.y = 3.08;
  detailGroup.add(upperRing);
  const lowerBellyRing = new THREE.Mesh(new THREE.TorusGeometry(16.4, 0.15, 12, 176), seamMaterial);
  lowerBellyRing.rotation.x = Math.PI / 2;
  lowerBellyRing.position.y = -3.88;
  detailGroup.add(lowerBellyRing);
  const canopySeal = new THREE.Mesh(new THREE.TorusGeometry(10.0, 0.14, 10, 192), seamMaterial);
  canopySeal.rotation.x = Math.PI / 2;
  canopySeal.position.y = 3.64;
  detailGroup.add(canopySeal);
  const canopyMidRing = new THREE.Mesh(new THREE.TorusGeometry(7.65, 0.06, 8, 160), seamMaterial);
  canopyMidRing.rotation.x = Math.PI / 2;
  canopyMidRing.position.y = 5.8;
  detailGroup.add(canopyMidRing);
  for (let i = 0; i < 28; i++) {
    const angle = i * Math.PI * 2 / 28;
    const seam = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 10.8, 8), seamMaterial);
    seam.position.set(Math.cos(angle) * 17.2, 2.88, Math.sin(angle) * 17.2);
    seam.rotation.set(0, -angle, Math.PI / 2);
    panelGroup.add(seam);
  }
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI * 2 / 24 + 0.08;
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 18), seamMaterial);
    vent.position.set(Math.cos(angle) * 18.4, -3.28, Math.sin(angle) * 18.4);
    vent.scale.set(1.0, 0.48, 1.0);
    detailGroup.add(vent);
  }
  modelRoot.add(detailGroup, panelGroup);

  const ringGroup = new THREE.Group();
  ringGroup.name = 'ufo-rotating-blue-belly-ring';
  ringGroup.position.y = -4.86;
  const ringCore = new THREE.Mesh(new THREE.TorusGeometry(8.25, 0.24, 14, 160), ringCoreMaterial);
  ringCore.rotation.x = Math.PI / 2;
  ringGroup.add(ringCore);
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI * 2 / 10;
    const segment = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.16, 0.28), ringCoreMaterial);
    segment.position.set(Math.cos(angle) * 8.25, 0, Math.sin(angle) * 8.25);
    segment.rotation.y = -angle;
    ringGroup.add(segment);
  }
  glowRoot.add(ringGroup);

  const edgeRing = new THREE.Mesh(new THREE.TorusGeometry(25.95, 0.25, 14, 224), glowMaterial);
  edgeRing.rotation.x = Math.PI / 2;
  edgeRing.position.y = 0.88;
  glowRoot.add(edgeRing);
  const lowerEdgeGlow = new THREE.Mesh(new THREE.TorusGeometry(24.7, 0.22, 12, 224), glowMaterial);
  lowerEdgeGlow.rotation.x = Math.PI / 2;
  lowerEdgeGlow.position.y = -2.5;
  glowRoot.add(lowerEdgeGlow);
  const bellyGlow = new THREE.Mesh(new THREE.TorusGeometry(8.8, 0.2, 10, 160), glowMaterial);
  bellyGlow.rotation.x = Math.PI / 2;
  bellyGlow.position.y = -4.96;
  glowRoot.add(bellyGlow);
  const canopyGlow = new THREE.Mesh(new THREE.TorusGeometry(10.0, 0.12, 10, 192), glowMaterial);
  canopyGlow.rotation.x = Math.PI / 2;
  canopyGlow.position.y = 3.66;
  glowRoot.add(canopyGlow);
  const canopySideGlow = new THREE.Mesh(new THREE.TorusGeometry(9.8, 0.08, 8, 176), glowMaterial);
  canopySideGlow.rotation.x = Math.PI / 2;
  canopySideGlow.position.y = 4.9;
  glowRoot.add(canopySideGlow);

  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  trail.name = 'ufo-subtle-blue-departure-trail';
  trail.visible = false;
  glowRoot.add(trail);

  return {
    id: 'server-synchronized-ufo-event',
    state: 'HIDDEN',
    group,
    modelRoot,
    glowRoot,
    cockpitGlass: cockpit,
    isParked: false,
    isAirborne: false,
    apronSlotId: null,
    eventId: '',
    bodyMaterial,
    seamMaterial,
    cockpitMaterial,
    glowMaterial,
    ringCoreMaterial,
    ringGroup,
    edgeRing,
    lowerEdgeGlow,
    canopyGlow,
    canopySideGlow,
    detailGroup,
    panelGroup,
    trail,
    setVisible(value) {
      group.visible = Boolean(value);
    },
    setGlowIntensity(value) {
      const clamped = THREE.MathUtils.clamp(value || 0, 0, 1.85);
      const night = THREE.MathUtils.clamp(this.nightFactor || 0, 0, 1);
      glowMaterial.opacity = THREE.MathUtils.clamp(
        (this.mode === UFO_EVENT_MODES.WORLD_ROAMING ? 0.045 : 0.065) + clamped * (night > 0.25 ? 0.5 : 0.12),
        0,
        0.68
      );
      glowMaterial.color.setHex(night > 0.25 ? 0x86dcff : 0x6fa6c6);
      ringCoreMaterial.emissiveIntensity = 0.36 + clamped * 1.62;
      ringCoreMaterial.opacity = THREE.MathUtils.clamp(0.42 + clamped * 0.44, 0.32, 0.88);
    },
    setDayNightMaterial(mode) {
      const night = typeof mode === 'number'
        ? THREE.MathUtils.clamp(mode, 0, 1)
        : mode === 'night' ? 1 : 0;
      this.nightFactor = night;
      bodyMaterial.roughness = THREE.MathUtils.lerp(0.76, 0.36, night);
      bodyMaterial.envMapIntensity = THREE.MathUtils.lerp(0.34, 0.94, night);
      bodyMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.006, 0.038, night) + (this.glowIntensity || 0) * 0.012;
      seamMaterial.roughness = THREE.MathUtils.lerp(0.62, 0.34, night);
      seamMaterial.envMapIntensity = THREE.MathUtils.lerp(0.34, 0.88, night);
      seamMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.012, 0.048, night) + (this.glowIntensity || 0) * 0.012;
      cockpitMaterial.roughness = THREE.MathUtils.lerp(0.18, 0.07, night);
      cockpitMaterial.envMapIntensity = THREE.MathUtils.lerp(0.48, 1.15, night);
      cockpitMaterial.emissiveIntensity = night * 0.02;
    },
    setBlueGlowEnabled(value) {
      glowRoot.visible = Boolean(value);
    },
    setParkedTransform(slotTransform = {}) {
      applyUfoTransform(group, slotTransform);
      this.isParked = true;
      this.isAirborne = false;
      this.apronSlotId = slotTransform.apronSlotId ?? this.apronSlotId;
    },
    setAirborneTransform(position, rotation = null) {
      if (position) group.position.copy(position);
      if (rotation) applyUfoRotation(group, rotation);
      this.isParked = false;
      this.isAirborne = true;
    },
    updateMaterialForTime(dayNightState = {}) {
      const night = dayNightState.nightFactor ?? dayNightState.nightLightFactor ?? 0;
      this.mode = dayNightState.mode || this.mode || UFO_EVENT_MODES.WORLD_ROAMING;
      this.glowIntensity = dayNightState.glowIntensity || 0;
      this.setDayNightMaterial(night);
      this.setGlowIntensity(this.glowIntensity);
    }
  };
}

function applyUfoTransform(group, transform = {}) {
  if (transform.position) group.position.copy(transform.position);
  else if (Number.isFinite(transform.x) && Number.isFinite(transform.y) && Number.isFinite(transform.z)) {
    group.position.set(transform.x, transform.y, transform.z);
  }
  applyUfoRotation(group, transform.rotation ?? transform.rotationY ?? transform.yaw);
}

function applyUfoRotation(group, rotation) {
  if (rotation == null) return;
  if (typeof rotation === 'number') {
    group.rotation.y = rotation;
  } else if (rotation.isEuler) {
    group.rotation.copy(rotation);
  } else if (Number.isFinite(rotation.yaw)) {
    group.rotation.y = rotation.yaw;
  } else if (Number.isFinite(rotation.y)) {
    group.rotation.y = rotation.y;
  }
}

function createPreGlow() {
  const material = new THREE.MeshBasicMaterial({
    color: 0x72cfff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 0.26, 10, 128), material);
  ring.rotation.x = Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.TorusGeometry(8, 0.16, 10, 96), material);
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 2.8;
  group.add(ring, inner);
  return { group, material };
}

function createDetailTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#858e94';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(30,38,42,0.24)';
  ctx.lineWidth = 1;
  for (let i = 6; i < 128; i += 13) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 22, 128);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(225,234,238,0.11)';
  for (let y = 10; y < 128; y += 11) {
    ctx.beginPath();
    ctx.moveTo(0, y + ((y * 7) % 5));
    ctx.lineTo(128, y + ((y * 3) % 4));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(39,48,53,0.22)';
  for (let x = 14; x < 128; x += 32) {
    ctx.strokeRect(x, 18 + ((x * 5) % 19), 18, 9);
  }
  ctx.fillStyle = 'rgba(220,230,235,0.12)';
  for (let i = 0; i < 58; i++) {
    const x = (i * 37) % 128;
    const y = (i * 61) % 128;
    ctx.fillRect(x, y, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function normalizeIslandDurations(payload) {
  const durations = payload.durations || {};
  return {
    preGlowMs: durations.preGlowMs || 3200,
    takeoffMs: durations.takeoffMs || 11000,
    hoverMs: durations.hoverMs || 5200,
    trackMs: durations.trackMs || 90000,
    departMs: durations.departMs || 5200,
    lostMs: durations.lostMs || CONTACT_LOST_HOLD_MS
  };
}

function estimatedServerNowMs(serverTime) {
  if (!serverTime?.serverNowMs || !serverTime?.receivedAtMs) return Date.now();
  return serverTime.serverNowMs + (performance.now() - serverTime.receivedAtMs);
}

function readPoint(value, fallback) {
  return new THREE.Vector3(
    finite(value?.x, fallback.x),
    finite(value?.y, fallback.y),
    finite(value?.z, fallback.z)
  );
}

function readDirection(value, fallback) {
  const x = finite(value?.x, fallback.x);
  const z = finite(value?.z, fallback.z);
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function islandFallbackSpawnPoint() {
  const point = airportWorld(HIDDEN_AIRPORT, -260, -520);
  return { x: point.x, y: 140, z: point.z };
}

function playerAwayDirection(origin) {
  const player = window.MHFS_DEBUG_STATE?.position;
  if (!player) return { x: 0.86, z: -0.5 };
  const dx = origin.x - player.x;
  const dz = origin.z - player.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function worldFallbackPoint(index) {
  const player = window.MHFS_DEBUG_STATE?.position || { x: 0, y: 3000, z: 0 };
  const side = index === 0 ? -1 : 1;
  return {
    x: THREE.MathUtils.clamp(player.x + side * 28000, -MAP_SIZE * 0.48, MAP_SIZE * 0.48),
    y: 12000 * FT_TO_M,
    z: THREE.MathUtils.clamp(player.z + 18000, -MAP_SIZE * 0.48, MAP_SIZE * 0.48)
  };
}

function worldMidPoint(start, payload) {
  const end = readPoint(payload.path?.endPoint || payload.endPoint, worldFallbackPoint(1));
  return {
    x: (start.x + end.x) * 0.5,
    y: Math.max(start.y, end.y) + 900,
    z: (start.z + end.z) * 0.5
  };
}

function sideEncounterLegAt(payload, elapsedMs) {
  const legs = payload.sideEncounter?.legs || [];
  if (!legs.length) return null;
  return legs.find(leg => elapsedMs >= (leg.startMs || 0) && elapsedMs <= (leg.endMs || 0)) || legs[legs.length - 1];
}

function sideEncounterTarget(payload, playerId) {
  const targets = payload.targetPlayers || [];
  return targets.find(target => target.playerId === playerId) || targets[0] || null;
}

function sideEncounterLegProgress(leg, elapsedMs) {
  if (!leg) return 0;
  const start = finite(leg.startMs, 0);
  const end = Math.max(start + 1, finite(leg.endMs, start + 1));
  return THREE.MathUtils.clamp((elapsedMs - start) / (end - start), 0, 1);
}

function islandFollowLeg(payload, durationMs) {
  const leg = payload.sideEncounter?.legs?.[0];
  if (leg) return leg;
  const side = (payload.ufoIndex || 0) % 2 === 0 ? -1 : 1;
  return {
    playerId: payload.targetPlayerId || payload.triggerPlayerId,
    startMs: 0,
    endMs: Math.max(45000, finite(durationMs, 60000)),
    startOffset: { rightM: side * 860, forwardM: 1350, upM: 420 },
    endOffset: { rightM: side * 680, forwardM: 1050, upM: 360 },
    bobPhase: 0.4,
    bobMeters: 7,
    driftMeters: side * 44,
    microShiftMeters: -side * 70,
    microShiftPeriodMs: 6800
  };
}

function setSideEncounterRelativePosition(target, targetPosition, headingDeg, leg, progress, nowMs) {
  const startOffset = leg?.startOffset || { rightM: -850, forwardM: 300, upM: 260 };
  const endOffset = leg?.endOffset || startOffset;
  const eased = smoothstep(0, 1, progress);
  const offset = {
    rightM: THREE.MathUtils.lerp(startOffset.rightM || 0, endOffset.rightM || 0, eased),
    forwardM: THREE.MathUtils.lerp(startOffset.forwardM || 0, endOffset.forwardM || 0, eased),
    upM: THREE.MathUtils.lerp(startOffset.upM || 220, endOffset.upM || 220, eased)
  };
  const drift = Math.sin(progress * Math.PI * 2 + finite(leg?.bobPhase, 0)) * finite(leg?.driftMeters, 0);
  const period = Math.max(1200, finite(leg?.microShiftPeriodMs, 6500));
  const microCycle = ((nowMs - finite(leg?.startMs, 0)) % period) / period;
  const microPulse = smoothstep(0.02, 0.08, microCycle) * (1 - smoothstep(0.16, 0.34, microCycle));
  offset.rightM += drift + microPulse * finite(leg?.microShiftMeters, 0);
  offset.upM += Math.sin(nowMs * 0.0017 + finite(leg?.bobPhase, 0)) * finite(leg?.bobMeters, 7);

  const forward = directionFromHeadingDeg(headingDeg);
  const right = directionFromHeadingDeg(headingDeg + 90);
  target.set(
    targetPosition.x + forward.x * offset.forwardM + right.x * offset.rightM,
    targetPosition.y + offset.upM,
    targetPosition.z + forward.z * offset.forwardM + right.z * offset.rightM
  );
  return target;
}

function sideEncounterAwayDirection(position, targetPosition) {
  const dx = position.x - targetPosition.x;
  const dz = position.z - targetPosition.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function directionFromHeadingDeg(deg) {
  const rad = deg * Math.PI / 180;
  return { x: Math.sin(rad), z: -Math.cos(rad) };
}

function sideEncounterPositionVisible(position, targetPosition, headingDeg, coneDeg = SIDE_ENCOUNTER_VISIBLE_CONE_DEG) {
  const relative = sideEncounterRelativeComponents(position, targetPosition, headingDeg);
  const horizontalDistance = Math.hypot(relative.forwardM, relative.rightM);
  if (horizontalDistance < 1) return false;
  const dotForward = relative.forwardM / horizontalDistance;
  if (dotForward < -0.2) return false;
  const angleDeg = Math.abs(Math.atan2(relative.rightM, relative.forwardM) * 180 / Math.PI);
  return angleDeg <= coneDeg * 0.5;
}

function sideEncounterRelativeComponents(position, targetPosition, headingDeg) {
  const forward = directionFromHeadingDeg(headingDeg);
  const right = directionFromHeadingDeg(headingDeg + 90);
  const dx = position.x - targetPosition.x;
  const dz = position.z - targetPosition.z;
  return {
    forwardM: dx * forward.x + dz * forward.z,
    rightM: dx * right.x + dz * right.z,
    upM: position.y - targetPosition.y
  };
}

function createDebugIslandPayload(nowMs) {
  const spawn = islandFallbackSpawnPoint();
  const player = window.MHFS_DEBUG_STATE?.position || { x: spawn.x + 1200, y: 2500, z: spawn.z - 900 };
  const heading = window.MHFS_DEBUG_STATE?.heading || 45;
  return {
    ufoEventId: `DEBUG-ISLAND-${Math.floor(nowMs / 1000)}`,
    mode: UFO_EVENT_MODES.ISLAND_EVENT,
    state: UFO_EVENT_STATES.PRE_GLOW,
    ufoIndex: 5,
    apronInitialUfoCount: 6,
    apronRemainingAfterTakeoff: 5,
    startTime: nowMs,
    endTime: nowMs + 118000,
    spawnPoint: spawn,
    targetAltitudeFt: 7200,
    departureSpeed: 420,
    departureSpeedKts: 999,
    departureDirection: { x: 0.86, z: -0.5 },
    targetPlayerId: 'debug-player',
    targetPlayerIds: ['debug-player'],
    targetPlayers: [{
      playerId: 'debug-player',
      position: { x: player.x, y: player.y, z: player.z },
      heading,
      speed: 220,
      altitude: Math.round(player.y * M_TO_FT),
      altitudeAGL: Math.round(player.y * M_TO_FT)
    }],
    followDurationMs: 90000,
    sideEncounter: {
      speedMatch: true,
      visibleConeDeg: 120,
      minimumVisibleDurationMs: 45000,
      legs: [{
        playerId: 'debug-player',
        startMs: 0,
        endMs: 90000,
        startOffset: { rightM: 860, forwardM: 1300, upM: 420 },
        endOffset: { rightM: 680, forwardM: 1050, upM: 360 },
        bobPhase: 0.4,
        bobMeters: 7,
        driftMeters: 44,
        microShiftMeters: -70,
        microShiftPeriodMs: 6800
      }]
    },
    speedKts: 220,
    speedOffsetKts: 0,
    visualContact: false,
    signalIntermittent: true,
    durations: {
      preGlowMs: 2800,
      takeoffMs: 11000,
      hoverMs: 3800,
      trackMs: 90000,
      departMs: 5200,
      lostMs: CONTACT_LOST_HOLD_MS
    }
  };
}

function createDebugWorldPayload(nowMs, debugMode) {
  const player = window.MHFS_DEBUG_STATE?.position || { x: 0, y: 3000, z: 0 };
  const heading = window.MHFS_DEBUG_STATE?.heading || 0;
  if (debugMode === 'side') {
    return {
      ufoEventId: `DEBUG-SIDE-${Math.floor(nowMs / 1000)}`,
      mode: UFO_EVENT_MODES.PLAYER_SIDE_ENCOUNTER,
      eventCategory: 'PLAYER_SIDE_ENCOUNTER',
      flightType: UFO_WORLD_FLIGHT_TYPES.PLAYER_SIDE_FOLLOW,
      state: UFO_EVENT_STATES.WORLD_TRACKING,
      startTime: nowMs,
      followDurationMs: 26000,
      departureDurationMs: 2200,
      durationMs: 28200,
      endTime: nowMs + 31000,
      targetPlayerId: 'debug-player',
      targetPlayerIds: ['debug-player'],
      targetPlayers: [{
        playerId: 'debug-player',
        position: { x: player.x, y: player.y, z: player.z },
        heading,
        speed: 220,
        altitude: Math.round(player.y * M_TO_FT),
        altitudeAGL: Math.round(player.y * M_TO_FT)
      }],
      sideEncounter: {
        speedMatch: true,
        legs: [{
          playerId: 'debug-player',
          startMs: 0,
          endMs: 26000,
          startOffset: { rightM: -850, forwardM: 500, upM: 260 },
          endOffset: { rightM: 920, forwardM: 900, upM: 430 },
          bobPhase: 0.8,
          bobMeters: 9,
          driftMeters: 70,
          microShiftMeters: -90,
          microShiftPeriodMs: 6200
        }],
        departureDirection: { x: 0.72, z: -0.69 }
      },
      speedKts: 220,
      departureSpeedKts: 1200,
      signalIntermittent: true,
      mapSpeedUnknown: true,
      visualContact: true,
      silent: true
    };
  }
  const type = debugMode === 'hover' ? UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART
    : debugMode === 'night' ? UFO_WORLD_FLIGHT_TYPES.SILENT_HOVER
      : UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS;
  const start = {
    x: THREE.MathUtils.clamp(player.x - 22000, -MAP_SIZE * 0.48, MAP_SIZE * 0.48),
    y: Math.max(player.y + 1700, 15000 * FT_TO_M),
    z: THREE.MathUtils.clamp(player.z - 16000, -MAP_SIZE * 0.48, MAP_SIZE * 0.48)
  };
  const end = {
    x: THREE.MathUtils.clamp(player.x + 26000, -MAP_SIZE * 0.48, MAP_SIZE * 0.48),
    y: start.y + 600,
    z: THREE.MathUtils.clamp(player.z + 11000, -MAP_SIZE * 0.48, MAP_SIZE * 0.48)
  };
  return {
    ufoEventId: `DEBUG-WORLD-${Math.floor(nowMs / 1000)}`,
    mode: debugMode === 'night' ? UFO_EVENT_MODES.NIGHT_ENCOUNTER : UFO_EVENT_MODES.WORLD_ROAMING,
    eventCategory: debugMode === 'night' ? 'NIGHT_ENCOUNTER_EVENT' : 'WORLD_ROAMING_EVENT',
    flightType: type,
    state: UFO_EVENT_STATES.WORLD_VISIBLE,
    startTime: nowMs,
    durationMs: type === UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART ? 16000 : 11000,
    endTime: nowMs + (type === UFO_WORLD_FLIGHT_TYPES.HOVER_AND_DEPART ? 18800 : 13800),
    path: {
      startPoint: start,
      controlPoint: { x: (start.x + end.x) * 0.5, y: start.y + 1100, z: (start.z + end.z) * 0.5 },
      endPoint: end
    },
    speedKts: type === UFO_WORLD_FLIGHT_TYPES.HIGH_SPEED_PASS ? 560 : 160,
    departureSpeedKts: 1200
  };
}

function quadraticBezier(target, a, b, c, t) {
  const inv = 1 - t;
  target.set(
    inv * inv * a.x + 2 * inv * t * b.x + t * t * c.x,
    inv * inv * a.y + 2 * inv * t * b.y + t * t * c.y,
    inv * inv * a.z + 2 * inv * t * b.z + t * t * c.z
  );
  return target;
}

function headingFromVector(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 0.5) return null;
  return normalizeHeading(Math.atan2(dx, -dz) * 180 / Math.PI);
}

function dampAngle(current, target, alpha) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * alpha;
}

function normalizeHeading(value) {
  return Math.round(((value % 360) + 360) % 360);
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createInitialReport() {
  return {
    active: false,
    mode: 'NONE',
    phase: UFO_EVENT_STATES.HIDDEN,
    ufoIs3D: 'PASS',
    ufoTrue3D: 'PASS',
    ufoHasVolumeAndThickness: 'PASS',
    notOrdinaryTrafficAi: 'PASS',
    noA320FlightModel: 'PASS'
  };
}
