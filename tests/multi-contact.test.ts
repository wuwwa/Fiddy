import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { SoftBodyPhysics, STEP, FLOOR, MAX_CONTACTS, type Point } from '../src/soft-body/physics.ts';
import { jellyProfile, cushionProfile, loopProfile, starProfile, dumplingProfile, type SoftToyProfile } from '../src/soft-body/profiles.ts';
import { SurfaceRipples } from '../src/soft-body/ripples.ts';
import { updateSoftSurface } from '../src/soft-body/surface.ts';

type Face = 'left' | 'right' | 'front' | 'back' | 'top';
const faces: Face[] = ['left', 'right', 'front', 'back', 'top'];

function fixture(profile: SoftToyProfile) {
  const body = new SoftBodyPhysics(profile.feel);
  const geometry = createSoftGeometry(profile.shape);
  const positions = geometry.getAttribute('position');
  const rest = new Float32Array(positions.array);
  const bindings = Array.from({ length: positions.count }, (_, i) =>
    body.bind(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]));
  const indices = { left: 0, right: 0, front: 0, back: 0, top: 0 };
  for (let i = 1; i < positions.count; i++) {
    if (positions.getX(i) < positions.getX(indices.left)) indices.left = i;
    if (positions.getX(i) > positions.getX(indices.right)) indices.right = i;
    if (positions.getZ(i) > positions.getZ(indices.front)) indices.front = i;
    if (positions.getZ(i) < positions.getZ(indices.back)) indices.back = i;
    if (positions.getY(i) > positions.getY(indices.top)) indices.top = i;
  }
  const ripples = new SurfaceRipples();
  const update = () => updateSoftSurface(geometry, body, rest, bindings, ripples);
  const read = (face: Face): Point => {
    const i = indices[face];
    return { x: positions.getX(i), y: positions.getY(i), z: positions.getZ(i) };
  };
  const contact = (face: Face) => {
    const normals = geometry.getAttribute('normal'), i = indices[face];
    return { point: read(face), normal: { x: normals.getX(i), y: normals.getY(i), z: normals.getZ(i) } };
  };
  const grab = (face: Face, id: number) => {
    const { point, normal } = contact(face);
    return body.beginGrab(point, normal, id);
  };
  const advance = (seconds: number) => {
    for (let i = 0; i < seconds / STEP; i++) body.step();
    update();
  };
  update();
  return { body, geometry, positions, rest, read, contact, grab, advance, update, dispose: () => geometry.dispose() };
}

for (const profile of [jellyProfile, cushionProfile]) {
  test(`${profile.label}: opposite side holds dent both touched faces inward`, () => {
    const toy = fixture(profile);
    try {
      const left = toy.read('left'), right = toy.read('right');
      toy.grab('left', 11); toy.grab('right', 22);
      toy.advance(1.4);
      assert.equal(toy.body.diagnostics().contactCount, 2);
      const leftDent = toy.read('left').x - left.x, rightDent = right.x - toy.read('right').x;
      assert.ok(leftDent > 0.1 && rightDent > 0.1, `Simultaneous inward dents: left ${leftDent}, right ${rightDent}`);
      assert.ok(Math.abs(toy.body.diagnostics().volumeRatio - 1) < 0.1);
      assert.ok(toy.body.diagnostics().minVolumeRatio > 0.7);
    } finally { toy.dispose(); }
  });

  test(`${profile.label}: opposing unloaded pulls widen both sides of the rendered skin`, () => {
    const toy = fixture(profile);
    try {
      const left = toy.read('left'), right = toy.read('right');
      toy.grab('left', 11); toy.grab('right', 22);
      toy.body.setPressure(0, 11); toy.body.setPressure(0, 22);
      toy.body.moveGrab({ x: -0.8, y: 0, z: 0 }, 11);
      toy.body.moveGrab({ x: 0.8, y: 0, z: 0 }, 22);
      toy.advance(1);
      const leftTravel = left.x - toy.read('left').x, rightTravel = toy.read('right').x - right.x;
      assert.ok(leftTravel > 0.25 && rightTravel > 0.25, `Outward travel: left ${leftTravel}, right ${rightTravel}`);
      assert.ok(leftTravel + rightTravel > 0.6);
      assert.equal(toy.body.diagnostics().contactCount, 2);
      assert.ok(Math.abs(toy.body.diagnostics().volumeRatio - 1) < 0.1);
      assert.ok(toy.body.diagnostics().minVolumeRatio > 0.7);
    } finally { toy.dispose(); }
  });

  test(`${profile.label}: two visible front shoulders pinch inward and pull apart`, () => {
    const toy = fixture(profile);
    try {
      // Both points are on the camera-facing skin, as in a two-finger gesture.
      const ids = [-0.7, 0.7].map(x => {
        let nearest = 0, best = Infinity;
        for (let i = 0; i < toy.positions.count; i++) {
          const d = (toy.positions.getX(i) - x) ** 2 + (toy.positions.getY(i) - 1.1) ** 2 + (toy.positions.getZ(i) - 0.8) ** 2;
          if (d < best) { best = d; nearest = i; }
        }
        return nearest;
      });
      for (const mode of ['pinch', 'apart'] as const) {
        toy.body.reset(); toy.update();
        const initial = ids.map(i => toy.positions.getX(i));
        for (let finger = 0; finger < ids.length; finger++) {
          const i = ids[finger], normals = toy.geometry.getAttribute('normal');
          const point = { x: toy.positions.getX(i), y: toy.positions.getY(i), z: toy.positions.getZ(i) };
          const normal = { x: normals.getX(i), y: normals.getY(i), z: normals.getZ(i) };
          assert.ok(point.z > 0.7 && normal.z > 0.3);
          toy.body.beginGrab(point, normal, finger + 1);
          toy.body.setPressure(0, finger + 1);
          const side = finger === 0 ? -1 : 1;
          toy.body.moveGrab({ x: side * (mode === 'pinch' ? -0.45 : 0.6), y: 0, z: 0 }, finger + 1);
        }
        for (let step = 0; step < 120; step++) {
          toy.body.step();
          const state = toy.body.diagnostics();
          assert.equal(state.contactCount, 2);
          assert.ok(state.minVolumeRatio > 0.6 && Math.abs(state.volumeRatio - 1) < 0.1, JSON.stringify(state));
        }
        toy.update();
        const travel = ids.map((i, finger) => toy.positions.getX(i) - initial[finger]);
        if (mode === 'pinch') {
          assert.ok(travel[0] > 0.18 && travel[1] < -0.18, `Both visible shoulders must pinch inward: ${travel}`);
        } else {
          assert.ok(travel[0] < -0.3 && travel[1] > 0.3, `Both visible shoulders must stretch apart: ${travel}`);
        }
      }
    } finally { toy.dispose(); }
  });

  test(`${profile.label}: a top press and a separate side pull both affect the shape`, () => {
    const toy = fixture(profile), pressOnly = fixture(profile);
    try {
      const top = toy.read('top');
      toy.grab('top', 10); pressOnly.grab('top', 10);
      toy.grab('right', 20);
      toy.body.setPressure(0, 20);
      toy.body.moveGrab({ x: 0.8, y: 0, z: 0 }, 20);
      toy.advance(1); pressOnly.advance(1);
      assert.ok(top.y - toy.read('top').y > 0.2, 'The held top contact must continue pressing down');
      const extraStretch = toy.read('right').x - pressOnly.read('right').x;
      assert.ok(extraStretch > 0.15, `The second finger must add stretch beyond ordinary pressure bulging: ${extraStretch}`);
      assert.equal(toy.body.diagnostics().contactCount, 2);
      assert.ok(toy.body.diagnostics().minVolumeRatio > 0.6);
    } finally { toy.dispose(); pressOnly.dispose(); }
  });

  test(`${profile.label}: releasing one finger leaves the other pull active`, () => {
    const toy = fixture(profile);
    try {
      const right = toy.read('right');
      toy.grab('left', 71); toy.grab('right', 82);
      toy.body.setPressure(0, 71); toy.body.setPressure(0, 82);
      toy.body.moveGrab({ x: -0.7, y: 0, z: 0 }, 71);
      toy.body.moveGrab({ x: 0.7, y: 0, z: 0 }, 82);
      toy.advance(0.7);
      toy.body.release(71);
      assert.equal(toy.body.diagnostics().contactCount, 1);
      assert.equal(toy.body.diagnostics().grabbed, true);
      toy.body.release(999);
      toy.body.moveGrab({ x: -100, y: -100, z: -100 }, 71);
      toy.advance(0.6);
      assert.ok(toy.read('right').x - right.x > 0.25, 'The unreleased finger must keep holding its face out');
      assert.equal(toy.body.diagnostics().contactCount, 1);
      toy.body.releaseAll();
      assert.equal(toy.body.diagnostics().contactCount, 0);
      assert.equal(toy.body.diagnostics().grabbed, false);
      toy.advance(15);
      assert.ok(Math.abs(toy.read('right').x - right.x) < 0.02);
    } finally { toy.dispose(); }
  });

  test(`${profile.label}: a remaining front finger preserves the top squeeze's own rebound`,()=>{
    const toy=fixture(profile),releasedAlone=fixture(profile),unloaded=fixture(profile);
    try {
      for(const setup of [toy,releasedAlone,unloaded]) setup.grab('top',1);
      toy.grab('front',2);unloaded.grab('front',2);
      for(const setup of [toy,releasedAlone,unloaded]) setup.advance(1.5);
      toy.body.release(1);releasedAlone.body.release(1);unloaded.body.setPressure(0,1);
      let minimum=Infinity,halfSecond=0;
      for(let frame=1;frame<=240;frame++) {
        for(const setup of [toy,releasedAlone,unloaded]) setup.body.step();
        const compression=toy.body.compressionAmount;
        minimum=Math.min(minimum,compression);
        if(frame===60) halfSecond=compression;
        assert.ok(Math.abs(compression-releasedAlone.body.compressionAmount)<0.004,
          'A front hold must not select the top compression spring or damping');
        assert.ok(Math.abs(compression-unloaded.body.compressionAmount)<0.004,
          'Unloading a top finger must permit the same return as lifting it');
      }
      assert.equal(toy.body.diagnostics().contactCount,1);
      assert.equal(unloaded.body.diagnostics().contactCount,2);
      if(profile===jellyProfile) assert.ok(minimum< -0.07,'Jelly should still bounce when a different face remains held');
      else assert.ok(halfSecond>0.15,'The dense Cushion should retain its slow recovery');
      toy.update();releasedAlone.update();
      assert.ok(toy.read('front').z<releasedAlone.read('front').z-0.1,
        'The remaining finger must keep its local front dent while the top rebounds');
    } finally {toy.dispose();releasedAlone.dispose();unloaded.dispose();}
  });

  test(`${profile.label}: an unloaded second finger preserves torsion's own return`,()=>{
    const toy=fixture(profile),releasedAlone=fixture(profile),unloaded=fixture(profile);
    try {
      for(const setup of [toy,releasedAlone,unloaded]) {
        setup.grab('front',1);setup.body.setPressure(0,1);setup.body.setTwist(0.7,1);
      }
      for(const setup of [toy,unloaded]) {setup.grab('top',2);setup.body.setPressure(0,2);}
      for(const setup of [toy,releasedAlone,unloaded]) setup.advance(1.5);
      toy.body.release(1);releasedAlone.body.release(1);unloaded.body.setTwist(0,1);
      let minimum=Infinity,halfSecond=0;
      for(let frame=1;frame<=240;frame++) {
        for(const setup of [toy,releasedAlone,unloaded]) setup.body.step();
        const twist=toy.body.twistAmount;
        minimum=Math.min(minimum,twist);if(frame===60) halfSecond=twist;
        assert.ok(Math.abs(twist-releasedAlone.body.twistAmount)<0.001,
          'An unloaded top hold must not suppress another contact\'s torsional rebound');
        assert.ok(Math.abs(twist-unloaded.body.twistAmount)<0.001,
          'Removing turning load while still holding must release the same stored twist');
      }
      assert.equal(toy.body.diagnostics().contactCount,1);
      if(profile===jellyProfile) assert.ok(minimum< -0.07,'Jelly must keep its elastic untwisting rebound');
      else assert.ok(halfSecond>0.25,'Cushion must keep its slow torsional recovery');
    } finally {toy.dispose();releasedAlone.dispose();unloaded.dispose();}
  });
}

test('duplicate IDs and contacts beyond the cap do not replace existing fingers', () => {
  assert.equal(MAX_CONTACTS, 5);
  const toy = fixture(jellyProfile), control = fixture(jellyProfile);
  try {
    for (let i = 0; i < MAX_CONTACTS; i++) {
      assert.equal(toy.grab(faces[i], i + 1), true);
      assert.equal(control.grab(faces[i], i + 1), true);
      toy.body.setPressure(0, i + 1); control.body.setPressure(0, i + 1);
    }
    toy.body.moveGrab({ x: -0.6, y: 0.2, z: 0 }, 1);
    control.body.moveGrab({ x: -0.6, y: 0.2, z: 0 }, 1);
    assert.equal(toy.grab('top', 1), false);
    assert.equal(toy.grab('front', 999), false);
    toy.body.setPressure(1.3, 999);
    toy.body.moveGrab({ x: 100, y: -100, z: 100 }, 999);
    toy.body.setTwist(0.8, 999);
    toy.body.release(999);
    assert.equal(toy.body.diagnostics().contactCount, MAX_CONTACTS);
    toy.advance(0.4); control.advance(0.4);
    assert.deepEqual(toy.body.positions, control.body.positions, 'Ignored input must leave the existing contact constraints intact');
    toy.body.reset(); toy.update();
    assert.equal(toy.body.diagnostics().contactCount, 0);
    assert.equal(toy.body.diagnostics().grabbed, false);
    assert.deepEqual(toy.body.positions, toy.body.rest);
    assert.deepEqual(toy.positions.array, toy.rest);
  } finally { toy.dispose(); control.dispose(); }
});

for (const profile of [jellyProfile, cushionProfile, loopProfile, starProfile, dumplingProfile]) {
  test(`${profile.label}: five outward extreme pulls do not silently reset the toy`, () => {
    const toy = fixture(profile);
    try {
      const contacts = faces.map(face => toy.contact(face));
      for (let finger = 0; finger < MAX_CONTACTS; finger++) {
        const { point, normal } = contacts[finger];
        toy.body.beginGrab(point, normal, finger + 1);
        toy.body.setPressure(0, finger + 1);
        toy.body.moveGrab({ x: normal.x * 100, y: normal.y * 100, z: normal.z * 100 }, finger + 1);
      }
      for (let step = 0; step < 2 / STEP; step++) {
        toy.body.step();
        const state = toy.body.diagnostics(), label = `${profile.label}, outward step ${step}: ${JSON.stringify(state)}`;
        assert.equal(state.contactCount, MAX_CONTACTS, label);
        assert.ok(Number.isFinite(state.displacement) && state.displacement < 2.5, label);
        assert.ok(Math.abs(state.volumeRatio - 1) < 0.15 && state.minVolumeRatio > 0.25, label);
        for (let i = 1; i < toy.body.positions.length; i += 3) assert.ok(toy.body.positions[i] >= FLOOR, label);
      }
      toy.update();
      const outwardMovement = faces.reduce((total, face, i) => {
        const current = toy.read(face), { point, normal } = contacts[i];
        return total + (current.x - point.x) * normal.x + (current.y - point.y) * normal.y + (current.z - point.z) * normal.z;
      }, 0);
      assert.ok(outwardMovement > 0.3, 'Bounded multi-finger pulling must still visibly move the touched skin');
      toy.body.releaseAll(); toy.advance(15);
      let error = 0;
      for (let i = 0; i < toy.rest.length; i++) error = Math.max(error, Math.abs(toy.positions.array[i] - toy.rest[i]));
      assert.ok(error < 0.02, `${profile.label}: outward pulls left a residual offset ${error}`);
      assert.equal(toy.body.diagnostics().contactCount, 0);
    } finally { toy.dispose(); }
  });

  test(`${profile.label}: five extreme contacts survive rapid replacement and recover`, () => {
    const toy = fixture(profile);
    try {
      for (let i = 0; i < MAX_CONTACTS; i++) toy.grab(faces[i], i + 1);
      for (let gesture = 0; gesture < 25; gesture++) {
        if (gesture > 0) {
          const replacement = gesture % MAX_CONTACTS;
          toy.body.release(replacement + 1);
          assert.equal(toy.body.diagnostics().contactCount, MAX_CONTACTS - 1);
          toy.update();
          toy.grab(faces[replacement], replacement + 1);
        }
        for (let i = 0; i < MAX_CONTACTS; i++) {
          toy.body.setPressure(i === 4 && gesture % 3 === 0 ? 1 : 0, i + 1);
          const angle = i * Math.PI * 0.5 + gesture * 0.73;
          toy.body.moveGrab({ x: Math.cos(angle) * 100, y: gesture % 4 === 0 ? -100 : 60, z: Math.sin(angle) * 100 }, i + 1);
          toy.body.setTwist(i % 2 ? 0.7 : -0.7, i + 1);
        }
        for (let step = 0; step < 12; step++) {
          toy.body.step();
          const state = toy.body.diagnostics();
          const label = `${profile.label}, gesture ${gesture}, step ${step}: ${JSON.stringify(state)}`;
          assert.equal(state.contactCount, MAX_CONTACTS, label);
          assert.ok(Number.isFinite(state.displacement) && state.displacement < 2.5, label);
          assert.ok(Math.abs(state.volumeRatio - 1) < 0.15 && state.minVolumeRatio > 0.25, label);
          for (let i = 1; i < toy.body.positions.length; i += 3) assert.ok(toy.body.positions[i] >= FLOOR, label);
        }
        toy.update();
        for (let i = 0; i < toy.positions.count; i++) {
          const x = toy.positions.getX(i), y = toy.positions.getY(i), z = toy.positions.getZ(i);
          assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
          assert.ok(Math.abs(x) < 6 && y < 6 && Math.abs(z) < 6);
          assert.ok(y >= FLOOR + 0.005 - 1e-8);
        }
      }
      toy.body.releaseAll();
      assert.equal(toy.body.diagnostics().contactCount, 0);
      toy.advance(15);
      let error = 0;
      for (let i = 0; i < toy.rest.length; i++) error = Math.max(error, Math.abs(toy.positions.array[i] - toy.rest[i]));
      assert.ok(error < 0.02, `${profile.label}: residual surface displacement ${error}`);
      assert.ok(toy.body.diagnostics().speed < 0.02);
      toy.body.reset(); toy.update();
      assert.deepEqual(toy.body.positions, toy.body.rest);
      assert.deepEqual(toy.positions.array, toy.rest);
      assert.equal(toy.body.diagnostics().contactCount, 0);
    } finally { toy.dispose(); }
  });
}

for (const profile of [loopProfile, starProfile, dumplingProfile]) {
  test(`${profile.label}: two side grips stretch independently and recover after partial release`, () => {
    const toy = fixture(profile);
    try {
      const left = toy.read('left'), right = toy.read('right');
      assert.equal(toy.grab('left', 31), true);
      assert.equal(toy.grab('right', 47), true);
      toy.body.setPressure(0, 31); toy.body.setPressure(0, 47);
      toy.body.moveGrab({ x: -0.8, y: 0, z: 0 }, 31);
      toy.body.moveGrab({ x: 0.8, y: 0, z: 0 }, 47);
      toy.advance(1);
      const leftTravel = left.x - toy.read('left').x, rightTravel = toy.read('right').x - right.x;
      assert.ok(leftTravel > 0.25 && rightTravel > 0.25, `${profile.label}: outward skin travel ${leftTravel}, ${rightTravel}`);
      assert.equal(toy.body.diagnostics().contactCount, 2);
      assert.ok(toy.body.diagnostics().minVolumeRatio > 0.6);
      assert.ok(Math.abs(toy.body.diagnostics().volumeRatio - 1) < 0.1);
      toy.body.release(31);
      assert.equal(toy.body.diagnostics().contactCount, 1);
      toy.advance(0.7);
      assert.equal(toy.body.diagnostics().contactCount, 1);
      assert.ok(toy.read('right').x - right.x > 0.25, `${profile.label}: releasing one grip dropped the other`);
      for (let i = 0; i < toy.positions.count; i++) assert.ok(toy.positions.getY(i) >= FLOOR + 0.005 - 1e-8);
      toy.body.releaseAll(); toy.advance(15);
      let error = 0;
      for (let i = 0; i < toy.rest.length; i++) error = Math.max(error, Math.abs(toy.positions.array[i] - toy.rest[i]));
      assert.ok(error < 0.02, `${profile.label}: residual skin displacement ${error}`);
      assert.equal(toy.body.diagnostics().contactCount, 0);
      assert.ok(toy.body.diagnostics().speed < 0.02);
    } finally { toy.dispose(); }
  });
}
