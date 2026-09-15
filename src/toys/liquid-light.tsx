import type { ToyDefinition } from './types';

function LiquidIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M17 3C14 10 5 13 5 21a11 11 0 0 0 22 0c0-7-7-10-10-18Z" fill="currentColor" opacity=".85" /><path d="M10 23c0 3 3 5 6 5M18 12c-6 6 7 9 2 14" stroke="var(--toy-background)" strokeWidth="2" strokeLinecap="round" /></svg>;
}

export const liquidLight: ToyDefinition = {
  id: 'liquid-light', preview: '/previews/liquid-light.webp', name: 'Liquid Light',
  description: 'Paint luminous ribbons. Let the colors wander.',
  icon: LiquidIcon,
  theme: { background: '#04060f', foreground: '#e5e7ff', accent: '#ada6ff', muted: '#a7aecf', surface: '#171a34', border: '#383b61' },
  copy: {
    loading: 'Warming the light',
    instructions: ['Drag to paint', 'Tap to bloom'],
    touchGuide: [
      {gesture:'Paint with a finger',description:'Drag anywhere to leave a ribbon of light. Move in curves to mix the colors.'},
      {gesture:'Tap or hold',description:'Tap for a small bloom, or hold in one place to add more color.'},
    ],
    keyboardHint: <>Arrows to move <span>·</span> hold <kbd>space</kbd> to paint</>,
  },
  load: () => import('../liquid-light/entry'),
};
