    }
  }
  return best?.name || '';
}

function islandMountainTaper(x, z) {
  let best = Infinity;
  for (const island of ISLANDS) best = Math.min(best, waterBodyNormalized(island, x, z));
  const shoreFade = 1 - smoothstep(0.72, 1.02, best);
  return THREE.MathUtils.clamp(shoreFade, 0, 1);
}

function applyPineBasinSouthSlopeRepair(height, x, z) {
  const airport = PINE_BASIN_AIRPORT;
  if (!airport) return height;

  const local = airportLocal(airport, x, z);
  if (isInAirportPavementLocal(airport, local, 56)) return height;

  const sideBand = smoothstep(180, 520, local.x) * (1 - smoothstep(1430, 1740, local.x));
  const lengthBand = smoothstep(-460, -120, local.z) * (1 - smoothstep(1120, 1520, local.z));
  const lakeN = closestLakeNormalized(x, z);
  const lakeClearance = smoothstep(0.9, 1.14, lakeN);
  const sideRepair = sideBand * lengthBand * lakeClearance;

  const uphill = smoothstep(2520, 3350, z);
  const naturalBreakup =
    Math.sin((x + z) * 0.006) * 4.5 +
    Math.cos(local.x * 0.01 + local.z * 0.003) * 3.2;
  const slopeTarget = WATER_LEVEL + 18 + uphill * ((airport.elevation || 146) - WATER_LEVEL - 28) + naturalBreakup * (0.35 + uphill * 0.65);
  let repairedHeight = THREE.MathUtils.lerp(height, Math.max(height, slopeTarget), sideRepair * 0.74);

  const outerShoulderBand = (1 - smoothstep(360, 640, Math.abs(local.x))) *
    smoothstep(820, 980, local.z) *
    (1 - smoothstep(1420, 1660, local.z)) *
    lakeClearance;
  if (outerShoulderBand <= 0) return repairedHeight;

  const shoulderDescent = smoothstep(1120, 1450, local.z);
  const shoreProgress = smoothstep(1.02, 1.72, lakeN);
  const shoulderTarget = WATER_LEVEL + 52 + shoreProgress * 72 + (1 - shoulderDescent) * 18 + naturalBreakup * 0.56;
  repairedHeight = THREE.MathUtils.lerp(repairedHeight, Math.max(repairedHeight, shoulderTarget), outerShoulderBand * 0.72);
  return repairedHeight;
}

function applyHiddenIslandAirportSlopeRing(height, airport, local) {
  if (airport.airportCategory !== 'HIDDEN_REMOTE_AIRFIELD') return height;
  if (isInAirportPavementLocal(airport, local, 92)) return height;

  const runwayLength = airport.runwayLength || 1320;
  const runwayWidth = airport.runwayWidth || 98;
  const size = airport.size || 1;
  const taxiX = runwayWidth * 1.18 + 70 * size;
  const taxiZ = runwayLength * 0.08;
  const taxiLength = Math.max(430 * size, runwayLength * 0.45);
  const apronW = airport.apronWidth || 420 * size;
  const apronD = airport.apronDepth || 310 * size;
  const apronX = taxiX + apronW * 0.45;
  const apronZ = runwayLength * 0.16;

  const runwayGuard = rectFalloff(local.x, local.z, runwayWidth * 3.1 + 84, runwayLength * 0.5 + 210, 170);
  const taxiGuard = rectFalloff(local.x - taxiX, local.z - taxiZ, Math.max(80, 92 * size), taxiLength * 0.5 + 126, 140);
  const apronGuard = rectFalloff(local.x - apronX, local.z - apronZ, apronW * 0.5 + 118, apronD * 0.5 + 126, 145);
  const clearCore = Math.max(runwayGuard, taxiGuard, apronGuard);
  if (clearCore > 0.64) return height;

  const radial = Math.hypot(local.x * 1.06, local.z * 0.82);
  const inner = runwayLength * 0.5 + 92;
  const outer = runwayLength * 0.5 + 520;
  const ring = smoothstep(inner, inner + 220, radial) * (1 - smoothstep(outer - 180, outer + 170, radial));
  if (ring <= 0) return height;

  const sideBias = smoothstep(runwayWidth * 3.8, runwayWidth * 10.5, Math.abs(local.x)) * (1 - smoothstep(930, 1250, Math.abs(local.x)));
  const endBias = smoothstep(runwayLength * 0.46, runwayLength * 0.68, Math.abs(local.z)) * (1 - smoothstep(runwayLength * 0.75, runwayLength * 0.95, Math.abs(local.z)));
  const irregular =
    Math.sin(local.x * 0.011 + local.z * 0.006 + 1.7) * 2.8 +
    Math.cos(local.x * 0.005 - local.z * 0.012) * 2.1;
  const slopeHeight = 8 + sideBias * 18 + endBias * 9 + irregular;
  const target = (airport.elevation || 0) + Math.max(5, slopeHeight);
  const strength = ring * (1 - clearCore * 0.78) * 0.72;
  return THREE.MathUtils.lerp(height, Math.max(height, target), strength);
}

function applyPineHighValleyCoastalRepair(height, x, z, mapEdge) {
  const xBand = smoothstep(350, 850, x) * (1 - smoothstep(3200, 3800, x));
  const zBand = smoothstep(4480, 4880, z);
  if (xBand <= 0 || zBand <= 0) return height;

  for (const airport of AIRPORTS) {
    if (airport.short !== 'High Valley' && airport.short !== 'Pine Basin') continue;
    if (isInAirportPavementLocal(airport, airportLocal(airport, x, z), 42)) return height;
  }

  const oceanDrop = 1 - smoothstep(EDGE_OCEAN_WIDTH - 120, EDGE_OCEAN_WIDTH + 45, mapEdge);
  if (oceanDrop <= 0) return height;

  const coastalShelf = WATER_LEVEL - 9 + Math.max(0, mapEdge) * 0.013;
  const repair = xBand * zBand * oceanDrop;
  return THREE.MathUtils.lerp(height, Math.min(height, coastalShelf), repair);
}

function mountainCoastalTaper(x, z) {
  const edgeTaper = smoothstep(EDGE_OCEAN_WIDTH + 70, EDGE_OCEAN_WIDTH + 1220, distanceToMapEdge(x, z));
  const onIsland = closestWaterBodyNormalized(ISLANDS, x, z) < 1.16;
  const bayTaper = onIsland ? 1 : smoothstep(1.06, 1.92, closestWaterBodyNormalized(BAYS, x, z));
  return edgeTaper * bayTaper;
}
