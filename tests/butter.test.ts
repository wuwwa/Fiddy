import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { butterProfile } from '../src/soft-body/profiles.ts';
import { SoftBodyPhysics, FLOOR, STEP } from '../src/soft-body/physics.ts';
import { pressureFrame, undoDeformation } from '../src/soft-body/pressure.ts';

const advance = (body: SoftBodyPhysics, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) body.step();
};

test('butter has a closed rounded stick surface that fits the deformation cage', () => {
  const geometry = createSoftGeometry('butter');
  try {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!, size = box.getSize(new Vector3());
    assert.ok(size.x / size.y > 2.5, 'The silhouette must read as a stick');
    assert.ok(box.min.x >= -1.4 && box.max.x <= 1.4);
    assert.ok(box.min.z >= -1.4 && box.max.z <= 1.4);
    assert.ok(box.min.y >= FLOOR && box.max.y <= FLOOR + 2);
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    for (let i = 0; i < positions.count; i++) {
      assert.ok([positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 0.01);
    }
    const edges = new Map<string, number>(), ids = geometry.index!.array;
    for (let i = 0; i < ids.length; i += 3) {
      for (const [a, b] of [[ids[i], ids[i+1]], [ids[i+1], ids[i+2]], [ids[i+2], ids[i]]]) {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert.ok([...edges.values()].every(count => count === 2), 'No cracks along the rounded face seams');
  } finally { geometry.dispose(); }
});

test('butter compresses on hold and rises gradually without bouncing past its mold', () => {
  const body = new SoftBodyPhysics(butterProfile.feel);
  body.beginGrab({ x: 0, y: 0.93, z: 0 });
  advance(body, 2);
  const held = body.compressionAmount;
  assert.ok(held > 0.35, `A sustained hold should visibly flatten the stick: ${held}`);
  body.release();
  advance(body, 0.5);
  assert.ok(body.compressionAmount > held * 0.65, 'Foam must not snap back on release');
  let previous = body.compressionAmount;
  for (let i = 0; i < 12; i++) {
    advance(body, 1);
    assert.ok(body.compressionAmount >= 0 && body.compressionAmount < previous, 'Recovery should be monotonic');
    assert.ok(body.diagnostics().minVolumeRatio > 0.1, 'Compressible foam must not invert');
    previous = body.compressionAmount;
  }
  assert.ok(body.compressionAmount < 0.003, 'The original stick returns after waiting');
  body.reset();
  assert.equal(body.compressionAmount, 0);
  assert.equal(body.diagnostics().grabbed, false);
});

test('foam compression reduces volume instead of expanding like an incompressible gel', () => {
  const compression = 0.65, lateral = butterProfile.feel.foam!.lateralExpansion;
  const frame = pressureFrame(0.94, compression, lateral);
  const heightRatio = (frame.y - FLOOR) / 0.9;
  assert.ok(heightRatio < 0.4, 'The foam should compress deeply');
  assert.ok(frame.width < 1.08, 'Air loss should prevent balloon-like sideways swelling');
  assert.ok(heightRatio * frame.width ** 2 < 0.45, 'The visible volume should decrease');
  const restored = undoDeformation({ x: 0.5 * frame.width, y: frame.y, z: 0.2 * frame.width }, compression, 0, lateral);
  assert.ok(Math.abs(restored.x - 0.5) < 1e-7 && Math.abs(restored.y - 0.94) < 1e-7 && Math.abs(restored.z - 0.2) < 1e-7,
    'Picking a compressed surface must recover the same material point');
});

test('a front-finger dent persists after release and recovers without snapping', () => {
  const body = new SoftBodyPhysics(butterProfile.feel);
  body.beginGrab({ x: 0, y: 0.65, z: 0.46 }, { x: 0, y: 0, z: 1 });
  advance(body, 1.5);
  const held = body.diagnostics().displacement;
  assert.ok(held > 0.08, 'A side press must visibly dent the foam');
  const before = new Float64Array(body.positions);
  body.release();
  assert.deepEqual(body.positions, before, 'Release must not change positions immediately');
  advance(body, 0.5);
  assert.ok(body.diagnostics().displacement > held * 0.65, 'The local dent must outlast the finger');
  assert.ok(!body.isAtRest(), 'Keep drawing while the dent is recovering');
  advance(body, 14);
  assert.ok(body.diagnostics().displacement < 0.001, 'Foam should recover its original local surface');
  assert.ok(body.isAtRest(), 'Recovered foam should let the renderer sleep');
});

test('repeated two-finger squeezing and twisting does not invert the foam cage', () => {
  const body = new SoftBodyPhysics(butterProfile.feel);
  for (let cycle = 0; cycle < 12; cycle++) {
    for (const id of [0, 1]) {
      const side = id === 0 ? -1 : 1;
      body.beginGrab({ x: side * 0.8, y: 0.65, z: 0.35 }, { x: 0, y: 0.4, z: 0.9 }, id);
      body.moveGrab({ x: -side * 0.4, y: 0.15, z: 0 }, id);
      body.setTwist(side * 0.3, id);
    }
    advance(body, 0.5);
    assert.ok(body.diagnostics().minVolumeRatio > 0.01, JSON.stringify(body.diagnostics()));
    body.releaseAll(); advance(body, 0.25);
    assert.ok([...body.positions].every(Number.isFinite));
  }
  advance(body, 16);
  assert.ok(body.diagnostics().displacement < 0.001);
});
