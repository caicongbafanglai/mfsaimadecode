      { z: 4.78, rx: 0.16, ry: 0.055, cy: -1.1 }
    ];
    return createClosedLoftGeometry(sections, section => {
      const ring = [];
      for (let i = 0; i < radial; i++) {
        const a = i / radial * Math.PI * 2;
        const sin = Math.sin(a);
        const cos = Math.cos(a);
        ring.push([
          cos * section.rx * U,
          (section.cy + sin * section.ry - Math.max(0, -sin) * 0.035) * U,
          section.z * U
        ]);
      }
      return ring;
    });
  }

  function createControlAirfoilGeometry(side, innerM, outerM, chordM, thicknessM, origin) {
    const stations = [innerM, outerM].map(spanM => {
      const wing = wingStationAtSpan(spanM);
      return {
        x: spanM,
        le: wing.te - chordM,
        te: wing.te,
        y: wing.y - 0.055,
        th: thicknessM,
        twist: wing.twist
      };
    });
    return createClosedLoftGeometry(stations, station => (
      airfoilProfile.map(point => {
        const absolute = airfoilSectionPoint(side, station, point);
        return [absolute[0] - origin.x, absolute[1] - origin.y, absolute[2] - origin.z];
      })
    ));
  }

  function createOvalGearDoorGeometry({ center, radiusY, radiusZ, normalSide, bow, sweep }) {
    const rings = parked ? 4 : 5;
    const segments = parked ? 24 : 36;
    const positions = [center.x, center.y, center.z];
    const indices = [];

    for (let ring = 1; ring <= rings; ring++) {
      const r = ring / rings;
      for (let i = 0; i < segments; i++) {
        const a = i / segments * Math.PI * 2;
        const vertical = Math.sin(a);
        const foreAft = Math.cos(a);
        const edgeSoftness = 0.94 + 0.06 * Math.cos(a * 2);
        const z = center.z + foreAft * radiusZ * r;
        const y = center.y + vertical * radiusY * r * edgeSoftness;
        const x = center.x
          + normalSide * bow * (1 - r * r)
          + normalSide * sweep * foreAft * r
          + normalSide * 0.018 * U * vertical * vertical * r;
        positions.push(x, y, z);
      }
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(0, 1 + i, 1 + next);
    }
    for (let ring = 1; ring < rings; ring++) {
      const innerStart = 1 + (ring - 1) * segments;
      const outerStart = 1 + ring * segments;
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const a = innerStart + i;
        const b = innerStart + next;
        const c = outerStart + i;
        const d = outerStart + next;
        indices.push(a, c, b, b, c, d);
      }
    }
    return bufferGeometry(positions, indices);
  }

  function createSharkletGeometry(side) {
    const stations = [
      { s: 0.0, x: 16.85, y: 0.66, le: -1.38, te: 1.9, th: 0.16 },
      { s: 0.14, x: 17.08, y: 0.78, le: -1.31, te: 1.7, th: 0.155 },
      { s: 0.34, x: 17.32, y: 1.24, le: -1.12, te: 1.32, th: 0.135 },
      { s: 0.58, x: 17.55, y: 2.04, le: -0.84, te: 0.86, th: 0.105 },
      { s: 0.82, x: 17.74, y: 2.9, le: -0.58, te: 0.5, th: 0.075 },
      { s: 0.96, x: 17.86, y: 3.32, le: -0.38, te: 0.28, th: 0.045 },
      { s: 1.0, x: 17.92, y: 3.52, le: -0.18, te: 0.12, th: 0.018 }
    ];
    return createClosedLoftGeometry(stations, station => (
      airfoilProfile.map(point => {
        const bend = smootherStep(0.05, 0.78, station.s);
        const thicknessX = point.h * station.th * bend * 0.92;
        const thicknessY = point.h * station.th * (1 - bend * 0.78);
        const chord = station.te - station.le;
        return [
          side * (station.x + thicknessX) * U,
          (station.y + thicknessY) * U,
          (station.le + chord * point.t) * U
        ];
      })
    ));
  }

  function createPylonGeometry(side) {
    const sections = [
      { y: -0.56, cx: 5.95, le: -3.62, te: -1.56, th: 0.38 },
      { y: -0.9, cx: 6.05, le: -3.48, te: -1.35, th: 0.42 },
      { y: -1.38, cx: 6.13, le: -3.2, te: -1.08, th: 0.46 },
      { y: -1.82, cx: 6.16, le: -2.92, te: -0.95, th: 0.52 }
    ];
    return createClosedLoftGeometry(sections, section => (
      airfoilProfile.map(point => {
        const chord = section.te - section.le;
        const taperedThickness = point.h * section.th * (0.95 - 0.2 * point.t);
        return [
          side * (section.cx + taperedThickness) * U,
          section.y * U,
          (section.le + chord * point.t) * U
        ];
      })
    ));
  }

  function createPylonWingBlendGeometry(side) {
    const radial = parked ? 18 : 26;
    const sections = [
      { z: -3.72, rx: 0.08, ry: 0.035 },
      { z: -3.32, rx: 0.36, ry: 0.1 },
      { z: -2.45, rx: 0.52, ry: 0.14 },
      { z: -1.55, rx: 0.28, ry: 0.08 },
      { z: -1.22, rx: 0.06, ry: 0.025 }
    ];
    return createClosedLoftGeometry(sections, section => {
      const ring = [];
      for (let i = 0; i < radial; i++) {
        const a = i / radial * Math.PI * 2;
        ring.push([
          side * (6.02 + Math.cos(a) * section.rx) * U,
          (-0.58 + Math.sin(a) * section.ry) * U,
          section.z * U
        ]);
      }
      return ring;
    });
  }

  function createPylonNacelleBlendGeometry(side) {
    const radial = parked ? 18 : 26;
    const sections = [
      { z: -3.04, rx: 0.12, ry: 0.04 },
      { z: -2.62, rx: 0.45, ry: 0.13 },
      { z: -2.02, rx: 0.5, ry: 0.16 },
      { z: -1.42, rx: 0.36, ry: 0.11 },
      { z: -1.05, rx: 0.1, ry: 0.035 }
    ];
    return createClosedLoftGeometry(sections, section => {
      const ring = [];
      for (let i = 0; i < radial; i++) {
        const a = i / radial * Math.PI * 2;
        ring.push([
          side * (6.15 + Math.cos(a) * section.rx) * U,
          (-1.66 + Math.sin(a) * section.ry) * U,
          section.z * U
        ]);
      }
      return ring;
    });
  }

  function createVerticalAirfoilGeometry(stations) {
    return createClosedLoftGeometry(stations, station => (
      airfoilProfile.map(point => {
        const chord = station.te - station.le;
        return [
          point.h * station.th * U,
          station.y * U,
          (station.le + chord * point.t) * U
        ];
      })
    ));
  }

  function createTailplaneGeometry(side) {
    const stations = [
      { x: 0.42, le: 13.55, te: 18.05, y: 2.18, th: 0.34, twist: -0.01 },
      { x: 1.25, le: 13.78, te: 17.9, y: 2.22, th: 0.3, twist: -0.015 },
      { x: 3.4, le: 14.34, te: 17.62, y: 2.34, th: 0.21, twist: -0.025 },
      { x: 6.1, le: 15.05, te: 17.38, y: 2.48, th: 0.12, twist: -0.04 }
    ];
    return createClosedLoftGeometry(stations, station => (
      airfoilProfile.map(point => airfoilSectionPoint(side, station, point))
    ));
  }

  function createTailplaneRootFairingGeometry(side) {
    return createGridGeometry(22, 10, (v, u) => {
      const chordBell = Math.pow(Math.sin(Math.PI * v), 0.6);
      const spanT = smootherStep(0, 1, u);
      const x = THREE.MathUtils.lerp(0.32 + 0.06 * chordBell, 1.62 + 0.12 * chordBell, spanT);
      const z = THREE.MathUtils.lerp(13.38, 18.08, v) + 0.08 * spanT;
      const bodyY = 1.45 + 0.18 * chordBell;
      const tailY = 2.14 + 0.12 * chordBell;
      const y = THREE.MathUtils.lerp(bodyY, tailY, spanT) + Math.sin(Math.PI * spanT) * chordBell * 0.16;
      return [side * x * U, y * U, z * U];
    });
  }

  function createVerticalTailRootFairingGeometry() {
    return createGridGeometry(28, 14, (v, u) => {
      const z = THREE.MathUtils.lerp(11.45, 16.9, v);
      const across = u * 2 - 1;
      const lengthBell = Math.pow(Math.sin(Math.PI * v), 0.72);
      const width = 0.24 + 0.58 * lengthBell;
      const tailTaper = smootherStep(13.0, 17.0, z);
      const fuselageTop = THREE.MathUtils.lerp(1.88, 1.26, tailTaper);
      const ridge = (0.12 + 0.86 * lengthBell) * (1 - Math.pow(Math.abs(across), 1.9));
      return [across * width * U, (fuselageTop + ridge) * U, z * U];
    });
  }

  function createCurvedCockpitPane(corners, material) {
    const geometry = createGridGeometry(4, 5, (v, u) => {
      const lower = lerpPoint(corners[0], corners[1], u);
      const upper = lerpPoint(corners[3], corners[2], u);
      const point = lerpPoint(lower, upper, v);
      const radialX = point[0];
      const radialY = point[1] - 0.08;
      const radialLength = Math.max(0.001, Math.hypot(radialX, radialY));
      const bow = 0.016 + Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.018;
      point[0] += radialX / radialLength * bow;
      point[1] += radialY / radialLength * bow;
      return scalePoint(point);
    });
    const pane = new THREE.Mesh(geometry, material);
    pane.castShadow = true;
    pane.receiveShadow = true;
    return pane;
  }

  function createClosedLoftGeometry(stations, ringBuilder, options = {}) {
    const capStart = options.capStart !== false;
    const capEnd = options.capEnd !== false;
    const rings = stations.map((station, index) => ringBuilder(station, index));
    const ringSize = rings[0].length;
    const positions = [];
    const indices = [];
    for (const ring of rings) {
      for (const point of ring) positions.push(point[0], point[1], point[2]);
    }
    for (let s = 0; s < rings.length - 1; s++) {
      for (let i = 0; i < ringSize; i++) {
        const next = (i + 1) % ringSize;
        const a = s * ringSize + i;
        const b = s * ringSize + next;
        const c = (s + 1) * ringSize + i;
        const d = (s + 1) * ringSize + next;
        indices.push(a, b, c, b, d, c);
      }
    }
    if (capStart) {
      const centerIndex = positions.length / 3;
      positions.push(...averageRingPoint(rings[0]));
      for (let i = 0; i < ringSize; i++) {
        indices.push(centerIndex, (i + 1) % ringSize, i);
      }
    }
    if (capEnd) {
      const centerIndex = positions.length / 3;
      const lastStart = (rings.length - 1) * ringSize;
      positions.push(...averageRingPoint(rings[rings.length - 1]));
      for (let i = 0; i < ringSize; i++) {
        indices.push(centerIndex, lastStart + i, lastStart + (i + 1) % ringSize);
      }
    }
    return bufferGeometry(positions, indices);
  }

  function createGridGeometry(rows, columns, pointAt) {
    const positions = [];
    const indices = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= columns; c++) {
        const point = pointAt(r / rows, c / columns);
        positions.push(point[0], point[1], point[2]);
      }
    }
    const stride = columns + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const a = r * stride + c;
        const b = a + 1;
        const d = (r + 1) * stride + c;
        const e = d + 1;
        indices.push(a, b, d, b, e, d);
      }
    }
    return bufferGeometry(positions, indices);
  }

  function averageRingPoint(ring) {
    const sum = [0, 0, 0];
    for (const point of ring) {
      sum[0] += point[0];
      sum[1] += point[1];
      sum[2] += point[2];
    }
    return sum.map(value => value / ring.length);
  }

  function smootherStep(edge0, edge1, value) {
    const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  function lerpPoint(a, b, t) {
    return [
      THREE.MathUtils.lerp(a[0], b[0], t),
      THREE.MathUtils.lerp(a[1], b[1], t),
      THREE.MathUtils.lerp(a[2], b[2], t)
    ];
  }

  function createQuadMesh(points, material) {
    return createIndexedMesh(points, [0, 1, 2, 0, 2, 3], material);
  }

  function createIndexedMesh(points, indices, material) {
    const geometry = bufferGeometry(points.flat(), indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function bufferGeometry(positions, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function boxIndices() {
    return [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6,
      3, 0, 4, 3, 4, 7
    ];
  }

  function scalePoint(point) {
    return [point[0] * U, point[1] * U, point[2] * U];
  }

  function addWindowPost(parent, from, to, radiusM, material) {
    addStrut(
      new THREE.Vector3(from[0] * U, from[1] * U, from[2] * U),
      new THREE.Vector3(to[0] * U, to[1] * U, to[2] * U),
      material,
      radiusM * U,
      parent
    );
  }

  function addStrut(from, to, material, radius = 0.055 * U, parent = group) {
    const direction = to.clone().sub(from);
    const length = direction.length();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
    strut.position.copy(from).add(to).multiplyScalar(0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    strut.castShadow = true;
    strut.receiveShadow = true;
    parent.add(strut);
  }
}
