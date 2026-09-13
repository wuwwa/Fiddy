import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { MagneticField, dipoleSample } from '../src/magnetic-dust/model.ts';
import { SilkField, type SilkPointer } from '../src/silk/model.ts';
import { SilkProjection } from '../src/silk/projection.ts';
import type { FieldPointer } from '../src/fields/input.ts';
const pointer = (): FieldPointer => ({ x: .5, y: .46, dx: 0, dy: 0, down: true, inside: true, keyboard: false, samples: [] });
const energy = (values: Float32Array) => values.reduce((sum, value) => sum + Math.abs(value), 0);
function distance(field: MagneticField) { let value = 0; for (let i = 0; i < field.count; i++) value += Math.hypot(field.position[i * 2] - field.width * .5, field.position[i * 2 + 1] - field.height * .46); return value / field.count; }
test('the softened dipole has finite poles, mirror symmetry, and inverse-cube far-field decay', () => {
  for (const [x, y] of [[0, 0], [1, 0], [-1, 0], [2, 3], [-2, -3]]) {
    const a = dipoleSample(x, y), b = dipoleSample(x, -y);
    assert.ok(Object.values(a).every(Number.isFinite));
    assert.ok(Math.abs(a.bx - b.bx) < 1e-10 && Math.abs(a.by + b.by) < 1e-10);
  }
  assert.ok(Math.abs(dipoleSample(100, 0).bx / dipoleSample(200, 0).bx - 8) < .003);
  const sample = dipoleSample(1.4, .8), epsilon = .0001;
  const strength = (x: number, y: number) => { const b = dipoleSample(x, y); return b.bx ** 2 + b.by ** 2; };
  assert.ok(Math.abs((strength(1.4 + epsilon, .8) - strength(1.4 - epsilon, .8)) / (2 * epsilon) - sample.ax) < .00001);
  assert.ok(Math.abs((strength(1.4, .8 + epsilon) - strength(1.4, .8 - epsilon)) / (2 * epsilon) - sample.ay) < .00001);
});
test('dust aligns with the dipole and converges into flux-contour chains without collapsing', () => {
  const field = new MagneticField(800, 600), input = pointer();
  function measure() {
    let error = 0, alignment = 0, count = 0; const c = Math.cos(field.angle), s = Math.sin(field.angle);
    for (let i = 0; i < field.count; i++) {
      const dx = field.position[i * 2] - 400, dy = field.position[i * 2 + 1] - 276;
      if (Math.hypot(dx, dy) > 200 || Math.hypot(dx, dy) < 30) continue;
      const b = dipoleSample((dx * c + dy * s) / field.pole, (-dx * s + dy * c) / field.pole);
      const level = Math.round(Math.sqrt(Math.max(0, b.flux)) * 22) / 22;
      error += Math.abs(b.flux - level * level) / Math.sqrt(b.gx * b.gx + b.gy * b.gy + .00002);
      alignment += Math.cos(2 * (field.directions[i] - Math.atan2(b.by, b.bx) - field.angle)); count++;
    }
    return { error: error / count, alignment: alignment / count };
  }
  const before = measure(), radius = distance(field);
  for (let i = 0; i < 240; i++) field.step(1 / 60, input, false);
  assert.ok(measure().error < before.error * .2); assert.ok(measure().alignment > .96);
  assert.ok(distance(field) > radius * .85, 'The field should reveal arches across the bed rather than collapse to its center');
});
test('repel remains an explicit outward scattering gesture', () => {
  const attract = new MagneticField(800, 600), repel = new MagneticField(800, 600), input = pointer();
  repel.polarity = 'repel'; const before = distance(attract);
  for (let i = 0; i < 90; i++) { attract.step(1 / 60, input, false); repel.step(1 / 60, input, false); }
  assert.ok(distance(repel) > before * 1.15); assert.ok(distance(repel) > distance(attract));
});
test('prolonged dust strokes stay bounded and recover without an emergency reset', () => {
  const field = new MagneticField(390, 844), input = pointer();
  for (let i = 0; i < 300; i++) {
    input.x = .5 + Math.sin(i * .12) * .65; input.y = .5 + Math.cos(i * .12) * .65;
    field.polarity = i % 60 < 30 ? 'attract' : 'repel'; field.step(.1, input, false);
    assert.ok(field.position.every((value, index) => Number.isFinite(value) && value >= 1 && value <= (index % 2 ? 843 : 389)));
    assert.ok(field.velocity.every(value => Math.abs(value) <= 1400));
  }
  input.inside = false;
  for (let i = 0; i < 900; i++) field.step(1 / 60, input, false);
  assert.ok(field.position.every((value, index) => Math.abs(value - field.home[index]) < .01));
});
test('a completed fast dust swipe retains momentum along the full path', () => {
  const field = new MagneticField(800, 600), input = pointer(); input.inside = input.down = false;
  input.samples.push({ x: .85, y: .46, dx: .7, dy: 0, dt: .01, down: true, start: false });
  field.step(1 / 60, input, false);
  assert.ok(field.velocity.filter((value, index) => index % 2 === 0 && value > 10).length > 1000);
});
test('hover and arrow-only movement leave resting dust untouched in either polarity', () => {
  for (const polarity of ['attract', 'repel'] as const) for (const reduced of [false, true]) {
    const field = new MagneticField(800, 600), input = pointer(); field.polarity = polarity; input.down = false;
    const original = field.position.slice(), directions = field.directions.slice();
    for (let i = 0; i < 60; i++) {
      input.x = .5 + Math.sin(i) * .4; input.y = .5 + Math.cos(i) * .4; input.keyboard = i > 30;
      input.samples = [{ x: input.x, y: input.y, dx: .2, dy: -.2, dt: .01, down: false, start: false }];
      field.step(1 / 60, input, reduced);
    }
    assert.deepEqual(field.position, original); assert.deepEqual(field.directions, directions); assert.equal(energy(field.velocity), 0);
  }
});
test('released dust recovers identically whether the cursor stays over it or leaves', () => {
  const hovered = new MagneticField(800, 600), departed = new MagneticField(800, 600), input = pointer();
  for (let i = 0; i < 30; i++) { hovered.step(1 / 60, input, false); departed.step(1 / 60, input, false); }
  input.down = false;
  for (let i = 0; i < 180; i++) {
    input.inside = true; input.x = .5 + Math.sin(i) * .4;
    input.samples = [{ x: input.x, y: .46, dx: .15, dy: 0, dt: .01, down: false, start: false }];
    hovered.step(1 / 60, input, false);
    departed.step(1 / 60, { ...input, inside: false, samples: [] }, false);
  }
  assert.deepEqual(hovered.position, departed.position); assert.deepEqual(hovered.velocity, departed.velocity);
});
test('dust reset restores every grain and orientation; resize preserves relative motion', () => {
  const field = new MagneticField(800, 600), input = pointer(), original = field.directions.slice();
  field.step(1 / 30, input, false); const before = field.position.slice(); field.resize(400, 900);
  assert.ok(field.position.every((value, index) => Math.abs(value - before[index] * (index % 2 ? 1.5 : .5)) < .001));
  field.reset(); assert.deepEqual(field.position, field.home); assert.deepEqual(field.directions, original); assert.equal(energy(field.velocity), 0);
});
test('silk lifts locally, propagates a fold, and settles back to the resting fabric', () => {
  const field = new SilkField(), input = pointer(); input.x = input.y = .5;
  for (let i = 0; i < 90; i++) field.step(1 / 60, input, false);
  const middle = 36 * field.side + 36;
  assert.ok(field.height[middle] > .5); assert.ok(field.height[middle + 12] > .08);
  assert.ok(Math.abs(field.height[0]) < field.height[middle] * .12, 'The lifted center should dominate the small edge gather needed to preserve thread lengths');
  input.inside = false;
  for (let i = 0; i < 600; i++) field.step(1 / 60, input, false);
  assert.ok(field.height.every(value => Math.abs(value) < .0001)); assert.ok(field.velocity.every(value => Math.abs(value) < .0001));
});
test('silk survives rapid edge gestures, reset clears waves, and reduced motion freezes its phase', () => {
  const field = new SilkField(), input = pointer();
  for (let i = 0; i < 300; i++) {
    input.x = .5 + Math.sin(i) * .7; input.y = .5 + Math.cos(i) * .7;
    input.samples = [{ x: input.x, y: input.y, dx: .5, dy: -.5, dt: .01, down: true, start: true }];
    field.step(.1, input, false);
    assert.ok(field.height.every(value => Number.isFinite(value) && value >= -.701 && value <= 1.101));
    for (const values of [field.offsetX, field.offsetZ]) assert.ok(values.every(value => Number.isFinite(value) && Math.abs(value) <= 1.051));
  }
  field.reset(); assert.equal([field.height,field.velocity,field.offsetX,field.offsetZ,field.velocityX,field.velocityZ].reduce((sum,values)=>sum+energy(values),0), 0); assert.equal(field.phase, 0);
  input.inside = false; input.samples = []; field.step(1 / 60, input, true);
  assert.equal(field.phase, 0); assert.equal(energy(field.height), 0);
  const reduced = new SilkField(), normal = new SilkField(); input.inside = true;
  for (let i = 0; i < 30; i++) { reduced.step(1 / 60, input, true); normal.step(1 / 60, input, false); }
  assert.ok(energy(reduced.height) < energy(normal.height) * .7);
});
test('silk keeps the original patch attached while a drag pulls the surrounding fabric sideways', () => {
  const field = new SilkField(), input: SilkPointer = {...pointer(), x: .3, y: .5};
  field.step(1/60,input,false);
  input.x = .72; input.y = .6;
  for(let i=0;i<100;i++)field.step(1/60,input,false);
  assert.equal(field.grabU,.3); assert.equal(field.grabV,.5);
  const grabbed = 36*field.side+22, neighbor=grabbed+8;
  assert.ok(field.offsetX[grabbed]>.4,'The patch should travel sideways with the pull');
  assert.ok(field.offsetZ[grabbed]>.1);
  assert.ok(field.offsetX[neighbor]>.15,'The pull should gather fabric around the original grip');
  input.down=false; input.samples=[];
  for(let i=0;i<600;i++)field.step(1/60,input,false);
  for(const values of [field.height,field.velocity,field.offsetX,field.offsetZ,field.velocityX,field.velocityZ]) {
    assert.ok(values.every(value=>Math.abs(value)<.0001),'Released fabric should recover in every direction');
  }
});
test('silk can catch a different patch during rebound or between animation frames', () => {
  const field=new SilkField(), input:SilkPointer={...pointer(),grabU:.2,grabV:.3,grabId:1};
  for(let i=0;i<20;i++)field.step(1/60,input,false);
  input.grabU=.75;input.grabV=.65;input.grabId=2;
  field.step(1/60,input,false);
  assert.equal(field.grabU,.75);assert.equal(field.grabV,.65);
  input.down=false;field.step(1/60,input,false);
  input.down=true;input.grabU=.4;input.grabV=.8;field.step(1/60,input,false);
  assert.equal(field.grabU,.4);assert.equal(field.grabV,.8);
});
test('a stationary hover leaves silk untouched and a moving brush sends a ripple', () => {
  const field=new SilkField(),input={...pointer(),down:false};
  for(let i=0;i<30;i++)field.step(1/60,input,false);
  assert.equal(energy(field.height)+energy(field.velocity),0);
  input.samples=[{x:.7,y:.5,dx:.4,dy:0,dt:.01,down:false,start:false}];
  field.step(1/60,input,false);input.samples=[];
  assert.ok(energy(field.height)>1);assert.equal(field.held,false);
});
test('silk input projection follows the camera on desktop and narrow viewports', () => {
  const projection = new SilkProjection();
  for (const aspect of [1.5, 390 / 844]) {
    const camera = new PerspectiveCamera(36, aspect, .1, 50); camera.position.set(3.7, 3.2, 4.3).normalize().multiplyScalar(8.7 / Math.min(1, aspect)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    for (const [u, v] of [[.5, .5], [.2, .8], [1.1, -.1]]) {
      const screen = new Vector3((u - .5) * 3.5, 0, (v - .5) * 3.5).project(camera);
      const mapped = projection.map(camera, (screen.x + 1) / 2, (1 - screen.y) / 2);
      assert.ok(Math.abs(mapped.x - u) < 1e-8 && Math.abs(mapped.y - v) < 1e-8);
    }
  }
});
