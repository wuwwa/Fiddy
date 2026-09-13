import type { ToyDefinition } from './types';
function MagnetIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 5v13a9 9 0 0 0 18 0V5h-6v13a3 3 0 0 1-6 0V5H7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M7 11h6m6 0h6M3 3l-1 2m27-2 1 2" stroke="currentColor" strokeWidth="2"/></svg>;
}
export const magneticDust: ToyDefinition = {
  id: 'magnetic-dust', name: 'Magnetic Dust', icon: MagnetIcon,
  description: 'Iron filings, a sheet of paper, and an invisible magnet.',
  theme: { background: '#e9e6dc', foreground: '#30382e', accent: '#526044', muted: '#6e7465', surface: '#e0ded3', border: '#bcbfb0' },
  copy: {
    loading: 'Scattering the filings', instructions: ['Press and hold', 'Move slowly'],
    touchInstructions: ['Hold and drag to shape', 'Release to relax'],
    keyboardHint: <>Arrows to aim <span>·</span> hold <kbd>space</kbd> to activate</>,
  },
  load: () => import('../magnetic-dust/entry'),
};
