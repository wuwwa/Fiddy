import type { ToyModule } from '../toys/types';
import { mountAstra } from './scene';
export const mount: ToyModule['mount'] = (host, context) => mountAstra(host, context, 'cursor');
