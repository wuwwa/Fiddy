import { defaultToy, toys } from '../toys/registry';
import type { ToyMode } from '../toys/types';

export const preferenceKey = 'fiddy-preferences-v1';
export interface PlayerPreferences { version: 1; favoriteIds: string[]; lastToyId: string | null; toyModes?: Record<string, ToyMode> }
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const known = new Set(toys.map(toy => toy.id));
export function readPreferences(storage: Pick<StoragePort, 'getItem'>): PlayerPreferences {
  const empty: PlayerPreferences = { version: 1, favoriteIds: [], lastToyId: null };
  try {
    const value = JSON.parse(storage.getItem(preferenceKey) ?? 'null');
    if (!value || value.version !== 1) return empty;
    const canonicalId = (id: unknown) => id === 'free-jelly' ? 'jelly' : id;
    const toyModes: Record<string, ToyMode> = {};
    if (value.toyModes && typeof value.toyModes === 'object') {
      for (const toy of toys) {
        const mode = value.toyModes[toy.id];
        if (toy.freePlay && (mode === 'free' || mode === 'resting')) toyModes[toy.id] = mode;
      }
    }
    if ((value.lastToyId === 'free-jelly' || Array.isArray(value.favoriteIds) && value.favoriteIds.includes('free-jelly')) && !toyModes.jelly) toyModes.jelly = 'free';
    const lastToyId = canonicalId(value.lastToyId);
    return { version: 1,
      favoriteIds: Array.isArray(value.favoriteIds) ? [...new Set<string>(value.favoriteIds.map(canonicalId).filter((id: unknown): id is string => typeof id === 'string' && known.has(id)))] : [],
      lastToyId: typeof lastToyId === 'string' && known.has(lastToyId) ? lastToyId : null,
      ...(Object.keys(toyModes).length ? { toyModes } : {}) };
  } catch { return empty; }
}
export function writePreferences(storage: Pick<StoragePort, 'setItem'>, value: PlayerPreferences) {
  try { storage.setItem(preferenceKey, JSON.stringify(value)); } catch { /* Session remains usable. */ }
}
export function orderToys(favoriteIds: readonly string[]) {
  const favorites = new Set(favoriteIds);
  const remaining = toys.filter(toy => toy.id !== defaultToy.id);
  return [defaultToy, ...remaining.filter(toy => favorites.has(toy.id)), ...remaining.filter(toy => !favorites.has(toy.id))];
}
