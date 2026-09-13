import * as THREE from 'three';
import type { ToyContext, ToyController } from '../toys/types';
import { SliceModel, MAX_PIECES, area, type Point, type SliceKind } from './model';
import { DEFAULT_CUT_ANGLE, findCut, KnifePress, type CutLine } from './knife';
import { SliceRenderer } from './render';
import { SliceAudio } from './audio';
import './style.css';

export function mountSlice(host: HTMLElement, context: ToyContext, kind: SliceKind): ToyController | null {
  if (context.signal.aborted) return null;
  const canvas = document.createElement('canvas'); canvas.className = 'toy-canvas slice-canvas'; canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', kind === 'slab' ? 'Jelly Slice' : 'Jelly Prism');
  canvas.setAttribute('aria-describedby', 'toy-instructions keyboard-instructions');
  const status = document.createElement('p'); status.className = 'slice-status sr-only'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const angleControl = document.createElement('div'); angleControl.className = 'slice-angle floating-surface'; angleControl.setAttribute('role', 'group'); angleControl.setAttribute('aria-label', 'Wire angle');
  const left = document.createElement('button'), right = document.createElement('button'), angleLabel = document.createElement('span');
  left.textContent = '↶'; right.textContent = '↷'; left.setAttribute('aria-label', 'Rotate wire counterclockwise'); right.setAttribute('aria-label', 'Rotate wire clockwise');
  angleControl.append(left, angleLabel, right); host.append(canvas, status, angleControl);
  let view: SliceRenderer;
  try { view = new SliceRenderer(canvas, kind, context.theme); }
  catch (error) { canvas.remove(); status.remove(); angleControl.remove(); throw error; }
  const model = new SliceModel(kind), press = new KnifePress(), audio = new SliceAudio(kind === 'slab' ? 1 : .86);
  let disposed = false, paused = context.preferences.paused, reduced = context.preferences.reducedMotion;
  let frame = 0, lastFrame = 0, frames = 0, frameMs = 0, soundTail = 0, lastStatus = '';
  let aimPoint: Point = { x: 0, z: 0 }, angle = DEFAULT_CUT_ANGLE, aim: CutLine | null = null, aimDirty = true;
  let pointer: { id: number; startY: number } | null = null, keyboard = false;
  const keys = new Set<string>(), raycaster = new THREE.Raycaster(), target = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -view.height);
  function setStatus(message: string) { if (message !== lastStatus) { lastStatus = message; status.textContent = message; } }
  function updateAim() {
    aim = findCut(model, aimPoint, angle); aimDirty = false;
    angleLabel.textContent = `Vertical ${Math.round((angle - DEFAULT_CUT_ANGLE) * 180 / Math.PI)}°`;
  }
  function diagnostics() {
    if (import.meta.env.DEV) canvas.dataset.diagnostics = JSON.stringify({ kind, frames, paused, reduced, pieces: model.pieces.length, cuts: model.cuts,
      moving: model.moving || press.moving, pointer: pointer?.id ?? null, keyboard: keys.has('Space'),
      knife: { phase: press.phase, depth: +press.depth.toFixed(4), speed: +press.speed.toFixed(4), pressure: press.pressure, resistance: press.resistance, canCut: !!aim },
      frameMs: +frameMs.toFixed(2), area: model.pieces.reduce((sum, p) => sum + area(p.polygon), 0), memory: view.diagnostics, audio: audio.diagnostics, width: canvas.width, height: canvas.height });
  }
  function draw(elapsedMs = 0) {
    if (aimDirty && press.phase === 'idle') updateAim();
    view.update(model, press, aim, reduced); view.render(elapsedMs); frames++; diagnostics();
  }
  function wake() { if (!disposed && !paused && !frame) { lastFrame = 0; frame = requestAnimationFrame(tick); } }
  function tick(now: number) {
    frame = 0; if (disposed || paused) return;
    const elapsedMs = lastFrame ? now - lastFrame : 16.67, dt = Math.min(elapsedMs / 1000, .05); lastFrame = now;
    if (elapsedMs < 150) frameMs = frameMs * .92 + elapsedMs * .08;
    try {
      model.step(dt, reduced);
      if (press.step(dt) && press.line) {
        const count = model.slice(press.line.start, press.line.end, reduced);
        if (count) { view.rebuild(model); audio.finish(); soundTail = .85; setStatus(`${model.pieces.length} pieces.`); }
        aimDirty = true;
      }
      if (press.phase === 'idle' && keyboard && keys.size) {
        const distance = dt * 1.1;
        if (keys.has('ArrowLeft')) moveAim(-distance, 0);
        if (keys.has('ArrowRight')) moveAim(distance, 0);
        if (keys.has('ArrowUp')) moveAim(0, -distance);
        if (keys.has('ArrowDown')) moveAim(0, distance);
        if (keys.has('KeyQ')) angle -= dt * .75;
        if (keys.has('KeyE')) angle += dt * .75;
        aimDirty = true;
      }
      const contact = press.phase === 'cutting' && press.depth > .12 && press.depth < .99;
      audio.move(press.speed, contact, Math.max(0, (press.depth - .12) / .88), press.resistance, (press.line?.center.x ?? 0) * .2);
      soundTail = Math.max(0, soundTail - dt);
      if (press.phase === 'idle' && model.pieces.length >= MAX_PIECES) setStatus('Cut limit reached. Reset to cut again.');
      draw(elapsedMs);
    } catch (error) { dispose(); context.onError(error instanceof Error ? error.message : 'The jelly stopped. Please try again.'); return; }
    if (press.moving || model.moving || soundTail > 0 || (keys.size && !keys.has('Space'))) frame = requestAnimationFrame(tick);
  }
  function point(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), view.camera);
    raycaster.ray.intersectPlane(plane, target);
    return { x: THREE.MathUtils.clamp(target.x, -5, 5), z: THREE.MathUtils.clamp(target.z, -5, 5) };
  }
  function begin() {
    if (disposed || paused || press.phase !== 'idle') return false;
    updateAim(); if (!aim || !press.begin(aim)) return false;
    model.beginStroke(); setStatus('');
    context.onInteractionChange(true); left.disabled = right.disabled = true; wake(); return true;
  }
  function release(immediate = false) {
    const active = pointer !== null || press.phase === 'cutting' || press.phase === 'complete';
    const finishing = press.phase === 'complete' && !immediate;
    const old = pointer; pointer = null;
    if (old) { try { if (canvas.hasPointerCapture(old.id)) canvas.releasePointerCapture(old.id); } catch { /* Capture may already be gone. */ } }
    press.release(immediate); keys.delete('Space'); if (!finishing) audio.reset(); soundTail = finishing ? .85 : .25;
    left.disabled = right.disabled = false; aimDirty = true;
    if (active) context.onInteractionChange(false); wake();
  }
  function pointerDown(event: PointerEvent) {
    if (disposed || paused || pointer || press.phase !== 'idle' || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); keyboard = false; keys.clear(); aimPoint = point(event); aimDirty = true;
    canvas.classList.add('is-pointer-focused'); canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(event.pointerId); } catch { return; }
    pointer = { id: event.pointerId, startY: event.clientY };
    if (!begin()) { release(true); setStatus(model.pieces.length >= MAX_PIECES ? 'Reset to cut again.' : 'Move the wire over a thicker piece.'); }
  }
  function pointerMove(event: PointerEvent) {
    if (disposed || paused) return;
    if (pointer?.id === event.pointerId) { event.preventDefault(); press.setPressure(.5 + (event.clientY - pointer.startY) / 150); wake(); }
    else if (!pointer && !keyboard && press.phase === 'idle' && event.pointerType !== 'touch') { aimPoint = point(event); aimDirty = true; wake(); }
  }
  function pointerUp(event: PointerEvent) { if (pointer?.id === event.pointerId) release(); }
  function pointerCancel(event: PointerEvent) { if (pointer?.id === event.pointerId) release(true); }
  function moveAim(rightward: number, downward: number) {
    aimPoint.x = THREE.MathUtils.clamp(aimPoint.x + rightward * .82 + downward * .57, -2.7, 2.7);
    aimPoint.z = THREE.MathUtils.clamp(aimPoint.z - rightward * .57 + downward * .82, -2.7, 2.7); aimDirty = true;
  }
  function rotate(direction: number) { if (disposed || paused || press.phase !== 'idle') return; angle += direction * Math.PI / 12; aimDirty = true; wake(); }
  const rotateLeft = () => rotate(-1), rotateRight = () => rotate(1);
  function keyDown(event: KeyboardEvent) {
    if (disposed || paused || pointer || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['Space', 'KeyQ', 'KeyE', 'KeyR', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.code)) return;
    event.preventDefault(); keyboard = true; canvas.classList.remove('is-pointer-focused');
    if (event.code === 'KeyR') { reset(); return; }
    if (event.code === 'Escape') { keys.clear(); release(true); return; }
    if (event.code === 'Space') { if (!event.repeat && !keys.has('Space') && begin()) keys.add('Space'); return; }
    if (press.phase !== 'idle') return;
    if (!event.repeat) {
      if (event.code === 'ArrowLeft') moveAim(-.08, 0); if (event.code === 'ArrowRight') moveAim(.08, 0);
      if (event.code === 'ArrowUp') moveAim(0, -.08); if (event.code === 'ArrowDown') moveAim(0, .08);
      if (event.code === 'KeyQ') angle -= .06; if (event.code === 'KeyE') angle += .06;
    }
    keys.add(event.code); aimDirty = true; wake();
  }
  function keyUp(event: KeyboardEvent) { if (event.code === 'Space' && keys.has('Space')) release(); keys.delete(event.code); }
  function blur() { keys.clear(); keyboard = false; release(true); }
  function visibility() { if (document.hidden) blur(); }
  function reset() {
    if (disposed) return;
    release(true); keys.clear(); keyboard = false; model.reset(); view.rebuild(model); aimPoint = { x: 0, z: 0 }; angle = DEFAULT_CUT_ANGLE; aimDirty = true;
    audio.reset(); setStatus('Jelly reset.'); draw(); wake();
  }
  function resize() { if (disposed) return; release(true); const rect = host.getBoundingClientRect(); view.resize(Math.max(1, rect.width), Math.max(1, rect.height)); draw(); wake(); }
  const observer = new ResizeObserver(() => { try { resize(); } catch (error) { dispose(); context.onError(String(error)); } });
  function lost(event: Event) { event.preventDefault(); dispose(); context.onError('Graphics were interrupted. Try again for a fresh block.'); }
  function dispose() {
    if (disposed) return; disposed = true; release(true); keys.clear(); cancelAnimationFrame(frame); observer.disconnect();
    canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('pointercancel', pointerCancel); canvas.removeEventListener('lostpointercapture', pointerCancel);
    canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('keyup', keyUp); canvas.removeEventListener('blur', blur); canvas.removeEventListener('webglcontextlost', lost);
    left.removeEventListener('click', rotateLeft); right.removeEventListener('click', rotateRight);
    window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); context.signal.removeEventListener('abort', dispose);
    audio.dispose(); view.dispose(); canvas.remove(); status.remove(); angleControl.remove();
  }
  try {
    view.rebuild(model); resize();
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerCancel); canvas.addEventListener('lostpointercapture', pointerCancel);
    canvas.addEventListener('keydown', keyDown); canvas.addEventListener('keyup', keyUp); canvas.addEventListener('blur', blur); canvas.addEventListener('webglcontextlost', lost);
    left.addEventListener('click', rotateLeft); right.addEventListener('click', rotateRight);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility); context.signal.addEventListener('abort', dispose, { once: true });
    observer.observe(host); audio.setPaused(paused); wake();
  } catch (error) { dispose(); throw error; }
  return {
    reset, dispose,
    async setSound(enabled) { if (disposed) return; await audio.setEnabled(enabled); if (!disposed) { diagnostics(); wake(); } },
    setPaused(value) { if (disposed) return; paused = value; keys.clear(); release(true); audio.setPaused(value); left.disabled = right.disabled = value;
      if (value) { cancelAnimationFrame(frame); frame = 0; } else wake(); diagnostics(); },
    setReducedMotion(value) { if (disposed) return; reduced = value; model.step(.01, value); draw(); wake(); },
  };
}
