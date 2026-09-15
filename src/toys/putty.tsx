import type { ToyDefinition } from './types';
import { softBodyControls } from './soft-body-copy';

function PuttyIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M4 19C3 10 10 5 17 6s13 6 12 13-9 10-17 8-8-4-8-8Z" fill="currentColor" />
    <path d="M9 14c1-3 4-4 6-3" stroke="var(--toy-surface)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}

export const putty:ToyDefinition={
  id:'putty', preview: '/previews/putty.webp', name:'Putty',
  description:'Warm, dense putty. Hold a dent or pull a fold; it remembers your touch.',
  icon:PuttyIcon,
  theme:{background:'#f2e8df',foreground:'#614638',accent:'#a16a4f',muted:'#947a6b',surface:'#fff9f3',border:'#dec8b8'},
  copy:{
    loading:'Loading putty',instructions:['Hold to knead','Pull a fold'],
    touchInstructions:['Hold to knead','Drag to shape'],
    ...softBodyControls,
    touchGuide:[
      {gesture:'Hold to knead',description:'Rest a finger on the putty. Longer holds leave a dent that stays.'},
      {gesture:'Pull a fold',description:'Drag from the putty to stretch it. Use two fingers to pinch or pull it apart.'},
      {gesture:'Turn it around',description:'Drag on the empty space beside the putty to knead another side.'},
    ],
  },
  load:()=>import('../putty/entry'),
};
