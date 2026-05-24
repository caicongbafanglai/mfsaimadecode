    confluenceMaterial.metalness = 0.14;
    confluenceMaterial.depthWrite = true;
    confluenceMaterial.polygonOffset = true;
    confluenceMaterial.polygonOffsetFactor = -8;
    confluenceMaterial.polygonOffsetUnits = -8;

    const rippleMaterial = liftSurfaceMaterial(new THREE.MeshBasicMaterial({
      color: 0xcaf7ff,
      transparent: true,
      opacity: 0.15,
      depthWrite: false
    }), -9, -9);

    const placed = [];
    for (const lake of LAKES) {
      for (const river of RIVER_SYSTEMS) {
        for (let i = 0; i < river.length - 1; i++) {
          const a = river[i];
          const b = river[i + 1];
          for (const crossing of lakeRiverCrossings(lake, a, b)) {
            if (placed.some(point => Math.hypot(point.x - crossing.x, point.z - crossing.z) < 145)) continue;
            placed.push(crossing);
            createLakeRiverConfluence(lake, crossing, a, b, rng, confluenceMaterial, rippleMaterial);
          }
        }
      }
    }
  }

  function createLakeRiverConfluence(lake, crossing, a, b, rng, confluenceMaterial, rippleMaterial) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const angle = Math.atan2(-dz, dx);
    const y = Math.max(lake.level + 0.18, RIVER_SURFACE_Y + 0.18);
    const major = Math.max(230, Math.min(360, lake.rx * 0.72));
    const minor = Math.max(134, Math.min(220, lake.rz * 0.72));

    const blend = new THREE.Mesh(new THREE.CircleGeometry(1, 128), confluenceMaterial.clone());
    blend.rotation.x = -Math.PI / 2;
    blend.rotation.z = -angle;
    blend.position.set(crossing.x, y, crossing.z);
    blend.scale.set(major, minor, 1);
    blend.renderOrder = 5;
    scene.add(blend);

    for (let i = 0; i < 4; i++) {
      const ripple = new THREE.Mesh(new THREE.BoxGeometry(70 + rng() * 90, 0.08, 2.4), rippleMaterial.clone());
      ripple.position.set(crossing.x, y + 0.08, crossing.z);
      ripple.rotation.y = angle + (rng() - 0.5) * 0.16;
      ripple.translateX((rng() - 0.5) * major * 0.38);
      ripple.translateZ((rng() - 0.5) * minor * 0.38);
      ripple.renderOrder = 6;
      scene.add(ripple);
      waterBands.push({
        mesh: ripple,
        baseX: ripple.position.x,
        phase: rng() * Math.PI * 2,
        speed: 0.28 + rng() * 0.38,
        travel: 3 + rng() * 6,
        worldAxis: true
      });
    }
  }

  function lakeRiverCrossings(lake, a, b, threshold = 1.02) {
    const crossings = [];
    const samples = 76;
    let prevT = 0;
    let prevN = waterBodyNormalized(lake, a.x, a.z) - threshold;

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const point = riverPointAt(a, b, t);
      const n = waterBodyNormalized(lake, point.x, point.z) - threshold;

      if ((prevN <= 0 && n > 0) || (prevN > 0 && n <= 0)) {
        const hitT = refineLakeCrossing(lake, a, b, prevT, t, threshold, prevN <= 0);
        const hit = riverPointAt(a, b, hitT);
        if (!crossings.some(point => Math.hypot(point.x - hit.x, point.z - hit.z) < 90)) crossings.push(hit);
      }

      prevT = t;
      prevN = n;
    }

    return crossings;
  }

  function refineLakeCrossing(lake, a, b, lo, hi, threshold, loInside) {
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) * 0.5;
      const point = riverPointAt(a, b, mid);
      const inside = waterBodyNormalized(lake, point.x, point.z) <= threshold;
      if (inside === loInside) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) * 0.5;
  }

  function riverPointAt(a, b, t) {
    return {
      x: THREE.MathUtils.lerp(a.x, b.x, t),
      z: THREE.MathUtils.lerp(a.z, b.z, t)
    };
  }

  function edgeRiverMouthPoint(endpoint, inside) {
    const half = MAP_SIZE / 2;
    const coast = half - EDGE_OCEAN_WIDTH - 18;
    const dx = endpoint.x - inside.x;
    const dz = endpoint.z - inside.z;
    let t = 0.72;
  
    if (Math.abs(endpoint.x) > Math.abs(endpoint.z) && Math.abs(dx) > 0.001) {
      const sign = Math.sign(endpoint.x || dx);
      const targetX = sign * (coast + coastlineOffset(false, sign, endpoint.z));
      t = THREE.MathUtils.clamp((targetX - inside.x) / dx, 0, 1);
    } else if (Math.abs(dz) > 0.001) {
      const sign = Math.sign(endpoint.z || dz);
      const targetZ = sign * (coast + coastlineOffset(true, sign, endpoint.x));
      t = THREE.MathUtils.clamp((targetZ - inside.z) / dz, 0, 1);
    }
  
    return {
      x: THREE.MathUtils.lerp(inside.x, endpoint.x, t),
      z: THREE.MathUtils.lerp(inside.z, endpoint.z, t)
    };
  }

  function updateWater(dt) {
    for (const band of waterBands) {
      band.phase += dt * band.speed;
      const drift = Math.sin(band.phase) * band.travel;
      if (band.worldAxis) {
        band.mesh.position.x = band.baseX + drift;
      } else {
        band.mesh.position.x = band.baseX + drift;
      }
      if (band.baseOpacity === undefined) band.baseOpacity = band.mesh.material?.opacity ?? 0.1;
      if (band.mesh.material && Math.abs((band.mesh.material.opacity ?? 0) - band.baseOpacity) > 0.0001) {
        band.mesh.material.opacity = band.baseOpacity;
        band.mesh.material.needsUpdate = true;
      }
    }
  }

  return {
    createWaterSystems,
    updateWater
  };
}

function createGlossFalloffTexture() {
  if (glossFalloffTexture) return glossFalloffTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.46)');
  gradient.addColorStop(0.78, 'rgba(255,255,255,0.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  glossFalloffTexture = new THREE.CanvasTexture(canvas);
  glossFalloffTexture.needsUpdate = true;
  return glossFalloffTexture;
}
