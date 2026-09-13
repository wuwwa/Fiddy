import { mountSoftToy } from '../soft-body/mount';
import { jellyProfile } from '../soft-body/profiles';
import type { ToyContext } from '../toys/types';

/** The adapter between the shared player and the jelly simulation. */
export const mount = (host: HTMLElement, context: ToyContext) => mountSoftToy(host,context,jellyProfile);
