import { createSoftToyScene } from './scene';
import type { SoftToyProfile } from './profiles';
import type { ToyController, ToyContext } from '../toys/types';

export async function mountSoftToy(host: HTMLElement, context: ToyContext, profile: SoftToyProfile): Promise<ToyController | null> {
  if (context.signal.aborted) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'toy-canvas';
  canvas.tabIndex = -1;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', `Interactive ${profile.label}`);
  canvas.setAttribute('aria-describedby', 'toy-instructions toy-touch-instructions keyboard-instructions');
  host.append(canvas);
  try {
    const controller = await createSoftToyScene(canvas, context, profile);
    if (!controller) { canvas.remove(); return null; }
    canvas.tabIndex = 0;
    return {
      reset: () => controller.reset(),
      setSound: enabled => controller.setSound?.(enabled),
      setPaused: paused => controller.setPaused?.(paused),
      setReducedMotion: reduced => controller.setReducedMotion?.(reduced),
      dispose: () => { try { controller.dispose(); } finally { canvas.remove(); } },
    };
  } catch (error) { canvas.remove(); throw error; }
}
