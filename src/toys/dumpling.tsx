import type { ToyDefinition } from './types';
import { softBodyControls } from './soft-body-copy';

function DumplingIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M12 6q4-3 8 0c1.5 2 8 5.5 9 12s-4 10-13 10S2 24.5 3 18 10.5 8 12 6Z" fill="currentColor" />
    <path d="M15 8c-4 3-6 6.5-6 10m7-10v10m1-10c4 3 6 6.5 6 10" stroke="var(--toy-surface, #fffaf3)" strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
}

export const dumpling: ToyDefinition = {
  id: 'dumpling', name: 'Dumpling',
  description: 'A dense, doughy bun with a slow return.',
  icon: DumplingIcon,
  theme: {
    background: '#f3e8db', foreground: '#594331', accent: '#8e5d3a',
    muted: '#7a634f', surface: '#fffaf3', border: '#dbc8b4',
  },
  copy: {
    loading: 'Loading dumpling',
    instructions: ['Hold to sink in', 'Drag to stretch & twist'],
    touchInstructions: ['Hold to sink in', 'Two fingers to pinch & stretch'],
    ...softBodyControls,
  },
  load: () => import('../dumpling/entry'),
};
