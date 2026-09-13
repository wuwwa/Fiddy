import type { ToyDefinition } from './types';

function TideIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M3 10c6-8 13 8 26 0M3 16c6-8 13 8 26 0M3 22c6-8 13 8 26 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 4" /></svg>;
}

export const asciiTide: ToyDefinition = {
  id: 'ascii-tide', name: 'ASCII Tide',
  description: 'Stir a sea of characters. Watch order return.',
  icon: TideIcon,
  theme: { background: '#030d0d', foreground: '#d0f9e9', accent: '#77ebbf', muted: '#91b9ac', surface: '#0b2520', border: '#255245' },
  copy: {
    loading: 'Gathering the tide',
    instructions: ['Move to disturb', 'Hold to draw a vortex'],
    keyboardHint: <>Arrows to move <span>·</span> hold <kbd>space</kbd> to gather</>,
  },
  load: () => import('../ascii-tide/entry'),
};
