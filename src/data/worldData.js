export const MAP_SIZE = 52000;
export const WATER_LEVEL = -2.4;
export const EDGE_OCEAN_WIDTH = 760;
export const EDGE_OCEAN_EXTENT = 96000;
export const RIVER_SURFACE_Y = WATER_LEVEL + 0.72;
export const RIVER_SHORE_Y = WATER_LEVEL + 0.18;
export const RIVER_BANK_Y = WATER_LEVEL + 0.86;
export const RIVER_FOAM_Y = WATER_LEVEL + 1.02;
export const PLAYER_AIRCRAFT_SCALE = 1.14;
export const A320_GEAR_GROUND_OFFSET = 6.15;
export const AIRCRAFT_GROUND_OFFSET = A320_GEAR_GROUND_OFFSET * PLAYER_AIRCRAFT_SCALE + 0.62;

export const CONTINENTS = [
  { name: 'Aurora Mainland', x: -9800, z: -5300, rx: 7050, rz: 4950, rotation: -0.22, shoreIrregularity: 0.18, shoreSeed: 1.18 },
  { name: 'Meridian Continent', x: 6900, z: -3100, rx: 7600, rz: 5450, rotation: 0.18, shoreIrregularity: 0.16, shoreSeed: 2.73 },
  { name: 'Southreach Continent', x: -3900, z: 9200, rx: 7200, rz: 4450, rotation: 0.08, shoreIrregularity: 0.17, shoreSeed: 4.14 },
  { name: 'Cascade Peninsula', x: -20500, z: 6600, rx: 5200, rz: 3350, rotation: -0.46, shoreIrregularity: 0.2, shoreSeed: 18.4 },
  { name: 'Northstar Coast', x: 2500, z: -19700, rx: 4650, rz: 2760, rotation: 0.26, shoreIrregularity: 0.19, shoreSeed: 19.6 }
];

export const ISLANDS = [
  { name: 'Harbor Cay', x: 13300, z: 5850, rx: 1850, rz: 1120, rotation: -0.18, houses: 78, shoreIrregularity: 0.18, shoreSeed: 5.1 },
  { name: 'Beacon Isle', x: 10400, z: 10100, rx: 1220, rz: 820, rotation: 0.42, houses: 48, shoreIrregularity: 0.16, shoreSeed: 5.8 },
  { name: 'Windward Isle', x: 14600, z: 10400, rx: 860, rz: 560, rotation: -0.34, houses: 26, shoreIrregularity: 0.2, shoreSeed: 6.4 },
  { name: 'Outer Reef Island', x: 15800, z: -2600, rx: 1040, rz: 620, rotation: 0.28, houses: 30, shoreIrregularity: 0.18, shoreSeed: 7.2 },
  { name: 'Northwatch Island', x: -3100, z: -14000, rx: 1380, rz: 720, rotation: -0.12, houses: 42, shoreIrregularity: 0.17, shoreSeed: 8.6 },
  { name: 'Sable Island', x: -12600, z: 5400, rx: 980, rz: 560, rotation: 0.58, houses: 24, shoreIrregularity: 0.19, shoreSeed: 9.5 },
  { name: 'Twin Sand East', x: 16100, z: 7600, rx: 520, rz: 330, rotation: 0.1, houses: 12, shoreIrregularity: 0.18, shoreSeed: 10.1 },
  { name: 'Twin Sand West', x: 15320, z: 7050, rx: 480, rz: 360, rotation: -0.5, houses: 10, shoreIrregularity: 0.2, shoreSeed: 10.8 },
  { name: 'Farpoint Island', x: 22000, z: -7900, rx: 1540, rz: 910, rotation: 0.34, houses: 44, shoreIrregularity: 0.18, shoreSeed: 20.2 },
  { name: 'Crescent Isle', x: 20500, z: 14000, rx: 1380, rz: 640, rotation: -0.38, houses: 36, shoreIrregularity: 0.21, shoreSeed: 21.1 },
  { name: 'Mistral Key', x: -21600, z: 12800, rx: 940, rz: 520, rotation: 0.22, houses: 20, shoreIrregularity: 0.19, shoreSeed: 22.3 },
  { name: 'Outer Shoal', x: 23800, z: 7600, rx: 760, rz: 390, rotation: 0.12, houses: 16, shoreIrregularity: 0.2, shoreSeed: 23.7 },
  { name: 'Remote Outpost Island', x: -23200, z: 21800, rx: 1180, rz: 690, rotation: -0.34, houses: 0, hiddenIsland: true, noResidential: true, shoreIrregularity: 0.24, shoreSeed: 31.4 }
];

export const LANDMASSES = [...CONTINENTS, ...ISLANDS];

export const AIRPORTS = [
  { name: 'Aurora International', short: 'Aurora Intl', region: 'Aurora Mainland', tier: 'international', runwayClass: 'A', a320Recommended: true, x: -10400, z: -6150, heading: Math.PI * 0.08, runway: '02', size: 1.86, runwayLength: 3720, runwayWidth: 58, apronWidth: 980, apronDepth: 560, flattenInner: 2050, flattenOuter: 3600 },
  { name: 'Meridian International', short: 'Meridian Intl', region: 'Meridian Continent', tier: 'international', runwayClass: 'A', a320Recommended: true, x: 6600, z: -3520, heading: Math.PI * 0.42, runway: '15', size: 1.78, runwayLength: 3600, runwayWidth: 56, apronWidth: 940, apronDepth: 540, flattenInner: 1980, flattenOuter: 3450 },
  { name: 'Southreach Gateway', short: 'Southreach', region: 'Southreach Continent', tier: 'international', runwayClass: 'A', a320Recommended: true, x: -3600, z: 8720, heading: Math.PI * 0.31, runway: '11', size: 1.62, runwayLength: 3420, runwayWidth: 54, apronWidth: 850, apronDepth: 510, flattenInner: 1880, flattenOuter: 3300 },
  { name: 'Harbor Cay International', short: 'Harbor Intl', region: 'Harbor Cay', tier: 'regional', runwayClass: 'B', a320Recommended: true, x: 13280, z: 5920, heading: Math.PI * 0.53, runway: '09', size: 1.34, runwayLength: 2860, runwayWidth: 44, apronWidth: 690, apronDepth: 420, flattenInner: 1480, flattenOuter: 2650 },
  { name: 'Aurora North Regional', short: 'Aurora North', region: 'Aurora Mainland', tier: 'regional', runwayClass: 'B', a320Recommended: true, x: -12550, z: -2080, heading: Math.PI * 0.58, runway: '21', size: 1.18, runwayLength: 2520, runwayWidth: 42, flattenInner: 1320, flattenOuter: 2350 },
  { name: 'Silver Lake Regional', short: 'Silver Lake', region: 'Aurora Mainland', tier: 'regional', runwayClass: 'B', a320Recommended: true, x: -7200, z: -8200, heading: Math.PI * 0.35, runway: '12', size: 1.12, runwayLength: 2320, runwayWidth: 40, flattenInner: 1220, flattenOuter: 2180 },
  { name: 'Meridian East Regional', short: 'Meridian East', region: 'Meridian Continent', tier: 'regional', runwayClass: 'B', a320Recommended: true, x: 10800, z: -850, heading: Math.PI * 0.72, runway: '26', size: 1.12, runwayLength: 2460, runwayWidth: 42, flattenInner: 1280, flattenOuter: 2300 },
  { name: 'South Cape Regional', short: 'South Cape', region: 'Southreach Continent', tier: 'regional', runwayClass: 'B', a320Recommended: true, x: -1200, z: 12200, heading: Math.PI * 0.62, runway: '22', size: 1.08, runwayLength: 2280, runwayWidth: 40, flattenInner: 1180, flattenOuter: 2120 },
  { name: 'Northwatch Field', short: 'Northwatch', region: 'Northwatch Island', tier: 'local', runwayClass: 'C', a320Recommended: false, x: -3100, z: -14020, heading: Math.PI * 0.5, runway: '09', size: 0.88, runwayLength: 1680, runwayWidth: 32, flattenInner: 840, flattenOuter: 1480 },
  { name: 'Beacon Island Field', short: 'Beacon', region: 'Beacon Isle', tier: 'local', runwayClass: 'C', a320Recommended: false, x: 10400, z: 10090, heading: Math.PI * 0.2, runway: '04', size: 0.82, runwayLength: 1540, runwayWidth: 30, flattenInner: 780, flattenOuter: 1380 },
  { name: 'Sable Coast Strip', short: 'Sable', region: 'Sable Island', tier: 'local', runwayClass: 'C', a320Recommended: false, x: -12620, z: 5400, heading: Math.PI * 0.67, runway: '24', size: 0.72, runwayLength: 1220, runwayWidth: 28, flattenInner: 620, flattenOuter: 1080 },
  { name: 'Ridge Gate Approach', short: 'Ridge Gate', region: 'Southreach Continent', tier: 'special', runwayClass: 'D', a320Recommended: 'challenge', x: -7200, z: 11100, heading: Math.PI * 0.55, runway: '20', elevation: 135, size: 0.94, runwayLength: 2240, runwayWidth: 38, flattenInner: 1120, flattenOuter: 2020, challenge: { end: 1, wallDistance: 940, wallHeight: 220, gullySide: -1 } },
  { name: 'Cliffturn Valley', short: 'Cliffturn', region: 'Meridian Continent', tier: 'special', runwayClass: 'D', a320Recommended: 'challenge', x: 9800, z: -5900, heading: Math.PI * 0.18, runway: '03', elevation: 118, size: 0.88, runwayLength: 2220, runwayWidth: 38, flattenInner: 1110, flattenOuter: 2000, challenge: { end: -1, wallDistance: 900, wallHeight: 190, gullySide: 1 } },
  { name: 'Cascade Coast Regional', short: 'Cascade Coast', region: 'Cascade Peninsula', tier: 'regional', runwayClass: 'B', a320Recommended: true, x: -20700, z: 6500, heading: Math.PI * 0.38, runway: '14', size: 1.08, runwayLength: 2480, runwayWidth: 42, flattenInner: 1300, flattenOuter: 2320 },
  { name: 'Northstar Outpost', short: 'Northstar', region: 'Northstar Coast', tier: 'local', runwayClass: 'C', a320Recommended: false, x: 2600, z: -19680, heading: Math.PI * 0.82, runway: '30', size: 0.92, runwayLength: 1760, runwayWidth: 34, flattenInner: 900, flattenOuter: 1560 },
  { name: 'Farpoint Island Field', short: 'Farpoint', region: 'Farpoint Island', tier: 'local', runwayClass: 'C', a320Recommended: false, x: 22030, z: -7920, heading: Math.PI * 0.32, runway: '12', size: 0.84, runwayLength: 1500, runwayWidth: 30, flattenInner: 760, flattenOuter: 1320 },
  { name: 'Crescent Island Field', short: 'Crescent', region: 'Crescent Isle', tier: 'local', runwayClass: 'C', a320Recommended: false, x: 20480, z: 14020, heading: Math.PI * 0.61, runway: '22', size: 0.78, runwayLength: 1420, runwayWidth: 30, flattenInner: 720, flattenOuter: 1260 },
  { name: 'nothing there', short: 'nothing there', region: 'Remote Outpost Island', tier: 'remote', runwayClass: 'C', airportCategory: 'HIDDEN_REMOTE_AIRFIELD', a320Recommended: false, isRemoteIslandField: true, x: -23580, z: 22180, heading: Math.PI * 0.17, runway: '03', size: 0.66, runwayLength: 1480, runwayWidth: 24, apronWidth: 260, apronDepth: 170, flattenInner: 620, flattenOuter: 1080, hasRunwayLights: false, hasTaxiwayLights: false, hasApronLights: false, hasApproachLights: false, hasPAPI: false, isNightCapable: false }
];

export const LAKES = [
  { name: 'Silver Lake', x: -7750, z: -7600, rx: 1180, rz: 620, rotation: -0.28, level: WATER_LEVEL + 0.15, shoreIrregularity: 0.1, shoreSeed: 12.2 },
  { name: 'Pine Lake', x: -10700, z: -2550, rx: 760, rz: 430, rotation: 0.46, level: WATER_LEVEL + 0.5, shoreIrregularity: 0.09, shoreSeed: 12.9 },
  { name: 'Meridian Lake', x: 5700, z: -850, rx: 1160, rz: 640, rotation: 0.12, level: WATER_LEVEL + 0.3, shoreIrregularity: 0.1, shoreSeed: 13.8 },
  { name: 'Southreach Tarns', x: -5700, z: 10350, rx: 820, rz: 420, rotation: -0.35, level: WATER_LEVEL + 1.1, shoreIrregularity: 0.12, shoreSeed: 14.4 },
  { name: 'Cascade Lagoon', x: -21900, z: 7750, rx: 920, rz: 520, rotation: -0.48, level: WATER_LEVEL + 0.55, shoreIrregularity: 0.12, shoreSeed: 24.2 },
  { name: 'Northstar Mere', x: 1000, z: -20480, rx: 760, rz: 440, rotation: 0.28, level: WATER_LEVEL + 0.65, shoreIrregularity: 0.1, shoreSeed: 25.4 }
];

export const BAYS = [
  { name: 'Aurora Gulf', x: -6400, z: -9300, rx: 1420, rz: 1880, rotation: -0.36, level: WATER_LEVEL - 0.25, shoreIrregularity: 0.16, shoreSeed: 15.5 },
  { name: 'Meridian Sound', x: 11900, z: -3320, rx: 1360, rz: 2140, rotation: 0.24, level: WATER_LEVEL - 0.25, shoreIrregularity: 0.16, shoreSeed: 16.2 },
  { name: 'Southreach Bay', x: -800, z: 7800, rx: 1320, rz: 1760, rotation: 0.6, level: WATER_LEVEL - 0.22, shoreIrregularity: 0.14, shoreSeed: 17.1 },
  { name: 'Cascade Bight', x: -22950, z: 5200, rx: 1320, rz: 1680, rotation: -0.2, level: WATER_LEVEL - 0.24, shoreIrregularity: 0.18, shoreSeed: 26.1 },
  { name: 'Northstar Fjord', x: 4250, z: -21100, rx: 980, rz: 1450, rotation: 0.42, level: WATER_LEVEL - 0.26, shoreIrregularity: 0.2, shoreSeed: 27.5 },
  { name: 'Crescent Sound', x: 19800, z: 13200, rx: 980, rz: 1280, rotation: -0.42, level: WATER_LEVEL - 0.22, shoreIrregularity: 0.18, shoreSeed: 28.7 }
];

export const RIVER_POINTS = [
  { x: -15600, z: -5050 },
  { x: -14200, z: -4550 },
  { x: -12840, z: -3880 },
  { x: -11300, z: -4200 },
  { x: -9800, z: -5480 },
  { x: -8650, z: -6900 },
  { x: -7750, z: -7600 },
  { x: -6760, z: -8520 },
  { x: -6120, z: -9820 }
];

export const SECONDARY_RIVERS = [
  [
    { x: -12000, z: -1300 },
    { x: -11100, z: -2220 },
    { x: -10400, z: -3120 },
    { x: -9800, z: -5480 }
  ],
  [
    { x: 2300, z: -3580 },
    { x: 4050, z: -2520 },
    { x: 5700, z: -850 },
    { x: 7420, z: -1380 },
    { x: 9300, z: -2420 },
    { x: 11200, z: -3460 },
    { x: 12600, z: -3900 }
  ],
  [
    { x: 7000, z: 1180 },
    { x: 6400, z: 320 },
    { x: 5700, z: -850 }
  ],
  [
    { x: -8200, z: 11620 },
    { x: -6900, z: 10880 },
    { x: -5700, z: 10350 },
    { x: -4200, z: 9680 },
    { x: -2450, z: 8520 },
    { x: -920, z: 7480 }
  ],
  [
    { x: -5600, z: 12580 },
    { x: -5940, z: 11680 },
    { x: -5700, z: 10350 }
  ],
  [
    { x: -24400, z: 8700 },
    { x: -23100, z: 8120 },
    { x: -21900, z: 7750 },
    { x: -20700, z: 6760 },
    { x: -19400, z: 5720 },
    { x: -18400, z: 4300 }
  ],
  [
    { x: -1600, z: -21300 },
    { x: -340, z: -20840 },
    { x: 1000, z: -20480 },
    { x: 2380, z: -19940 },
    { x: 3980, z: -20840 },
    { x: 5200, z: -21900 }
  ],
  [
    { x: 21000, z: 12880 },
    { x: 20250, z: 13380 },
    { x: 19800, z: 14050 },
    { x: 19520, z: 15080 }
  ]
];
export const RIVER_SYSTEMS = [RIVER_POINTS, ...SECONDARY_RIVERS];

export const BRIDGES = [
  { name: 'Aurora West Bridge', x: -13000, z: -3950, heading: Math.PI * 0.3, length: 680, width: 74, lift: 12, clearance: 26 },
  { name: 'Aurora Gulf Bridge', x: -6640, z: -8764, heading: Math.PI * 0.18, length: 620, width: 70, lift: 11, clearance: 26 },
  { name: 'Meridian Sound Bridge', x: 10800, z: -3150, heading: Math.PI * 0.26, length: 720, width: 76, lift: 13, clearance: 30 },
  { name: 'Meridian Lake Bridge', x: 5900, z: -720, heading: Math.PI * 0.52, length: 560, width: 64, lift: 10, clearance: 24 },
  { name: 'Southreach Bay Bridge', x: -2200, z: 8460, heading: Math.PI * 0.62, length: 640, width: 68, lift: 12, clearance: 28 },
  { name: 'Ridge Gate River Bridge', x: -6564, z: 10732, heading: Math.PI * 0.44, length: 620, width: 56, lift: 14, clearance: 28 },
  { name: 'Cascade Lagoon Bridge', x: -21450, z: 7360, heading: Math.PI * 0.34, length: 560, width: 60, lift: 12, clearance: 27 },
  { name: 'Northstar Fjord Bridge', x: 3960, z: -20760, heading: Math.PI * 0.66, length: 600, width: 62, lift: 13, clearance: 28 },
  { name: 'Northstar Mere Bridge', x: 1640, z: -20180, heading: Math.PI * 0.68, length: 430, width: 52, lift: 11, clearance: 25 },
  { name: 'Crescent Sound Causeway', x: 20180, z: 13580, heading: Math.PI * 0.6, length: 390, width: 46, lift: 9, clearance: 22 }
];

export const CONNECTING_ROADS = [
  { x1: -10400, z1: -6150, x2: -12800, z2: -4100, width: 44 },
  { x1: -12800, z1: -4100, x2: -12550, z2: -2080, width: 40 },
  { x1: -10400, z1: -6150, x2: -7200, z2: -8200, width: 42 },
  { x1: 6600, z1: -3520, x2: 10800, z2: -850, width: 44 },
  { x1: 6600, z1: -3520, x2: 9800, z2: -5900, width: 38 },
  { x1: -3600, z1: 8720, x2: -7200, z2: 11100, width: 40 },
  { x1: -3600, z1: 8720, x2: -1200, z2: 12200, width: 42 },
  { x1: 13280, z1: 5920, x2: 15320, z2: 7050, width: 32 },
  { x1: -20700, z1: 6500, x2: -21800, z2: 6040, width: 38 },
  { x1: -20700, z1: 6500, x2: -22350, z2: 8300, width: 36 },
  { x1: 2600, z1: -19680, x2: 3450, z2: -20420, width: 36 },
  { x1: 2600, z1: -19680, x2: -300, z2: -20700, width: 34 },
  { x1: 22030, z1: -7920, x2: 23000, z2: -7200, width: 30 },
  { x1: 20480, z1: 14020, x2: 19800, z2: 13200, width: 28 }
];

export const CITY_ZONES = [
  { name: 'Aurora City', x: -11100, z: -5300, radius: 1900, span: 2500, roadSpacing: 210, blocks: 5, cars: 64, maxHeight: 220, density: 0.74 },
  { name: 'Aurora North', x: -12550, z: -1850, radius: 980, span: 1180, roadSpacing: 170, blocks: 3, cars: 24, maxHeight: 84, density: 0.58 },
  { name: 'Silver Lake City', x: -6900, z: -7250, radius: 1100, span: 1320, roadSpacing: 170, blocks: 4, cars: 30, maxHeight: 96, density: 0.62 },
  { name: 'Meridian City', x: 6900, z: -2860, radius: 2100, span: 2760, roadSpacing: 220, blocks: 6, cars: 72, maxHeight: 240, density: 0.76 },
  { name: 'Meridian East', x: 10800, z: -1120, radius: 1040, span: 1260, roadSpacing: 170, blocks: 4, cars: 28, maxHeight: 92, density: 0.6 },
  { name: 'Southreach City', x: -3300, z: 9020, radius: 1650, span: 2100, roadSpacing: 200, blocks: 5, cars: 50, maxHeight: 148, density: 0.7 },
  { name: 'Harbor Cay Town', x: 13380, z: 5600, radius: 720, span: 820, roadSpacing: 130, blocks: 3, cars: 18, maxHeight: 62, density: 0.56 },
  { name: 'Cascade Harbor', x: -21800, z: 6040, radius: 860, span: 1060, roadSpacing: 150, blocks: 3, cars: 22, maxHeight: 76, density: 0.58 },
  { name: 'Northstar Town', x: 3500, z: -20380, radius: 760, span: 920, roadSpacing: 140, blocks: 3, cars: 18, maxHeight: 58, density: 0.54 },
  { name: 'Farpoint Town', x: 22550, z: -7500, radius: 520, span: 620, roadSpacing: 120, blocks: 2, cars: 10, maxHeight: 46, density: 0.52 },
  { name: 'Crescent Port', x: 20050, z: 13420, radius: 540, span: 660, roadSpacing: 120, blocks: 2, cars: 10, maxHeight: 44, density: 0.52 }
];

export const MOUNTAINS = [
  { x: -13400, z: -1500, rx: 2300, rz: 950, height: 320, ridge: 0.9 },
  { x: -8700, z: -2100, rx: 1800, rz: 820, height: 260, ridge: -0.55 },
  { x: -7600, z: -9800, rx: 1200, rz: 780, height: 190, ridge: 0.25 },
  { x: 3700, z: -6200, rx: 1850, rz: 1050, height: 280, ridge: 1.8 },
  { x: 9500, z: -6500, rx: 2000, rz: 980, height: 310, ridge: -1.25 },
  { x: 11100, z: 600, rx: 1500, rz: 900, height: 210, ridge: 1.15 },
  { x: -8000, z: 11100, rx: 2100, rz: 900, height: 320, ridge: -2.1 },
  { x: -5200, z: 12100, rx: 1600, rz: 760, height: 260, ridge: 0.35 },
  { x: 13200, z: 6100, rx: 700, rz: 420, height: 92, ridge: 2.4 },
  { x: -3100, z: -14020, rx: 620, rz: 360, height: 84, ridge: -2.6 },
  { x: -22500, z: 8700, rx: 1650, rz: 760, height: 230, ridge: 1.65 },
  { x: -18600, z: 5200, rx: 1320, rz: 680, height: 170, ridge: -0.95 },
  { x: 1500, z: -21200, rx: 1420, rz: 740, height: 190, ridge: 2.25 },
  { x: 4700, z: -18600, rx: 1180, rz: 620, height: 150, ridge: -1.75 },
  { x: 22000, z: -7800, rx: 560, rz: 360, height: 72, ridge: 0.85 },
  { x: 13140, z: 6310, rx: 1120, rz: 620, height: 265, ridge: -0.65 },
  { x: 13780, z: 5450, rx: 820, rz: 410, height: 145, ridge: 1.25 },
  { x: 10440, z: 10170, rx: 760, rz: 460, height: 185, ridge: 0.92 },
  { x: 14630, z: 10420, rx: 460, rz: 300, height: 96, ridge: -1.8 },
  { x: 15840, z: -2570, rx: 560, rz: 340, height: 128, ridge: 2.15 },
  { x: -3130, z: -14030, rx: 820, rz: 430, height: 178, ridge: -2.35 },
  { x: -12630, z: 5420, rx: 520, rz: 310, height: 118, ridge: 1.8 },
  { x: 16110, z: 7610, rx: 270, rz: 180, height: 44, ridge: 0.2 },
  { x: 15320, z: 7050, rx: 260, rz: 190, height: 40, ridge: -0.7 },
  { x: 21980, z: -7900, rx: 920, rz: 520, height: 215, ridge: 0.78 },
  { x: 20540, z: 14020, rx: 840, rz: 360, height: 185, ridge: -1.12 },
  { x: -21630, z: 12820, rx: 510, rz: 290, height: 112, ridge: 1.4 },
  { x: 23810, z: 7610, rx: 380, rz: 210, height: 74, ridge: -2.0 },
  { x: -22980, z: 21600, rx: 620, rz: 360, height: 58, ridge: 0.6, hiddenIslandMountain: true },
  { x: -22640, z: 21360, rx: 360, rz: 220, height: 28, ridge: -1.1, hiddenIslandMountain: true }
];

export const FOREST_CLUSTERS = [
  { x: -13200, z: -2400, radius: 1150, count: 190, cabins: 6 },
  { x: -9300, z: -1300, radius: 980, count: 168, cabins: 5 },
  { x: -7300, z: -9000, radius: 850, count: 124, cabins: 4 },
  { x: 4200, z: -5800, radius: 1050, count: 168, cabins: 6 },
  { x: 10100, z: -5600, radius: 1120, count: 190, cabins: 6 },
  { x: 10800, z: 620, radius: 800, count: 118, cabins: 4 },
  { x: -7600, z: 10800, radius: 1180, count: 190, cabins: 6 },
  { x: -4900, z: 12000, radius: 900, count: 140, cabins: 4 },
  { x: -1800, z: 11150, radius: 760, count: 104, cabins: 4 },
  { x: 13400, z: 6000, radius: 560, count: 90, cabins: 3 },
  { x: 10400, z: 10100, radius: 430, count: 70, cabins: 3 },
  { x: -12600, z: 5400, radius: 380, count: 52, cabins: 2 },
  { x: -22600, z: 8100, radius: 940, count: 150, cabins: 5 },
  { x: -19000, z: 5600, radius: 760, count: 104, cabins: 4 },
  { x: 1200, z: -20600, radius: 840, count: 120, cabins: 4 },
  { x: 4200, z: -19000, radius: 680, count: 92, cabins: 3 },
  { x: 22000, z: -7700, radius: 360, count: 48, cabins: 2 },
  { x: 20500, z: 13900, radius: 340, count: 42, cabins: 2 },
  { x: 14600, z: 10400, radius: 310, count: 46, cabins: 0 },
  { x: 15840, z: -2600, radius: 360, count: 58, cabins: 0 },
  { x: 16100, z: 7600, radius: 190, count: 24, cabins: 0 },
  { x: 15320, z: 7050, radius: 180, count: 22, cabins: 0 },
  { x: -21600, z: 12800, radius: 320, count: 46, cabins: 0 },
  { x: 23800, z: 7600, radius: 260, count: 34, cabins: 0 },
  { x: -22900, z: 4120, radius: 720, count: 88, cabins: 3 },
  { x: 4380, z: -19000, radius: 590, count: 66, cabins: 2 },
  { x: 21100, z: -7520, radius: 330, count: 38, cabins: 0 },
  { x: -22960, z: 21610, radius: 520, count: 140, cabins: 0, hiddenIslandForest: true },
  { x: -23780, z: 21680, radius: 390, count: 82, cabins: 0, hiddenIslandForest: true },
  { x: -24120, z: 22430, radius: 360, count: 64, cabins: 0, hiddenIslandForest: true }
];

export const VILLAGES = [
  { name: 'Aurora Farms', x: -9100, z: -4550, radius: 480, houses: 48, road: [[-9100, -4550], [-10000, -5400], [-10400, -6150]] },
  { name: 'North Pine Hamlet', x: -11900, z: -2850, radius: 420, houses: 38, road: [[-11900, -2850], [-12200, -2200], [-12550, -2080]] },
  { name: 'Silver Croft', x: -8200, z: -8900, radius: 410, houses: 38, road: [[-8200, -8900], [-7600, -8500], [-7200, -8200]] },
  { name: 'Meridian Orchard', x: 5200, z: -4350, radius: 490, houses: 52, road: [[5200, -4350], [6000, -3900], [6600, -3520]] },
  { name: 'East Sound Village', x: 9800, z: -1980, radius: 420, houses: 42, road: [[9800, -1980], [10300, -1400], [10800, -850]] },
  { name: 'Cliffturn Village', x: 9050, z: -6500, radius: 350, houses: 32, road: [[9050, -6500], [9400, -6200], [9800, -5900]] },
  { name: 'Southreach Farms', x: -4300, z: 10300, radius: 510, houses: 56, road: [[-4300, 10300], [-3920, 9500], [-3600, 8720]] },
  { name: 'Cape Rows', x: -1700, z: 11300, radius: 420, houses: 38, road: [[-1700, 11300], [-1450, 11800], [-1200, 12200]] },
  { name: 'Ridge Gate Hamlet', x: -6800, z: 11000, radius: 350, houses: 32, road: [[-6800, 11000], [-7000, 11040], [-7200, 11100]] },
  { name: 'Harbor Lane', x: 13720, z: 5520, radius: 310, houses: 34, road: [[13720, 5520], [13520, 5720], [13280, 5920]] },
  { name: 'Beacon Village', x: 10150, z: 9850, radius: 280, houses: 28, road: [[10150, 9850], [10280, 9950], [10400, 10090]] },
  { name: 'Northwatch Hamlet', x: -3400, z: -13760, radius: 320, houses: 30, road: [[-3400, -13760], [-3260, -13900], [-3100, -14020]] },
  { name: 'Cascade Mill', x: -22350, z: 8300, radius: 390, houses: 36, road: [[-22350, 8300], [-21400, 7200], [-20700, 6500]] },
  { name: 'Bight Rows', x: -21780, z: 5700, radius: 340, houses: 32, road: [[-21780, 5700], [-21250, 6100], [-20700, 6500]] },
  { name: 'Northstar Fishers', x: 3450, z: -20420, radius: 340, houses: 34, road: [[3450, -20420], [2980, -20060], [2600, -19680]] },
  { name: 'Farpoint Cove', x: 22600, z: -7480, radius: 260, houses: 24, road: [[22600, -7480], [22360, -7700], [22030, -7920]] },
  { name: 'Crescent Pier', x: 20080, z: 13480, radius: 270, houses: 24, road: [[20080, 13480], [20300, 13800], [20480, 14020]] },
  { name: 'Windward Garden Hamlet', x: 14620, z: 10380, radius: 230, houses: 18, road: [[14480, 10320], [14620, 10380], [14820, 10420]] },
  { name: 'Outer Reef Crofts', x: 15840, z: -2620, radius: 260, houses: 18, road: [[15680, -2680], [15840, -2620], [16020, -2520]] },
  { name: 'Twin Sand East Rows', x: 16120, z: 7620, radius: 145, houses: 8, road: [[16040, 7550], [16120, 7620], [16210, 7690]] },
  { name: 'Twin Sand West Rows', x: 15300, z: 7060, radius: 145, houses: 8, road: [[15220, 7000], [15300, 7060], [15400, 7130]] },
  { name: 'Mistral Key Hamlet', x: -21620, z: 12820, radius: 210, houses: 14, road: [[-21740, 12750], [-21620, 12820], [-21480, 12880]] },
  { name: 'Outer Shoal Fishers', x: 23800, z: 7600, radius: 185, houses: 10, road: [[23690, 7550], [23800, 7600], [23920, 7660]] },
  { name: 'Farpoint Ridge Homes', x: 21100, z: -7520, radius: 230, houses: 14, road: [[21100, -7520], [21700, -7440], [22600, -7480]] },
  { name: 'Cascade Upland Rows', x: -22900, z: 4120, radius: 330, houses: 24, road: [[-22900, 4120], [-22340, 5060], [-21780, 5700]] },
  { name: 'Northstar Ridge Hamlet', x: 4540, z: -19020, radius: 290, houses: 20, road: [[4540, -19020], [3820, -19580], [2600, -19680]] }
];

export const FARM_REGIONS = [
  { name: 'Aurora Grain Belt', x: -9700, z: -4700, rx: 2100, rz: 1300, rotation: -0.18, fields: 46, houses: 34 },
  { name: 'Aurora Lake Crofts', x: -7900, z: -8650, rx: 1500, rz: 880, rotation: 0.2, fields: 34, houses: 26 },
  { name: 'North Pine Farms', x: -11900, z: -2850, rx: 1400, rz: 760, rotation: 0.34, fields: 30, houses: 24 },
  { name: 'Meridian Orchard Rows', x: 5100, z: -4300, rx: 1700, rz: 980, rotation: 0.28, fields: 38, houses: 32 },
  { name: 'Meridian East Fields', x: 10100, z: -1850, rx: 1600, rz: 860, rotation: -0.22, fields: 36, houses: 30 },
  { name: 'Southreach Long Fields', x: -4100, z: 10300, rx: 1850, rz: 1050, rotation: -0.1, fields: 42, houses: 36 },
  { name: 'South Cape Pastures', x: -1700, z: 11300, rx: 1400, rz: 860, rotation: 0.46, fields: 30, houses: 24 },
  { name: 'Harbor Cay Garden Blocks', x: 13700, z: 5480, rx: 650, rz: 390, rotation: 0.16, fields: 14, houses: 14 },
  { name: 'Cascade Coastal Farms', x: -21400, z: 7000, rx: 1500, rz: 820, rotation: -0.42, fields: 32, houses: 24 },
  { name: 'Northstar Cold Fields', x: 2800, z: -20100, rx: 1220, rz: 760, rotation: 0.34, fields: 24, houses: 20 },
  { name: 'Farpoint Garden Strips', x: 22450, z: -7600, rx: 520, rz: 320, rotation: 0.32, fields: 10, houses: 10 },
  { name: 'Crescent Terraces', x: 20250, z: 13600, rx: 560, rz: 300, rotation: -0.38, fields: 10, houses: 10 },
  { name: 'Windward Garden Terraces', x: 14600, z: 10400, rx: 430, rz: 280, rotation: -0.34, fields: 8, houses: 4 },
  { name: 'Outer Reef Vegetable Plots', x: 15840, z: -2600, rx: 470, rz: 300, rotation: 0.28, fields: 8, houses: 4 },
  { name: 'Twin Sand Dry Plots', x: 15740, z: 7340, rx: 420, rz: 220, rotation: -0.2, fields: 6, houses: 2 },
  { name: 'Mistral Key Gardens', x: -21620, z: 12820, rx: 380, rz: 230, rotation: 0.22, fields: 7, houses: 3 },
  { name: 'Outer Shoal Garden Plots', x: 23800, z: 7600, rx: 310, rz: 180, rotation: 0.12, fields: 5, houses: 2 },
  { name: 'Cascade Upland Crofts', x: -22900, z: 4120, rx: 1180, rz: 580, rotation: -0.28, fields: 22, houses: 12 },
  { name: 'Northstar Ridge Farms', x: 4300, z: -18950, rx: 980, rz: 540, rotation: 0.22, fields: 18, houses: 10 },
  { name: 'Farpoint Hill Gardens', x: 21100, z: -7520, rx: 520, rz: 320, rotation: 0.12, fields: 8, houses: 4 }
];
