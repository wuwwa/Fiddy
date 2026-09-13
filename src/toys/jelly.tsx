import type { ToyDefinition } from './types';
import { softBodyControls } from './soft-body-copy';

function JellyIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M4 19C3 8 9 4 17 5s12 5 12 13-4 10-13 10S5 26 4 19Z" fill="currentColor" />
    <path d="M9 14c0-3 3-5 6-5" stroke="var(--toy-surface, #fff8fa)" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

/** Lightweight metadata; the simulation is imported only when selected. */
export const jelly: ToyDefinition = {
  id: 'jelly', name: 'Jelly',
  description: 'A delicate gel that stretches, yields, and recovers.',
  icon: JellyIcon,
  theme: {
    background: '#f6e3e7', foreground: '#572333', accent: '#a93a59',
    muted: '#956a76', surface: '#fff8fa', border: '#dcbac3',
  },
  copy: {
    loading: 'Loading jelly',
    desktopInstructionsOnly: true,
    instructions: ['Hold to press in', 'Drag to stretch & twist'],
    touchInstructions: ['Press & hold', 'Drag to stretch'],
    ...softBodyControls,
  },
  load: () => import('../jelly/entry'),
};
