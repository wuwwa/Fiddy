import { mountSoftToy } from '../soft-body/mount';
import { cushionProfile } from '../soft-body/profiles';
import type { ToyContext } from '../toys/types';

export const mount = (host: HTMLElement, context: ToyContext) => mountSoftToy(host,context,cushionProfile);
