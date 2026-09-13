import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { SoftBodyPhysics, STEP, FLOOR, type Point } from '../src/soft-body/physics.ts';
import { jellyProfile, cushionProfile, type SoftToyProfile } from '../src/soft-body/profiles.ts';

function advance(body: SoftBodyPhysics, seconds: number) {
  for (let i = 0; i < seconds / STEP; i++) body.step();
}

function surfacePoints(profile: SoftToyProfile) {
  const geometry = createSoftGeometry(profile.shape);
  try {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const point = (index: number): Point => ({ x: positions.getX(index), y: positions.getY(index), z: positions.getZ(index) });
    const normal = (index: number): Point => ({ x: normals.getX(index), y: normals.getY(index), z: normals.getZ(index) });
    let front = 0, top = 0, side = 0, base = 0;
    for (let i = 1; i < positions.count; i++) {
      if (positions.getZ(i) > positions.getZ(front)) front = i;
      if (positions.getY(i) > positions.getY(top)) top = i;
      if (positions.getX(i) > positions.getX(side)) side = i;
      if (positions.getY(i) < positions.getY(base)) base = i;
    }
    return {
      front: { point: point(front), normal: normal(front) },
      top: { point: point(top), normal: normal(top) },
      side: { point: point(side), normal: normal(side) },
      base: point(base),
    };
  } finally { geometry.dispose(); }
}

function sample(body: SoftBodyPhysics, point: Point): Point {
  const rest = new Float32Array([point.x, point.y, point.z]);
  const output = new Float32Array(3);
  body.deform(rest, output, [body.bind(point.x, point.y, point.z)]);
  return { x: output[0], y: output[1], z: output[2] };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const pulls = [
  { name: 'front sideways', surface: 'front', axis: 'x', offset: { x: 0.8, y: 0, z: 0 } },
  { name: 'front upward', surface: 'front', axis: 'y', offset: { x: 0, y: 0.8, z: 0 } },
  { name: 'top upward', surface: 'top', axis: 'y', offset: { x: 0, y: 0.8, z: 0 } },
  { name: 'side outward', surface: 'side', axis: 'x', offset: { x: 0.8, y: 0, z: 0 } },
] as const;

for (const profile of [jellyProfile, cushionProfile]) for (const pull of pulls) {
  test(`${profile.label}: a ${pull.name} pull moves the visible skin at least 0.5 units`, () => {
    const body = new SoftBodyPhysics(profile.feel);
    const points = surfacePoints(profile);
    const contact = points[pull.surface];
    const baseline = sample(body, contact.point);
    const base = sample(body, points.base);
    body.beginGrab(contact.point, contact.normal);
    body.setPressure(0);
    body.moveGrab(pull.offset);
    advance(body, 1);
    const held = sample(body, contact.point);
    const state = body.diagnostics();
    const travel = held[pull.axis] - baseline[pull.axis];
    const baseTravel = distance(sample(body, points.base), base);

    assert.equal(state.grabbed, true, 'The solver must not silently reset the drag');
    assert.ok(Math.abs(state.volumeRatio - 1) < 0.1, JSON.stringify(state));
    assert.ok(state.minVolumeRatio > 0.75, JSON.stringify(state));
    for (let i = 1; i < body.positions.length; i += 3) assert.ok(body.positions[i] >= FLOOR);
    assert.ok(baseTravel < 0.12, `The base should remain restrained: base travel ${baseTravel.toFixed(4)}, touched face travel ${travel.toFixed(4)}`);
    assert.ok(travel >= 0.5, `${pull.name}: visible ${pull.axis} travel ${travel.toFixed(4)} for a raw 0.8-unit drag`);
  });
}

test('the cushion releases an upward pull gradually and then recovers completely', () => {
  const body = new SoftBodyPhysics(cushionProfile.feel);
  const contact = surfacePoints(cushionProfile).front;
  const initial = sample(body, contact.point);
  body.beginGrab(contact.point, contact.normal);
  body.setPressure(0);
  body.moveGrab({ x: 0, y: 0.8, z: 0 });
  advance(body, 1);
  const heldLift = sample(body, contact.point).y - initial.y;
  assert.ok(heldLift > 0.5);

  body.release();
  body.step();
  assert.ok(body.diagnostics().speed < 10, 'Releasing must not abruptly restore stiff edges');
  assert.ok(sample(body, contact.point).y - initial.y > heldLift * 0.9,
    'The lifted patch should survive the first released step');
  advance(body, 0.15 - STEP);
  const retainedLift = sample(body, contact.point).y - initial.y;
  assert.ok(retainedLift > 0.15 && retainedLift > heldLift * 0.25,
    `The dense cushion recovered too quickly: held ${heldLift}, retained ${retainedLift}`);

  advance(body, 12);
  assert.ok(distance(sample(body, contact.point), initial) < 0.02);
  assert.ok(body.diagnostics().speed < 0.02);
});

test('sustained extreme pulls remain anchored and recover without leaving a stretched skin', () => {
  for (const profile of [jellyProfile, cushionProfile]) {
    const body = new SoftBodyPhysics(profile.feel);
    const points = surfacePoints(profile);
    const initial = sample(body, points.front.point);
    const base = sample(body, points.base);
    body.beginGrab(points.front.point, points.front.normal);
    body.setPressure(0);
    body.moveGrab({ x: 100, y: 100, z: 100 });
    for (let second = 0; second < 6; second++) {
      advance(body, 1);
      const state = body.diagnostics();
      assert.equal(state.grabbed, true, `${profile.label}: an extreme drag should stay captured`);
      assert.ok(Number.isFinite(state.displacement) && state.displacement < 2.5, JSON.stringify(state));
      assert.ok(Math.abs(state.volumeRatio - 1) < 0.15 && state.minVolumeRatio > 0.25, JSON.stringify(state));
      for (let i = 1; i < body.positions.length; i += 3) assert.ok(body.positions[i] >= FLOOR);
      const baseTravel = distance(sample(body, points.base), base);
      assert.ok(baseTravel < 0.2, `${profile.label}: extreme pull moved the base ${baseTravel.toFixed(4)}`);
    }
    assert.ok(distance(sample(body, points.front.point), initial) > 0.5, 'A sustained pull should visibly hold the skin out');
    body.release();
    advance(body, 12);
    assert.ok(distance(sample(body, points.front.point), initial) < 0.02, `${profile.label}: the pulled face did not recover`);
    assert.ok(body.diagnostics().speed < 0.02);
    body.reset();
    assert.deepEqual(body.positions, body.rest);
    assert.deepEqual(sample(body, points.front.point), initial);
    assert.equal(body.diagnostics().grabbed, false);
  }
});

for (const profile of [jellyProfile, cushionProfile]) {
  test(`${profile.label}: rapid unloaded re-grabs on the moving skin remain stable`, () => {
    const body = new SoftBodyPhysics(profile.feel);
    const geometry = createSoftGeometry(profile.shape);
    try {
      const positions = geometry.getAttribute('position');
      const rest = new Float32Array(positions.array);
      const bindings = Array.from({ length: positions.count }, (_, i) =>
        body.bind(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]));
      let front = 0, top = 0, side = 0;
      for (let i = 1; i < positions.count; i++) {
        if (rest[i * 3 + 2] > rest[front * 3 + 2]) front = i;
        if (rest[i * 3 + 1] > rest[top * 3 + 1]) top = i;
        if (rest[i * 3] > rest[side * 3]) side = i;
      }
      const contactIds = [front, top, side];
      const update = () => {
        body.deform(rest, positions.array as Float32Array, bindings);
        geometry.computeVertexNormals();
      };
      let caughtMovingSkin = 0;
      for (let gesture = 0; gesture < 36; gesture++) {
        update();
        const id = contactIds[gesture % contactIds.length];
        const normals = geometry.getAttribute('normal');
        const contact = { x: positions.getX(id), y: positions.getY(id), z: positions.getZ(id) };
        const normal = { x: normals.getX(id), y: normals.getY(id), z: normals.getZ(id) };
        if (Math.hypot(contact.x - rest[id * 3], contact.y - rest[id * 3 + 1], contact.z - rest[id * 3 + 2]) > 0.03) caughtMovingSkin++;
        body.beginGrab(contact, normal);
        body.setPressure(0);
        const sign = gesture % 2 ? -1 : 1;
        body.moveGrab({ x: sign * 100, y: gesture % 3 === 1 ? 100 : 20, z: gesture % 4 < 2 ? 80 : -80 });
        if (gesture % 4 === 0) body.setTwist(sign * 0.7);
        for (let step = 0; step < 20; step++) {
          body.step();
          const state = body.diagnostics();
          const label = `${profile.label}, gesture ${gesture}, step ${step}: ${JSON.stringify(state)}`;
          assert.equal(state.grabbed, true, label);
          assert.ok(Number.isFinite(state.displacement) && state.displacement < 2.5, label);
          assert.ok(Math.abs(state.volumeRatio - 1) < 0.15 && state.minVolumeRatio > 0.25, label);
          for (let i = 1; i < body.positions.length; i += 3) assert.ok(body.positions[i] >= FLOOR, label);
        }
        update();
        for (let i = 0; i < positions.count; i++) {
          assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) && Number.isFinite(positions.getZ(i)));
          assert.ok(Math.abs(positions.getX(i)) < 6 && positions.getY(i) < 6 && Math.abs(positions.getZ(i)) < 6);
          assert.ok(positions.getY(i) >= FLOOR + 0.005 - 1e-8);
        }
        body.release();
        // Catch the rebound before it settles, including an already twisted face.
        advance(body, 3 * STEP);
      }
      assert.ok(caughtMovingSkin > 20, 'Most grabs must land on a visibly displaced surface');
      advance(body, 15);
      update();
      let recoveryError = 0;
      for (let i = 0; i < rest.length; i++) recoveryError = Math.max(recoveryError, Math.abs(positions.array[i] - rest[i]));
      assert.ok(recoveryError < 0.02, `${profile.label}: residual skin offset ${recoveryError}`);
      assert.ok(body.diagnostics().speed < 0.02);
      body.reset();
      update();
      assert.deepEqual(body.positions, body.rest);
      assert.deepEqual(positions.array, rest);
      assert.equal(body.diagnostics().grabbed, false);
    } finally { geometry.dispose(); }
  });
}
