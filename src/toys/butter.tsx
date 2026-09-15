import type { ToyDefinition } from './types';
import { softBodyControls } from './soft-body-copy';

function ButterIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="m3 13 7-6 20 5v10l-7 5-20-5Z" fill="currentColor" />
    <path d="m3 13 20 5 7-6M23 18v9M10 10l-4 4m10-2-4 4m10-3-4 4" stroke="var(--toy-surface)" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>;
}

export const butter: ToyDefinition = {
  id: 'butter', preview: '/previews/butter.webp', name: 'Butter',
  description: 'A butter stick to press flat and watch slowly rise.',
  icon: ButterIcon,
  theme: {
    background: '#f3ecdb', foreground: '#57462d', accent: '#987233',
    muted: '#82735b', surface: '#fffaf0', border: '#d9ccb1',
  },
  copy: {
    loading: 'Unwrapping butter',
    instructions: ['Hold to squish', 'Let go & watch it rise'],
    touchInstructions: ['Hold to squish', 'Let go & watch it rise'],
    ...softBodyControls,
  },
  load: () => import('../butter/entry'),
};
