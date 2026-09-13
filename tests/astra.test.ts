import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createCursorPathTexture, createStars, cursorPoint, spiralPoint, SPIRAL_CENTER_Y, CURSOR_PATH_SAMPLES } from '../src/astra/geometry';
import { RotationMotion, trackballPoint } from '../src/astra/rotation';
import { drawingOutline, makePath, PRESET_OUTLINES } from '../src/astra/paths';

test('the inward spiral converges to a finite center, and the cursor closes without a seam', () => {
  const center = new Vector3(0, SPIRAL_CENTER_Y, 0);
  assert.ok(spiralPoint(0).distanceTo(center) < 1e-8);
  assert.ok(spiralPoint(.2).distanceTo(center) < spiralPoint(.8).distanceTo(center));
  assert.ok(cursorPoint(0).distanceTo(cursorPoint(1)) < 1e-8);
  assert.ok(cursorPoint(.99999).distanceTo(cursorPoint(.00001)) < .002);
  for (let i = 0; i < 1000; i++) {
    for (const point of [spiralPoint(i / 1000), cursorPoint(i / 1000)]) assert.ok(point.toArray().every(Number.isFinite));
  }
});

test('star fields have bounded, deterministic samples and matching GPU attributes', () => {
  for (const shape of ['swirl', 'cursor'] as const) {
    const a = createStars(shape), b = createStars(shape);
    assert.deepEqual(a.getAttribute('position').array, b.getAttribute('position').array);
    for (const attribute of Object.values(a.attributes)) {
      assert.equal(attribute.count, a.getAttribute('position').count);
      assert.ok(Array.from(attribute.array).every(Number.isFinite));
    }
    assert.ok(a.boundingSphere!.radius < 5);
    a.dispose(); b.dispose();
  }
});

test('trackball remains normalized for tiny surfaces and drags far beyond their edges', () => {
  for (const size of [[0, 0], [390, 844], [1280, 720]]) {
    for (const position of [[0, 0], [-100000, 100000], [200, 400]]) {
      const point = trackballPoint(position[0], position[1], size[0], size[1]);
      assert.ok(point.toArray().every(Number.isFinite)); assert.ok(Math.abs(point.length() - 1) < 1e-10);
    }
  }
});

test('rotation preserves the grabbed direction and stays normalized through extreme gestures', () => {
  const motion = new RotationMotion(), a = trackballPoint(320, 280, 1280, 720), b = trackballPoint(920, 640, 1280, 720);
  motion.drag(a, b, .01);
  assert.ok(a.clone().applyQuaternion(motion.orientation).distanceTo(b) < 1e-8);
  for (let i = 0; i < 3000; i++) {
    motion.drag(i % 2 ? a : b, i % 2 ? b : a, 0); motion.step(1 / 60);
    assert.ok(Math.abs(motion.orientation.length() - 1) < 1e-8); assert.ok(motion.velocity.length() <= 3.80001);
  }
  motion.reset(); assert.ok(motion.orientation.equals(new Quaternion())); assert.equal(motion.velocity.length(), 0);
});

test('release momentum settles with frame-rate-independent travel', () => {
  const run = (fps: number) => {
    const motion = new RotationMotion(); motion.velocity.set(1, 2, .5);
    for (let i = 0; i < fps * 4; i++) motion.step(1 / fps);
    assert.equal(motion.velocity.length(), 0); return motion.orientation;
  };
  assert.ok(run(30).angleTo(run(120)) < .0001);
});

test('drawn strokes remain separate, preserve open ends, and share one fitted coordinate system', () => {
  const outline = drawingOutline([[[10,20],[10,22],[10,24]], [[14,20],[14,24]], [[9,9],[9,9]]]);
  assert.equal(outline.paths.length,2);
  assert.ok(outline.paths.every(path=>!path.closed));
  assert.ok(outline.paths[0].sample(1).y > outline.paths[0].sample(0).y);
  assert.ok(outline.paths[1].sample(.5).x > outline.paths[0].sample(.5).x + .5);
  const geometry=createStars('cursor',false,outline), strokes=Array.from(geometry.getAttribute('aStroke').array);
  assert.deepEqual(new Set(strokes),new Set([0,1]));
  assert.ok(Array.from(geometry.getAttribute('position').array).every(Number.isFinite));
  geometry.dispose();
});

test('preset and custom paths have finite continuous travel, including closed seams and self intersections', () => {
  const custom=drawingOutline([[[0,0],[1,0],[1,1],[0,1]]],true);
  for(const outline of [...PRESET_OUTLINES,custom])for(const path of outline.paths){
    assert.ok(path.length>0);
    for(let i=0;i<1000;i++) assert.ok(path.sample(i/1000).toArray().every(Number.isFinite));
    if(path.closed)assert.ok(path.sample(.999999).distanceTo(path.sample(.000001))<.001);
    else assert.ok(path.sample(1).distanceTo(path.sample(0))>.1);
  }
  assert.throws(()=>drawingOutline([]));
  assert.throws(()=>drawingOutline([[[1,1],[1,1]]]));
});

test('path atlas retains each stroke length and endpoint behavior for the GPU', () => {
  const outline=drawingOutline([[[0,0],[1,0],[1,1]], [[2,0],[2,2]]]);
  const texture=createCursorPathTexture(outline), data=texture.image.data as Float32Array;
  assert.equal(texture.image.height,2);
  for(let row=0;row<2;row++){
    const offset=row*CURSOR_PATH_SAMPLES*4;
    assert.ok(Math.abs(data[offset+3]+outline.paths[row].length)<1e-5);
    const start=outline.paths[row].sample(0),end=outline.paths[row].sample(1),last=offset+(CURSOR_PATH_SAMPLES-1)*4;
    assert.ok(Math.hypot(data[offset]-start.x,data[offset+1]-start.y)<1e-5);
    assert.ok(Math.hypot(data[last]-end.x,data[last+1]-end.y)<1e-5);
  }
  texture.dispose();
  const unequal=makePath([[0,0],[.1,0],[10,0]],false);
  assert.ok(Math.abs(unequal.sample(.5).x-5)<1e-8);
});
