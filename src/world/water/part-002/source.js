    riverWaterMaterial.polygonOffsetUnits = -5;
    const riverFoamMaterial = liftSurfaceMaterial(new THREE.MeshBasicMaterial({ color: 0xc8f6ff, transparent: true, opacity: 0.12, depthWrite: false }), -7, -7);
    const samples = sampleRiverCurve(points, 12);
    let run = [];
    for (const sample of samples) {
      if (!isRiverGeometryHiddenByWater(sample.x, sample.z)) {
        run.push(sample);
        continue;
      }
      createRiverRibbonRun(run, rng, shoreMaterial, riverWaterMaterial, riverFoamMaterial);
      run = [];
    }
    createRiverRibbonRun(run, rng, shoreMaterial, riverWaterMaterial, riverFoamMaterial);
  }

  function createRiverRibbonRun(run, rng, shoreMaterial, waterMaterial, foamMaterial) {
    if (run.length < 2) return;
    createRiverRibbonMesh(run, sample => sample.width + 92, RIVER_SHORE_Y, shoreMaterial, 1);
    createRiverRibbonMesh(run, sample => sample.width, RIVER_SURFACE_Y, waterMaterial.clone(), 2);

    for (let i = 2; i < run.length - 2; i += 5) {
      const sample = run[i];
      const next = run[Math.min(run.length - 1, i + 1)];
      const angle = Math.atan2(-(next.z - sample.z), next.x - sample.x);
      const band = new THREE.Mesh(new THREE.BoxGeometry(62 + rng() * 92, 0.12, 2.6), foamMaterial.clone());
      band.position.set(sample.x, RIVER_FOAM_Y, sample.z);
      band.rotation.y = angle + (rng() - 0.5) * 0.11;
      band.translateZ((rng() - 0.5) * sample.width * 0.44);
      band.renderOrder = 4;
      scene.add(band);
      waterBands.push({
        mesh: band,
        baseX: band.position.x,
        phase: rng() * Math.PI * 2,
        speed: 0.32 + rng() * 0.48,
        travel: 4 + rng() * 7,
        worldAxis: true
      });
    }
  }

  function createRiverRibbonMesh(samples, widthForSample, y, material, renderOrder) {
    const positions = [];
    const indices = [];

    for (let i = 0; i < samples.length; i++) {
      const prev = samples[Math.max(0, i - 1)];
      const current = samples[i];
      const next = samples[Math.min(samples.length - 1, i + 1)];
      const tangentX = next.x - prev.x;
      const tangentZ = next.z - prev.z;
      const length = Math.max(0.001, Math.hypot(tangentX, tangentZ));
      const normalX = -tangentZ / length;
      const normalZ = tangentX / length;
      const halfWidth = widthForSample(current, i, samples.length) * 0.5;
      positions.push(
        current.x - normalX * halfWidth,
        y,
        current.z - normalZ * halfWidth,
        current.x + normalX * halfWidth,
        y,
        current.z + normalZ * halfWidth
      );
    }

    for (let i = 0; i < samples.length - 1; i++) {
      const row = i * 2;
      indices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
  }

  function sampleRiverCurve(points, samplesPerSegment) {
    const samples = [];
    const segmentCount = Math.max(1, points.length - 1);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const steps = samplesPerSegment;
      for (let step = 0; step < steps; step++) {
        if (i > 0 && step === 0) continue;
        const t = step / steps;
        const globalT = (i + t) / segmentCount;
        const point = catmullRom2(p0, p1, p2, p3, t);
        samples.push({
          x: point.x,
          z: point.z,
          t: globalT,
          width: riverWidthAt(globalT, point.x, point.z)
        });
      }
    }

    const end = points[points.length - 1];
    samples.push({ x: end.x, z: end.z, t: 1, width: riverWidthAt(1, end.x, end.z) });
    return samples;
  }

  function catmullRom2(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
    };
  }

  function riverWidthAt(t, x, z) {
    const mouth = Math.max(1 - smoothstep(0.04, 0.18, t), smoothstep(0.82, 0.98, t));
    const lakeBlend = smoothstep(1.18, 0.96, closestLakeNormalized(x, z));
    const texture = 0.5 + 0.5 * Math.sin(x * 0.0021 + z * 0.0017 + t * 7.4);
    return 116 + mouth * 96 + lakeBlend * 54 + texture * 18;
  }

  function createRiverSpan(a, b, rng, shoreMaterial, riverWaterMaterial, riverFoamMaterial) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
    if (length < 44) return;
      const angle = Math.atan2(-dz, dx);
  
      const shore = new THREE.Mesh(new THREE.BoxGeometry(length + 92, 0.08, 238), shoreMaterial);
      shore.position.set((a.x + b.x) / 2, RIVER_SHORE_Y, (a.z + b.z) / 2);
      shore.rotation.y = angle;
      shore.receiveShadow = true;
      shore.renderOrder = 1;
      scene.add(shore);
  
      const water = new THREE.Mesh(new THREE.BoxGeometry(length + 86, 0.16, 154), riverWaterMaterial.clone());
      water.position.set((a.x + b.x) / 2, RIVER_SURFACE_Y, (a.z + b.z) / 2);
      water.rotation.y = angle;
      water.renderOrder = 2;
      scene.add(water);
  
      for (let w = 0; w < 7; w++) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(56 + rng() * 86, 0.12, 2.5),
          riverFoamMaterial.clone()
        );
        band.position.set((a.x + b.x) / 2, RIVER_FOAM_Y, (a.z + b.z) / 2);
        band.rotation.y = angle + (rng() - 0.5) * 0.08;
        band.translateX((rng() - 0.5) * length * 0.82);
        band.translateZ((rng() - 0.5) * 74);
        band.renderOrder = 4;
        scene.add(band);
        waterBands.push({ mesh: band, baseX: band.position.x, phase: rng() * Math.PI * 2, speed: 0.35 + rng() * 0.55, travel: 4 + rng() * 7, worldAxis: true });
      }
    }

  function riverVisibleSpans(a, b, samples = 34) {
    const spans = [];
    let start = null;
  
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = THREE.MathUtils.lerp(a.x, b.x, t);
      const z = THREE.MathUtils.lerp(a.z, b.z, t);
      const visible = !isRiverGeometryHiddenByWater(x, z);
  
      if (visible && start === null) start = t;
      if ((!visible || i === samples) && start !== null) {
        const end = visible && i === samples ? t : (i - 1) / samples;
        if (end - start > 0.028) {
          spans.push({
            a: {
              x: THREE.MathUtils.lerp(a.x, b.x, start),
              z: THREE.MathUtils.lerp(a.z, b.z, start)
            },
            b: {
              x: THREE.MathUtils.lerp(a.x, b.x, end),
              z: THREE.MathUtils.lerp(a.z, b.z, end)
            }
          });
        }
        start = null;
      }
    }
  
    return spans;
  }

  function createRiverBends(points, shoreMaterial, waterMaterial) {
    for (let i = 1; i < points.length - 1; i++) {
      const point = points[i];
      if (isRiverGeometryHiddenByWater(point.x, point.z)) continue;
      const mouthZone = isRiverMouthZone(point.x, point.z);
      if (mouthZone) continue;

      const prev = points[i - 1];
      const next = points[i + 1];
      createRiverBendPatch(prev, point, next, 130, 126, RIVER_SHORE_Y + 0.03, shoreMaterial, 1);
      createRiverBendPatch(prev, point, next, 84, 112, RIVER_SURFACE_Y + 0.08, waterMaterial.clone(), 2);
    }
  }

  function createRiverBendPatch(prev, point, next, halfWidth, length, y, material, renderOrder) {
    const inDir = normalized2(point.x - prev.x, point.z - prev.z);
    const outDir = normalized2(next.x - point.x, next.z - point.z);
    if (!inDir || !outDir) return;

    const inNormal = { x: -inDir.z, z: inDir.x };
    const outNormal = { x: -outDir.z, z: outDir.x };
    const candidates = [
      offsetPoint(point, -inDir.x * length + inNormal.x * halfWidth, -inDir.z * length + inNormal.z * halfWidth),
      offsetPoint(point, -inDir.x * length - inNormal.x * halfWidth, -inDir.z * length - inNormal.z * halfWidth),
      offsetPoint(point, inNormal.x * halfWidth, inNormal.z * halfWidth),
      offsetPoint(point, -inNormal.x * halfWidth, -inNormal.z * halfWidth),
      offsetPoint(point, outDir.x * length + outNormal.x * halfWidth, outDir.z * length + outNormal.z * halfWidth),
      offsetPoint(point, outDir.x * length - outNormal.x * halfWidth, outDir.z * length - outNormal.z * halfWidth),
      offsetPoint(point, outNormal.x * halfWidth, outNormal.z * halfWidth),
      offsetPoint(point, -outNormal.x * halfWidth, -outNormal.z * halfWidth)
    ];
    const hull = convexHull2(candidates);
    if (hull.length < 3) return;

    const center = hull.reduce((sum, item) => ({ x: sum.x + item.x, z: sum.z + item.z }), { x: 0, z: 0 });
    center.x /= hull.length;
    center.z /= hull.length;

    const positions = [center.x, y, center.z];
    for (const item of hull) positions.push(item.x, y, item.z);

    const indices = [];
    for (let i = 0; i < hull.length; i++) {
      indices.push(0, i + 1, ((i + 1) % hull.length) + 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const patch = new THREE.Mesh(geometry, material);
    patch.receiveShadow = true;
    patch.renderOrder = renderOrder;
    scene.add(patch);
  }

  function normalized2(x, z) {
    const length = Math.hypot(x, z);
    if (length < 0.001) return null;
    return { x: x / length, z: z / length };
  }

  function offsetPoint(point, x, z) {
    return { x: point.x + x, z: point.z + z };
  }

  function convexHull2(points) {
    const unique = [];
    for (const point of points) {
      if (!unique.some(item => Math.hypot(item.x - point.x, item.z - point.z) < 0.01)) unique.push(point);
    }
    unique.sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
    if (unique.length <= 3) return unique;

    const lower = [];
    for (const point of unique) {
      while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    }

    const upper = [];
    for (let i = unique.length - 1; i >= 0; i--) {
      const point = unique[i];
      while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function cross2(a, b, c) {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  }

  function isRiverMouthZone(x, z) {
    if (distanceToMapEdge(x, z) < EDGE_OCEAN_WIDTH + 460) return true;
    const inBay = closestWaterBodyNormalized(BAYS, x, z) < 1.38;
    const onIsland = closestWaterBodyNormalized(ISLANDS, x, z) < 1.08;
    return inBay && !onIsland;
  }

  function createRiverMouths(rng, shoreMaterial, waterMaterial) {
    const mouthWaterMaterial = waterMaterial.clone();
    mouthWaterMaterial.color.setHex(0x319fc3);
    mouthWaterMaterial.roughness = 0.14;
    mouthWaterMaterial.metalness = 0.16;
    const wetSandMaterial = liftSurfaceMaterial(new THREE.MeshStandardMaterial({
      color: 0xded79f,
      roughness: 0.9,
      metalness: 0.02,
      transparent: true,
      opacity: 0.44,
      depthWrite: false
    }), -3, -3);
    const foamMaterial = liftSurfaceMaterial(new THREE.MeshBasicMaterial({
      color: 0xd8fbff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    }), -8, -8);
  
    for (const river of RIVER_SYSTEMS) {
      if (river.length < 2) continue;
      addMouth(river[0], river[1]);
      addMouth(river[river.length - 1], river[river.length - 2]);
    }
  
    function addMouth(endpoint, inside) {
      const edgeMouth = distanceToMapEdge(endpoint.x, endpoint.z) < EDGE_OCEAN_WIDTH + 280;
      const bayMouth = closestWaterBodyNormalized(BAYS, endpoint.x, endpoint.z) < 1.38 &&
        (closestWaterBodyNormalized(ISLANDS, endpoint.x, endpoint.z) > 1.08 ||
          isRiverMouthClearancePoint(endpoint.x, endpoint.z, 160));
      if (!edgeMouth && !bayMouth) return;
  
      const outward = new THREE.Vector2(endpoint.x - inside.x, endpoint.z - inside.z);
      if (outward.lengthSq() < 0.001) outward.set(1, 0);
      outward.normalize();
      const center = bayMouth
        ? { x: endpoint.x + outward.x * 130, z: endpoint.z + outward.y * 130 }
        : { x: endpoint.x + outward.x * 210, z: endpoint.z + outward.y * 210 };
      const heading = Math.atan2(-outward.y, outward.x);
      const width = bayMouth ? 720 : 640;
      const length = bayMouth ? 980 : 1060;
      if (edgeMouth) createEdgeMouthConnector(endpoint, inside, shoreMaterial, mouthWaterMaterial);
  
      const group = new THREE.Group();
      group.position.set(center.x, RIVER_SHORE_Y + 0.04, center.z);
      group.rotation.y = heading;
      scene.add(group);
  
      for (const side of [-1, 1]) {
        const sandbar = new THREE.Mesh(new THREE.CircleGeometry(1, 72), wetSandMaterial.clone());
        sandbar.rotation.x = -Math.PI / 2;
        sandbar.position.set(length * 0.02, 0.06, side * width * 0.38);
        sandbar.rotation.z = side * 0.18;
        sandbar.scale.set(length * 0.34, width * 0.13, 1);
        sandbar.receiveShadow = true;
        sandbar.renderOrder = 1;
        group.add(sandbar);
      }
  
      const channel = new THREE.Mesh(new THREE.CircleGeometry(1, 128), mouthWaterMaterial.clone());
      channel.rotation.x = -Math.PI / 2;
      channel.position.set(length * 0.04, RIVER_SURFACE_Y - RIVER_SHORE_Y + 0.12, 0);
      channel.scale.set(length * 0.72, width * 0.43, 1);
      channel.renderOrder = 2;
      group.add(channel);
  
      for (let i = 0; i < 9; i++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(62 + rng() * 90, 0.12, 2.6), foamMaterial.clone());
        band.position.set(
          -length * 0.25 + i * length * 0.065 + (rng() - 0.5) * 22,
          RIVER_FOAM_Y - RIVER_SHORE_Y + 0.12,
          (rng() - 0.5) * width * 0.44
        );
        band.rotation.y = (rng() - 0.5) * 0.2;
        band.renderOrder = 4;
        group.add(band);
        waterBands.push({
          mesh: band,
          baseX: band.position.x,
          phase: rng() * Math.PI * 2,
          speed: 0.34 + rng() * 0.4,
          travel: 6 + rng() * 10
        });
      }
    }

    function createEdgeMouthConnector(endpoint, inside, shoreMaterial, waterMaterial) {
      const anchor = riverPointAt(inside, endpoint, 0.18);
      const length = Math.hypot(endpoint.x - anchor.x, endpoint.z - anchor.z);
      if (length < 120) return;
      const angle = Math.atan2(-(endpoint.z - anchor.z), endpoint.x - anchor.x);
      const center = {
        x: (anchor.x + endpoint.x) / 2,
        z: (anchor.z + endpoint.z) / 2
      };

      const normalX = -(endpoint.z - anchor.z) / length;
      const normalZ = (endpoint.x - anchor.x) / length;

      for (const side of [-1, 1]) {
        const sediment = new THREE.Mesh(new THREE.CircleGeometry(1, 64), shoreMaterial.clone());
        sediment.rotation.x = -Math.PI / 2;
        sediment.rotation.z = -angle + side * 0.18;
        sediment.position.set(center.x + normalX * side * 126, RIVER_SHORE_Y + 0.08, center.z + normalZ * side * 126);
        sediment.scale.set(length * 0.42, 86, 1);
        sediment.receiveShadow = true;
        sediment.renderOrder = 1;
        scene.add(sediment);
      }

      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 96), waterMaterial.clone());
      water.rotation.x = -Math.PI / 2;
      water.rotation.z = -angle;
      water.position.set(center.x, RIVER_SURFACE_Y + 0.14, center.z);
      water.scale.set(length * 0.68 + 120, 118, 1);
      water.renderOrder = 5;
      scene.add(water);
    }
  }

  function createLakeRiverConfluences(rng, waterMaterial) {
    const confluenceMaterial = waterMaterial.clone();
    confluenceMaterial.color.setHex(0x2f93ba);
    confluenceMaterial.roughness = 0.14;