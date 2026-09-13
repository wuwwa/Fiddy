import { AdditiveBlending, Group, PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer, type Vector3 } from 'three';
import type { ToyContext, ToyController } from '../toys/types';
import { createCursorPathTexture, createStars, type AstraShape } from './geometry';
import { RotationMotion, trackballPoint } from './rotation';
import { starFragment, starVertex } from './shaders';
import { cursorOutline, type Outline } from './paths';
import { createOutlineStudio, DEFAULT_FLOW_SPEED, loadStudioState, studioOutline } from './studio';
import './style.css';

export async function mountAstra(host: HTMLElement, context: ToyContext, shape: AstraShape, options: {persistStudio?: boolean} = {}): Promise<ToyController | null> {
  if (context.signal.aborted) return null;
  const wrapper = document.createElement('div');
  wrapper.className = `astra-surface astra-${shape}`;
  const canvas = document.createElement('canvas');
  canvas.className = 'toy-canvas astra-canvas';
  canvas.tabIndex = 0; canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', `Interactive ${shape === 'swirl' ? 'inward star spiral' : 'starlight cursor'}. Drag to rotate. Arrow keys rotate, Q and E roll, plus and minus zoom, Space pauses motion, R resets.`);
  canvas.setAttribute('aria-describedby', 'toy-instructions keyboard-instructions');
  const tabs = document.createElement('nav');
  tabs.className = 'astra-switch'; tabs.setAttribute('aria-label', 'Starlight experiences');
  for (const [id, title] of [['swirl', 'Swirl'], ['cursor', 'Shapes']]) {
    const link = document.createElement('a');
    const params = new URLSearchParams(location.search); params.set('toy', `astra-${id}`);
    link.href = `?${params}`; link.textContent = title;
    if (id === shape) link.setAttribute('aria-current', 'page');
    tabs.append(link);
  }
  const controls = document.createElement('div'); controls.className = 'astra-motion-controls';
  const motionButton = document.createElement('button'); motionButton.type = 'button';
  const zoomOut = document.createElement('button'); zoomOut.type = 'button'; zoomOut.textContent = '−'; zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomIn = document.createElement('button'); zoomIn.type = 'button'; zoomIn.textContent = '+'; zoomIn.setAttribute('aria-label', 'Zoom in');
  const zoomLabel = document.createElement('span'); zoomLabel.className = 'astra-zoom-label'; zoomLabel.textContent = 'View';
  controls.append(motionButton, zoomLabel, zoomOut, zoomIn);
  const caption = document.createElement('div'); caption.className = 'astra-caption';
  caption.innerHTML = `<span>STARLIGHT STUDIES</span><span>${shape === 'swirl' ? '01 / Into the spiral' : '02 / A point in space'}</span>`;
  wrapper.append(canvas, tabs, controls, caption); host.append(wrapper);

  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' }); }
  catch { wrapper.remove(); throw new Error('This star field needs WebGL2. Try a browser with hardware acceleration enabled.'); }
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene(), camera = new PerspectiveCamera(45, 1, .1, 80);
  camera.position.z = 8.8;
  const sculpture = new Group();
  sculpture.position.set(shape === 'cursor' ? -.12 : 0, shape === 'cursor' ? .28 : .10, 0);
  sculpture.scale.setScalar(shape === 'swirl' ? .86 : 1.33); scene.add(sculpture);
  const studioState = shape === 'cursor' ? loadStudioState(options.persistStudio !== false) : null;
  let outline = studioState ? studioOutline(studioState) : cursorOutline;
  function frameOutline() {
    if (shape !== 'cursor') return;
    sculpture.scale.setScalar(outline.id === 'cursor' ? 1.28 : 1.14);
    sculpture.position.set(outline.id === 'cursor' ? -.12 : 0, outline.id === 'cursor' ? .28 : .10, 0);
  }
  frameOutline();
  let artwork = createStars(shape, false, outline);
  const backdrop = createStars(shape, true);
  let cursorPath = shape === 'cursor' ? createCursorPathTexture(outline) : null;
  const materials: ShaderMaterial[] = [];
  const makeMaterial = (halo: boolean, background: boolean) => {
    const material = new ShaderMaterial({
      vertexShader: starVertex, fragmentShader: starFragment,
      uniforms: {
        uTime: { value: 0 }, uPixelRatio: { value: 1 }, uScale: { value: 1 },
        uHalo: { value: halo ? 1 : 0 }, uEnergy: { value: background ? .8 : 1 },
        uSwirl: { value: !background && shape === 'swirl' ? 1 : 0 },
        uCursor: { value: !background && shape === 'cursor' ? 1 : 0 }, uCursorPath: { value: cursorPath },
        uPathCount: { value: outline.paths.length }, uCursorMask: { value: outline.id === 'cursor' ? 1 : 0 }, uFlowDistance: { value: 0 },
      },
      transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending, vertexColors: true,
    });
    materials.push(material); return material;
  };
  scene.add(new Points(backdrop, makeMaterial(false, true)));
  scene.add(new Points(backdrop, makeMaterial(true, true)));
  const haloPoints = new Points(artwork, makeMaterial(true, false)), corePoints = new Points(artwork, makeMaterial(false, false));
  sculpture.add(haloPoints, corePoints);
  const rotation = new RotationMotion();
  const keys = new Set<string>(), listeners: Array<() => void> = [];
  let width = 1, height = 1, zoom = 1, frame = 0, lastFrame = 0, clock = 0, frames = 0;
  let disposed = false, paused = context.preferences.paused, reduced = context.preferences.reducedMotion;
  let flowDistance = 0, flowSpeed = studioState?.speed ?? 1, editing = false;
  let ambient = !reduced, dragging: number | null = null, previous: Vector3 | null = null;
  let lastMove = 0, lastInput = 0, interactive = false;
  function listen(target: EventTarget, name: string, callback: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(name, callback, options);
    listeners.push(() => target.removeEventListener(name, callback, options));
  }
  function setInteracting(value: boolean) {
    if (value === interactive) return;
    interactive = value; context.onInteractionChange(value);
  }
  function updateMotionButton() {
    motionButton.textContent = ambient ? 'Ⅱ Pause' : '▷ Play';
    motionButton.setAttribute('aria-label', ambient ? 'Pause starlight motion' : 'Play starlight motion');
    motionButton.setAttribute('aria-pressed', String(ambient));
  }
  function wake() {
    if (!disposed && !paused && !frame) frame = requestAnimationFrame(tick);
  }
  function clearInput() {
    const id = dragging; dragging = null; previous = null; keys.clear(); rotation.velocity.set(0, 0, 0);
    try { if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch { /* Capture may have already been canceled by the browser. */ }
    canvas.classList.remove('is-grabbing'); setInteracting(false);
  }
  function setZoom(value: number) {
    zoom = Math.max(.72, Math.min(1.5, value));
    zoomOut.disabled = zoom <= .72001; zoomIn.disabled = zoom >= 1.49999;
    camera.position.z = 8.8 * Math.max(1, .88 / (width / height)) / zoom;
    wake();
  }
  function reset() {
    if (disposed) return;
    clearInput(); rotation.reset(); clock = 0; flowDistance = 0; setZoom(1); wake();
  }
  function toggleMotion() {
    ambient = !ambient; updateMotionButton();
    if (!ambient) rotation.velocity.set(0, 0, 0);
    wake();
  }
  function resize() {
    if (disposed) return;
    const rect = host.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    materials.forEach(material => {
      material.uniforms.uPixelRatio.value = pixelRatio;
      material.uniforms.uScale.value = Math.max(.72, Math.min(1.15, height / 760));
    });
    // Resize cancels a grip whose screen-space anchor no longer exists, preserving orientation.
    clearInput(); setZoom(zoom); wake();
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || paused) return;
    const dt = Math.min(.05, lastFrame ? (now - lastFrame) / 1000 : 1 / 60); lastFrame = now;
    if (ambient && !editing) { clock += dt; flowDistance += dt * DEFAULT_FLOW_SPEED * flowSpeed; }
    if (dragging === null) {
      if (!reduced) rotation.step(dt);
      const speed = dt * 1.3;
      rotation.rotate((Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'))) * speed,
        (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * speed,
        (Number(keys.has('KeyQ')) - Number(keys.has('KeyE'))) * speed);
    }
    sculpture.quaternion.copy(rotation.orientation);
    materials.forEach(material => { material.uniforms.uTime.value = clock; material.uniforms.uFlowDistance.value = flowDistance; });
    renderer.render(scene, camera); frames++;
    if (import.meta.env.DEV) canvas.dataset.diagnostics = JSON.stringify({
      shape, frames, particles: artwork.getAttribute('position').count + backdrop.getAttribute('position').count,
      orientation: rotation.orientation.toArray(), velocity: rotation.velocity.length(), zoom,
      dragging: dragging !== null, paused, ambient, reducedMotion: reduced, clock,
      geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0,
      width, height, outline: outline.id, strokes: outline.paths.length, flowDistance, flowSpeed, editing,
      textures: renderer.info.memory.textures,
    });
    if ((ambient && !editing) || dragging !== null || keys.size || rotation.velocity.lengthSq() > .000004) wake();
  }

  listen(canvas, 'pointerdown', ((event: PointerEvent) => {
    if (paused || disposed || editing || dragging !== null || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); clearInput();
    try { canvas.setPointerCapture(event.pointerId); } catch { return; }
    const rect = canvas.getBoundingClientRect();
    dragging = event.pointerId; previous = trackballPoint(event.clientX - rect.left, event.clientY - rect.top, width, height);
    lastMove = lastInput = event.timeStamp; canvas.classList.add('is-grabbing', 'is-pointer-focused');
    canvas.focus({ preventScroll: true }); setInteracting(true); wake();
  }) as EventListener);
  function move(event: PointerEvent) {
    if (event.pointerId !== dragging || !previous || disposed || paused) return;
    const rect = canvas.getBoundingClientRect();
    const next = trackballPoint(event.clientX - rect.left, event.clientY - rect.top, width, height);
    if (next.distanceToSquared(previous) < 1e-10) return;
    rotation.drag(previous, next, Math.max(1 / 120, (event.timeStamp - lastMove) / 1000));
    previous.copy(next); lastMove = lastInput = event.timeStamp; wake();
  }
  listen(canvas, 'pointermove', move as EventListener);
  listen(canvas, 'pointerup', ((event: PointerEvent) => {
    if (event.pointerId !== dragging) return;
    move(event);
    const velocity = rotation.velocity.clone();
    const coast = !reduced && event.timeStamp - lastInput < 90;
    clearInput(); if (coast) rotation.velocity.copy(velocity); wake();
  }) as EventListener);
  for (const name of ['pointercancel', 'lostpointercapture']) listen(canvas, name, ((event: PointerEvent) => { if (event.pointerId === dragging) { clearInput(); wake(); } }) as EventListener);
  const rotationKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyE'];
  listen(canvas, 'keydown', ((event: KeyboardEvent) => {
    if (paused || disposed || editing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (![...rotationKeys, 'Space', 'KeyR', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Home'].includes(event.code)) return;
    event.preventDefault(); canvas.classList.remove('is-pointer-focused');
    if (rotationKeys.includes(event.code)) {
      if (dragging !== null) clearInput();
      rotation.velocity.set(0, 0, 0); keys.add(event.code); setInteracting(true); wake();
      if (!event.repeat) rotation.rotate(event.code === 'ArrowDown' ? .055 : event.code === 'ArrowUp' ? -.055 : 0,
        event.code === 'ArrowRight' ? .055 : event.code === 'ArrowLeft' ? -.055 : 0,
        event.code === 'KeyQ' ? .055 : event.code === 'KeyE' ? -.055 : 0);
    } else if (!event.repeat) {
      if (event.code === 'Space') toggleMotion();
      else if (['KeyR', 'Home'].includes(event.code)) reset();
      else setZoom(zoom * (['Equal', 'NumpadAdd'].includes(event.code) ? 1.1 : 1 / 1.1));
    }
  }) as EventListener);
  listen(canvas, 'keyup', ((event: KeyboardEvent) => {
    if (!keys.has(event.code)) return;
    event.preventDefault(); keys.delete(event.code); setInteracting(keys.size > 0); wake();
  }) as EventListener);
  listen(canvas, 'blur', () => { clearInput(); wake(); });
  listen(window, 'blur', () => { clearInput(); wake(); });
  listen(canvas, 'wheel', ((event: WheelEvent) => {
    if (disposed || paused || editing || event.ctrlKey) return;
    event.preventDefault(); setZoom(zoom * Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * .0015));
  }) as EventListener, { passive: false });
  listen(motionButton, 'click', toggleMotion);
  listen(zoomOut, 'click', () => setZoom(zoom / 1.12)); listen(zoomIn, 'click', () => setZoom(zoom * 1.12));
  listen(canvas, 'webglcontextlost', ((event: Event) => {
    event.preventDefault(); if (!disposed) context.onError('The graphics connection was interrupted. Use Try again to restore the star field.');
  }) as EventListener);
  function updateOutlineLabel() {
    caption.lastElementChild!.textContent = `02 / ${outline.name}`;
    canvas.setAttribute('aria-label', `Interactive starlight ${outline.name.toLowerCase()}. Drag to rotate. Arrow keys rotate, Q and E roll, plus and minus zoom, Space pauses motion, R resets.`);
  }
  function setOutline(next: Outline) {
    if (disposed) return;
    const nextArtwork = createStars('cursor', false, next), nextPath = createCursorPathTexture(next);
    haloPoints.geometry = corePoints.geometry = nextArtwork;
    materials.forEach(material => {
      material.uniforms.uCursorPath.value = nextPath;
      material.uniforms.uPathCount.value = next.paths.length;
      material.uniforms.uCursorMask.value = next.id === 'cursor' ? 1 : 0;
    });
    artwork.dispose(); cursorPath?.dispose(); artwork = nextArtwork; cursorPath = nextPath; outline = next;
    frameOutline(); updateOutlineLabel(); reset();
  }
  const studio = studioState ? createOutlineStudio(wrapper, studioState, {
    onOutline: setOutline,
    onSpeed(value) { flowSpeed = value; wake(); },
    onEditing(value) { editing = value; clearInput(); lastFrame = 0; canvas.tabIndex = value ? -1 : 0; wake(); },
  }, options.persistStudio !== false) : null;
  if (studioState) updateOutlineLabel();
  const observer = new ResizeObserver(resize); observer.observe(host);
  const dispose = () => {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); frame = 0; clearInput(); observer.disconnect();
    listeners.splice(0).forEach(remove => remove()); context.signal.removeEventListener('abort', dispose);
    studio?.dispose(); artwork.dispose(); backdrop.dispose(); cursorPath?.dispose(); materials.forEach(material => material.dispose());
    renderer.dispose(); renderer.forceContextLoss(); wrapper.remove();
  };
  context.signal.addEventListener('abort', dispose, { once: true });
  if (context.signal.aborted) { dispose(); return null; }
  updateMotionButton(); resize();
  // Mount resolves only after rendering usable artwork; no reveal timer or remote assets.
  renderer.render(scene, camera);
  return {
    reset, dispose,
    setPaused(value) {
      if (disposed) return;
      paused = value; clearInput(); cancelAnimationFrame(frame); frame = 0; lastFrame = 0;
      if (!paused) wake();
    },
    setReducedMotion(value) {
      if (disposed) return;
      reduced = value; if (value) { ambient = false; rotation.velocity.set(0, 0, 0); }
      updateMotionButton(); wake();
    },
  };
}
