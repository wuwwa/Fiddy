import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveToyRoute, toyLocationHref } from '../src/player/navigation.ts';

const location = (search: string) => ({ pathname: '/play/', search, hash: '#controls' });

test('stale toy bookmarks resolve and canonicalize without dropping URL options', () => {
  const route = resolveToyRoute(location('?toy=switchboard&renderer=webgl&tag=one&tag=two'));
  assert.equal(route.toy.id, 'butter');
  assert.equal(route.replacement, '/play/?toy=butter&renderer=webgl&tag=one&tag=two#controls');
  assert.equal(resolveToyRoute(location('?toy=')).replacement, '/play/?toy=butter#controls');
});

test('valid bookmarks and an omitted default stay unchanged', () => {
  assert.equal(resolveToyRoute(location('?toy=cushion&renderer=webgl')).replacement, null);
  assert.equal(resolveToyRoute(location('?renderer=webgl')).replacement, null);
  assert.equal(resolveToyRoute(location('')).toy.id, 'butter');
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

test('the former Free Jelly bookmark opens Jelly in free mode and preserves other options', () => {
  const route = resolveToyRoute(location('?toy=free-jelly&renderer=webgl&tag=one'));
  assert.equal(route.toy.id, 'jelly'); assert.equal(route.mode, 'free');
  assert.equal(route.replacement, '/play/?toy=jelly&renderer=webgl&tag=one#controls');
});

test('each toy keeps its primary behavior across entry and old mode bookmarks', () => {
  for (const id of ['jelly', 'dumpling', 'cushion', 'loop', 'star', 'putty', 'dough']) {
    const expected = ['jelly', 'dumpling'].includes(id) ? 'free' : 'resting';
    assert.equal(resolveToyRoute(location(`?toy=${id}`)).mode, expected);
    assert.equal(resolveToyRoute(location(''), id).mode, expected);
    for (const oldMode of ['free', 'resting', 'nope']) {
      const route = resolveToyRoute(location(`?toy=${id}&mode=${oldMode}&renderer=webgl`));
      assert.equal(route.mode, expected);
      assert.equal(route.replacement, `/play/?toy=${id}&renderer=webgl#controls`);
    }
    assert.equal(toyLocationHref(id, location('?toy=jelly&mode=free&renderer=webgl')),
      `/play/?toy=${id}&renderer=webgl#controls`);
  }
});
