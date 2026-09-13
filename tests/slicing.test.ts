import test from 'node:test';
import assert from 'node:assert/strict';
import { SliceModel, MAX_PIECES, area, chord, center, silhouette, splitPolygon, type Point } from '../src/slicing/model.ts';

const square: Point[] = [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }];
const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test('edge-to-edge cuts conserve volume and create closed convex footprints', () => {
  for (const kind of ['slab', 'prism'] as const) {
    const polygon = silhouette(kind), original = area(polygon);
    close(center(polygon).x, 0); close(center(polygon).z, 0);
    for (let i = 0; i < 70; i++) {
      const angle = i * .41, offset = Math.sin(i) * .8;
      const start = { x: -4 * Math.cos(angle) - offset * Math.sin(angle), z: -4 * Math.sin(angle) + offset * Math.cos(angle) };
      const end = { x: 4 * Math.cos(angle) - offset * Math.sin(angle), z: 4 * Math.sin(angle) + offset * Math.cos(angle) };
      const halves = splitPolygon(polygon, start, end);
      assert.ok(halves); close(area(halves[0]) + area(halves[1]), original);
      for (const half of halves) {
        assert.ok(half.length >= 3);
        assert.ok(half.every(p => Number.isFinite(p.x + p.z)));
        for (let j = 0; j < half.length; j++) {
          const a = half[j], b = half[(j + 1) % half.length], c = half[(j + 2) % half.length];
          assert.ok((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x) >= -1e-7);
        }
      }
    }
  }
});
test('taps, partial strokes, tangencies, thin scraps, and invalid coordinates do not cut', () => {
  for (const [start, end] of [
    [{ x: 0, z: 0 }, { x: 0, z: 0 }],
    [{ x: -2, z: 0 }, { x: .3, z: 0 }],
    [{ x: 0, z: 0 }, { x: 2, z: 0 }],
    [{ x: -2, z: 1 }, { x: 2, z: 1 }],
    [{ x: -2, z: .998 }, { x: 2, z: .998 }],
    [{ x: -2, z: 2 }, { x: 2, z: 2 }],
    [{ x: NaN, z: 0 }, { x: 2, z: 0 }],
    [{ x: -Infinity, z: 0 }, { x: 2, z: 0 }],
  ]) assert.equal(splitPolygon(square, start, end), null);
  assert.deepEqual(chord(square, { x: -2, z: 0 }, { x: 2, z: 0 }), [1, 3]);
});
test('cuts through vertices produce two valid pieces in either direction', () => {
  for (const direction of [1, -1]) {
    const halves = splitPolygon(square, { x: -2 * direction, z: -2 * direction }, { x: 2 * direction, z: 2 * direction });
    assert.ok(halves); assert.deepEqual(halves.map(p => p.length), [3, 3]);
    halves.forEach(p => close(area(p), 2));
  }
});
test('one drag cannot recut its own children; another drag cuts separated pieces', () => {
  const model = new SliceModel('slab'); model.beginStroke();
  assert.equal(model.slice({ x: -3, z: 0 }, { x: 3, z: 0 }), 1);
  assert.equal(model.slice({ x: 0, z: -3 }, { x: 0, z: 3 }), 0);
  for (let i = 0; i < 150; i++) model.step(1 / 60, false);
  assert.equal(model.moving, false);
  assert.ok(model.pieces.every(p => Math.abs(p.offset.z) > .1));
  model.beginStroke(); assert.equal(model.slice({ x: 0, z: -3 }, { x: 0, z: 3 }), 2);
  assert.equal(model.pieces.length, 4);
  model.reset(); assert.equal(model.pieces.length, 1); assert.equal(model.cuts, 0);
  close(model.pieces[0].offset.x, 0); close(model.pieces[0].offset.z, 0);
});
test('hundreds of random cuts stay bounded, finite, and conserve all material', () => {
  for (const kind of ['slab', 'prism'] as const) {
    const model = new SliceModel(kind), original = area(model.pieces[0].polygon);
    for (let i = 0; i < 350; i++) {
      const angle = i * 2.399963, offset = Math.sin(i * 8.1) * 1.5;
      model.beginStroke(); model.slice({ x: -8 * Math.cos(angle) - offset * Math.sin(angle), z: -8 * Math.sin(angle) + offset * Math.cos(angle) }, { x: 8 * Math.cos(angle) - offset * Math.sin(angle), z: 8 * Math.sin(angle) + offset * Math.cos(angle) }, i % 5 === 0);
      model.step(i % 3 ? 1 / 60 : .5, false);
      assert.ok(model.pieces.length <= MAX_PIECES);
      close(model.pieces.reduce((sum, p) => sum + area(p.polygon), 0), original);
      for (const p of model.pieces) { assert.ok(Number.isFinite(p.offset.x + p.offset.z + p.velocity.x + p.velocity.z)); assert.ok(Math.hypot(p.offset.x, p.offset.z) < 4); }
    }
    assert.ok(model.pieces.length > 30);
  }
});
test('reduced motion separates without a spring; contact requires crossing actual material', () => {
  const model = new SliceModel('prism');
  assert.equal(model.contact({ x: -3, z: 3 }, { x: 3, z: 3 }), false);
  assert.equal(model.contact({ x: -3, z: 0 }, { x: 3, z: 0 }), true);
  model.beginStroke(); model.slice({ x: -3, z: 0 }, { x: 3, z: 0 }, true);
  assert.equal(model.moving, false);
  for (const p of model.pieces) assert.deepEqual(p.offset, p.target);
  assert.equal(model.contact({ x: -3, z: 0 }, { x: 3, z: 0 }), false);
});
