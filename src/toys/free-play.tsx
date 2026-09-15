import type { FreeShape, ToyDefinition } from './types';

/** Metadata stays light: neither solver is imported until its mode is selected. */
export function freePlay(shape: FreeShape): NonNullable<ToyDefinition['freePlay']> {
  return {
    copy: {
      loading: `Loading ${shape}`, desktopInstructionsOnly: true,
      instructions: ['Hold to squish', 'Pull up to lift', 'Release to toss'],
      touchInstructions: ['Hold to squish', 'Lift & toss'],
      keyboardHint: <><kbd>Space</kbd> hold · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> move · release to toss</>,
    },
    load: async () => {
      const module = await import('../free-jelly/entry');
      return { mount: (host, context) => module.mountFreeBody(host, context, shape) };
    },
  };
}
