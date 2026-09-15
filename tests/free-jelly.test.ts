import test from 'node:test';
import assert from 'node:assert/strict';
import { FreeJellyPhysics, FREE_FLOOR } from '../src/free-jelly/physics.ts';
import { createJellyTopology, createJellySkin } from '../src/free-jelly/surface.ts';
import { jellyPressure } from '../src/free-jelly/gesture.ts';

function setup() {
  const topology = createJellyTopology();
  const body = new FreeJellyPhysics(topology.rest, topology.triangles);
  const skin = createJellySkin(topology.rest, topology.triangles);
  const step = (count: number) => { for (let i = 0; i < count; i++) body.step(); };
  const contact = (axis: 'x' | 'y' | 'z' = 'y') => {
    skin.update(body.positions);
    const p = skin.geometry.getAttribute('position'); let id = 0;
    const component = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    for (let i = 1; i < p.count; i++) if (p.getComponent(i, component) > p.getComponent(id, component)) id = i;
    return { binding: skin.bindings[id], point: { x: p.getX(id), y: p.getY(id), z: p.getZ(id) } };
  };
  return { body, skin, step, top: () => contact(), contact };
}

test('free jelly settles under gravity with conserved volume and no fixed particles', () => {
  const { body, skin, step } = setup();
  try {
    assert.ok([...body.invMass].every(m => m > 0));
    step(1200);
    assert.ok(body.isAtRest());
    assert.equal(body.diagnostics().minY, FREE_FLOOR);
    assert.ok(Math.abs(body.diagnostics().volumeRatio - 1) < 0.01);
    assert.equal(body.resetCount, 0);
  } finally { skin.geometry.dispose(); }
});

test('a press squashes; a rising pull stretches on the floor before lifting the entire body', () => {
  const { body, skin, step, top } = setup();
  try {
    step(900); const baseline = body.diagnostics(); const hit = top();
    assert.ok(body.grab(hit.binding));
    body.move({ ...hit.point, y: hit.point.y - 0.32 }); step(120);
    assert.ok(body.diagnostics().height < baseline.height - 0.2);
    for (let n = 0; n < 60; n++) {
      body.move({ x: n / 60 * 0.7, y: 1.3 + n / 60 * 1.7, z: 0 }); body.step();
      if (n === 15) {
        assert.equal(body.diagnostics().minY, FREE_FLOOR);
        assert.ok(body.diagnostics().height > baseline.height);
      }
    }
    assert.ok(body.diagnostics().minY > FREE_FLOOR + 0.3);
    assert.ok(body.center.x > 0.25);
    assert.ok(Math.abs(body.diagnostics().volumeRatio - 1) < 0.02);
  } finally { skin.geometry.dispose(); }
});

test('release carries momentum, lands with squash and rebound, and settles away from its starting point', () => {
  const { body, skin, step, top } = setup();
  try {
    // Keep this throw clear of a wall, whose rebound can legitimately return it.
    body.setBounds(4.3, 5.5);
    step(900); body.grab(top().binding);
    for (let n = 0; n < 70; n++) { body.move({ x: n / 70, y: 1.6 + n / 70 * 1.6, z: 0 }); body.step(); }
    const released = { ...body.center }; body.release(); step(8);
    assert.ok(body.center.x > released.x + 0.03);
    let landed = false, minHeight = Infinity, reboundHeight = 0;
    for (let n = 0; n < 1200; n++) {
      body.step(); const d = body.diagnostics();
      if (body.impact > 2) landed = true;
      if (landed) { minHeight = Math.min(minHeight, d.height); reboundHeight = Math.max(reboundHeight, d.height - minHeight); }
      assert.ok(d.minY >= FREE_FLOOR);
    }
    assert.ok(landed); assert.ok(minHeight < 1.4); assert.ok(reboundHeight > 0.3);
    assert.ok(body.isAtRest()); assert.ok(Math.abs(body.center.x) > 0.2); assert.equal(body.resetCount, 0);
  } finally { skin.geometry.dispose(); }
});

test('catching a moving skin binds at its current position without resetting shape or momentum', () => {
  const { body, skin, step, top } = setup();
  try {
    step(700); body.grab(top().binding); body.move({ x: 0.8, y: 3, z: 0 }); step(80); body.release(); step(10);
    const hit = top(), positions = new Float64Array(body.positions), velocities = new Float64Array(body.velocities);
    assert.ok(body.grab(hit.binding));
    assert.deepEqual(body.positions, positions); assert.deepEqual(body.velocities, velocities);
    body.move(hit.point); body.step();
    let maxChange = 0;
    for (let i = 0; i < positions.length; i++) maxChange = Math.max(maxChange, Math.abs(body.positions[i] - positions[i]));
    assert.ok(maxChange < 0.12); assert.equal(body.resetCount, 0);
  } finally { skin.geometry.dispose(); }
});

test('between-frame taps survive once, while cancellation removes pending throws and duplicate release is harmless', () => {
  const first = setup(), control = setup(), cancelled = setup();
  try {
    for (const s of [first, control, cancelled]) s.step(700);
    for (const s of [first, cancelled]) {
      const hit = s.top(); s.body.grab(hit.binding); s.body.move({ ...hit.point, y: hit.point.y - 0.2 }); s.body.release();
    }
    first.body.release(); cancelled.body.release(true);
    first.body.step(); control.body.step(); cancelled.body.step();
    assert.ok(first.body.speed > control.body.speed + 0.1);
    assert.ok(cancelled.body.speed < 0.02);
    assert.equal(first.body.grabbed, false);
    first.step(1200); assert.ok(first.body.isAtRest());
  } finally { [first, control, cancelled].forEach(s => s.skin.geometry.dispose()); }
});

test('extreme repeated throws, resizing, bad inputs and reset stay finite and inside the stage', () => {
  const { body, skin, step, top } = setup();
  try {
    step(600);
    assert.equal(body.grab({ ids: [-1], weights: [1] }), false);
    assert.equal(body.grab({ ids: [0], weights: [NaN] }), false);
    for (let turn = 0; turn < 12; turn++) {
      body.grab(top().binding);
      body.move({ x: NaN, y: Infinity, z: 0 });
      body.move({ x: turn % 2 ? 1e9 : -1e9, y: turn % 3 ? 1e9 : -1e9, z: 1e9 }); step(65);
      body.release(); step(80);
    }
    body.release(true); body.setBounds(1.7, 3.2); step(700);
    for (let i = 0; i < body.positions.length; i += 3) {
      assert.ok(Math.abs(body.positions[i]) <= 1.7);
      assert.ok(body.positions[i + 1] >= FREE_FLOOR && body.positions[i + 1] <= 3.2);
      assert.ok(Math.abs(body.positions[i + 2]) <= body.bounds.z);
    }
    assert.ok(Math.abs(body.diagnostics().volumeRatio - 1) < 0.04); assert.equal(body.resetCount, 0);
    body.reset(); assert.deepEqual(body.positions, body.rest); assert.equal(body.grabbed, false);
    assert.ok([...body.velocities].every(v => v === 0));
  } finally { skin.geometry.dispose(); }
});

test('reduced motion preserves lifting and settles its release without a position reset', () => {
  const { body, skin, step, top } = setup();
  try {
    step(600); body.grab(top().binding); body.move({ x: 0.6, y: 3.1, z: 0 }); step(180);
    const positions = new Float64Array(body.positions); body.reducedMotion = true;
    assert.deepEqual(body.positions, positions); assert.ok(body.diagnostics().minY > 0.2);
    body.release(); step(1800); assert.ok(body.isAtRest()); assert.equal(body.resetCount, 0);
  } finally { skin.geometry.dispose(); }
});

test('the subdivided skin remains closed, finite and bound to material through deformation', () => {
  const { body, skin, step, top } = setup();
  try {
    step(600); body.grab(top().binding); body.move({ x: 0.8, y: 3, z: 0.5 }); step(80); skin.update(body.positions);
    const edges = new Map<string, number>(), faces = skin.geometry.index!.array;
    for (let i = 0; i < faces.length; i += 3) for (let k = 0; k < 3; k++) {
      const a = faces[i + k], b = faces[i + (k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    assert.ok([...edges.values()].every(count => count === 2));
    assert.ok([...skin.geometry.getAttribute('position').array].every(Number.isFinite));
    assert.ok([...skin.geometry.getAttribute('normal').array].every(Number.isFinite));
    for (const binding of skin.bindings) assert.ok(Math.abs(binding.weights.reduce((a, b) => a + b, 0) - 1) < 1e-6);
  } finally { skin.geometry.dispose(); }
});

for (const [name, axis] of [['front', 'z'], ['side', 'x'], ['crown', 'y']] as const) {
  test(`a ${name} hold visibly compresses, a downward push stays on the floor, and release rebounds`, () => {
    const { body, skin, step, contact } = setup();
    try {
      step(900); const baseline = body.diagnostics(), hit = contact(axis);
      body.grab(hit.binding);
      for (let n = 0; n < 180; n++) {
        body.move(hit.point, jellyPressure(hit.point, hit.point, n / 120)); body.step();
      }
      const held = body.diagnostics();
      assert.ok(held.height < baseline.height * 0.8, `${name} hold failed to squash`);
      assert.ok(held.center.y < baseline.center.y - 0.1);
      let minHeight = Infinity, maxHeight = 0;
      for (let n = 0; n < 720; n++) {
        const target = { ...hit.point, y: hit.point.y - Math.min(1, n / 60) * 3 };
        body.move(target, jellyPressure(hit.point, target, 1.5 + n / 120)); body.step();
        const d = body.diagnostics();
        assert.equal(d.minY, FREE_FLOOR, 'A sustained downward press must not hop');
        if (n > 120) { minHeight = Math.min(minHeight, d.height); maxHeight = Math.max(maxHeight, d.height); }
      }
      assert.ok(maxHeight < held.height - 0.12, 'Pushing down should compress further');
      assert.ok(maxHeight - minHeight < 0.04, 'The compressed material should settle under the hand');
      assert.ok(body.speed < 0.1);
      assert.ok(body.diagnostics().volumeRatio > 0.97);
      const compressed = body.diagnostics().height;
      body.release(); step(35);
      assert.ok(body.diagnostics().height > compressed + 0.15, 'The release should recover, without a reset');
      step(1500); assert.ok(body.isAtRest()); assert.equal(body.resetCount, 0);
    } finally { skin.geometry.dispose(); }
  });
}

test('pressing transitions into lifting the same material, and an airborne hold does not apply a floor press', () => {
  const { body, skin, step, contact } = setup();
  try {
    step(900); const hit = contact('z'); body.grab(hit.binding);
    for (let n = 0; n < 150; n++) {
      body.move(hit.point, jellyPressure(hit.point, hit.point, n / 120)); body.step();
    }
    for (let n = 0; n < 180; n++) {
      const target = { ...hit.point, y: hit.point.y + n / 180 * 2.4 };
      body.move(target, jellyPressure(hit.point, target, 1.25 + n / 120)); body.step();
    }
    assert.ok(body.diagnostics().minY > 0.3);
    assert.ok(body.pressure < 0.001);
    body.release(); step(8);
    const catchPoint = contact('z'); const positions = new Float64Array(body.positions);
    body.grab(catchPoint.binding);
    body.move(catchPoint.point, jellyPressure(catchPoint.point, catchPoint.point, 0.5));
    assert.deepEqual(body.positions, positions);
    body.step(); assert.equal(body.pressure, 0);
    assert.equal(body.resetCount, 0);
  } finally { skin.geometry.dispose(); }
});

test('downward travel increases pressure; upward and sideways travel unload it continuously', () => {
  const anchor = { x: 0, y: 1, z: 0.8 };
  const held = jellyPressure(anchor, anchor, 1);
  assert.ok(held > jellyPressure(anchor, anchor, 0));
  assert.ok(jellyPressure(anchor, { ...anchor, y: 0.6 }, 1) > held);
  assert.ok(jellyPressure(anchor, { ...anchor, y: 1.1 }, 1) < held);
  assert.equal(jellyPressure(anchor, { ...anchor, y: 1.4 }, 1), 0);
  assert.equal(jellyPressure(anchor, { ...anchor, x: 0.7 }, 1), 0);
  assert.equal(jellyPressure(anchor, { ...anchor, y: -100 }, 1), 1);
});
