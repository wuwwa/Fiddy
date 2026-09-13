export interface FieldSample {
  x: number;
  y: number;
  dx: number;
  dy: number;
  dt: number;
  down: boolean;
  start: boolean;
}

export interface FieldPointer {
  x: number;
  y: number;
  dx: number;
  dy: number;
  down: boolean;
  inside: boolean;
  keyboard: boolean;
  samples: FieldSample[];
}

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const MAX_FIELD_SAMPLES = 64;

export function normalizedPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return {
    x: clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1),
    y: clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1),
  };
}

/** Retains complete taps and stroke segments until a simulation frame consumes them. */
export function bindFieldInput(canvas: HTMLCanvasElement, onChange: (active: boolean) => void) {
  const pointer: FieldPointer = { x: .5, y: .5, dx: 0, dy: 0, down: false, inside: false, keyboard: false, samples: [] };
  const keys = new Set<string>();
  const listeners: Array<() => void> = [];
  let pointerId: number | null = null, lastStamp = 0;
  let enabled = true, disposed = false;
  function listen(target: EventTarget, name: string, handler: EventListener) {
    target.addEventListener(name, handler);
    listeners.push(() => target.removeEventListener(name, handler));
  }
  function held(value: boolean) {
    if (pointer.down === value) return;
    pointer.down = value; onChange(value);
  }
  function releaseCapture() {
    const captured = pointerId;
    pointerId = null;
    // A browser may already have invalidated a canceled pointer.
    try { if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured); }
    catch { /* Ownership is already cleared; the next gesture may acquire it. */ }
  }
  function release() {
    releaseCapture(); keys.clear(); held(false);
    pointer.inside = false; pointer.keyboard = false;
    pointer.dx = pointer.dy = 0; lastStamp = 0;
  }
  function clear() { release(); pointer.samples.length = 0; }
  function enqueue(start: boolean, dx: number, dy: number, dt: number) {
    if (!start && dx === 0 && dy === 0) return;
    if (pointer.samples.length >= MAX_FIELD_SAMPLES) {
      // Under an event flood, merge adjacent segments before sacrificing an old tap.
      const index = pointer.samples.findIndex((sample, i, list) => i > 0 && !sample.start && !list[i - 1].start && sample.down === list[i - 1].down);
      if (index > 0) {
        const previous = pointer.samples[index - 1], next = pointer.samples[index];
        next.dx += previous.dx; next.dy += previous.dy; next.dt += previous.dt;
        pointer.samples.splice(index - 1, 1);
      } else pointer.samples.shift();
    }
    pointer.samples.push({ x: pointer.x, y: pointer.y, dx, dy, dt: clamp(dt, 1 / 240, 1 / 15), down: pointer.down, start });
  }
  function locate(event: PointerEvent, sample: boolean) {
    const point = normalizedPoint(event.clientX, event.clientY, canvas.getBoundingClientRect());
    const dx = pointer.inside ? point.x - pointer.x : 0, dy = pointer.inside ? point.y - pointer.y : 0;
    pointer.x = point.x; pointer.y = point.y; pointer.inside = true;
    pointer.dx += dx; pointer.dy += dy;
    if (sample) enqueue(false, dx, dy, lastStamp ? (event.timeStamp - lastStamp) / 1000 : 1 / 60);
    lastStamp = event.timeStamp;
  }
  listen(canvas, 'pointerdown', ((event: PointerEvent) => {
    if (!enabled || disposed || !event.isPrimary || event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    release(); locate(event, false);
    // Capture must succeed before this gesture becomes active.
    try { canvas.setPointerCapture(event.pointerId); }
    catch { release(); return; }
    pointerId = event.pointerId;
    held(true); enqueue(true, 0, 0, 1 / 60);
    canvas.classList.add('is-pointer-focused');
    canvas.focus({ preventScroll: true });
  }) as EventListener);
  listen(canvas, 'pointermove', ((event: PointerEvent) => {
    if (!enabled || disposed || !event.isPrimary || (pointerId !== null && pointerId !== event.pointerId)) return;
    // Hovering a mouse must not redirect a keyboard-held stroke.
    if (pointer.keyboard) {
      if (keys.size || pointer.down) return;
      pointer.keyboard = false; pointer.inside = false;
    }
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const sample of coalesced.slice(-MAX_FIELD_SAMPLES)) locate(sample, true);
    locate(event, true);
  }) as EventListener);
  listen(canvas, 'pointerup', ((event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    locate(event, true); release();
  }) as EventListener);
  listen(canvas, 'pointercancel', ((event: PointerEvent) => { if (event.pointerId === pointerId) clear(); }) as EventListener);
  listen(canvas, 'lostpointercapture', ((event: PointerEvent) => { if (event.pointerId === pointerId) clear(); }) as EventListener);
  listen(canvas, 'pointerleave', (() => { if (!pointer.down && !pointer.keyboard) pointer.inside = false; }));
  listen(canvas, 'blur', clear);
  listen(window, 'blur', clear);
  listen(canvas, 'keydown', ((event: KeyboardEvent) => {
    if (!enabled || disposed || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) return;
    event.preventDefault();
    if (!pointer.keyboard) release();
    pointer.keyboard = true; pointer.inside = true;
    canvas.classList.remove('is-pointer-focused');
    const starting = event.code === 'Space' && !keys.has('Space');
    keys.add(event.code); held(keys.has('Space'));
    if (starting) enqueue(true, 0, 0, 1 / 60);
  }) as EventListener);
  listen(canvas, 'keyup', ((event: KeyboardEvent) => {
    if (!keys.has(event.code)) return;
    event.preventDefault(); keys.delete(event.code); held(keys.has('Space'));
  }) as EventListener);
  return {
    pointer,
    advance(dt: number) {
      if (!enabled || disposed || !pointer.keyboard || dt <= 0) return;
      const oldX = pointer.x, oldY = pointer.y;
      pointer.x = clamp(pointer.x + ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * dt * .38, .02, .98);
      pointer.y = clamp(pointer.y + ((keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0)) * dt * .38, .02, .98);
      const dx = pointer.x - oldX, dy = pointer.y - oldY;
      pointer.dx += dx; pointer.dy += dy; enqueue(false, dx, dy, dt);
    },
    clear,
    setEnabled(value: boolean) { enabled = value && !disposed; if (!enabled) clear(); },
    dispose() {
      if (disposed) return;
      disposed = true; clear(); listeners.splice(0).forEach(remove => remove());
    },
  };
}
