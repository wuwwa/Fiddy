import test from 'node:test';
import assert from 'node:assert/strict';
import { SliceGesture } from '../src/slicing/gesture.ts';
import { SliceModel, MAX_PIECES, area } from '../src/slicing/model.ts';

test('a quick line becomes a swipe while a settled hold keeps the tension gesture', () => {
  const swipe = new SliceGesture({ x: 0, z: 0 }, { x: 100, y: 100 }, 0, true);
  swipe.move({ x: .02, z: 0 }, { x: 106, y: 100 }, 30);
  assert.equal(swipe.mode, 'pending'); assert.equal(swipe.consume(), null);
  swipe.move({ x: .2, z: 0 }, { x: 125, y: 100 }, 80);
  assert.equal(swipe.mode, 'swipe'); swipe.advance(2000); assert.equal(swipe.mode, 'swipe');
  const hold = new SliceGesture({ x: 0, z: 0 }, { x: 100, y: 100 }, 0, true);
  hold.advance(180); hold.move({ x: 0, z: 2 }, { x: 100, y: 200 }, 250);
  assert.equal(hold.mode, 'hold'); assert.equal(hold.consume(), null);
});

test('starting outside the jelly supports slow strokes and consumes only the newest endpoint once', () => {
  const model = new SliceModel('slab');
  assert.equal(model.contains({ x: -3, z: 0 }), false); assert.equal(model.contains({ x: 0, z: 0 }), true);
  const swipe = new SliceGesture({ x: -3, z: 0 }, { x: 0, y: 100 }, 0, false);
  for (let i = 0; i <= 1000; i++) swipe.move({ x: -3 + i * .006, z: 0 }, { x: i, y: 100 }, i * 4);
  model.beginStroke();
  const segment = swipe.consume()!;
  assert.equal(model.slice(segment.start, segment.end), 1); assert.equal(swipe.consume(), null);
  assert.equal(model.pieces.length, 2);
});

test('swipes cut both jelly shapes across either direction while partial strokes and empty space do not', () => {
  for (const kind of ['slab', 'prism'] as const) for (const direction of [-1, 1]) {
    const model = new SliceModel(kind), original = area(model.pieces[0].polygon);
    model.beginStroke();
    assert.equal(model.slice({ x: -3, z: 3 }, { x: 3, z: 3 }), 0);
    assert.equal(model.slice({ x: -3 * direction, z: 0 }, { x: 0, z: 0 }), 0);
    assert.equal(model.slice({ x: -3 * direction, z: 0 }, { x: 3 * direction, z: 0 }), 1);
    assert.equal(model.slice({ x: -4 * direction, z: 0 }, { x: 4 * direction, z: 0 }), 0, 'One stroke cannot cut its new children');
    assert.ok(Math.abs(model.pieces.reduce((sum, piece) => sum + area(piece.polygon), 0) - original) < 1e-7);
    model.step(.05, true); assert.equal(model.contains({ x: 0, z: 0 }), false, 'The separated seam is empty');
  }
});

test('the hard piece cap stops further work and reset allows a fresh cut', () => {
  for (const kind of ['slab', 'prism'] as const) {
    const model = new SliceModel(kind);
    for (let i = 0; i < 200; i++) {
      const a = i * 2.399963, o = Math.sin(i * 8.1) * 1.2;
      model.beginStroke(); model.slice({ x: -8 * Math.cos(a) - o * Math.sin(a), z: -8 * Math.sin(a) + o * Math.cos(a) }, { x: 8 * Math.cos(a) - o * Math.sin(a), z: 8 * Math.sin(a) + o * Math.cos(a) }, true);
      assert.ok(model.pieces.length <= MAX_PIECES);
    }
    assert.equal(model.pieces.length, MAX_PIECES);
    const pieces = model.pieces, cuts = model.cuts;
    model.beginStroke(); assert.equal(model.slice({ x: -3, z: 0 }, { x: 3, z: 0 }), 0);
    assert.equal(model.pieces, pieces); assert.equal(model.cuts, cuts);
    model.reset(); assert.equal(model.pieces.length, 1);
    model.beginStroke(); assert.equal(model.slice({ x: -3, z: 0 }, { x: 3, z: 0 }), 1);
  }
});
