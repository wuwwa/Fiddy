import type { ToyContext } from '../toys/types';
import { mountSlice } from './scene';
export async function mount(host: HTMLElement, context: ToyContext) { return mountSlice(host, context, 'prism'); }
