import { jelly } from './jelly';
import { cushion } from './cushion';
import { putty } from './putty';
import { loop } from './loop';
import { star } from './star';
import { dumpling } from './dumpling';
import { asciiTide } from './ascii-tide';
import { liquidLight } from './liquid-light';
import { astraSwirl, astraCursor } from './astra';
import { magneticDust } from './magnetic-dust';
import { silk } from './silk';
import { jellySlice, jellyPrism } from './slicing';
import type { ToyDefinition } from './types';

/** Display order is collection order. Register finished, playable toys here. */
export const toys: readonly ToyDefinition[] = [jelly, cushion, putty, loop, star, dumpling, asciiTide, liquidLight, astraSwirl, astraCursor, magneticDust, silk, jellySlice, jellyPrism];
export const defaultToy = jelly;

export function findToy(id: string | null): ToyDefinition {
  return toys.find(toy => toy.id === id) ?? defaultToy;
}

export function toyHref(id: string, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  params.set('toy', id);
  return `?${params.toString()}`;
}
