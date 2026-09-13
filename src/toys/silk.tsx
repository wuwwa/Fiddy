import type { ToyDefinition } from './types';
function SilkIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m4 11 10-7 14 15-11 9L4 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M7 9c3 8 9 3 11 15M11 6c2 7 8 4 12 15M5 15c7-2 7-5 15-4M9 21c5-2 6-5 15-5" stroke="currentColor" strokeWidth="1.3"/></svg>;
}
export const silk: ToyDefinition = {
  id: 'silk', name: 'Silk', icon: SilkIcon,
  description: 'Catch a fold, pull the fabric, and let it settle into soft ripples.',
  theme: { background: '#191a18', foreground: '#eae4da', accent: '#d4c4ad', muted: '#aca699', surface: '#2b2d28', border: '#48483f' },
  copy: {
    loading: 'Unfolding the silk', instructions: ['Brush to ripple', 'Hold and drag to lift'], touchInstructions: ['Drag to lift', 'Release to ripple'],
    keyboardHint: <>Arrows to explore <span>·</span> hold <kbd>space</kbd> to lift</>,
  },
  load: () => import('../silk/entry'),
};
