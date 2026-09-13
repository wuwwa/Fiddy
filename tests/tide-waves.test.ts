import test from 'node:test';
import assert from 'node:assert/strict';
import { TideField } from '../src/ascii-tide/model.ts';
import type { FieldPointer } from '../src/fields/input.ts';

const idle = (): FieldPointer => ({ x: .5, y: .5, dx: 0, dy: 0, inside: false, down: false, keyboard: false, samples: [] });

test('a local tide impulse travels through untouched neighbors symmetrically', () => {
  const field = new TideField(840, 650), input = idle();
  const row = Math.floor(field.rows / 2), col = Math.floor(field.columns / 2), middle = row * field.columns + col;
  field.elevationVelocity[middle] = 120;
  assert.equal(field.elevation[middle + 4], 0);
  for (let i = 0; i < 18; i++) field.step(1 / 60, input, false);
  assert.ok(Math.abs(field.elevation[middle + 4]) > .01, 'A wave must reach grains outside the original impulse');
  assert.ok(Math.abs(field.elevation[middle + 4] - field.elevation[middle - 4]) < .00001);
  for (let i = 0; i < 900; i++) field.step(1 / 60, input, false);
  assert.ok(field.elevation.every(value => Math.abs(value) < .00001));
});

test('tide wave propagation agrees at 30 and 120 frames per second', () => {
  const slow = new TideField(640, 480), fast = new TideField(640, 480), input = idle();
  const middle = Math.floor(slow.rows / 2) * slow.columns + Math.floor(slow.columns / 2);
  slow.elevationVelocity[middle] = fast.elevationVelocity[middle] = 120;
  for (let i = 0; i < 30; i++) slow.step(1 / 30, input, false);
  for (let i = 0; i < 120; i++) fast.step(1 / 120, input, false);
  assert.ok(slow.elevation.every((value, index) => Math.abs(value - fast.elevation[index]) < .00001));
});

test('tide retains its wake on resize, bounds long holds, and resets all wave state', () => {
  const field = new TideField(390, 844), input = idle(); input.inside = input.down = true;
  for (let i = 0; i < 600; i++) {
    input.x = .5 + .45 * Math.sin(i * .07);
    input.samples = [{ x: input.x, y: .5, dx: .3, dy: -.3, dt: .01, down: true, start: i % 20 === 0 }];
    field.step(1 / 30, input, false);
  }
  assert.ok(field.elevation.every(value => Number.isFinite(value) && Math.abs(value) <= 40));
  assert.ok(field.elevationVelocity.every(value => Number.isFinite(value) && Math.abs(value) <= 180));
  const resized = field.resized(844, 390);
  assert.ok(resized.elevation.some(value => Math.abs(value) > .1));
  resized.reset();
  assert.ok(resized.elevation.every(value => value === 0) && resized.elevationVelocity.every(value => value === 0));
  const still = resized.elevation.slice(); input.inside = false; input.samples = [];
  for (let i = 0; i < 60; i++) resized.step(1 / 60, input, true);
  assert.deepEqual(resized.elevation, still);
});
