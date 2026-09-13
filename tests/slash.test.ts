import test from 'node:test';
import assert from 'node:assert/strict';
import { SlashTrail } from '../src/slicing/slash.ts';
import { SliceModel } from '../src/slicing/model.ts';

test('a blade follows a curved stroke with pointed ends instead of anchoring to pointer-down', () => {
  const trail = new SlashTrail(); trail.begin(0, 0, 0);
  for (let i = 1; i <= 40; i++) trail.add(i * 12, Math.sin(i * .1) * 40, i * 4);
  assert.equal(trail.update(160), true);
  const edge = trail.edges, end = (trail.count - 1) * 4;
  assert.ok(edge[0] > 180, 'The old beginning has already left the short trail');
  assert.equal(edge[0], edge[2]); assert.equal(edge[1], edge[3]);
  assert.equal(edge[end], edge[end + 2]); assert.equal(edge[end + 1], edge[end + 3]);
  assert.ok(Math.abs(edge[end] - 480) < .001);
  assert.ok(Math.abs(edge[end + 1] - Math.sin(4) * 40) < .001);
  assert.ok(trail.count <= 48);
  assert.ok(edge.slice(0, trail.count * 4).every(Number.isFinite));
});

test('the blade fades while stationary and completely retires after release', () => {
  const trail = new SlashTrail(); trail.begin(0, 0, 0); trail.add(120, 0, 40);
  trail.update(40); const bright = trail.opacity;
  trail.update(90); assert.ok(trail.opacity < bright && trail.opacity > 0);
  trail.add(120, 0, 180); trail.update(240);
  assert.equal(trail.active, false); assert.equal(trail.count, 0);
});

test('rapid swipes and cut bursts reuse bounded storage and clear for interruption', () => {
  const trail = new SlashTrail(), edges = trail.edges, particles = trail.particles;
  trail.begin(0, 0, 0);
  for (let i = 1; i <= 2000; i++) {
    trail.add(i * 4, Math.sin(i) * 20, i);
    if (i % 8 === 0) trail.burst(i, 100, 1, 0, i);
    trail.update(i);
    assert.ok(trail.count <= 48); assert.equal(trail.particles.length, 16);
  }
  assert.equal(trail.edges, edges); assert.equal(trail.particles, particles);
  trail.update(2300); assert.equal(trail.active, false);
  trail.burst(1, 2, 0, 0, 2400); trail.update(2400, true); assert.equal(trail.active, false, 'Reduced motion omits the cut droplets');
  trail.clear(); assert.equal(trail.count, 0); assert.equal(trail.active, false);
});

test('swipe cuts separate more crisply than wire cuts and still settle safely', () => {
  for (const kind of ['slab', 'prism'] as const) {
    const slow = new SliceModel(kind), swipe = new SliceModel(kind);
    for (const model of [slow, swipe]) model.beginStroke();
    slow.slice({ x: -3, z: 0 }, { x: 3, z: 0 }); swipe.slice({ x: -3, z: 0 }, { x: 3, z: 0 }, false, 1);
    slow.step(1 / 60, false); swipe.step(1 / 60, false);
    assert.ok(Math.abs(swipe.pieces[0].offset.z) > Math.abs(slow.pieces[0].offset.z) * 2);
    for (let i = 0; i < 120; i++) swipe.step(1 / 60, false);
    assert.equal(swipe.moving, false);
    for (const piece of swipe.pieces) {
      assert.ok(Math.abs(piece.offset.z - piece.target.z) < .001);
      assert.ok(Math.abs(piece.offset.z) < .2);
    }
  }
});
