import type { ToyDefinition } from './types';

function SliceIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m3 12 10-5 6 3-10 6-6-4Zm0 0v10l6 4V16m3 1 10-6 7 4-10 6-7-4Zm0 0v10l7 3 10-6V15M19 21v9" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m16 2-5 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
function PrismIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m3 10 9-5 7 3-9 6-7-4Zm0 0v10l7 4V14m4 3 9-6 6 4v9l-9 6-6-4v-9Zm0 0 6 4 9-6m-9 6v9" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m23 2-5 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
const copy: ToyDefinition['copy'] = {
  loading: 'Setting out the jelly',
  desktopInstructionsOnly: true,
  instructions: ['Swipe across to cut', 'Hold, then drag down for tension'],
  touchInstructions: ['Swipe across to cut', 'Hold, then slide down for tension'],
  keyboardHint: <>Arrows to aim <span>·</span> <kbd>Q</kbd> / <kbd>E</kbd> to angle <span>·</span> hold <kbd>space</kbd> to cut</>,
};
export const jellySlice: ToyDefinition = {
  id: 'jelly-slice', name: 'Jelly Slice', icon: SliceIcon,
  description: 'Draw a fine wire through rose gel. A slow pull, a gentle separation, a deep little plop.',
  theme: { background: '#f4e9e5', foreground: '#653a41', accent: '#a75365', muted: '#947778', surface: '#fff9f5', border: '#ddc9c7' },
  copy, load: () => import('../slicing/slab'),
};
export const jellyPrism: ToyDefinition = {
  id: 'jelly-prism', name: 'Jelly Prism', icon: PrismIcon,
  description: 'A fine cutting cord slips through mint gel with soft resistance and a low, rounded plop.',
  theme: { background: '#eaf0e9', foreground: '#315b4e', accent: '#4b8069', muted: '#788c7f', surface: '#f7fbf3', border: '#c6d6c7' },
  copy: { ...copy, loading: 'Setting out the prism' }, load: () => import('../slicing/prism'),
};
