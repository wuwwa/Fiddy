import type { ToyDefinition } from './types';
import { softBodyControls } from './soft-body-copy';

function LoopIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <ellipse cx="16" cy="16" rx="9.5" ry="11" stroke="currentColor" strokeWidth="7" transform="rotate(-15 16 16)" />
    <path d="M9.5 11c1-2.8 3-4.5 5.5-4.8" stroke="var(--toy-surface, #f8fcf8)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}

export const loop: ToyDefinition = {
  id: 'loop', name: 'Loop',
  description: 'A resilient gel ring with a soft, stretchable rim.',
  icon: LoopIcon,
  theme: {
    background: '#e5f1e9', foreground: '#284c3a', accent: '#39765a',
    muted: '#586f61', surface: '#f8fcf8', border: '#bfd5c5',
  },
  copy: {
    loading: 'Loading loop',
    instructions: ['Hold to press in', 'Drag to stretch & twist'],
    touchInstructions: ['Press & hold', 'Drag to stretch'],
    ...softBodyControls,
  },
  load: () => import('../loop/entry'),
};
