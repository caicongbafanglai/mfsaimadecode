function createWaterHorizonSheen(group) {
  const radius = MAP_SIZE * 1.9;
  const material = new THREE.MeshBasicMaterial({
    color: 0x8fdcff,
    transparent: true,
    opacity: 0.045,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2, 1, 1), material);
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.y = WATER_LEVEL + 0.34;
  sheen.renderOrder = -3;
  sheen.frustumCulled = false;
  sheen.userData.longRangeVisual = true;
  group.add(sheen);
}

function samplePolyline(points, samplesPerSegment) {
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let step = 0; step < samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      samples.push({
        x: THREE.MathUtils.lerp(a.x, b.x, t),
        z: THREE.MathUtils.lerp(a.z, b.z, t)
      });
    }
  }
  const last = points[points.length - 1];
  samples.push({ x: last.x, z: last.z });
  return samples;
}

function createBoundaryBand(body, innerScale, outerScale, terrainHeight, material, samples, lift, renderOrder) {
  const positions = [];
  const indices = [];

  for (let i = 0; i <= samples; i++) {
    const angle = i / samples * Math.PI * 2;
    for (const scale of [innerScale, outerScale]) {
      const point = waterBodyBoundaryPoint(body, angle, scale);
      positions.push(
        point.x,
        Math.max(WATER_LEVEL + 1.2, terrainHeight(point.x, point.z) + lift),
        point.z
      );
    }
  }

  for (let i = 0; i < samples; i++) {
    const row = i * 2;
    indices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  mesh.userData.longRangeVisual = true;
  return mesh;
}

function createRiverMouthFan(endpoint, inside, terrainHeight, waterMaterial, sedimentMaterial, firstEndpoint) {
  const group = new THREE.Group();
  group.userData.longRangeVisual = true;
  const nearOcean = distanceToMapEdge(endpoint.x, endpoint.z) < 1480;
  const nearBay = closestWaterBodyNormalized(BAYS, endpoint.x, endpoint.z) < 1.58;
  const nearLake = closestWaterBodyNormalized(LAKES, endpoint.x, endpoint.z) < 1.16;
  if (!nearOcean && !nearBay && !nearLake) return group;

  const outwardX = endpoint.x - inside.x;
  const outwardZ = endpoint.z - inside.z;
  const length = Math.max(0.001, Math.hypot(outwardX, outwardZ));
  const dirX = outwardX / length;
  const dirZ = outwardZ / length;
  const normalX = -dirZ;
  const normalZ = dirX;
  const heading = Math.atan2(-dirZ, dirX);
  const scale = nearOcean || nearBay ? 1 : 0.72;
  const centerX = endpoint.x + dirX * 150 * scale;
  const centerZ = endpoint.z + dirZ * 150 * scale;

  group.add(createConformingEllipse({
    cx: centerX,
    cz: centerZ,
    rx: 520 * scale,
    rz: 230 * scale,
    rotation: heading,
    terrainHeight,
    lift: 1.9,
    material: waterMaterial,
    segments: 88,
    rings: 4,
    renderOrder: 6
  }));

  for (const side of [-1, 1]) {
    group.add(createConformingEllipse({
      cx: endpoint.x + dirX * 80 * scale + normalX * side * 210 * scale,
      cz: endpoint.z + dirZ * 80 * scale + normalZ * side * 210 * scale,
      rx: 260 * scale,
      rz: 72 * scale,
      rotation: heading + side * 0.2 + (firstEndpoint ? 0.04 : -0.04),
      terrainHeight,
      lift: 1.55,
      material: sedimentMaterial,
      segments: 48,
      rings: 3,
      renderOrder: 5
    }));
  }

  return group;
}

function createLightPoints(positions, colors, size, opacity) {
  const marker = new THREE.Group();
  marker.name = 'distant-light-points-disabled-metadata';
  marker.visible = false;
  marker.userData.longRangeVisual = true;
  marker.userData.renderedAsGroundGlowOnly = true;
  marker.userData.disabledFloatingLightPointCount = positions.length / 3;
  marker.userData.disabledFloatingLightPointSize = size;
  marker.userData.disabledFloatingLightPointOpacity = opacity;
  return marker;
}

function createLightSpriteTexture() {
  if (lightSpriteTexture) return lightSpriteTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.34, 'rgba(255,245,210,0.82)');
  gradient.addColorStop(0.7, 'rgba(255,210,120,0.18)');
  gradient.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  lightSpriteTexture = new THREE.CanvasTexture(canvas);
  lightSpriteTexture.colorSpace = THREE.SRGBColorSpace;
  lightSpriteTexture.needsUpdate = true;
  return lightSpriteTexture;
}

function applySkyTimeOfDay(material, nightFactor, duskFactor) {
  if (!material?.uniforms) return;
  const duskTop = new THREE.Color(0x376fa6);
  const duskHorizon = new THREE.Color(0xffc37a);
  material.uniforms.topColor.value.set(0x4ca9e8).lerp(new THREE.Color(0x071225), nightFactor).lerp(duskTop, duskFactor * (1 - nightFactor));
  material.uniforms.upperColor.value.set(0x9ad0f1).lerp(new THREE.Color(0x182a43), nightFactor).lerp(new THREE.Color(0x7fb0d4), duskFactor * (1 - nightFactor));
  material.uniforms.horizonColor.value.set(0xe6f2f4).lerp(new THREE.Color(0x243247), nightFactor).lerp(duskHorizon, duskFactor * (1 - nightFactor));
  material.uniforms.groundColor.value.set(0x8dbad2).lerp(new THREE.Color(0x10192a), nightFactor);
  material.needsUpdate = true;
}

function pushLightColor(colors, rng, intensity) {
  const cool = rng() < 0.16;
  if (cool) {
    colors.push(0.58 * intensity, 0.78 * intensity, 1 * intensity);
    return;
  }
  const amber = 0.84 + rng() * 0.16;
  colors.push(1 * intensity, amber * intensity, 0.48 * intensity);
}

function overlayMaterial(color, opacity, blending, polygonOffsetUnits) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = polygonOffsetUnits;
  material.polygonOffsetUnits = polygonOffsetUnits;
  return material;
}

function createConformingEllipse({
  cx,
  cz,
  rx,
  rz,
  rotation,
  terrainHeight,
  lift,
  material,
  segments,
  rings,
  renderOrder
}) {
  const positions = [cx, terrainHeight(cx, cz) + lift, cz];
  const indices = [];
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);

  for (let ring = 1; ring <= rings; ring++) {
    const r = ring / rings;
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const localX = Math.cos(angle) * rx * r;
      const localZ = Math.sin(angle) * rz * r;
      const x = cx + c * localX + s * localZ;
      const z = cz - s * localX + c * localZ;
      positions.push(x, terrainHeight(x, z) + lift, z);
    }
  }

  for (let i = 0; i < segments; i++) {
    indices.push(0, 1 + ((i + 1) % segments), 1 + i);
  }

  for (let ring = 2; ring <= rings; ring++) {
    const prevStart = 1 + (ring - 2) * segments;
    const currentStart = 1 + (ring - 1) * segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(
        prevStart + i,
        currentStart + i,
        prevStart + next,
        prevStart + next,
        currentStart + i,
        currentStart + next
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  mesh.userData.longRangeVisual = true;
  return mesh;
}
