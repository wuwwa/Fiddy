import type { ToyDefinition } from './types';
import { softBodyControls } from './soft-body-copy';

function DoughIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M3 21C2 15 7 9 13 9c4-3 13-1 15 6 4 7-2 11-11 11S4 25 3 21Z" fill="currentColor" />
    <path d="M7 17c4-4 8 4 13 0 2-2 3-3 5-2M8 21c3 2 6 2 8 1" stroke="var(--toy-surface)" strokeWidth="1.7" strokeLinecap="round" />
  </svg>;
}

export const dough:ToyDefinition={
  id:'dough',name:'Dough',icon:DoughIcon,
  description:'Lean in. Push a heavy fold through, then work it back. Flour blends with every knead.',
  theme:{background:'#ede5d8',foreground:'#594b38',accent:'#97764e',muted:'#8b7b65',surface:'#faf5e9',border:'#d6c8b0'},
  copy:{
    ...softBodyControls,
    loading:'Resting the dough',
    instructions:['Drag an edge across','Release to merge'],
    touchInstructions:['Drag an edge across','Release to merge'],
    touchGuide:[
      {gesture:'Lean into it',description:'Press and hold. The dough gives way slowly under your hand.'},
      {gesture:'Fold it over',description:'Catch an edge and drag it across the middle. The flap rolls over onto the dough. Release to let the layers settle and merge.'},
      {gesture:'Work it together',description:'Knead different parts again and again. The flour gradually blends in, and worked folds keep some of their shape.'},
      {gesture:'Use both hands',description:'Hold one side with a finger while pushing the other. Drag beside the dough to turn it.'},
    ],
    keyboardHint:<><kbd>←</kbd> / <kbd>→</kbd> to turn <span>·</span> hold <kbd>space</kbd> + arrows to knead</>,
  },
  load:()=>import('../dough/entry'),
};
