import test from 'node:test';
import assert from 'node:assert/strict';
import { TideField } from '../src/ascii-tide/model.ts';
import { normalizedPoint, bindFieldInput, MAX_FIELD_SAMPLES, type FieldPointer } from '../src/fields/input.ts';
import { mountField } from '../src/fields/surface.ts';
import type { ToyContext } from '../src/toys/types.ts';
import { fluidColor, createFluid } from '../src/liquid-light/engine.ts';

const pointer = (): FieldPointer => ({ x: .5, y: .5, dx: 0, dy: 0, inside: true, down: true, keyboard: false, samples: [] });

test('tide survives sustained extreme input and returns to its undisturbed shape', () => {
  const tide = new TideField(900, 650), input = pointer();
  for (let i = 0; i < 600; i++) {
    input.x = .5 + Math.sin(i * .08) * .45; input.dx = i % 2 ? 40 : -40;
    tide.step(1 / 30, input, false);
  }
  assert.ok(tide.offsets.some(x => Math.abs(x) > 5));
  assert.ok(tide.offsets.every(x => Number.isFinite(x) && Math.abs(x) <= 650 * .23 * .9 + .001));
  input.inside = false;
  for (let i = 0; i < 600; i++) tide.step(1 / 60, input, false);
  assert.ok(tide.offsets.every(x => Math.abs(x) < .001));
});

test('reduced motion keeps the resting tide still and reset removes all momentum', () => {
  const tide = new TideField(400, 700), input = pointer(); input.inside = false;
  tide.step(1 / 60, input, true); const before = tide.positions.slice();
  for (let i = 0; i < 60; i++) tide.step(1 / 60, input, true);
  assert.deepEqual(tide.positions, before);
  input.inside = true;
  for (let i = 0; i < 60; i++) tide.step(1 / 60, input, true);
  tide.reset(); assert.ok(tide.offsets.every(x => x === 0)); assert.ok(tide.velocity.every(x => x === 0));
});

test('input coordinates account for the surface offset and clamp captured drags', () => {
  const rect = { left: 120, top: 80, width: 400, height: 200 };
  assert.deepEqual(normalizedPoint(320, 130, rect), { x: .5, y: .25 });
  assert.deepEqual(normalizedPoint(-10, 900, rect), { x: 0, y: 1 });
  assert.ok(Number.isFinite(normalizedPoint(0, 0, { ...rect, width: 0 }).x));
});

test('a released between-frame stroke still disturbs the full tide path', () => {
  const tide = new TideField(800, 600), input = pointer();
  input.down = input.inside = false;
  input.samples.push({ x: .85, y: .5, dx: .7, dy: 0, dt: .01, down: true, start: false });
  tide.step(1 / 60, input, true);
  const middle = Math.floor(tide.rows / 2) * tide.columns + Math.floor(tide.columns / 2);
  assert.ok(Math.abs(tide.offsets[middle * 2]) > .1, 'The middle of a fast swipe must move after release');
});

test('tide resizing preserves deformation and reduced motion freezes the current wave phase', () => {
  const tide = new TideField(800, 600), input = pointer();
  for (let i = 0; i < 90; i++) tide.step(1 / 60, input, false);
  const phase = tide.phase;
  const next = tide.resized(390, 844);
  assert.equal(next.phase, phase); assert.ok(next.offsets.some(value => Math.abs(value) > .1));
  input.inside = false;
  next.step(0, input, true); const before = next.positions.slice();
  for (let i = 0; i < 90; i++) next.step(1 / 60, input, true);
  assert.equal(next.phase, phase); assert.deepEqual(next.positions, before);
  next.step(1 / 60, input, false);
  assert.ok(Math.abs(next.phase - phase - .22 / 60) < 1e-8);
});

test('fluid palette cycles continuously without invalid channels', () => {
  for (let i = 0; i < 1000; i++) assert.ok(fluidColor(i / 10).every(x => Number.isFinite(x) && x >= 0 && x <= 1.2));
  const before = fluidColor(25 - .00001), after = fluidColor(25 + .00001);
  assert.ok(before.every((x, i) => Math.abs(x - after[i]) < .0001));
});

class FakeElement extends EventTarget {
  className = ''; tabIndex = 0; hidden = false; width = 0; height = 0;
  style: Record<string, string> = {}; dataset: Record<string, string> = {};
  classList = { toggle() {}, add() {}, remove() {} };
  children: FakeElement[] = []; captures = new Set<number>(); removed = false;
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...items: FakeElement[]) { this.children.push(...items); }
  remove() { this.removed = true; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  focus() {}
  hasPointerCapture(id: number) { return this.captures.has(id); }
  setPointerCapture(id: number) { this.captures.add(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); }
}
function emit(target: EventTarget, type: string, properties: Record<string, unknown>) {
  target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), properties));
}

function inputFixture(run: (canvas: FakeElement, input: ReturnType<typeof bindFieldInput>) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  const canvas = new FakeElement(), input = bindFieldInput(canvas as unknown as HTMLCanvasElement, () => {});
  try { run(canvas, input); }
  finally {
    input.dispose();
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}
const contact = (x: number, id = 1) => ({ isPrimary: true, pointerType: 'touch', pointerId: id, button: 0, clientX: x, clientY: 300 });

test('multiple taps and complete strokes remain distinct until consumed', () => inputFixture((canvas, input) => {
  emit(canvas, 'pointerdown', contact(80)); emit(canvas, 'pointerup', contact(80));
  emit(canvas, 'pointerdown', contact(320)); emit(canvas, 'pointerup', contact(320));
  emit(canvas, 'pointerdown', contact(500)); emit(canvas, 'pointermove', contact(600)); emit(canvas, 'pointerup', contact(720));
  const starts = input.pointer.samples.filter(sample => sample.start);
  assert.deepEqual(starts.map(sample => sample.x), [.1, .4, .625]);
  const segments = input.pointer.samples.filter(sample => !sample.start);
  assert.equal(segments.length, 2); assert.ok(segments.every(sample => sample.down));
  assert.equal(segments.at(-1)!.x, .9); assert.equal(input.pointer.down, false);
}));

test('capture failure does not activate input and the next pointer can recover', () => inputFixture((canvas, input) => {
  const capture = canvas.setPointerCapture.bind(canvas);
  canvas.setPointerCapture = () => { throw new Error('Pointer no longer active'); };
  emit(canvas, 'pointerdown', contact(80));
  assert.equal(input.pointer.down, false); assert.equal(input.pointer.samples.length, 0);
  canvas.setPointerCapture = capture;
  emit(canvas, 'pointerdown', contact(320, 2)); assert.equal(input.pointer.down, true);
  emit(canvas, 'pointercancel', contact(0, 99)); assert.equal(input.pointer.down, true);
  emit(canvas, 'lostpointercapture', contact(320, 2)); assert.equal(input.pointer.down, false);
}));

test('mouse hover cannot redirect keyboard painting and explicit pointer input releases keys', () => inputFixture((canvas, input) => {
  emit(canvas, 'keydown', { code: 'Space' }); emit(canvas, 'keydown', { code: 'ArrowRight' });
  input.advance(.1); const x = input.pointer.x;
  emit(canvas, 'pointermove', contact(5));
  assert.equal(input.pointer.x, x); assert.equal(input.pointer.keyboard, true);
  emit(canvas, 'pointerdown', contact(600)); emit(canvas, 'pointerup', contact(600));
  const after = input.pointer.x; input.advance(.1);
  assert.equal(input.pointer.x, after); assert.equal(input.pointer.down, false);
  emit(canvas, 'keydown', { code: 'Space', ctrlKey: true }); assert.equal(input.pointer.down, false);
  emit(canvas, 'keydown', { code: 'ArrowLeft' }); emit(canvas, 'keyup', { code: 'ArrowLeft' });
  emit(canvas, 'pointermove', contact(160));
  assert.equal(input.pointer.keyboard, false); assert.equal(input.pointer.x, .2);
}));

test('an input flood stays bounded and preserves the latest position', () => inputFixture((canvas, input) => {
  emit(canvas, 'pointerdown', contact(10));
  for (let i = 0; i < 1000; i++) emit(canvas, 'pointermove', contact(10 + i % 780));
  assert.ok(input.pointer.samples.length <= MAX_FIELD_SAMPLES);
  assert.equal(input.pointer.samples.at(-1)!.x, (10 + 999 % 780) / 800);
  emit(canvas, 'blur', {}); assert.equal(input.pointer.samples.length, 0);
}));

test('quick taps survive between frames; cancellation and disposal release input', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  try {
    const canvas = new FakeElement(); let notifications = 0;
    const input = bindFieldInput(canvas as unknown as HTMLCanvasElement, () => notifications++);
    const event = { isPrimary: true, pointerType: 'touch', pointerId: 1, button: 0, clientX: 200, clientY: 300 };
    emit(canvas, 'pointerdown', event); emit(canvas, 'pointerup', event);
    emit(canvas, 'lostpointercapture', event);
    assert.equal(input.pointer.down, false); assert.equal(input.pointer.samples.filter(sample => sample.start).length, 1);
    assert.equal(canvas.captures.size, 0);
    emit(canvas, 'pointerdown', event); emit(canvas, 'pointercancel', event);
    assert.equal(input.pointer.samples.length, 0); assert.equal(input.pointer.down, false);
    input.setEnabled(false); emit(canvas, 'pointerdown', event); assert.equal(input.pointer.down, false);
    input.setEnabled(true);
    emit(canvas, 'keydown', { code: 'Space', repeat: false });
    emit(canvas, 'keydown', { code: 'ArrowRight', repeat: false });
    const previousX = input.pointer.x;
    input.advance(.1); assert.ok(input.pointer.x > previousX); assert.equal(input.pointer.down, true);
    emit(canvas, 'blur', {}); assert.equal(input.pointer.down, false);
    input.dispose(); input.dispose(); const count = notifications;
    emit(canvas, 'pointerdown', event); assert.equal(notifications, count);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

/** Resource accounting mock: actual shader compilation is checked in the browser. */
function graphicsDevice() {
  const resources = new Set<object>(); let sequence = 0, contextLosses = 0;
  let framebuffers = 0, failAt = Infinity;
  const constants = new Map<string, number>();
  const create = () => { const handle = { id: ++sequence }; resources.add(handle); return handle; };
  const remove = (handle: object) => resources.delete(handle);
  const methods: Record<string, (...args: any[]) => any> = {
    createShader: create, createProgram: create, createTexture: create, createFramebuffer: () => { framebuffers++; return create(); }, createVertexArray: create,
    deleteShader: remove, deleteProgram: remove, deleteTexture: remove, deleteFramebuffer: remove, deleteVertexArray: remove,
    getShaderParameter: () => true,
    getProgramParameter: (_: object, parameter: number) => parameter === constants.get('ACTIVE_UNIFORMS') ? 0 : true,
    getExtension: (name: string) => name === 'WEBGL_lose_context' ? { loseContext: () => contextLosses++ } : {},
    checkFramebufferStatus: () => framebuffers >= failAt ? -1 : constants.get('FRAMEBUFFER_COMPLETE'),
  };
  const gl = new Proxy({}, {
    get(_target, key: string) {
      if (/^[A-Z0-9_]+$/.test(key)) { if (!constants.has(key)) constants.set(key, constants.size + 1); return constants.get(key); }
      return methods[key] ?? (() => {});
    },
  }) as WebGL2RenderingContext;
  void gl.FRAMEBUFFER_COMPLETE;
  const canvas = { width: 1, height: 1, getContext: () => gl } as unknown as HTMLCanvasElement;
  return { canvas, resources, contextLosses: () => contextLosses, failAfter: (count: number) => { failAt = framebuffers + count; } };
}

test('fluid resizing replaces its graphics resources and disposal releases the context once', () => {
  const device = graphicsDevice(), engine = createFluid(device.canvas);
  engine.resize(1000, 700, 1); const baseline = device.resources.size;
  assert.ok(baseline > 0);
  for (const [w, h] of [[390, 844], [1440, 900], [320, 600]]) {
    engine.resize(w, h, 1.5); engine.reset(true); engine.draw(1 / 60, 2, pointer(), true);
    assert.equal(device.resources.size, baseline);
  }
  engine.dispose(); engine.dispose();
  assert.equal(device.resources.size, 0); assert.equal(device.contextLosses(), 1);
});

test('partial fluid allocation failures release both old and new resources', () => {
  const device = graphicsDevice(), engine = createFluid(device.canvas);
  engine.resize(1000, 700, 1); device.failAfter(3);
  assert.throws(() => engine.resize(390, 844, 1), /floating-point textures/);
  engine.dispose(); assert.equal(device.resources.size, 0);
});

test('unsupported fluid graphics produces an actionable error', () => {
  assert.throws(() => createFluid({ getContext: () => null } as unknown as HTMLCanvasElement), /WebGL 2/);
});

test('field surface pauses, aborts, and cleans up its engine exactly once', () => {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const frames = new Map<number, FrameRequestCallback>(); let id = 0, disconnects = 0, draws = 0, resets = 0, disposals = 0;
  let resizeCallback = () => {}, width = 800, lastDown = false;
  const globals: Record<string, unknown> = {
    document: { createElement: () => new FakeElement(), activeElement: null }, window: new EventTarget(), devicePixelRatio: 2,
    ResizeObserver: class { constructor(callback:()=>void) { resizeCallback = callback; } observe() {} disconnect() { disconnects++; } },
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (key: number) => frames.delete(key),
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  try {
    const host = new FakeElement(), abort = new AbortController();
    host.getBoundingClientRect = () => ({left:0,top:0,width,height:600});
    const context: ToyContext = { signal: abort.signal, preferences: { paused: false, reducedMotion: false, sound: false }, theme: { background: '#000', foreground: '#fff', accent: '#fff', muted: '#aaa', surface: '#111', border: '#333' }, onInteractionChange() {}, onError(message: string) { throw new Error(message); } };
    const controller = mountField(host as unknown as HTMLElement, context, 'Test field', () => ({
      releaseInputOnResize: true,
      resize() {}, draw(_dt,_time,pointer) { draws++; lastDown = pointer.down; }, reset() { resets++; }, dispose() { disposals++; },
    }))!;
    assert.equal(frames.size, 1); assert.equal(resets, 1);
    const canvas = host.children[0];
    emit(canvas,'pointerdown',contact(400));resizeCallback();
    assert.ok(lastDown && canvas.captures.size === 1,'A redundant resize must preserve the grip');
    width=390;resizeCallback();
    assert.equal(lastDown,false,'A perspective resize must release input before rendering');
    assert.equal(canvas.captures.size,0,'Resizing must release the browser capture');
    controller.setPaused!(true); assert.equal(frames.size, 0);
    controller.setPaused!(false); assert.equal(frames.size, 1);
    controller.reset(); assert.equal(resets, 2); assert.ok(draws >= 3);
    abort.abort(); controller.dispose();
    assert.equal(frames.size, 0); assert.equal(disposals, 1); assert.equal(disconnects, 1);
    assert.ok(host.children.every(child => child.removed));
    assert.equal(mountField(host as unknown as HTMLElement, context, 'Canceled', () => { throw new Error('must not create'); }), null);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
