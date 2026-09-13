import type { ToyContext } from '../toys/types';
import { mountField } from '../fields/surface';
import { createFluid } from './engine';
import '../fields/surface.css';

export async function mount(host: HTMLElement, context: ToyContext) {
  return mountField(host, context, 'Liquid Light. Drag to paint flowing color; tap to create a bloom.', createFluid);
}
