import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftToyActivity } from '../src/soft-body/activity.ts';
import { SoftBodyPhysics, STEP } from '../src/soft-body/physics.ts';
import { jellyProfile, cushionProfile } from '../src/soft-body/profiles.ts';

test('sleep requires sustained quiet frames and interrupted settling starts over', () => {
  const activity = new SoftToyActivity();
  for (let i = 0; i < 14; i++) assert.equal(activity.update(1 / 60, true), true);
  assert.equal(activity.update(1 / 60, false), true);
  for (let i = 0; i < 14; i++) assert.equal(activity.update(1 / 60, true), true);
  for (let i = 0; i < 5; i++) activity.update(1 / 60, true);
  assert.equal(activity.update(1 / 60, true), false);
  activity.wake();
  assert.equal(activity.update(1 / 60, true), true);
});

test('one stalled or invalid frame cannot skip the settling window', () => {
  const activity = new SoftToyActivity();
  assert.equal(activity.update(12, true), true);
  for (const elapsed of [NaN, Infinity, -1]) assert.equal(activity.update(elapsed, true), true);
  for (let i = 0; i < 12; i++) assert.equal(activity.update(1 / 60, true), true);
});

test('a held toy or an unmoved toy with an impulse stays awake', () => {
  const body = new SoftBodyPhysics();
  assert.equal(body.isAtRest(), true);
  body.beginGrab({ x: 0, y: 0.95, z: 1 }, { x: 0, y: 0, z: 1 });
  assert.equal(body.isAtRest(), false);
  body.reset();
  body.impulse({ x: 0, y: 0.95, z: 1 }, { x: 0, y: 0, z: -1 });
  assert.equal(body.isAtRest(), false);
  body.reset();
  assert.equal(body.isAtRest(), true);
});

test('both profiles retain their compression and twisting rebound before becoming idle', () => {
  for (const profile of [jellyProfile, cushionProfile]) {
    const body = new SoftBodyPhysics(profile.feel);
    const activity = new SoftToyActivity();
    body.beginGrab({ x: 0.5, y: 1.65, z: 0.2 });
    body.moveGrab({ x: 0.4, y: 0.05, z: 0.25 });
    body.setTwist(0.5);
    for (let i = 0; i < 1.5 / STEP; i++) body.step();
    body.release();
    assert.equal(body.isAtRest(), false);

    let sleepAt = -1;
    for (let time = 0; time < 20; time += STEP) {
      body.step();
      if (!activity.update(STEP, body.isAtRest())) { sleepAt = time; break; }
    }
    assert.ok(sleepAt > 1 && sleepAt < 20, `${profile.shape}: slept at ${sleepAt}`);
    assert.equal(body.isAtRest(), true);
    const state = body.diagnostics();
    assert.ok(state.displacement < 0.0005 && state.speed < 0.002);
    assert.ok(Math.abs(state.compression) < 0.00015 && Math.abs(state.twist) < 0.0003);

    body.beginGrab({ x: 0, y: 0.95, z: 1 }, { x: 0, y: 0, z: 1 });
    assert.equal(activity.update(STEP, body.isAtRest()), true);
  }
});
