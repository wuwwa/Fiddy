import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute, PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_CUT_ANGLE, KnifePress, findCut } from '../src/slicing/knife.ts';
import { SliceModel, MAX_PIECES } from '../src/slicing/model.ts';
import { BatchedGel } from '../src/slicing/gel.ts';
import { CuttingWire } from '../src/slicing/wire.ts';

test('the cutting cord stays finite, faces outward, and reuses its geometry through tension and cancellation', () => {
  const wire = new CuttingWire(), press = new KnifePress(), model = new SliceModel('slab');
  const line = findCut(model, { x: 0, z: 0 }, DEFAULT_CUT_ANGLE)!;
  const position = wire.geometry.attributes.position, normal = wire.geometry.attributes.normal, indices = wire.geometry.index!;
  try {
    press.begin(line);
    for (let i = 0; i < 150; i++) {
      press.depth = (i % 101) / 100; press.resistance = .9;
      wire.update(line, press, 1.02, i % 2 ? 10.7 : 20);
      assert.equal(wire.geometry.attributes.position, position); assert.equal(wire.geometry.attributes.normal, normal);
      for (let j = 0; j < position.count; j++) {
        assert.ok(Number.isFinite(position.getX(j) + position.getY(j) + position.getZ(j)));
        assert.ok(Math.abs(Math.hypot(normal.getX(j), normal.getY(j), normal.getZ(j)) - 1) < 1e-5);
      }
    }
    for (let i = 0; i < indices.count; i += 27) {
      const a = new Vector3().fromBufferAttribute(position, indices.getX(i)), b = new Vector3().fromBufferAttribute(position, indices.getX(i + 1)), c = new Vector3().fromBufferAttribute(position, indices.getX(i + 2));
      const face = b.sub(a).cross(c.sub(a)).normalize(), shading = new Vector3().fromBufferAttribute(normal, indices.getX(i));
      assert.ok(face.dot(shading) > .7, 'The cord must render its outside face');
    }
    press.release(true); wire.update(null, press, 1.02, 10.7); assert.equal(wire.mesh.visible, false);
  } finally { wire.dispose(); }
});

test('the default knife incision projects vertically on desktop and phone cameras', () => {
  for (const aspect of [1100 / 800, 390 / 844, 844 / 390]) {
    const camera = new PerspectiveCamera(34, aspect, .1, 60);
    camera.position.set(4.5, 5.6, 6.5).normalize().multiplyScalar(Math.max(10.7, 9 / aspect));
    camera.position.y += .45; camera.lookAt(0, .45, 0); camera.updateMatrixWorld();
    const a = new Vector3(Math.cos(DEFAULT_CUT_ANGLE), 1.02, Math.sin(DEFAULT_CUT_ANGLE)).project(camera);
    const b = new Vector3(-Math.cos(DEFAULT_CUT_ANGLE), 1.02, -Math.sin(DEFAULT_CUT_ANGLE)).project(camera);
    assert.ok(Math.abs(a.x - b.x) < 1e-8); assert.ok(Math.abs(a.y - b.y) > .1);
  }
});

test('wire tension stays loaded while held, responds smoothly to a pull, and resets after cancellation', () => {
  const line = findCut(new SliceModel('slab'), { x: 0, z: 0 }, 0)!;
  for (const fps of [30, 60, 120]) {
    const press = new KnifePress(); press.begin(line);
    for (let i = 0; i < fps / 2; i++) press.step(1 / fps);
    assert.equal(press.tension, .6, 'Holding still keeps the cord pre-tensioned');
    press.setPressure(1); press.step(1 / fps);
    assert.ok(press.tension > .6 && press.tension < .9, 'A pull loads the cord without snapping to maximum');
    for (let i = 0; i < fps / 2; i++) press.step(1 / fps);
    assert.ok(press.tension > .998);
    for (let i = 0; i < fps / 2; i++) press.step(1 / fps);
    assert.ok(press.tension > .998, 'A stationary pull retains its tension');
    press.setPressure(.05);
    for (let i = 0; i < fps / 2; i++) press.step(1 / fps);
    assert.ok(press.tension >= .24 && press.tension < .25, 'Easing back keeps some tension');
    press.release(true); assert.equal(press.tension, .6); assert.equal(press.pressure, .5);
  }
});

test('pulling the cutting cord taut reduces its bow without shifting the incision or stretching its length', () => {
  const wire = new CuttingWire(), press = new KnifePress();
  const line = findCut(new SliceModel('slab'), { x: 0, z: 0 }, 0)!;
  const positions = wire.geometry.attributes.position;
  const center = (ring: number) => new Vector3().fromBufferAttribute(positions, ring * 9)
    .add(new Vector3().fromBufferAttribute(positions, ring * 9 + 4)).multiplyScalar(.5);
  try {
    press.begin(line); press.depth = .5; press.resistance = 1;
    const bows: number[] = [];
    for (const tension of [.24, .6, 1]) {
      press.tension = tension; wire.update(line, press, 1.02, 10.7);
      bows.push(center(32).y - center(0).y);
      let length = 0;
      for (let i = 1; i <= 64; i++) length += center(i).distanceTo(center(i - 1));
      assert.ok(Math.abs(length - Math.min(6, line.width + 1.25)) < .005, 'The cord retains its material length');
      assert.ok(Math.abs(center(32).y + wire.mesh.position.y - (1.02 + .21 - .5 * (1.02 + .235))) < 1e-6, 'Tension does not jump the cutting center');
    }
    assert.ok(bows[0] > bows[1] && bows[1] > bows[2] && bows[2] > 0, 'Even a taut cord reacts to gel resistance');
  } finally { wire.dispose(); }
});

function complete(fps: number, pressure: number) {
  const knife = new KnifePress(), model = new SliceModel('slab'); knife.begin(findCut(model, { x: 0, z: 0 }, -.6)!); knife.setPressure(pressure);
  let time = 0, completions = 0;
  while (knife.phase !== 'complete' && time < 10) { if (knife.step(1 / fps)) completions++; time += 1 / fps; }
  for (let i = 0; i < 60; i++) if (knife.step(1 / fps)) completions++;
  assert.equal(completions, 1); assert.equal(knife.depth, 1); return time;
}
test('knife cuts take several seconds even at maximum pressure, with consistent elapsed time', () => {
  const normal = complete(60, .5), forceful = complete(60, 1), light = complete(60, .05);
  assert.ok(forceful > 2.4 && normal > forceful && light > normal);
  for (const fps of [30, 120, 165]) assert.ok(Math.abs(complete(fps, .5) - normal) < .06);
});
test('a tap, release, invalid timestep, or repeated input cannot skip knife resistance', () => {
  const model = new SliceModel('slab'), knife = new KnifePress(), line = findCut(model, { x: 0, z: 0 }, 0)!;
  assert.ok(knife.begin(line)); assert.equal(knife.begin(line), false);
  knife.step(Infinity); knife.step(NaN); assert.equal(knife.depth, 0);
  knife.step(10); assert.ok(knife.depth < .01);
  knife.release(); for (let i = 0; i < 40; i++) assert.equal(knife.step(1 / 60), false);
  assert.equal(knife.phase, 'idle'); assert.equal(knife.depth, 0);
  knife.begin(line); for (let i = 0; i < 60; i++) knife.step(1 / 60);
  assert.ok(knife.depth > .1 && knife.depth < .5); knife.release(true); assert.equal(knife.depth, 0);
});
test('knife finds real fragments and rejects empty planes and razor-thin scraps', () => {
  const model = new SliceModel('prism');
  assert.equal(findCut(model, { x: 0, z: 4 }, 0), null);
  const line = findCut(model, { x: 0, z: 0 }, 0)!; assert.ok(line && line.length > 2);
  model.beginStroke(); model.slice(line.start, line.end, true);
  assert.equal(findCut(model, { x: 0, z: 0 }, 0), null, 'The previous empty seam should not cut');
  assert.ok(findCut(model, { x: 0, z: .5 }, 0));
});
for (const kind of ['slab', 'prism'] as const) test(`${kind}: 48 fragments use one fixed geometry without surface uploads while animating`, () => {
  const model = new SliceModel(kind), gel = new BatchedGel(kind === 'prism' ? 1.22 : 1.02, kind === 'prism');
  const position = gel.geometry.attributes.position, normal = gel.geometry.attributes.normal, material = gel.material;
  try {
    assert.ok(position instanceof BufferAttribute && normal instanceof BufferAttribute);
    gel.rebuild(model.pieces);
    for (let i = 0; i < 100; i++) {
      const angle = i * 2.399963, offset = Math.sin(i * 8.1) * 1.2;
      model.beginStroke(); model.slice({ x: -8 * Math.cos(angle) - offset * Math.sin(angle), z: -8 * Math.sin(angle) + offset * Math.cos(angle) }, { x: 8 * Math.cos(angle) - offset * Math.sin(angle), z: 8 * Math.sin(angle) + offset * Math.cos(angle) }, true);
    }
    assert.equal(model.pieces.length, MAX_PIECES); gel.rebuild(model.pieces);
    const versions = [position.version, normal.version], rebuilds = gel.rebuilds;
    for (let i = 0; i < 500; i++) { model.step(1 / 60, false); gel.update(model.pieces, false); }
    assert.deepEqual([position.version, normal.version], versions); assert.equal(gel.rebuilds, rebuilds);
    assert.equal(gel.geometry.attributes.position, position); assert.equal(gel.geometry.attributes.normal, normal); assert.equal(gel.material, material);
    assert.ok(gel.vertices < position.count);
    for (let i = 0; i < gel.vertices * 3; i++) assert.ok(Number.isFinite(position.array[i]) && Number.isFinite(normal.array[i]));
    model.reset(); gel.rebuild(model.pieces); assert.equal(gel.geometry.attributes.position, position);
  } finally { gel.dispose(); }
});

test('prism pieces wobble independently, keep their base anchored, and settle for reduced motion', () => {
  const model = new SliceModel('prism'), gel = new BatchedGel(1.22, true);
  try {
    model.beginStroke(); model.slice({ x: -3, z: 0 }, { x: 3, z: 0 }); gel.rebuild(model.pieces);
    for (let i = 0; i < 8; i++) model.step(1 / 60, false);
    gel.update(model.pieces, false);
    assert.ok(gel.poses[0].z * gel.poses[1].z < 0, 'Neighbors lean independently after separation');
    assert.notEqual(gel.poses[0].w, gel.poses[1].w);
    const positions = gel.geometry.attributes.position, normals = gel.geometry.attributes.normal;
    for (let i = 0; i < gel.vertices; i++) {
      assert.ok(positions.getY(i) >= .0149, 'Rounded surfaces stay above the supporting plane');
      assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 1e-5);
    }
    gel.update(model.pieces, true);
    for (const pose of gel.poses.slice(0, 2)) { assert.equal(pose.z, 0); assert.equal(pose.w, 0); }
    for (let i = 0; i < 120; i++) model.step(1 / 60, false);
    gel.update(model.pieces, false);
    for (const pose of gel.poses.slice(0, 2)) { assert.equal(pose.z, 0); assert.equal(pose.w, 0); }
  } finally { gel.dispose(); }
});
