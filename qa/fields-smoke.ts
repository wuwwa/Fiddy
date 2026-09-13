import { mount as mountTide } from '../src/ascii-tide/entry';
import { createFluid } from '../src/liquid-light/engine';
import { ToySession } from '../src/player/ToySession';
import { liquidLight } from '../src/toys/liquid-light';
import type { FieldPointer } from '../src/fields/input';
import type { ToyContext } from '../src/toys/types';

const host = document.querySelector<HTMLDivElement>('#surface')!;
const output = document.querySelector<HTMLPreElement>('#results')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const results: Array<{ name: string; details?: unknown }> = [];
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function frames(count: number) { for (let i = 0; i < count; i++) await frame(); }
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function report(name: string, details?: unknown) {
  results.push({ name, details }); output.textContent = JSON.stringify({ status: 'running', checks: results }, null, 2);
}
const idle = (): FieldPointer => ({ x: .5, y: .5, dx: 0, dy: 0, down: false, inside: false, keyboard: false, samples: [] });
function differences(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let changed = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 2) changed++;
  return changed;
}

async function checkTide() {
  const abort = new AbortController(), errors: string[] = [], activity: boolean[] = [];
  const context: ToyContext = { signal: abort.signal, preferences: { reducedMotion: true, paused: false, sound: false }, theme: liquidLight.theme,
    onInteractionChange: value => activity.push(value), onError: value => errors.push(value) };
  const controller = (await mountTide(host, context))!;
  try {
    await frames(3);
    const canvas = host.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
    const pixels = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const initial = pixels(); await frames(4);
    check(differences(initial, pixels()) === 0, 'Reduced-motion tide moved without input');
    report('Reduced-motion tide remains pixel-stable at rest');
    // Synthetic PointerEvents cannot acquire browser capture. Substitute capture only
    // on this QA surface; the real capture failure path is covered in unit tests.
    const captures = new Set<number>();
    canvas.setPointerCapture = id => { captures.add(id); };
    canvas.hasPointerCapture = id => captures.has(id);
    canvas.releasePointerCapture = id => { captures.delete(id); };
    function touch(type: string, x: number, y: number) {
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 101, pointerType: 'touch', isPrimary: true,
        button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: rect.left + x * rect.width, clientY: rect.top + y * rect.height }));
    }
    touch('pointerdown', .2, .5); touch('pointermove', .5, .5); touch('pointerup', .8, .5);
    await frames(3);
    check(differences(initial, pixels()) > 100, 'Between-frame touch stroke did not visibly disturb tide');
    check(captures.size === 0 && activity.at(-1) === false, 'Touch release retained a hold');
    report('Complete synthetic touch swipe produces visible deformation after release');
    touch('pointerdown', .4, .4); controller.setPaused!(true);
    const pausedFrame = JSON.parse(canvas.dataset.diagnostics!).frames;
    await frames(4);
    check(JSON.parse(canvas.dataset.diagnostics!).frames === pausedFrame, 'Paused tide still renders');
    check(captures.size === 0, 'Pause retained pointer capture');
    controller.setPaused!(false); await frames(3);
    check(JSON.parse(canvas.dataset.diagnostics!).frames > pausedFrame, 'Tide did not resume');
    controller.reset(); check(differences(initial, pixels()) === 0, 'Tide reset did not reproduce initial image');
    report('Pause cancels touch capture, resume restarts, and reset reproduces original pixels');
    controller.setReducedMotion!(false); await frames(6);
    check(differences(initial, pixels()) > 50, 'Normal tide has no ambient motion');
    controller.setReducedMotion!(true); await frames(2);
    const frozen = pixels(); await frames(5);
    check(differences(frozen, pixels()) === 0, 'Changing to reduced motion did not freeze the wave');
    report('Live reduced-motion preference changes freeze the current wave');
    abort.abort(); controller.dispose();
    check(host.querySelectorAll('canvas').length === 0, 'Aborted tide left a canvas');
    check(errors.length === 0, errors.join('; '));
    report('Tide abort/dispose removes its surface without runtime errors');
  } finally { controller.dispose(); }
}

function trackGraphics(gl: WebGL2RenderingContext) {
  const objects = new Set<object>(), buffers = new Set<WebGLFramebuffer>();
  const sizes = new Map<WebGLTexture, [number, number]>(), attachments = new Map<WebGLFramebuffer, WebGLTexture>();
  let texture: WebGLTexture | null = null, buffer: WebGLFramebuffer | null = null;
  // The harness owns this context. These wrappers count real allocations/deletions.
  for (const kind of ['Texture', 'Framebuffer', 'Program', 'Shader', 'VertexArray'] as const) {
    const api = gl as any, create = api[`create${kind}`].bind(gl), remove = api[`delete${kind}`].bind(gl);
    api[`create${kind}`] = (...args: unknown[]) => { const object = create(...args); if (object) { objects.add(object); if (kind === 'Framebuffer') buffers.add(object); } return object; };
    api[`delete${kind}`] = (object: object) => { objects.delete(object); if (kind === 'Framebuffer') buffers.delete(object as WebGLFramebuffer); remove(object); };
  }
  const bindTexture = gl.bindTexture.bind(gl), bindFramebuffer = gl.bindFramebuffer.bind(gl), texImage = gl.texImage2D.bind(gl), attach = gl.framebufferTexture2D.bind(gl);
  gl.bindTexture = (target, value) => { texture = value; bindTexture(target, value); };
  gl.bindFramebuffer = (target, value) => { buffer = value; bindFramebuffer(target, value); };
  gl.texImage2D = ((...args: any[]) => { if (texture && args.length === 9) sizes.set(texture, [args[3], args[4]]); (texImage as any)(...args); }) as typeof gl.texImage2D;
  gl.framebufferTexture2D = (target, attachment, textarget, value, level) => { if (buffer && value) attachments.set(buffer, value); attach(target, attachment, textarget, value, level); };
  function inspect() {
    let channels = 0, maxMagnitude = 0;
    for (const fbo of buffers) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      const [width, height] = sizes.get(attachments.get(fbo)!)!;
      const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
      if (type === gl.FLOAT) {
        const values = new Float32Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, type, values);
        for (const value of values) { check(Number.isFinite(value), 'Non-finite fluid buffer value'); maxMagnitude = Math.max(maxMagnitude, Math.abs(value)); }
        channels += values.length;
      } else if (type === gl.HALF_FLOAT) {
        const values = new Uint16Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, type, values);
        for (const value of values) {
          check((value & 0x7c00) !== 0x7c00, 'Non-finite half-float fluid buffer value');
          const exponent = (value >>> 10) & 31, fraction = value & 1023;
          maxMagnitude = Math.max(maxMagnitude, exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15));
        }
        channels += values.length;
      } else throw new Error(`Cannot validate float buffers with read type ${type}`);
      check(gl.getError() === gl.NO_ERROR, 'Graphics error while inspecting fluid buffers');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { buffers: buffers.size, channels, maxMagnitude };
  }
  return { objects, inspect };
}

async function checkFluid() {
  const canvas = document.createElement('canvas'); canvas.style.width = '100%'; canvas.style.height = '100%'; host.append(canvas);
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false })!;
  check(gl, 'WebGL2 unavailable');
  const tracking = trackGraphics(gl), engine = createFluid(canvas);
  try {
    engine.resize(800, 600, 1); engine.reset(false); engine.draw(0, 0, idle(), false);
    const resourceCount = tracking.objects.size;
    const samplePixel = (x: number, y: number) => {
      const color = new Uint8Array(4); gl.readPixels(Math.round(x * canvas.width), Math.round(y * canvas.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color);
      return Math.max(color[0], color[1], color[2]);
    };
    const baseline = samplePixel(.18, .22), tap = idle();
    tap.samples.push({ x: .18, y: .78, dx: 0, dy: 0, dt: 1 / 60, down: true, start: true });
    tap.samples.push({ x: .82, y: .78, dx: 0, dy: 0, dt: 1 / 60, down: true, start: true });
    engine.draw(1 / 60, 0, tap, false);
    check(samplePixel(.18, .22) > baseline + 30 && samplePixel(.82, .22) > baseline + 30, 'Distinct quick taps did not create both blooms');
    report('Two between-frame taps render independent blooms in actual WebGL pixels');
    engine.resize(390, 844, 1); engine.draw(0, 0, idle(), false);
    check(samplePixel(.18, .22) > baseline + 25, 'Resize discarded the fluid painting');
    check(tracking.objects.size === resourceCount, 'Resize leaked graphics objects');
    report('Portrait resizing retains painted fluid and stable resource counts');
    engine.resize(800, 600, 1);
    const started = performance.now();
    for (let i = 0; i < 720; i++) {
      const pointer = idle();
      if (i % 9 === 0) {
        const x = .5 + Math.sin(i * 1.7) * .43, y = .5 + Math.cos(i * .9) * .4;
        pointer.samples.push({ x, y, dx: Math.sin(i) * .6, dy: Math.cos(i) * .5, dt: 1 / 240, down: true, start: i % 27 === 0 });
      }
      if (i > 420 && i < 540) { pointer.down = pointer.inside = true; }
      engine.draw(1 / 30, i / 30, pointer, i >= 540);
      if (i === 239 || i === 479) report(`Finite GPU buffers after ${i + 1} stress steps`, tracking.inspect());
      if (i % 30 === 0) await frame();
    }
    check(gl.getError() === gl.NO_ERROR, 'Fluid stress run reported graphics errors');
    report('720 simulation steps: rapid strokes, sustained hold, and reduced motion remain finite', { ...tracking.inspect(), elapsedMs: Math.round(performance.now() - started) });
    engine.reset(true); engine.draw(0, 0, idle(), true);
    check(tracking.objects.size === resourceCount, 'Reset allocated extra graphics resources');
    report('Fluid reset retains stable allocations', tracking.inspect());
    engine.reset(false); const openingMagnitude = tracking.inspect().maxMagnitude;
    for (let i = 0; i < 360; i++) {
      engine.draw(1 / 30, i / 30, idle(), false);
      if (i % 30 === 0) await frame();
    }
    const restingMagnitude = tracking.inspect().maxMagnitude;
    check(restingMagnitude < openingMagnitude * .25, 'Unforced fluid amplified grid-scale turbulence instead of relaxing');
    report('Unforced fluid dissipates its opening momentum without self-sustaining grid noise', { openingMagnitude, restingMagnitude });
    engine.dispose(); engine.dispose();
    check(tracking.objects.size === 0, 'Fluid dispose leaked graphics resources');
    report('Actual GPU textures, framebuffers, shaders, programs, and vertex arrays released');
  } finally { engine.dispose(); canvas.remove(); }
}

async function checkContextLoss() {
  let failure = '', ready = false;
  const events = { onReady() { ready = true; }, onInteractionChange() {}, onError(message: string) { failure = message; }, onSoundError() {} };
  const preferences = { paused: false, reducedMotion: false, sound: false };
  let session = new ToySession(liquidLight, host, events, preferences);
  try {
    await session.start(); await frames(2); check(ready, 'Fluid session did not become ready');
    const canvas = host.querySelector('canvas')!, gl = canvas.getContext('webgl2')!;
    const loss = gl.getExtension('WEBGL_lose_context'); check(loss, 'Cannot test context loss on this device');
    loss.loseContext(); await frames(4);
    check(failure.includes('Graphics were interrupted'), 'Context loss did not reach player error handling');
    check(host.querySelectorAll('canvas').length === 0, 'Failed session retained its surface');
    session.dispose(); failure = ''; ready = false;
    session = new ToySession(liquidLight, host, events, preferences);
    await session.start(); await frames(2);
    check(ready && !failure, 'A fresh session could not recover after context loss');
    report('Real context loss reaches the player error path; a fresh session recovers');
  } finally { session.dispose(); }
}

button.addEventListener('click', async () => {
  button.disabled = true; results.length = 0; output.textContent = 'Running actual renderer checks…';
  try {
    await checkTide(); await checkFluid(); await checkContextLoss();
    output.textContent = JSON.stringify({ status: 'passed', checks: results }, null, 2);
  } catch (error) {
    output.textContent = JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error), checks: results }, null, 2);
  } finally { button.disabled = false; }
});
