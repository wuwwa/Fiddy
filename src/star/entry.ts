import { mountSoftToy } from '../soft-body/mount';
import { starProfile } from '../soft-body/profiles';
import type { ToyContext } from '../toys/types';

export const mount = (host: HTMLElement, context: ToyContext) => mountSoftToy(host, context, starProfile);
