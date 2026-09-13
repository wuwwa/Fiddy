import test from 'node:test';
import assert from 'node:assert/strict';
import { ToySession, type SessionEvents } from '../src/player/ToySession.ts';
import { jelly } from '../src/toys/jelly.tsx';
import { toys, findToy, toyHref } from '../src/toys/registry.ts';
import type { ToyContext, ToyController, ToyModule, ToyPreferences } from '../src/toys/types.ts';

const host = {} as HTMLElement;
const defaults: ToyPreferences = { sound: false, reducedMotion: false, paused: false };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function observe() {
  const ready: boolean[] = [], interactions: boolean[] = [], errors: string[] = [], soundErrors: string[] = [];
  const events: SessionEvents = {
    onReady: value => ready.push(value), onInteractionChange: value => interactions.push(value),
    onError: value => errors.push(value), onSoundError: value => soundErrors.push(value),
  };
  return { events, ready, interactions, errors, soundErrors };
}
function session(load: () => Promise<ToyModule>, preferences = defaults) {
  const observed = observe();
  return { player: new ToySession({ ...jelly, id: 'test-toy', load }, host, observed.events, preferences), ...observed };
}

test('a toy canceled during import is never mounted', async () => {
  const loading = deferred<ToyModule>();
  let mounts = 0;
  const { player, ready, errors } = session(() => loading.promise);
  const starting = player.start(); player.dispose();
  loading.resolve({ mount: async () => { mounts++; return { reset() {}, dispose() {} }; } });
  await starting;
  assert.equal(mounts, 0); assert.deepEqual(ready, []); assert.deepEqual(errors, []);
});

test('a late mount is disposed once and cannot replace the new toy', async () => {
  const mounting = deferred<ToyController>();
  let context!: ToyContext, disposals = 0;
  const old = session(async () => ({ mount: async (_host, ctx) => { context = ctx; return mounting.promise; } }));
  const starting = old.player.start(); await Promise.resolve();
  context.onInteractionChange(true);
  old.player.dispose();
  const next = session(async () => ({ mount: async () => ({ reset() {}, dispose() {} }) }));
  await next.player.start();
  assert.equal(context.signal.aborted, true);
  context.onInteractionChange(false); context.onError('late error');
  mounting.resolve({ reset() {}, dispose() { disposals++; } });
  await starting; old.player.dispose();
  assert.equal(disposals, 1); assert.deepEqual(old.ready, []); assert.deepEqual(old.errors, []);
  assert.deepEqual(old.interactions, [true]); assert.deepEqual(next.ready, [false]);
  next.player.dispose();
});

test('latest preferences are delivered even if they change during loading', async () => {
  const loading = deferred<ToyModule>();
  const calls: [string, boolean][] = [];
  let context!: ToyContext;
  const { player, ready } = session(() => loading.promise);
  const starting = player.start();
  player.setPaused(true); player.setReducedMotion(true); await player.setSound(true);
  loading.resolve({ mount: async (_host, ctx) => {
    context = ctx;
    return {
      reset() {}, dispose() {},
      setPaused: value => { calls.push(['pause', value]); },
      setReducedMotion: value => { calls.push(['motion', value]); },
      setSound: value => { calls.push(['sound', value]); },
    };
  } });
  await starting; await Promise.resolve();
  assert.deepEqual(context.preferences, { sound: true, paused: true, reducedMotion: true });
  assert.deepEqual(calls, [['motion', true], ['pause', true], ['sound', true]]);
  assert.deepEqual(ready, [true]); player.dispose();
});

test('asynchronous sound changes finish in order and audio failure is nonfatal', async () => {
  const firstAudio = deferred<void>();
  const calls: boolean[] = [];
  let resets = 0;
  const { player, errors, soundErrors } = session(async () => ({ mount: async () => ({
    reset() { resets++; }, dispose() {},
    async setSound(value) { calls.push(value); if (calls.length === 1) await firstAudio.promise; },
  }) }));
  await player.start();
  const first = player.setSound(true); await Promise.resolve();
  const second = player.setSound(false);
  firstAudio.reject(new Error('audio unavailable'));
  await Promise.all([first, second]);
  player.reset();
  assert.deepEqual(calls, [true, false]); assert.equal(soundErrors.length, 1);
  assert.deepEqual(errors, []); assert.equal(resets, 1); player.dispose();
});

test('a runtime error stops the toy and rejects later callbacks', async () => {
  let context!: ToyContext, disposals = 0;
  const { player, errors, interactions } = session(async () => ({ mount: async (_host, ctx) => {
    context = ctx; return { reset() {}, dispose() { disposals++; } };
  } }));
  await player.start(); context.onError('graphics connection lost');
  context.onInteractionChange(true); context.onError('duplicate failure'); player.dispose();
  assert.equal(context.signal.aborted, true); assert.equal(disposals, 1);
  assert.deepEqual(errors, ['graphics connection lost']); assert.deepEqual(interactions, []);
});

test('failed imports are recoverable through a fresh session', async () => {
  const failed = session(async () => { throw new Error('module unavailable'); });
  await failed.player.start();
  assert.deepEqual(failed.errors, ['module unavailable']);
  const retried = session(async () => ({ mount: async () => ({ reset() {}, dispose() {} }) }));
  await retried.player.start(); assert.deepEqual(retried.ready, [false]);
  failed.player.dispose(); retried.player.dispose();
});

test('registry IDs are unique and toy links preserve renderer options', () => {
  assert.equal(new Set(toys.map(toy => toy.id)).size, toys.length);
  assert.equal(findToy(null).id, 'jelly'); assert.equal(findToy('missing').id, 'jelly');
  assert.equal(findToy('jelly'), jelly);
  assert.equal(findToy('cushion').id, 'cushion');
  assert.equal(toyHref('cushion', '?renderer=webgl&toy=jelly'), '?renderer=webgl&toy=cushion');
  assert.equal(toyHref('jelly', '?renderer=webgl&toy=old'), '?renderer=webgl&toy=jelly');
});

test('a cleanup failure cannot break switching to another toy', async t => {
  const log = t.mock.method(console, 'error', () => {});
  const old = session(async () => ({ mount: async () => ({
    reset() {}, dispose() { throw new Error('broken cleanup'); },
  }) }));
  await old.player.start();
  assert.doesNotThrow(() => old.player.dispose());
  assert.equal(log.mock.callCount(), 1);
  const next = session(async () => ({ mount: async () => ({ reset() {}, dispose() {} }) }));
  await next.player.start();
  assert.deepEqual(next.ready, [false]); next.player.dispose();
});
