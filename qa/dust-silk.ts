import { mount as dust } from '../src/magnetic-dust/entry';
import { mount as silk } from '../src/silk/entry';
import { magneticDust } from '../src/toys/magnetic-dust';
import type { ToyContext, ToyController } from '../src/toys/types';
const host = document.querySelector<HTMLDivElement>('#surface')!, output = document.querySelector<HTMLPreElement>('#results')!, button = document.querySelector<HTMLButtonElement>('#run')!;
const nativeRAF = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
const frames = async (count: number) => { for (let i = 0; i < count; i++) await new Promise<void>(resolve => nativeRAF(() => resolve())); };
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function capture(canvas: HTMLCanvasElement) { const ids = new Set<number>(); canvas.setPointerCapture = id => { ids.add(id); }; canvas.hasPointerCapture = id => ids.has(id); canvas.releasePointerCapture = id => { ids.delete(id); }; return ids; }
function touch(canvas: HTMLCanvasElement, type: string, x = .5, y = .5) { const rect = canvas.getBoundingClientRect(); canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, buttons: /up|cancel/.test(type) ? 0 : 1, clientX: rect.left + x * rect.width, clientY: rect.top + y * rect.height })); }
button.addEventListener('click', async () => {
  const savedColor = localStorage.getItem('silk-color-v1');
  button.disabled = true; const checks: string[] = [], errors: string[] = [], pending = new Set<number>(), graphics = new Map<object, string>(), wrapped = new WeakSet<object>(), controllers: ToyController[] = [];
  let active = false; const report = (name: string) => { checks.push(name); output.textContent = JSON.stringify({ status: 'running', checks }, null, 2); };
  const owners = new Map<object, WebGL2RenderingContext>(), contexts = new Set<WebGL2RenderingContext>();
  function collectLostContexts() {
    // Three also owns placeholder textures and binding scratch objects. Context loss
    // releases these even where its renderer does not issue individual delete calls.
    for (const [item, gl] of owners) if (gl.isContextLost()) { graphics.delete(item); owners.delete(item); }
  }
  const context = (abort: AbortController): ToyContext => ({ signal: abort.signal, theme: magneticDust.theme, preferences: { paused: false, reducedMotion: true, sound: false }, onInteractionChange: value => { active = value; }, onError: value => errors.push(value) });
  window.requestAnimationFrame = callback => { let id = 0; id = nativeRAF(time => { pending.delete(id); callback(time); }); pending.add(id); return id; };
  window.cancelAnimationFrame = id => { pending.delete(id); nativeCancel(id); };
  const bitmaps = new Set<HTMLCanvasElement>();
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: object) {
    const result = original.call(this, type, type === '2d' ? { ...options, willReadFrequently: true } : options);
    if (result && type === '2d') bitmaps.add(this);
    if (result && type === 'webgl2' && !wrapped.has(result)) {
      wrapped.add(result); const gl = result as WebGL2RenderingContext; contexts.add(gl);
      for (const name of ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader', 'VertexArray', 'Sampler']) {
        const target = gl as unknown as Record<string, (...args: unknown[]) => unknown>, create = target[`create${name}`].bind(gl), remove = target[`delete${name}`].bind(gl);
        target[`create${name}`] = (...args) => { const item = create(...args); if (item) { graphics.set(item as object, name); owners.set(item as object, gl); } return item; };
        target[`delete${name}`] = (...args) => { graphics.delete(args[0] as object); owners.delete(args[0] as object); return remove(...args); };
      }
    }
    return result;
  } as typeof original;
  try {
    for (const [name, mount] of [['Dust', dust], ['Silk', silk]] as const) {
      const abort = new AbortController(), controller = (await mount(host, context(abort)))!; controllers.push(controller); await frames(3);
      const canvas = host.querySelector('canvas')!, captures = capture(canvas), stats = () => JSON.parse(canvas.dataset.diagnostics!);
      const material = () => JSON.parse(name === 'Dust' ? canvas.dataset.dust! : canvas.dataset.silk!);
      const start = material(); await frames(4); check(JSON.stringify(start) === JSON.stringify(material()), `${name} moves at rest with reduced motion`);
      report(`${name}: stable reduced-motion rest`);
      touch(canvas, 'pointerdown', .4, .5); touch(canvas, 'pointermove', .65, .5); touch(canvas, 'pointerup', .65, .5); await frames(5);
      check((name === 'Dust' ? material().energy : material().displacement) > 1, `${name} lost a complete between-frame touch stroke`);
      check(captures.size === 0 && !active, `${name} retained a released touch`); report(`${name}: a complete touch stroke creates visible motion after release`);
      touch(canvas, 'pointerdown'); controller.setPaused!(true); const pausedFrame = stats().frames; await frames(4);
      check(stats().frames === pausedFrame && pending.size === 0 && captures.size === 0, `${name} pause retained animation/capture`);
      controller.setPaused!(false); await frames(3); check(stats().frames > pausedFrame, `${name} did not resume`);
      controller.reset(); check((name === 'Dust' ? material().energy : material().displacement) === 0, `${name} reset retained motion`);
      report(`${name}: pause cancels captures and frames; resume and reset work`);
      if (name === 'Dust') {
        host.querySelector<HTMLButtonElement>('[data-mode="repel"]')!.click(); await frames(1); check(host.querySelector('[data-mode="repel"]')!.getAttribute('aria-pressed') === 'true', 'Repel did not select');
        controller.reset(); check(host.querySelector('[data-mode="attract"]')!.getAttribute('aria-pressed') === 'true', 'Dust reset retained repel');
      } else {
        check(material().iridescence === 0 && material().metalness === 0, 'Silk restored its chromatic metal finish');
        for(const color of ['pearl','sand','ink']) {
          host.querySelector<HTMLButtonElement>(`[aria-label="${color[0].toUpperCase()+color.slice(1)} fabric"]`)!.click(); await frames(1);
          check(material().color===color, `Silk failed to select ${color}`);
        }
        host.querySelector<HTMLButtonElement>('[aria-label="Pearl fabric"]')!.click();
        controller.setReducedMotion!(false); controller.reset();
        touch(canvas,'pointerdown',.5,.5);await frames(10);
        const grip=material().grip;check(material().held,'Silk failed to catch the actual surface');
        touch(canvas,'pointermove',.68,.42);await frames(25);
        check(JSON.stringify(material().grip)===JSON.stringify(grip),'Silk relocated its grip during a drag');
        check(material().lateral>10,'Silk did not pull the caught fabric sideways');
        touch(canvas,'pointerup',.68,.42);await frames(2);check(!material().held,'Silk retained the released grip');
        controller.reset();check(material().lateral===0,'Silk reset retained lateral deformation');
        // Compare the actual picked patch for a slow start and a whole down/move
        // burst consumed in one render. The ending pointer must not choose the grip.
        controller.setReducedMotion!(true); controller.reset();
        touch(canvas,'pointerdown',.5,.5);await frames(1);const originalGrip=material().grip;
        touch(canvas,'pointerup',.5,.5);controller.reset();
        touch(canvas,'pointerdown',.5,.5);touch(canvas,'pointermove',.95,.15);await frames(1);
        check(material().held && material().grip.every((value:number,i:number)=>Math.abs(value-originalGrip[i])<.00001),'A between-frame drag grabbed its endpoint instead of its start');
        host.style.width='390px';await frames(2);
        check(!material().held && !active && captures.size===0,'Silk retained a grip across a camera resize');
        touch(canvas,'pointerup',.95,.15);host.style.width='800px';await frames(2);controller.reset();
        report('Silk: between-frame drags preserve the original patch; resizing releases camera-dependent input');
        touch(canvas,'pointerdown',.02,.02);await frames(3);check(!material().held,'Empty space grabbed Silk');touch(canvas,'pointerup',.02,.02);
        report('Silk: neutral color choices, attached surface grip, sideways gathering, and full reset');
        controller.setReducedMotion!(false); await frames(4); const phase = material().phase; check(phase > 0, 'Silk does not breathe with normal motion');
        controller.setReducedMotion!(true); await frames(3); check(material().phase === phase, 'Reduced motion did not freeze the current folds');
      }
      const beforeResize = material(); host.style.width = '390px'; await frames(3); check(stats().width <= 585, `${name} canvas did not resize`);
      if (name === 'Silk') check(material().geometries === beforeResize.geometries && material().textures === beforeResize.textures, 'Silk resizing grows GPU resources');
      host.style.width = '800px'; await frames(2); touch(canvas, 'pointerdown'); abort.abort(); controller.dispose();
      check(host.children.length === 0 && pending.size === 0 && captures.size === 0 && canvas.width === 0 && !active, `${name} disposal retained a surface, frame, or input`);
      check([...bitmaps].every(bitmap => bitmap.width === 0 && bitmap.height === 0), `${name} retained a canvas backing store`);
      collectLostContexts(); check([...contexts].every(gl => gl.isContextLost()), 'Disposed renderer retained its context');
      check(graphics.size === 0, `${name} leaked ${graphics.size} graphics objects: ${[...graphics.values()].join(', ')}`); report(`${name}: resize preserves resources; abort disposes all graphics and input`);
    }
    for (let i = 0; i < 8; i++) {
      const abort = new AbortController(), controller = (await (i % 2 ? silk : dust)(host, context(abort)))!; controllers.push(controller); await frames(1); abort.abort(); controller.dispose();
      collectLostContexts(); check(host.children.length === 0 && pending.size === 0 && graphics.size === 0 && [...contexts].every(gl => gl.isContextLost()), `Repeated switch ${i} leaked resources`);
      check([...bitmaps].every(bitmap => bitmap.width === 0 && bitmap.height === 0), `Repeated switch ${i} retained a cached paper bitmap`);
    }
    report('Eight alternating mounts leave no abandoned animation loops or graphics objects');
    const abort = new AbortController(); abort.abort(); check(await dust(host, context(abort)) === null && await silk(host, context(abort)) === null, 'Canceled loads created a surface');
    check(errors.length === 0, errors.join('; ')); report('Canceled loading creates no surface; no runtime errors');
    output.textContent = JSON.stringify({ status: 'passed', count: checks.length, checks }, null, 2);
  } catch (error) { output.textContent = JSON.stringify({ status: 'failed', checks, error: String(error) }, null, 2); }
  finally { controllers.forEach(controller => controller.dispose()); HTMLCanvasElement.prototype.getContext = original; window.requestAnimationFrame = nativeRAF; window.cancelAnimationFrame = nativeCancel; if(savedColor===null)localStorage.removeItem('silk-color-v1');else localStorage.setItem('silk-color-v1',savedColor); button.disabled = false; }
});
document.querySelector('#mobile')!.addEventListener('click', () => {
  const phones = document.querySelector('#phones')!; phones.replaceChildren();
  for (const toy of ['magnetic-dust', 'silk']) { const frame = document.createElement('iframe'); frame.title = `${toy} phone preview`; frame.src = `/?toy=${toy}`; phones.append(frame); }
});
