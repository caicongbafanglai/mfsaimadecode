
function createHighLiftDeviceSet(side, materials) {
  const group = new THREE.Group();
  const sideName = side < 0 ? 'left' : 'right';
  group.name = `a320neo_high_lift_devices_${sideName}`;
  const slats = [];
  const speedBrakeSpoilers = [];
  const groundSpoilers = [];

  for (const segment of [
    { center: 4.25, span: 1.55 },
    { center: 6.35, span: 1.75 },
    { center: 9.0, span: 2.15 },
    { center: 12.1, span: 2.05 },
    { center: 15.0, span: 1.65 }
  ]) {
    const slat = createSlatSegment(side, segment, materials.metal);
    group.add(slat);
    slats.push(slat);
  }

  for (let index = 0; index < 5; index++) {
    const span = 4.35 + index * 1.9;
    const spoiler = createSpoilerSegment(side, span, index, materials.panel);
    group.add(spoiler);
    if (index >= 1 && index <= 3) speedBrakeSpoilers.push(spoiler);
    groundSpoilers.push(spoiler);
  }

  for (const span of [4.2, 7.4, 10.6]) {
    const track = createFlapTrackFairing(side, span, materials.wingMaterial);
    group.add(track);
  }

  return { group, slats, speedBrakeSpoilers, groundSpoilers };
}

function createSlatSegment(side, segment, material) {
  const station = approximateWingStation(segment.center);
  const pivot = new THREE.Group();
  pivot.name = `leading_edge_slat_${side < 0 ? 'left' : 'right'}_${segment.center.toFixed(1)}`;
  pivot.position.set(side * segment.center * U, (station.y + 0.06) * U, (station.le + 0.05) * U);
  pivot.rotation.y = side * -0.04;

  const skin = new THREE.Mesh(new THREE.BoxGeometry(segment.span * U, 0.12 * U, 0.34 * U), material);
  skin.name = 'rounded_metal_slat_skin';
  skin.position.set(0, 0.01 * U, -0.1 * U);
  skin.castShadow = true;
  skin.receiveShadow = true;
  pivot.add(skin);

  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * U, 0.065 * U, segment.span * U, 10), material);
  nose.name = 'slat_rounded_leading_edge';
  nose.rotation.z = Math.PI / 2;
  nose.position.set(0, 0.02 * U, -0.27 * U);
  pivot.add(nose);

  const trackMaterial = material.clone();
  trackMaterial.color.offsetHSL(0, 0, -0.12);
  for (const x of [-0.34, 0.34]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045 * U, 0.035 * U, 0.46 * U), trackMaterial);
    rail.name = 'slat_track_rail';
    rail.position.set(x * segment.span * U, -0.055 * U, 0.05 * U);
    rail.rotation.x = -0.08;
    pivot.add(rail);
  }

  pivot.userData.highLift = {
    basePosition: pivot.position.clone(),
    extendZ: -0.46 * U,
    dropY: -0.13 * U,
    angle: 0.16,
    kind: 'slat'
  };
  return pivot;
}

function createSpoilerSegment(side, spanM, index, material) {
  const station = approximateWingStation(spanM);
  const pivot = new THREE.Group();
  pivot.name = `spoiler_${index + 1}_${side < 0 ? 'left' : 'right'}`;
  pivot.position.set(side * spanM * U, (station.y + 0.18) * U, THREE.MathUtils.lerp(station.le, station.te, 0.58) * U);
  pivot.rotation.y = side * -0.055;

  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.18 * U, 0.045 * U, 0.72 * U), material);
  panel.name = 'upper_wing_spoiler_panel_with_thickness';
  panel.position.set(0, 0.024 * U, 0.36 * U);
  panel.castShadow = true;
  panel.receiveShadow = true;
  pivot.add(panel);

  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * U, 0.035 * U, 1.18 * U, 10), material);
  hinge.name = 'spoiler_front_hinge';
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, 0.035 * U, 0);
  pivot.add(hinge);

  pivot.userData.highLift = {
    basePosition: pivot.position.clone(),
    airAngle: -35 * Math.PI / 180,
    groundAngle: -56 * Math.PI / 180,
    kind: 'spoiler',
    index
  };
  return pivot;
}

function createFlapTrackFairing(side, spanM, material) {
  const station = approximateWingStation(spanM);
  const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.26 * U, 0.16 * U, 1.35 * U), material);
  fairing.name = `flap_track_fairing_${side < 0 ? 'left' : 'right'}`;
  fairing.position.set(side * spanM * U, (station.y - 0.2) * U, (station.te - 0.34) * U);
  fairing.rotation.y = side * -0.05;
  fairing.castShadow = true;
  fairing.receiveShadow = true;
  return fairing;
}

function approximateWingStation(spanM) {
  const stations = [
    { x: 0.82, le: -4.95, te: 4.35, y: -0.48 },
    { x: 4.8, le: -3.82, te: 3.78, y: -0.18 },
    { x: 8.6, le: -3.14, te: 3.3, y: 0.06 },
    { x: 12.3, le: -2.38, te: 2.78, y: 0.31 },
    { x: 15.5, le: -1.68, te: 2.22, y: 0.52 },
    { x: 17.1, le: -1.34, te: 1.92, y: 0.66 }
  ];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (spanM >= a.x && spanM <= b.x) {
      const t = (spanM - a.x) / (b.x - a.x);
      return {
        le: THREE.MathUtils.lerp(a.le, b.le, t),
        te: THREE.MathUtils.lerp(a.te, b.te, t),
        y: THREE.MathUtils.lerp(a.y, b.y, t)
      };
    }
  }
  return stations[stations.length - 1];
}
