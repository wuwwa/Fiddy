import test from 'node:test';
import assert from 'node:assert/strict';
import { createJellyTopology, createJellySkin } from '../src/free-jelly/surface';
import { createSlimeMorphRest, FreeJellyPhysics, FREE_FLOOR } from '../src/free-jelly/physics';

function setup(morph = true) {
  const t = createJellyTopology();
  const body = new FreeJellyPhysics(t.rest, t.triangles, morph ? { bonusMorphRest: createSlimeMorphRest(t.rest, t.triangles) } : {});
  const step = (count: number) => { for (let n = 0; n < count; n++) body.step(); };
  const top = () => {
    const skin = createJellySkin(t.rest, t.triangles);
    try {
      skin.update(body.positions); const positions = skin.geometry.getAttribute('position');
      let id = 0;
      for (let i = 1; i < positions.count; i++) if (positions.getY(i) > positions.getY(id)) id = i;
      return { binding: skin.bindings[id], point: { x: positions.getX(id), y: positions.getY(id), z: positions.getZ(id) } };
    } finally { skin.geometry.dispose(); }
  };
  step(900);
  return { body, step, top };
}

test('bonus slime physically grows a taller crown while conserving volume and settling', () => {
  const { body, step } = setup(), before = body.diagnostics();
  const p = body.positions.slice(), v = body.velocities.slice();
  body.bonusGravity = true; body.setTransformation(true);
  assert.deepEqual(body.positions, p); assert.deepEqual(body.velocities, v);
  let peakSpeed = 0, arrivalSteps = 0;
  for (let i = 0; i < 1800; i++) {
    body.step(); peakSpeed = Math.max(peakSpeed, body.speed);
    if (body.transformationAmount < 1) arrivalSteps++;
  }
  const after = body.diagnostics();
  assert.equal(body.transformationAmount, 1);
  assert.ok(after.height > before.height * 1.15 && after.height < before.height * 1.35);
  assert.ok(arrivalSteps <= 90, 'A resting bonus should finish morphing in under 0.75 seconds');
  assert.ok(peakSpeed < 1.5, 'The faster morph must remain a small, bounded shape change');
  assert.ok(Math.abs(after.volumeRatio - 1) < 0.01);
  assert.ok(body.isAtRest()); assert.equal(body.resetCount, 0);
  body.setTransformation(false); step(2400);
  assert.equal(body.transformationAmount, 0);
  assert.ok(Math.abs(body.diagnostics().height - before.height) < 0.03);
});

test('the optional character mould leaves ordinary play and the material preview unchanged', () => {
  const normal = setup(false), character = setup();
  assert.deepEqual(normal.body.positions, character.body.positions);
  for (const s of [normal, character]) { s.body.setTransformation(true); s.step(1800); }
  assert.deepEqual(normal.body.positions, character.body.positions);
  assert.deepEqual(normal.body.velocities, character.body.velocities);
});

test('a skin grip freezes a partial physical morph and can lift the completed character', () => {
  const { body, step, top } = setup();
  body.bonusGravity = true; body.setTransformation(true); step(25);
  const amount = body.transformationAmount; assert.ok(amount > 0 && amount < 1);
  const hit = top(); body.grab(hit.binding); body.move(hit.point); step(120);
  assert.equal(body.transformationAmount, amount);
  body.release(true); step(2000); assert.equal(body.transformationAmount, 1);
  const character = top(); body.grab(character.binding); body.move({ ...character.point, x: 0.6, y: 3.8 }); step(180);
  assert.ok(body.diagnostics().minY > FREE_FLOOR + 0.3);
  body.release(); step(2200);
  assert.ok(body.isAtRest()); assert.equal(body.resetCount, 0);
  assert.ok(Math.abs(body.diagnostics().volumeRatio - 1) < 0.02);
});

test('character celebration is a small bounded hop and never interrupts a grip or reduced motion', () => {
  const { body, step, top } = setup();
  assert.equal(body.celebrate(), false);
  body.bonusGravity = true; body.setTransformation(true); step(1800);
  const floorCenter = body.center.y;
  assert.equal(body.celebrate(), true); assert.equal(body.celebrate(), false);
  let peak = body.center.y;
  for (let i = 0; i < 120; i++) { body.step(); peak = Math.max(peak, body.center.y); }
  assert.ok(peak > floorCenter + 0.08 && peak < floorCenter + 0.35);
  step(1400); const hit = top(); body.grab(hit.binding);
  const velocities = body.velocities.slice(); assert.equal(body.celebrate(), false);
  assert.deepEqual(body.velocities, velocities);
  body.release(true); body.reducedMotion = true; step(1800);
  assert.equal(body.celebrate(), false); assert.equal(body.celebrate(NaN), false);
  assert.ok(body.isAtRest()); assert.equal(body.resetCount, 0);
});

test('morphed jelly survives repeated extreme throws and orientation changes in both motion settings', () => {
  for (const reducedMotion of [false, true]) {
    const { body, step, top } = setup();
    body.bonusGravity = true; body.reducedMotion = reducedMotion; body.setTransformation(true); step(1800);
    for (let i = 0; i < 6; i++) {
      body.grab(top().binding); body.move({ x: i % 2 ? 1e9 : -1e9, y: 1e9, z: 1e9 }); step(90);
      body.release(); step(180);
      assert.ok(Math.abs(body.diagnostics().volumeRatio - 1) < 0.06);
    }
    body.setBounds(1.7, 3.2); step(2200);
    assert.ok(body.isAtRest()); assert.equal(body.resetCount, 0);
    assert.ok(Math.abs(body.diagnostics().volumeRatio - 1) < 0.02);
    for (let i = 0; i < body.positions.length; i += 3) {
      assert.ok(Number.isFinite(body.positions[i]));
      assert.ok(Math.abs(body.positions[i]) <= body.bounds.x);
      assert.ok(body.positions[i + 1] >= FREE_FLOOR && body.positions[i + 1] <= body.bounds.top);
      assert.ok(Math.abs(body.positions[i + 2]) <= body.bounds.z);
    }
  }
});
