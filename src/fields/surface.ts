import type { ToyContext, ToyController } from '../toys/types';
import { bindFieldInput, type FieldPointer } from './input';

export interface FieldEngine {
  /** Perspective surfaces release grips before a CSS size change moves the camera. */
  releaseInputOnResize?: boolean;
  resize(width: number, height: number, pixelRatio: number): void;
  draw(dt: number, time: number, pointer: FieldPointer, reduced: boolean): void;
  reset(reduced: boolean): void;
  dispose(): void;
}

/** Owns the DOM, input, animation, and cancellation shared by the two field toys. */
export function mountField(host: HTMLElement, context: ToyContext, name: string,
  create: (canvas: HTMLCanvasElement) => FieldEngine): ToyController | null {
  if (context.signal.aborted) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'toy-canvas field-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', name);
  canvas.setAttribute('aria-describedby', 'toy-instructions keyboard-instructions');
  const cursor = document.createElement('div');
  cursor.className = 'field-keyboard-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.hidden = true;
  host.append(canvas, cursor);
  let engine: FieldEngine;
  try { engine = create(canvas); }
  catch (error) { canvas.remove(); cursor.remove(); throw error; }
  const input = bindFieldInput(canvas, context.onInteractionChange);
  let disposed = false, paused = context.preferences.paused, reduced = context.preferences.reducedMotion;
  let frame = 0, last = 0, time = 0, frames = 0, cssWidth = 0, cssHeight = 0;
  input.setEnabled(!paused);
  function diagnostics() {
    if (import.meta.env?.DEV) canvas.dataset.diagnostics = JSON.stringify({ frames, paused, reduced, width: canvas.width, height: canvas.height });
  }
  function render(dt: number) {
    input.advance(dt);
    time += dt;
    engine.draw(dt, time, input.pointer, reduced);
    if (dt > 0) {
      input.pointer.dx = input.pointer.dy = 0;
      input.pointer.samples.length = 0;
    }
    cursor.hidden = !input.pointer.keyboard || document.activeElement !== canvas || paused;
    cursor.style.left = `${input.pointer.x * 100}%`;
    cursor.style.top = `${input.pointer.y * 100}%`;
    cursor.classList.toggle('is-active', input.pointer.down);
    frames++; diagnostics();
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || paused) return;
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    try { render(dt); }
    catch (error) { dispose(); context.onError(error instanceof Error ? error.message : 'This experience stopped. Please try again.'); return; }
    frame = requestAnimationFrame(tick);
  }
  function start() { if (!frame && !disposed && !paused) { last = 0; frame = requestAnimationFrame(tick); } }
  function resize() {
    if (disposed) return;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    if (engine.releaseInputOnResize && (width !== cssWidth || height !== cssHeight)) input.clear();
    cssWidth = width; cssHeight = height;
    engine.resize(width, height, Math.min(devicePixelRatio || 1, 1.5));
    render(0);
  }
  const observer = new ResizeObserver(() => {
    try { resize(); }
    catch (error) { dispose(); context.onError(error instanceof Error ? error.message : 'Could not resize this experience.'); }
  });
  const lost = (event: Event) => {
    event.preventDefault();
    dispose(); context.onError('Graphics were interrupted. Try again to restart this experience.');
  };
  canvas.addEventListener('webglcontextlost', lost);
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame); frame = 0;
    observer.disconnect(); input.dispose();
    context.signal.removeEventListener('abort', dispose);
    canvas.removeEventListener('webglcontextlost', lost);
    try { engine.dispose(); }
    finally { canvas.remove(); cursor.remove(); }
  }
  context.signal.addEventListener('abort', dispose, { once: true });
  try {
    resize(); engine.reset(reduced); render(0);
    observer.observe(host); start();
  } catch (error) { dispose(); throw error; }
  return {
    reset() { if (disposed) return; input.clear(); time = 0; engine.reset(reduced); render(0); },
    setPaused(value) {
      if (disposed) return;
      paused = value; input.setEnabled(!value);
      if (paused) { cancelAnimationFrame(frame); frame = 0; cursor.hidden = true; }
      else start();
      diagnostics();
    },
    setReducedMotion(value) { if (disposed) return; reduced = value; diagnostics(); },
    dispose,
  };
}
