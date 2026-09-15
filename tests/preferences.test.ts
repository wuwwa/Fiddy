import test from 'node:test';
import assert from 'node:assert/strict';
import { readPreferences, writePreferences, orderToys } from '../src/player/preferences.ts';
import { resolveToyRoute } from '../src/player/navigation.ts';
import { toys } from '../src/toys/registry.ts';
const read = (value: unknown) => readPreferences({ getItem: () => JSON.stringify(value) });
test('preferences validate version, IDs and duplicate favorites', () => {
  assert.deepEqual(read({ version: 1, favoriteIds: ['putty', 'missing', 'putty', 3, 'jelly'], lastToyId: 'silk' }),
    { version: 1, favoriteIds: ['putty', 'jelly'], lastToyId: 'silk' });
  for (const value of [null, [], { version: 2 }, { version: 1, favoriteIds: false, lastToyId: 'gone' }])
    assert.deepEqual(read(value), { version: 1, favoriteIds: [], lastToyId: null });
});
test('unavailable and malformed storage does not block play or saving', () => {
  for (const getItem of [() => '{', () => { throw new Error('blocked'); }])
    assert.equal(readPreferences({ getItem }).lastToyId, null);
  assert.doesNotThrow(() => writePreferences({ setItem: () => { throw new Error('quota'); } }, read(null)));
});
test('Butter stays first, followed by favorites in registry order', () => {
  assert.deepEqual(orderToys([]), toys);
  assert.deepEqual(orderToys(['putty', 'jelly']).slice(0, 3).map(toy => toy.id), ['butter', 'jelly', 'putty']);
  assert.equal(new Set(orderToys(['jelly', 'jelly']).map(toy => toy.id)).size, toys.length);
  assert.deepEqual(orderToys(['putty']).slice(0, 2).map(toy => toy.id), ['butter', 'putty']);
});
test('saved toy applies only to entry without an explicit route', () => {
  const route = (search: string, saved?: string) => resolveToyRoute({ pathname: '/', search, hash: '#play' }, saved);
  assert.equal(route('?renderer=webgl', 'putty').replacement, '/?renderer=webgl&toy=putty#play');
  assert.equal(route('?toy=silk', 'putty').toy.id, 'silk');
  assert.equal(route('?toy=invalid', 'putty').toy.id, 'butter');
  assert.equal(route('?toy=', 'putty').toy.id, 'butter');
  assert.equal(route('').toy.id, 'butter'); // Popstate never consults saved preferences.
});

test('legacy Free Jelly favorites and last selection merge into Jelly without duplication', () => {
  assert.deepEqual(read({ version: 1, favoriteIds: ['free-jelly', 'cushion', 'jelly'], lastToyId: 'free-jelly' }),
    { version: 1, favoriteIds: ['jelly', 'cushion'], lastToyId: 'jelly', toyModes: { jelly: 'free' } });
  assert.equal(read({ version: 1, favoriteIds: ['free-jelly'], lastToyId: 'putty' }).toyModes?.jelly, 'free');
});

test('mode preferences accept only supported toys and known modes, and preserve an explicit resting choice', () => {
  const value = read({ version: 1, favoriteIds: ['free-jelly'], lastToyId: 'cushion',
    toyModes: { jelly: 'resting', cushion: 'free', loop: 'free', star: false, dumpling: 'magic', dough: 'free', gone: 'free' } });
  assert.deepEqual(value.toyModes, { jelly: 'resting', cushion: 'free', loop: 'free' });
  assert.deepEqual(value.favoriteIds, ['jelly']);
});
