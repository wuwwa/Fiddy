import type { ToyDefinition } from './types';

function SwirlIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M22 3C10 2 3 11 6 22s19 9 21-1S15 8 11 17s9 10 9 3-7-4-5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray=".5 2.6"/></svg>;
}
function CursorIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 4c-1-.4-2 .5-1.6 1.6L12 28c.3 1 1.4 1 1.8 0l4-10 10-4c1-.4 1-1.5 0-1.8L7 4Z" stroke="currentColor" strokeWidth="1.7" strokeDasharray=".6 2.4" strokeLinecap="round"/></svg>;
}
const theme = { background: '#03080d', foreground: '#e0eaf2', accent: '#dcebf5', muted: '#95a9b9', surface: '#101a24', border: '#2b3a47' };
const copy = {
  loading: 'Gathering starlight', instructions: ['Grab to rotate', 'Scroll to look closer'],
  touchInstructions: ['Drag to rotate', 'Release to let it drift'],
  keyboardHint: <><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> rotate <span>·</span> <kbd>Q</kbd><kbd>E</kbd> roll <span>·</span> <kbd>space</kbd> pause</>,
};
export const astraSwirl: ToyDefinition = {
  id: 'astra-swirl', name: 'Swirl', description: 'An inward spiral of starlight. Turn it in your hands.',
  icon: SwirlIcon, theme, copy, load: () => import('../astra/swirl'),
};
export const astraCursor: ToyDefinition = {
  id: 'astra-cursor', name: 'Shapes', description: 'Draw an outline or choose a shape. Watch starlight flow around it.',
  icon: CursorIcon, theme, copy, load: () => import('../astra/cursor'),
};
