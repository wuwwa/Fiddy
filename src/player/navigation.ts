import { findToy, toyHref } from '../toys/registry';

type ToyLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

/** Resolve a bookmark and identify stale IDs without adding a history entry. */
export function resolveToyRoute(location: ToyLocation) {
  const params = new URLSearchParams(location.search);
  const requested = params.get('toy');
  const toy = findToy(requested);
  const needsReplacement = params.has('toy') && (requested !== toy.id || params.getAll('toy').length > 1);
  return {
    toy,
    replacement: needsReplacement ? toyLocationHref(toy.id, location) : null,
  };
}

/** Keep renderer options, other query values, and fragments when switching. */
export function toyLocationHref(id: string, location: ToyLocation) {
  return `${location.pathname}${toyHref(id, location.search)}${location.hash}`;
}
