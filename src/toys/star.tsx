import type { ToyDefinition } from './types';
import { softBodyControls } from './soft-body-copy';

function StarIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M13.8 4.5q2.2-3.8 4.4 0l3.1 6.3 6.9 1q4.2.6 1.1 3.6l-5 4.8 1.2 6.8q.7 4.2-3.1 2.2L16 26l-6.4 3.2q-3.8 2-3.1-2.2l1.2-6.8-5-4.8q-3.1-3 1.1-3.6l6.9-1 3.1-6.3Z" fill="currentColor" />
    <path d="m14.4 11 1.6-3 1.6 3" stroke="var(--toy-surface, #fffcf2)" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export const star: ToyDefinition = {
  id: 'star', name: 'Star',
  description: 'A soft solid with pliable points and a gentle return.',
  icon: StarIcon,
  theme: {
    background: '#f8eed0', foreground: '#5a441f', accent: '#8b6015',
    muted: '#79663d', surface: '#fffcf2', border: '#ddcca1',
  },
  copy: {
    loading: 'Loading star',
    instructions: ['Hold to press in', 'Drag the tips to stretch'],
    touchInstructions: ['Hold to press', 'Two fingers to pinch & stretch'],
    ...softBodyControls,
  },
  load: () => import('../star/entry'),
};
