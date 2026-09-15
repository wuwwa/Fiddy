import test from 'node:test';
import assert from 'node:assert/strict';
import { JellyTransformation } from '../src/free-jelly/transformation';
import { FreeJellyPhysics, FREE_FLOOR } from '../src/free-jelly/physics';
import { createJellyTopology, createJellySkin } from '../src/free-jelly/surface';

function setup() {
  const t = createJellyTopology(), body = new FreeJellyPhysics(t.rest, t.triangles);
  const step = (n: number) => { for (let i = 0; i < n; i++) body.step(); };
  const top = () => {
    const skin = createJellySkin(t.rest, t.triangles);
    try {
      skin.update(body.positions);
      const p = skin.geometry.getAttribute('position'); let id = 0;
      for (let i = 1; i < p.count; i++) if (p.getY(i) > p.getY(id)) id = i;
      return { binding: skin.bindings[id], point: { x: p.getX(id), y: p.getY(id), z: p.getZ(id) } };
    } finally { skin.geometry.dispose(); }
  };
  step(900);
  return { body, step, top };
}

test('material transitions pause when unsafe, reverse continuously, and reject invalid elapsed time', () => {
  const t = new JellyTransformation();
  t.request(true);
  for (let i = 0; i < 240; i++) t.step(1 / 120, false);
  assert.equal(t.amount, 0); assert.equal(t.state, 'waiting');
  for (let i = 0; i < 60; i++) t.step(1 / 120, true);
  const partial = t.amount;
  assert.ok(partial > 0 && partial < 1);
  for (const dt of [NaN, Infinity, -1, 0]) t.step(dt, true);
  assert.equal(t.amount, partial);
  t.request(false); assert.equal(t.amount, partial);
  for (let i = 0; i < 160; i++) t.step(1 / 120, true);
  assert.equal(t.amount, 0); assert.equal(t.state, 'ordinary');
  t.request(true); t.step(60, true);
  assert.ok(t.amount < 0.01, 'A stall cannot finish a transition');
});

test('requesting a transformation never resets positions or velocities and holds defer it', () => {
  const { body, step, top } = setup(), hit = top();
  body.grab(hit.binding); body.move(hit.point, 0.8); step(90);
  const p = body.positions.slice(), v = body.velocities.slice();
  body.setTransformation(true);
  assert.deepEqual(body.positions, p); assert.deepEqual(body.velocities, v);
  step(240); assert.equal(body.transformationAmount, 0);
  body.release(); body.step();
  assert.equal(body.transformationAmount, 0, 'Final release endpoint must be consumed before transition');
  step(1800); assert.equal(body.transformationState, 'transformed');
  assert.equal(body.resetCount, 0); assert.ok(body.isAtRest());
});

test('airborne Jelly keeps its material until landing, and a catch freezes a partial blend', () => {
  const { body, step, top } = setup();
  body.grab(top().binding); body.move({ x: 0.5, y: 3.5, z: 0 }); step(160);
  body.release(); body.step(); assert.ok(body.diagnostics().minY > FREE_FLOOR + 0.2);
  body.setTransformation(true);
  for (let i = 0; i < 15; i++) { body.step(); assert.equal(body.transformationAmount, 0); }
  for (let i = 0; i < 1800 && body.transformationAmount === 0; i++) body.step();
  assert.ok(body.transformationAmount > 0 && body.transformationAmount < 1);
  const amount = body.transformationAmount, hit = top();
  body.grab(hit.binding); body.move(hit.point); step(120);
  assert.equal(body.transformationAmount, amount);
  body.release(true); step(1800); assert.equal(body.transformationState, 'transformed');
});

test('transformed Jelly recovers more slowly from the same press while retaining its volume', () => {
  const ordinary = setup(), bonus = setup();
  bonus.body.setTransformation(true);
  for (const s of [ordinary, bonus]) {
    s.step(1800);
    const hit = s.top(); s.body.grab(hit.binding); s.body.move(hit.point, 0.95); s.step(144);
    s.body.release(); s.step(15);
  }
  assert.ok(bonus.body.diagnostics().height < ordinary.body.diagnostics().height - 0.3,
    'The visible release response must differ beyond a tint change');
  for (const s of [ordinary, bonus]) {
    s.step(1800); assert.ok(s.body.isAtRest());
    assert.ok(Math.abs(s.body.diagnostics().volumeRatio - 1) < 0.015);
    assert.equal(s.body.resetCount, 0);
  }
});

test('reset preserves the material choice and extreme transformed throws stay bounded in both motion settings', () => {
  for (const reduced of [false, true]) {
    const { body, step, top } = setup();
    body.reducedMotion = reduced; body.setTransformation(true); step(1800);
    assert.equal(body.transformationAmount, 1);
    for (let i = 0; i < 8; i++) {
      body.grab(top().binding); body.move({ x: i % 2 ? 1e9 : -1e9, y: 1e9, z: 1e9 }); step(90);
      body.release(); step(180);
      assert.ok(Math.abs(body.diagnostics().volumeRatio - 1) < 0.06);
    }
    body.reset(); assert.deepEqual(body.positions, body.rest);
    assert.equal(body.transformationAmount, 1); assert.ok([...body.velocities].every(v => v === 0));
    step(1800); assert.ok(body.isAtRest()); assert.equal(body.resetCount, 0);
    for (let i = 0; i < body.positions.length; i += 3) {
      assert.ok(Math.abs(body.positions[i]) <= body.bounds.x);
      assert.ok(body.positions[i + 1] >= FREE_FLOOR && body.positions[i + 1] <= body.bounds.top);
      assert.ok(Math.abs(body.positions[i + 2]) <= body.bounds.z);
    }
    body.setTransformation(false); step(1800); assert.equal(body.transformationState, 'ordinary');
  }
});

test('Jelly Fever adds hang time without changing reduced-motion gravity or losing floor bounds', () => {
  const normal=setup(), fever=setup(), reduced=setup();
  for(const s of [normal,fever,reduced]){
    s.body.setTransformation(true);s.step(1800);
    for(let i=1;i<s.body.positions.length;i+=3)s.body.positions[i]+=1.8;
    s.body.previous.set(s.body.positions);s.body.velocities.fill(0);
  }
  fever.body.bonusGravity=true;reduced.body.bonusGravity=true;reduced.body.reducedMotion=true;
  for(const s of [normal,fever,reduced])s.step(30);
  assert.ok(fever.body.center.y>normal.body.center.y+0.1,'Reduced gravity must be perceptible in a free fall');
  assert.ok(Math.abs(normal.body.center.y-reduced.body.center.y)<0.02,'Reduced motion keeps ordinary gravity');
  for(const s of [fever,reduced]){
    s.step(2400);assert.ok(s.body.isAtRest());assert.equal(s.body.resetCount,0);
    assert.ok(Math.abs(s.body.diagnostics().volumeRatio-1)<0.02);
    assert.ok(s.body.diagnostics().minY>=FREE_FLOOR);
  }
});
