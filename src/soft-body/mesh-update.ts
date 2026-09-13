import { Box3, BufferAttribute, Sphere, type BufferGeometry } from 'three/webgpu';

function packedFloat32(geometry: BufferGeometry, name: 'position' | 'normal') {
  const attribute = geometry.getAttribute(name);
  if (!(attribute instanceof BufferAttribute) || !(attribute.array instanceof Float32Array)
    || attribute.itemSize !== 3 || attribute.normalized || attribute.array.length % 3 !== 0) {
    throw new TypeError(`Soft mesh ${name} must be a packed, non-normalized Float32 attribute with itemSize 3`);
  }
  return attribute;
}

/**
 * Recompute indexed soft-skin normals in Three's triangle and Float32 accumulation
 * order. The mesh must have finite packed Float32 positions and valid Uint16/32
 * triangle indices. Call Three's own methods for other geometry layouts.
 * Pass false for a CPU-only intermediate pass; only the final pass needs upload.
 */
export function updateSoftNormals(geometry: BufferGeometry, markNeedsUpdate = true) {
  const position = packedFloat32(geometry, 'position');
  const index = geometry.index;
  if (!(index instanceof BufferAttribute)
    || !(index.array instanceof Uint16Array || index.array instanceof Uint32Array)
    || index.itemSize !== 1 || index.normalized || index.count % 3 !== 0) {
    throw new TypeError('Soft mesh normals require packed Uint16 or Uint32 triangle indices');
  }
  let normal = geometry.getAttribute('normal');
  if (normal === undefined) {
    normal = new BufferAttribute(new Float32Array(position.array.length), 3);
    geometry.setAttribute('normal', normal);
  }
  const normalAttribute = packedFloat32(geometry, 'normal');
  if (normalAttribute.count !== position.count) {
    throw new TypeError('Soft mesh position and normal attributes must have matching counts');
  }
  const p = position.array as Float32Array;
  const n = normalAttribute.array as Float32Array;
  const indices = index.array;
  n.fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const cbx = p[c] - p[b], cby = p[c + 1] - p[b + 1], cbz = p[c + 2] - p[b + 2];
    const abx = p[a] - p[b], aby = p[a + 1] - p[b + 1], abz = p[a + 2] - p[b + 2];
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
    n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
    n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
  }
  for (let i = 0; i < n.length; i += 3) {
    // Three normalizes a zero vector by one, keeping collapsed faces finite.
    const inverse = 1 / (Math.sqrt(n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2]) || 1);
    n[i] *= inverse; n[i + 1] *= inverse; n[i + 2] *= inverse;
  }
  if (markNeedsUpdate) normalAttribute.needsUpdate = true;
}

/**
 * Update both bounds of a finite packed Float32 skin, reusing their objects.
 * Sharing the box scan avoids the extra box scan in computeBoundingSphere().
 * Position morph targets are outside this helper's soft-body contract.
 */
export function updateSoftBounds(geometry: BufferGeometry) {
  const p = packedFloat32(geometry, 'position').array as Float32Array;
  if (geometry.morphAttributes.position?.length) {
    throw new TypeError('Soft mesh bounds do not support position morph targets');
  }
  const box = geometry.boundingBox ?? (geometry.boundingBox = new Box3());
  const sphere = geometry.boundingSphere ?? (geometry.boundingSphere = new Sphere());
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); minY = Math.min(minY, p[i + 1]); minZ = Math.min(minZ, p[i + 2]);
    maxX = Math.max(maxX, p[i]); maxY = Math.max(maxY, p[i + 1]); maxZ = Math.max(maxZ, p[i + 2]);
  }
  box.min.set(minX, minY, minZ);
  box.max.set(maxX, maxY, maxZ);
  // Box3.getCenter returns zero for an empty position attribute.
  box.getCenter(sphere.center);
  const x = sphere.center.x, y = sphere.center.y, z = sphere.center.z;
  let radiusSquared = 0;
  for (let i = 0; i < p.length; i += 3) {
    const dx = x - p[i], dy = y - p[i + 1], dz = z - p[i + 2];
    radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
  }
  sphere.radius = Math.sqrt(radiusSquared);
}
