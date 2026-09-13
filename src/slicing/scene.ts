import * as THREE from 'three';
import type { ToyContext, ToyController } from '../toys/types';
import { SliceModel, MAX_PIECES, area, center, type Point, type SliceKind } from './model';
import { DEFAULT_CUT_ANGLE, findCut, KnifePress, type CutLine } from './knife';
import { SliceRenderer } from './render';
import { SliceAudio } from './audio';
import { SliceGesture } from './gesture';
import { SlashTrail, drawSlash } from './slash';
import './style.css';

export function mountSlice(host: HTMLElement, context: ToyContext, kind: SliceKind): ToyController | null {
  if (context.signal.aborted) return null;
  const canvas = document.createElement('canvas'); canvas.className = 'toy-canvas slice-canvas'; canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', kind === 'slab' ? 'Jelly Slice' : 'Jelly Prism');
  canvas.setAttribute('aria-describedby', 'toy-instructions keyboard-instructions');
  const status = document.createElement('p'); status.className = 'slice-status sr-only'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const tensionCue = document.createElement('div'); tensionCue.className = 'slice-tension floating-surface'; tensionCue.hidden = true;
  const tensionArrow = document.createElement('span'); tensionArrow.className = 'slice-tension-arrow'; tensionArrow.textContent = '↓'; tensionArrow.setAttribute('aria-hidden', 'true');
  const tensionCopy = document.createElement('div'), tensionLabel = document.createElement('strong'), tensionMeter = document.createElement('meter');
  tensionMeter.min = 0; tensionMeter.max = 1; tensionMeter.setAttribute('aria-label', 'Wire tension');
  tensionCopy.append(tensionLabel, tensionMeter); tensionCue.append(tensionArrow, tensionCopy);
  const pieceCount = document.createElement('p'); pieceCount.className = 'slice-count'; pieceCount.hidden = true;
  const limitCue = document.createElement('div'); limitCue.className = 'slice-limit floating-surface'; limitCue.hidden = true;
  const limitLabel = document.createElement('strong'); limitLabel.textContent = `${MAX_PIECES} pieces · limit reached`;
  const resetButton = document.createElement('button'); resetButton.textContent = 'Reset jelly'; resetButton.setAttribute('aria-label', 'Start with a fresh block');
  limitCue.append(limitLabel, resetButton);
  const stroke = document.createElement('canvas'); stroke.className = 'slice-stroke'; stroke.setAttribute('aria-hidden', 'true');
  const strokeContext = stroke.getContext('2d'), slash = new SlashTrail();
  let strokeRatio = 1, strokeDrawn = false;
  const angleControl = document.createElement('div'); angleControl.className = 'slice-angle floating-surface'; angleControl.setAttribute('role', 'group'); angleControl.setAttribute('aria-label', 'Wire angle');
  const left = document.createElement('button'), right = document.createElement('button'), angleLabel = document.createElement('span');
  left.textContent = '↶'; right.textContent = '↷'; left.setAttribute('aria-label', 'Rotate wire counterclockwise'); right.setAttribute('aria-label', 'Rotate wire clockwise');
  angleControl.append(left, angleLabel, right); host.append(canvas, stroke, status, angleControl, pieceCount, tensionCue, limitCue);
  let view: SliceRenderer;
  try { view = new SliceRenderer(canvas, kind, context.theme); }
  catch (error) { canvas.remove(); stroke.remove(); status.remove(); angleControl.remove(); pieceCount.remove(); tensionCue.remove(); limitCue.remove(); throw error; }
  const model = new SliceModel(kind), press = new KnifePress(), audio = new SliceAudio(kind === 'slab' ? 1 : .86);
  let disposed = false, paused = context.preferences.paused, reduced = context.preferences.reducedMotion;
  let frame = 0, lastFrame = 0, frames = 0, frameMs = 0, soundTail = 0, lastStatus = '';
  let aimPoint: Point = { x: 0, z: 0 }, angle = DEFAULT_CUT_ANGLE, aim: CutLine | null = null, aimDirty = true;
  let pointer: { id: number; gesture: SliceGesture; rect: DOMRect; pulling: boolean; touch: boolean } | null = null, keyboard = false, meshDirty = false;
  const keys = new Set<string>(), raycaster = new THREE.Raycaster(), target = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -view.height);
  function setStatus(message: string) { if (message !== lastStatus) { lastStatus = message; status.textContent = message; } }
  function updateAim() {
    aim = findCut(model, aimPoint, angle); aimDirty = false;
    angleLabel.textContent = `Vertical ${Math.round((angle - DEFAULT_CUT_ANGLE) * 180 / Math.PI)}°`;
  }
  function diagnostics() {
    if (import.meta.env.DEV) canvas.dataset.diagnostics = JSON.stringify({ kind, frames, paused, reduced, pieces: model.pieces.length, cuts: model.cuts,
      moving: model.moving || press.moving, pointer: pointer?.id ?? null, gesture: pointer?.gesture.mode ?? null, keyboard: keys.has('Space'), limit: MAX_PIECES,
      slash: { active: slash.active, samples: slash.count },
      knife: { phase: press.phase, depth: +press.depth.toFixed(4), speed: +press.speed.toFixed(4), pressure: press.pressure, tension: press.tension, resistance: press.resistance, canCut: !!aim },
      frameMs: +frameMs.toFixed(2), area: model.pieces.reduce((sum, p) => sum + area(p.polygon), 0), memory: view.diagnostics, audio: audio.diagnostics, width: canvas.width, height: canvas.height });
  }
  function draw(elapsedMs = 0) {
    if (meshDirty) { view.rebuild(model); meshDirty = false; }
    if (aimDirty && press.phase === 'idle') updateAim();
    const atLimit = model.pieces.length >= MAX_PIECES;
    limitCue.hidden = !atLimit; pieceCount.hidden = model.pieces.length < 2 || atLimit;
    const countText = `${model.pieces.length} / ${MAX_PIECES} pieces`;
    if (pieceCount.textContent !== countText) pieceCount.textContent = countText;
    const swipe = pointer?.gesture.mode === 'swipe' ? pointer : null;
    const now = performance.now(); slash.update(now, reduced);
    stroke.classList.toggle('is-active', slash.active);
    if (strokeContext && (slash.active || strokeDrawn)) {
      strokeContext.clearRect(0, 0, stroke.width / strokeRatio, stroke.height / strokeRatio);
      if (slash.active) drawSlash(strokeContext, slash, context.theme.accent, now, reduced);
    }
    strokeDrawn = slash.active;
    tensionCue.hidden = !pointer?.pulling || press.phase !== 'cutting';
    if (!tensionCue.hidden) {
      const full = press.tension >= .98;
      tensionLabel.textContent = full ? 'Full tension · keep holding' : `${pointer?.touch ? 'Slide' : 'Drag'} down for more tension`;
      tensionCue.classList.toggle('is-full', full);
      tensionMeter.value = press.tension;
    }
    view.update(model, press, swipe || slash.active ? null : aim, reduced); view.render(elapsedMs); frames++; diagnostics();
  }
  function cut(start: Point, end: Point, swipeStrength = 0) {
    const count = model.slice(start, end, reduced, swipeStrength);
    if (count) {
      meshDirty = true; aimDirty = true;
      if (!pointer?.gesture.cut) {
        audio.finish(); soundTail = .85;
        if (pointer && swipeStrength > 0 && !reduced) {
          let x = 0, z = 0, weight = 0;
          for (const piece of model.pieces) if (piece.bornStroke === model.stroke) {
            const c = center(piece.polygon), a = area(piece.polygon);
            x += (c.x + piece.offset.x) * a; z += (c.z + piece.offset.z) * a; weight += a;
          }
          if (weight) {
            target.set(x / weight, view.height * .85, z / weight).project(view.camera);
            const { rect, gesture } = pointer;
            slash.burst((target.x + 1) * rect.width / 2, (1 - target.y) * rect.height / 2,
              gesture.screenEnd.x - gesture.screenStart.x, gesture.screenEnd.y - gesture.screenStart.y, performance.now());
          }
        }
      }
      if (pointer) pointer.gesture.cut = true;
      setStatus(model.pieces.length >= MAX_PIECES ? `${MAX_PIECES} pieces. Reset to cut again.` : `${model.pieces.length} pieces.`);
    }
    return count;
  }
  function flushSwipe() {
    const segment = pointer?.gesture.consume();
    if (segment) cut(segment.start, segment.end, .45 + .55 * Math.min(1, (pointer?.gesture.speed ?? 0) / 2.4));
  }
  function wake() { if (!disposed && !paused && !frame) { lastFrame = 0; frame = requestAnimationFrame(tick); } }
  function tick(now: number) {
    frame = 0; if (disposed || paused) return;
    const elapsedMs = lastFrame ? now - lastFrame : 16.67, dt = Math.min(elapsedMs / 1000, .05); lastFrame = now;
    if (elapsedMs < 150) frameMs = frameMs * .92 + elapsedMs * .08;
    try {
      model.step(dt, reduced);
      pointer?.gesture.advance(now); flushSwipe();
      if (press.step(dt) && press.line) {
        cut(press.line.start, press.line.end);
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
    if (press.moving || model.moving || slash.active || soundTail > 0 || (keys.size && !keys.has('Space'))) frame = requestAnimationFrame(tick);
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
    const finishing = (press.phase === 'complete' || pointer?.gesture.cut) && !immediate;
    const old = pointer; pointer = null;
    tensionCue.hidden = true;
    if (immediate || reduced) { slash.clear(); stroke.classList.remove('is-active'); }
    if (old) { try { if (canvas.hasPointerCapture(old.id)) canvas.releasePointerCapture(old.id); } catch { /* Capture may already be gone. */ } }
    press.release(immediate); keys.delete('Space'); if (!finishing) audio.reset(); soundTail = finishing ? .85 : .25;
    left.disabled = right.disabled = false; aimDirty = true;
    if (active) context.onInteractionChange(false); wake();
  }
  function pointerDown(event: PointerEvent) {
    if (disposed || paused || pointer || press.phase !== 'idle' || event.button !== 0 || !event.isPrimary || model.pieces.length >= MAX_PIECES) return;
    event.preventDefault(); keyboard = false; keys.clear(); aimPoint = point(event); aimDirty = true;
    canvas.classList.add('is-pointer-focused'); canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(event.pointerId); } catch { return; }
    updateAim();
    const canHold = !!aim && model.contains(aimPoint);
    pointer = { id: event.pointerId, gesture: new SliceGesture(aimPoint, { x: event.clientX, y: event.clientY }, event.timeStamp, canHold), rect: canvas.getBoundingClientRect(), pulling: false, touch: event.pointerType === 'touch' };
    slash.begin(event.clientX - pointer.rect.left, event.clientY - pointer.rect.top, event.timeStamp);
    if (canHold) begin();
    else { model.beginStroke(); setStatus('Swipe across the jelly to cut.'); context.onInteractionChange(true); left.disabled = right.disabled = true; wake(); }
  }
  function movePointer(event: PointerEvent) {
    if (!pointer) return;
    const gesture = pointer.gesture;
    gesture.move(point(event), { x: event.clientX, y: event.clientY }, event.timeStamp);
    if (gesture.mode === 'swipe') {
      press.reset(); tensionCue.hidden = true;
      const samples = event.getCoalescedEvents?.() ?? [];
      for (let i = Math.max(0, samples.length - 48); i < samples.length; i++) {
        const sample = samples[i]; slash.add(sample.clientX - pointer.rect.left, sample.clientY - pointer.rect.top, sample.timeStamp);
      }
      slash.add(event.clientX - pointer.rect.left, event.clientY - pointer.rect.top, event.timeStamp);
    }
    else if (gesture.mode === 'hold' && press.phase === 'cutting') {
      const pull = event.clientY - gesture.screenStart.y;
      if (pull > 6 && !pointer.pulling) { pointer.pulling = true; setStatus('Pulling down increases wire tension. Keep holding to cut.'); }
      press.setPressure(.5 + pull / 150);
    }
  }
  function pointerMove(event: PointerEvent) {
    if (disposed || paused) return;
    if (pointer?.id === event.pointerId) {
      event.preventDefault();
      movePointer(event); wake();
    }
    else if (!pointer && !keyboard && press.phase === 'idle' && event.pointerType !== 'touch') { aimPoint = point(event); aimDirty = true; wake(); }
  }
  function pointerUp(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return;
    movePointer(event); flushSwipe();
    if (pointer.gesture.mode === 'swipe' && !pointer.gesture.cut) setStatus('Swipe all the way across a piece to cut.');
    release();
  }
  function pointerCancel(event: PointerEvent) { if (pointer?.id === event.pointerId) release(true); }
  function moveAim(rightward: number, downward: number) {
    aimPoint.x = THREE.MathUtils.clamp(aimPoint.x + rightward * .82 + downward * .57, -2.7, 2.7);
    aimPoint.z = THREE.MathUtils.clamp(aimPoint.z - rightward * .57 + downward * .82, -2.7, 2.7); aimDirty = true;
  }
  function rotate(direction: number) { if (disposed || paused || pointer || press.phase !== 'idle') return; angle += direction * Math.PI / 12; aimDirty = true; wake(); }
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
    release(true); keys.clear(); keyboard = false; model.reset(); meshDirty = true; aimPoint = { x: 0, z: 0 }; angle = DEFAULT_CUT_ANGLE; aimDirty = true;
    audio.reset(); setStatus('Jelly reset.'); draw(); wake();
  }
  function resize() {
    if (disposed) return; release(true); const rect = host.getBoundingClientRect();
    strokeRatio = Math.min(devicePixelRatio || 1, 1.5);
    stroke.width = Math.max(1, Math.round(rect.width * strokeRatio)); stroke.height = Math.max(1, Math.round(rect.height * strokeRatio));
    strokeContext?.setTransform(strokeRatio, 0, 0, strokeRatio, 0, 0); strokeDrawn = false;
    view.resize(Math.max(1, rect.width), Math.max(1, rect.height)); draw(); wake();
  }
  const observer = new ResizeObserver(() => { try { resize(); } catch (error) { dispose(); context.onError(String(error)); } });
  function lost(event: Event) { event.preventDefault(); dispose(); context.onError('Graphics were interrupted. Try again for a fresh block.'); }
  function dispose() {
    if (disposed) return; disposed = true; release(true); keys.clear(); cancelAnimationFrame(frame); observer.disconnect();
    canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('pointercancel', pointerCancel); canvas.removeEventListener('lostpointercapture', pointerCancel);
    canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('keyup', keyUp); canvas.removeEventListener('blur', blur); canvas.removeEventListener('webglcontextlost', lost);
    left.removeEventListener('click', rotateLeft); right.removeEventListener('click', rotateRight); resetButton.removeEventListener('click', reset);
    window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); context.signal.removeEventListener('abort', dispose);
    audio.dispose(); view.dispose(); canvas.remove(); stroke.remove(); status.remove(); angleControl.remove(); pieceCount.remove(); tensionCue.remove(); limitCue.remove();
    stroke.width = stroke.height = 0;
  }
  try {
    view.rebuild(model); resize();
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerCancel); canvas.addEventListener('lostpointercapture', pointerCancel);
    canvas.addEventListener('keydown', keyDown); canvas.addEventListener('keyup', keyUp); canvas.addEventListener('blur', blur); canvas.addEventListener('webglcontextlost', lost);
    left.addEventListener('click', rotateLeft); right.addEventListener('click', rotateRight); resetButton.addEventListener('click', reset);
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
