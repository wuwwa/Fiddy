import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, InterleavedBuffer,
  InterleavedBufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3,
} from 'three/webgpu';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { updateSoftBounds, updateSoftNormals } from '../src/soft-body/mesh-update.ts';
import { SoftBodyPhysics, STEP } from '../src/soft-body/physics.ts';
import { cushionProfile, dumplingProfile, jellyProfile, loopProfile, starProfile } from '../src/soft-body/profiles.ts';

function compareReference(geometry: BufferGeometry, label: string) {
  const reference = geometry.clone();
  try {
    reference.computeVertexNormals();
    reference.computeBoundingBox();
    reference.computeBoundingSphere();
    updateSoftNormals(geometry);
    updateSoftBounds(geometry);
    assert.deepEqual(geometry.getAttribute('normal').array, reference.getAttribute('normal').array, `${label}: normals`);
    assert.ok(geometry.boundingBox!.equals(reference.boundingBox!), `${label}: box`);
    assert.ok(geometry.boundingSphere!.equals(reference.boundingSphere!), `${label}: sphere`);

    // Exercise the bounds' actual consumer after a transform, including rays
    // through holes and empty space that must remain misses.
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    const referenceMesh = new Mesh(reference, material);
    try {
      for (const target of [mesh, referenceMesh]) {
        target.position.set(0.4, -0.2, 0.7);
        target.rotation.set(0.08, 0.23, -0.05);
        target.scale.set(1.05, 0.9, 1.1);
        target.updateMatrixWorld(true);
      }
      const center = reference.boundingBox!.getCenter(new Vector3());
      const size = reference.boundingBox!.getSize(new Vector3());
      const raycaster = new Raycaster();
      let hitCount = 0, missCount = 0;
      for (const x of [-0.8, -0.35, 0, 0.35, 0.8]) {
        for (const y of [-0.25, 0, 0.25]) {
          const target = center.clone().add(new Vector3(size.x * x, size.y * y, 0)).applyMatrix4(mesh.matrixWorld);
          raycaster.set(target.clone().add(new Vector3(0, 0, 5)), new Vector3(0, 0, -1));
          const actual = raycaster.intersectObject(mesh);
          const expected = raycaster.intersectObject(referenceMesh);
          assert.equal(actual.length, expected.length, `${label}: ray hit count`);
          if (expected.length) hitCount++; else missCount++;
          for (let i = 0; i < expected.length; i++) {
            assert.equal(actual[i].distance, expected[i].distance, `${label}: ray distance`);
            assert.equal(actual[i].faceIndex, expected[i].faceIndex, `${label}: ray face`);
            assert.deepEqual(actual[i].point, expected[i].point, `${label}: ray point`);
            assert.deepEqual(actual[i].normal, expected[i].normal, `${label}: interpolated ray normal`);
          }
        }
      }
      assert.ok(hitCount > 0 && missCount > 0, `${label}: exercise both hits and misses`);
    } finally { material.dispose(); }
  } finally { reference.dispose(); }
}

for (const profile of [jellyProfile, cushionProfile, loopProfile, starProfile, dumplingProfile]) {
  test(`${profile.shape}: typed updates exactly match Three after actual press, twisted pull, and release`, () => {
    const geometry = createSoftGeometry(profile.shape);
    try {
      const body = new SoftBodyPhysics(profile.feel);
      const position = geometry.getAttribute('position') as BufferAttribute;
      const normal = geometry.getAttribute('normal') as BufferAttribute;
      const rest = new Float32Array(position.array);
      const bindings = Array.from({ length: position.count }, (_, i) => body.bind(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]));
      let front = 0;
      for (let i = 1; i < position.count; i++) if (position.getZ(i) > position.getZ(front)) front = i;
      const point = { x: position.getX(front), y: position.getY(front), z: position.getZ(front) };
      const direction = { x: normal.getX(front), y: normal.getY(front), z: normal.getZ(front) };
      const advance = (seconds: number) => { for (let i = 0; i < seconds / STEP; i++) body.step(); };
      const deform = (alpha = 1) => body.deform(rest, position.array as Float32Array, bindings, alpha);

      compareReference(geometry, 'rest');
      assert.equal(body.beginGrab(point, direction), true);
      body.setPressure(1);
      advance(0.8);
      deform();
      assert.ok(position.array.some((value, i) => Math.abs(value - rest[i]) > 0.1), 'Use visibly deformed skin');
      compareReference(geometry, 'pressed');

      body.setPressure(0);
      body.moveGrab({ x: 0.75, y: 0.55, z: 0.2 });
      body.setTwist(0.72);
      advance(0.9);
      deform(0.37);
      compareReference(geometry, 'twisted pull, interpolated');

      body.release();
      advance(0.18);
      deform(0.63);
      compareReference(geometry, 'rebound, interpolated');
    } finally { geometry.dispose(); }
  });
}

for (const IndexArray of [Uint16Array, Uint32Array]) {
  test(`${IndexArray.name}: collapsed, collinear, cancelling and unused vertices have finite normals`, () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      2, 2, 2, 3, 3, 3, 4, 4, 4,
      7, 8, 9,
    ]), 3));
    geometry.setIndex(new BufferAttribute(new IndexArray([0, 1, 2, 2, 1, 0, 0, 0, 1, 3, 4, 5]), 1));
    const reference = geometry.clone();
    try {
      reference.computeVertexNormals();
      updateSoftNormals(geometry);
      const normals = geometry.getAttribute('normal').array;
      assert.deepEqual(normals, reference.getAttribute('normal').array);
      assert.ok(normals.every(value => Number.isFinite(value) && value === 0));
      // A subsequent valid face must replace those zeros without replacing the attribute.
      const attribute = geometry.getAttribute('normal');
      geometry.setIndex(new BufferAttribute(new IndexArray([0, 1, 2]), 1));
      updateSoftNormals(geometry);
      assert.equal(geometry.getAttribute('normal'), attribute);
      assert.deepEqual(Array.from(normals.slice(0, 9)), [0, 0, 1, 0, 0, 1, 0, 0, 1]);
    } finally { geometry.dispose(); reference.dispose(); }
  });
}

test('Uint32 indices address vertices beyond the Uint16 limit', () => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(65539 * 3);
  positions.set([2, 3, 4, 3, 3, 4, 2, 4, 4], 65536 * 3);
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array([65536, 65537, 65538]), 1));
  const reference = geometry.clone();
  try {
    reference.computeVertexNormals();
    updateSoftNormals(geometry);
    assert.deepEqual(geometry.getAttribute('normal').array, reference.getAttribute('normal').array);
    assert.equal(geometry.getAttribute('normal').getZ(65536), 1);
    assert.equal(geometry.getAttribute('normal').getZ(0), 0);
  } finally { geometry.dispose(); reference.dispose(); }
});

test('repeated passes reuse resources and invalidate only the caller-requested normal pass', () => {
  const geometry = createSoftGeometry('cushion');
  try {
    const position = geometry.getAttribute('position') as BufferAttribute;
    const normal = geometry.getAttribute('normal') as BufferAttribute;
    normal.setUsage(DynamicDrawUsage);
    const positionArray = position.array, normalArray = normal.array, index = geometry.index;
    const positionVersion = position.version, normalVersion = normal.version, indexVersion = index!.version;
    updateSoftBounds(geometry);
    const box = geometry.boundingBox!, sphere = geometry.boundingSphere!;
    const min = box.min, max = box.max, center = sphere.center;
    for (let frame = 0; frame < 12; frame++) {
      position.setX(0, position.getX(0) + 0.03);
      updateSoftNormals(geometry, false);
      assert.equal(normal.version, normalVersion + frame, 'Intermediate computation leaves version unchanged');
      updateSoftBounds(geometry);
      updateSoftNormals(geometry);
      assert.equal(normal.version, normalVersion + frame + 1);
    }
    assert.equal(geometry.getAttribute('position'), position);
    assert.equal(position.array, positionArray);
    assert.equal(position.version, positionVersion, 'Caller owns position invalidation');
    assert.equal(geometry.getAttribute('normal'), normal);
    assert.equal(normal.array, normalArray);
    assert.equal(normal.usage, DynamicDrawUsage);
    assert.equal(geometry.index, index);
    assert.equal(index!.version, indexVersion);
    assert.equal(geometry.boundingBox, box);
    assert.equal(geometry.boundingSphere, sphere);
    assert.equal(box.min, min); assert.equal(box.max, max); assert.equal(sphere.center, center);
  } finally { geometry.dispose(); }
});

test('empty and fully collapsed meshes match Three bounds without NaN normals', () => {
  for (const values of [[], [4, -2, 8, 4, -2, 8, 4, -2, 8]]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(values), 3));
    geometry.setIndex(new BufferAttribute(new Uint16Array(values.length ? [0, 1, 2] : []), 1));
    const reference = geometry.clone();
    try {
      reference.computeVertexNormals(); reference.computeBoundingBox(); reference.computeBoundingSphere();
      updateSoftNormals(geometry, false); updateSoftBounds(geometry);
      assert.deepEqual(geometry.getAttribute('normal').array, reference.getAttribute('normal').array);
      assert.equal((geometry.getAttribute('normal') as BufferAttribute).version, 0);
      assert.ok(geometry.boundingBox!.equals(reference.boundingBox!));
      assert.ok(geometry.boundingSphere!.equals(reference.boundingSphere!));
      assert.equal(geometry.boundingSphere!.radius, 0);
      assert.ok(geometry.getAttribute('normal').array.every(Number.isFinite));
    } finally { geometry.dispose(); reference.dispose(); }
  }
});

test('unsupported layouts fail clearly instead of treating storage as packed Float32 data', () => {
  const geometry = new BufferGeometry();
  try {
    geometry.setIndex([0, 1, 2]);
    geometry.setAttribute('position', new BufferAttribute(new Float64Array(9), 3));
    assert.throws(() => updateSoftNormals(geometry), /packed.*Float32/);
    assert.throws(() => updateSoftBounds(geometry), /packed.*Float32/);
    geometry.setAttribute('position', new InterleavedBufferAttribute(new InterleavedBuffer(new Float32Array(12), 4), 3, 0));
    assert.throws(() => updateSoftNormals(geometry), /packed.*Float32/);
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3, true));
    assert.throws(() => updateSoftBounds(geometry), /non-normalized/);
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    geometry.setIndex(null);
    assert.throws(() => updateSoftNormals(geometry), /triangle indices/);
    geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1]), 1));
    assert.throws(() => updateSoftNormals(geometry), /triangle indices/);
    geometry.setIndex([0, 1, 2]);
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(3), 3));
    assert.throws(() => updateSoftNormals(geometry), /matching counts/);
    geometry.morphAttributes.position = [new BufferAttribute(new Float32Array(9), 3)];
    assert.throws(() => updateSoftBounds(geometry), /morph targets/);
  } finally { geometry.dispose(); }
});
