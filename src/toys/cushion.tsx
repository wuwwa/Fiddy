import type { ToyDefinition } from './types';
import { softBodyControls } from './soft-body-copy';
import { freePlay } from './free-play';

function CushionIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="4" y="5" width="24" height="23" rx="8" fill="currentColor" transform="rotate(-9 16 16)" />
    <path d="M9 14q-1-5 5-5" stroke="var(--toy-surface)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}

export const cushion: ToyDefinition = {
  freePlay: freePlay('cushion'),
  id: 'cushion', preview: '/previews/cushion.webp', name: 'Cushion',
  description: 'A soft cushion that sinks slowly and gently recovers.',
  icon: CushionIcon,
  theme: {
    background: '#eae5f3', foreground: '#3e3456', accent: '#786098',
    muted: '#80758e', surface: '#f9f7fc', border: '#cec3dd',
  },
  copy: {
    loading: 'Loading cushion',
    instructions: ['Hold to sink in', 'Drag to stretch & twist'],
    touchInstructions: ['Hold to sink in', 'Drag to stretch'],
    ...softBodyControls,
  },
  load: () => import('../cushion/entry'),
};
