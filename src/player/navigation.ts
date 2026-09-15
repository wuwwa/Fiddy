import { findToy, toyHref } from '../toys/registry';

type ToyLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

/** Resolve a bookmark and identify stale IDs without adding a history entry. */
export function resolveToyRoute(location: ToyLocation, lastToyId?: string | null) {
  const params = new URLSearchParams(location.search);
  const requested = params.get('toy');
  const id = params.has('toy') ? requested : lastToyId ?? null;
  const legacy = id === 'free-jelly';
  const toy = findToy(legacy ? 'jelly' : id);
  const mode = toy.primaryMode ?? 'resting';
  const needsReplacement = (params.has('toy') ? (requested !== toy.id || params.getAll('toy').length > 1) : !!lastToyId) || params.has('mode');
  return {
    toy,
    mode,
    replacement: needsReplacement ? toyLocationHref(toy.id, location) : null,
  };
}

/** Keep renderer options, other query values, and fragments when switching. */
export function toyLocationHref(id: string, location: ToyLocation) {
  return `${location.pathname}${toyHref(id, location.search)}${location.hash}`;
}
