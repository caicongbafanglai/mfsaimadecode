import * as THREE from '../../../three.module.min.js?v=202605050057';

export function createTerrainPatchFactory({ scene, terrainHeight }) {
  return function createTerrainConformingPatch(cx, cz, width, depth, rotation, material, lift = 0.24, segmentsX = 4, segmentsZ = 3, renderOrder = 1, parent = scene) {
    const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);

    for (let i = 0; i < positions.count; i++) {
      const localX = positions.getX(i);
      const localZ = positions.getZ(i);
      const x = cx + c * localX + s * localZ;
      const z = cz - s * localX + c * localZ;
      positions.setXYZ(i, x, terrainHeight(x, z) + lift, z);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const patch = new THREE.Mesh(geometry, material);
    patch.receiveShadow = true;
    patch.renderOrder = renderOrder;
    patch.userData.terrainConformingPatch = true;
    patch.userData.groundOffset = lift;
    patch.userData.diagnosticType = 'ground-overlay';
    patch.userData.diagnosticCount = 1;
    parent.add(patch);
    return patch;
  };
}

export function rotatedOffset(cx, cz, localX, localZ, rotation) {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return { x: cx + c * localX + s * localZ, z: cz - s * localX + c * localZ };
}

export function createPatchRect(x, z, width, depth, rotation) {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return {
    x,
    z,
    width,
    depth,
    halfWidth: width / 2,
    halfDepth: depth / 2,
    axisX: { x: c, z: -s },
    axisZ: { x: s, z: c }
  };
}

export function patchOverlapsPlaced(candidate, placedRects, margin) {
  const candidateRect = createPatchRect(candidate.x, candidate.z, candidate.width, candidate.depth, candidate.rotation);
  return placedRects.some(rect => patchRectsOverlap(candidateRect, rect, margin));
}

export function patchRectsOverlap(a, b, margin = 0) {
  const axes = [a.axisX, a.axisZ, b.axisX, b.axisZ];
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  for (const axis of axes) {
    const distance = Math.abs(dx * axis.x + dz * axis.z);
    const radiusA =
      (a.halfWidth + margin) * Math.abs(a.axisX.x * axis.x + a.axisX.z * axis.z) +
      (a.halfDepth + margin) * Math.abs(a.axisZ.x * axis.x + a.axisZ.z * axis.z);
    const radiusB =
      (b.halfWidth + margin) * Math.abs(b.axisX.x * axis.x + b.axisX.z * axis.z) +
      (b.halfDepth + margin) * Math.abs(b.axisZ.x * axis.x + b.axisZ.z * axis.z);
    if (distance > radiusA + radiusB) return false;
  }
  return true;
}
