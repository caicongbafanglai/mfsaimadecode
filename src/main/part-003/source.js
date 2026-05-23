      ? 'dusk/dawn'
      : cycleState.daylight > 0.7
        ? 'day'
        : 'transition';
  console.info('Lighting Check:', {
    phase,
    serverSync: report.serverSync,
    cityWindows: report.cityWindows,
    villageLights: report.villageLights,
    runwayLights: report.runwayLights,
    apronLights: report.apronLights,
    dawnFadeOut: report.dawnFadeOut,
    duskFadeIn: report.duskFadeIn,
    multiplayerAircraft: report.multiplayerAircraft
  });
}

function cleanupMapGuideLines() {
  scene.traverse(object => {
    if (isDescendantOf(object, aircraft.group)) return;
    if (object.isLine || object.isLineSegments || object.isLineLoop) {
      object.visible = false;
      object.userData.cleanedMapGuideLine = true;
    }
    const material = object.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
      if (item?.wireframe) {
        item.wireframe = false;
        item.needsUpdate = true;
      }
    }
  });
}

function createFramePerformanceMonitor(getQuality) {
  const samples = [];
  const longTasks = [];
  let longTaskCount = 0;
  let latestFrameTimeMs = 0;
  let latestCpuMs = 0;
  let latestHeapBytes = performance.memory?.usedJSHeapSize || 0;
  let gcSpikeUntilMs = 0;
  let frameSpikeReason = '';
  let checkAccumulator = 0;
  let stableAccumulator = 0;

  try {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          longTaskCount++;
          longTasks.push({ timeMs: performance.now(), durationMs: entry.duration || 0 });
        }
        pruneLongTasks(performance.now());
      });
      observer.observe({ type: 'longtask', buffered: true });
    }
  } catch {
    // Long Task API is optional; Safari usually does not expose it.
  }

  function recordFrame(dt, cpuMs = 0, rendered = true) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const nowMs = performance.now();
    const quality = getQuality?.() || renderQuality;
    const frameTimeMs = dt * 1000;
    latestFrameTimeMs = frameTimeMs;
    latestCpuMs = cpuMs;
    samples.push({ timeMs: nowMs, frameTimeMs, cpuMs, rendered });
    pruneSamples(nowMs);

    const heapBytes = performance.memory?.usedJSHeapSize || 0;
    if (heapBytes > 0 && latestHeapBytes > 0) {
      const heapDropMb = (latestHeapBytes - heapBytes) / (1024 * 1024);
      if (heapDropMb > 8 && frameTimeMs > Math.max(36, (quality.softFrameMs || quality.targetFrameMs || 16.7) * 1.7)) {
        gcSpikeUntilMs = nowMs + 5000;
        frameSpikeReason = `heap drop ${heapDropMb.toFixed(1)} MB`;
      }
    }
    latestHeapBytes = heapBytes || latestHeapBytes;
    if (frameTimeMs > Math.max(60, (quality.softFrameMs || 22) * 2.4)) {
      frameSpikeReason = `long frame ${frameTimeMs.toFixed(0)} ms`;
    }
  }

  function updateGovernor(dt) {
    checkAccumulator += dt;
    const quality = getQuality?.() || renderQuality;
    const checkSeconds = quality.degradeCheckSeconds || 5;
    if (checkAccumulator < checkSeconds) return 'none';

    const elapsed = checkAccumulator;
    checkAccumulator = 0;
    const stats = windowStats();
    const targetFps = quality.targetFPS || 60;
    const softFrameMs = quality.softFrameMs || Math.max(1000 / targetFps * 1.12, 22);
    const hardFrameMs = quality.frameBudgetHardMs || softFrameMs * 1.8;
    const badWindow =
      stats.averageFrameTimeMs > softFrameMs ||
      stats.onePercentLowFps < targetFps * 0.74 ||
      stats.maxFrameTimeLast5sMs > hardFrameMs ||
      latestCpuMs > softFrameMs * 0.92;

    if (badWindow) {
      stableAccumulator = 0;
      return 'degrade';
    }

    const stableWindow =
      stats.averageFrameTimeMs < softFrameMs * 0.82 &&
      stats.maxFrameTimeLast5sMs < hardFrameMs * 0.72 &&
      stats.onePercentLowFps >= targetFps * 0.92 &&
      latestCpuMs < softFrameMs * 0.55;

    if (!stableWindow) {
      stableAccumulator = 0;
      return 'none';
    }

    stableAccumulator += elapsed;
    if (stableAccumulator >= (quality.restoreStableSeconds || 20)) {
      stableAccumulator = 0;
      return 'restore';
    }
    return 'none';
  }

  function snapshot() {
    const stats = windowStats();
    const heapBytes = performance.memory?.usedJSHeapSize || latestHeapBytes;
    const nowMs = performance.now();
    return {
      ...stats,
      frameTimeMs: latestFrameTimeMs,
      cpuFrameMs: latestCpuMs,
      jsHeapUsedMb: heapBytes ? heapBytes / (1024 * 1024) : null,
      gcSpikeWarning: nowMs < gcSpikeUntilMs ? frameSpikeReason || 'yes' : 'no',
      longTaskCount,
      longTaskCountLast5s: longTasks.length
    };
  }

  function markFrameSpike(reason) {
    frameSpikeReason = reason || 'frame spike';
    gcSpikeUntilMs = performance.now() + 3000;
  }

  function windowStats() {
    const nowMs = performance.now();
    pruneSamples(nowMs);
    if (!samples.length) {
      return {
        averageFrameTimeMs: 0,
        maxFrameTimeLast5sMs: 0,
        onePercentLowFps: 0
      };
    }
    let total = 0;
    let max = 0;
    const frameTimes = [];
    for (const sample of samples) {
      total += sample.frameTimeMs;
      max = Math.max(max, sample.frameTimeMs);
      frameTimes.push(sample.frameTimeMs);
    }
    frameTimes.sort((a, b) => b - a);
    const lowCount = Math.max(1, Math.ceil(frameTimes.length * 0.01));
    let worstTotal = 0;
    for (let i = 0; i < lowCount; i++) worstTotal += frameTimes[i];
    const worstAverage = worstTotal / lowCount;
    return {
      averageFrameTimeMs: total / samples.length,
      maxFrameTimeLast5sMs: max,
      onePercentLowFps: worstAverage > 0 ? 1000 / worstAverage : 0
    };
  }

  function pruneSamples(nowMs) {
    const minTime = nowMs - 5000;
    while (samples.length && samples[0].timeMs < minTime) samples.shift();
    pruneLongTasks(nowMs);
  }

  function pruneLongTasks(nowMs) {
    const minTime = nowMs - 5000;
    while (longTasks.length && longTasks[0].timeMs < minTime) longTasks.shift();
  }

  return {
    recordFrame,
    updateGovernor,
    snapshot,
    markFrameSpike
  };
}

function createDetailCuller(excludedRoot) {
  const lodEntries = [];
  const lodWorldPosition = new THREE.Vector3();
  let accumulator = 0;

  scene.traverse(object => {
    if (isDescendantOf(object, excludedRoot)) return;
    if (object.userData.cleanedMapGuideLine || object.isLine || object.isLineSegments || object.isLineLoop) {
      object.visible = false;
      return;
    }
    if (object.isMesh || object.isInstancedMesh || object.isLine || object.isPoints) {
      object.visible = true;
      if (object.userData.longRangeVisual || object.isLine || object.isPoints) object.frustumCulled = false;
    }
    if (object.userData.stableLod) {
      lodEntries.push({
        object,
        config: object.userData.stableLod,
        visible: true,
        alpha: 1,
        targetAlpha: 1
      });
    }
  });

  function update(dt) {
    accumulator += dt;
    if (accumulator < 0.12) return;
    const step = accumulator;
    accumulator = 0;
    for (const entry of lodEntries) updateLodEntry(entry, step);
  }

  function updateLodEntry(entry, dt) {
    const distance = qualityLodDistance(entry.config, renderQuality);
    if (!Number.isFinite(distance) || distance <= 0) return;
    const hysteresis = entry.config.hysteresis ?? renderQuality.hysteresis ?? 0.2;
    entry.object.getWorldPosition(lodWorldPosition);
    const distanceToCamera = lodWorldPosition.distanceTo(camera.position);
    const enterDistance = distance * (1 - hysteresis * 0.5);
    const exitDistance = distance * (1 + hysteresis * 0.5);

    if (entry.visible && distanceToCamera > exitDistance) entry.visible = false;
    if (!entry.visible && distanceToCamera < enterDistance) entry.visible = true;

    entry.targetAlpha = entry.visible ? 1 : 0;
    const fadeSeconds = entry.config.fadeSeconds ?? 0;
    if (fadeSeconds <= 0) {
      entry.alpha = entry.targetAlpha;
      entry.object.visible = entry.visible;
      return;
    }

    entry.alpha = THREE.MathUtils.damp(entry.alpha, entry.targetAlpha, 5 / fadeSeconds, dt);
    entry.object.visible = entry.alpha > 0.025;
    applyLodOpacity(entry.object, entry.alpha);
  }

  return {
    update,
    applyQuality() {
      for (const entry of lodEntries) updateLodEntry(entry, 1 / 30);
    }
  };
}

function qualityLodDistance(config, quality) {
  if (config.distanceByQuality?.[quality.key]) return config.distanceByQuality[quality.key];
  if (config.distanceByQuality?.[quality.legacyKey]) return config.distanceByQuality[quality.legacyKey];
  return config.distance || quality.groundDetailDistance || 6000;
}

function applyLodOpacity(root, alpha) {
  root.traverse(object => {
    const material = object.material;
    if (!material) return;
    if (Array.isArray(material)) {
      for (let i = 0; i < material.length; i++) material[i] = fadeMaterial(material[i], alpha);
      return;
    }
    object.material = fadeMaterial(material, alpha);
  });
}

function fadeMaterial(material, alpha) {
  if (!material) return material;
  if (!material.userData.lodFadeMaterial) {
    const clone = material.clone();
    clone.userData.lodFadeMaterial = true;
    clone.userData.lodBaseOpacity = material.opacity ?? 1;
    clone.userData.baseTransparent = material.transparent === true;
    clone.userData.baseDepthWrite = material.depthWrite !== false;
    material = clone;
  }
  const baseOpacity = material.userData.lodBaseOpacity ?? material.userData.baseOpacity ?? 1;
  material.opacity = baseOpacity * alpha;
  material.transparent = alpha < 0.999 || material.userData.baseTransparent;
  material.depthWrite = alpha >= 0.999 ? material.userData.baseDepthWrite : false;
  material.needsUpdate = true;
  return material;
}

function isDescendantOf(object, root) {
  for (let current = object; current; current = current.parent) {
    if (current === root) return true;
  }
  return false;
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
