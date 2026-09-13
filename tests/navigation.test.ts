import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveToyRoute, toyLocationHref } from '../src/player/navigation.ts';

const location = (search: string) => ({ pathname: '/play/', search, hash: '#controls' });

test('stale toy bookmarks resolve and canonicalize without dropping URL options', () => {
  const route = resolveToyRoute(location('?toy=switchboard&renderer=webgl&tag=one&tag=two'));
  assert.equal(route.toy.id, 'jelly');
  assert.equal(route.replacement, '/play/?toy=jelly&renderer=webgl&tag=one&tag=two#controls');
  assert.equal(resolveToyRoute(location('?toy=')).replacement, '/play/?toy=jelly#controls');
});

test('valid bookmarks and an omitted default stay unchanged', () => {
  assert.equal(resolveToyRoute(location('?toy=cushion&renderer=webgl')).replacement, null);
  assert.equal(resolveToyRoute(location('?renderer=webgl')).replacement, null);
  assert.equal(resolveToyRoute(location('')).toy.id, 'jelly');
});

test('ambiguous duplicate toy IDs retain the displayed selection', () => {
  const route = resolveToyRoute(location('?toy=loop&renderer=webgl&toy=jelly'));
  assert.equal(route.toy.id, 'loop');
  assert.equal(route.replacement, '/play/?toy=loop&renderer=webgl#controls');
});

test('in-app and native collection links preserve pathname, options, and fragment', () => {
  assert.equal(toyLocationHref('cushion', location('?renderer=webgl&toy=jelly&debug=1')),
    '/play/?renderer=webgl&toy=cushion&debug=1#controls');
});
