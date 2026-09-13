import { mountAstra } from '../src/astra/scene';
import type { ToyController } from '../src/toys/types';
import { PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from 'three';
import { createCursorPathTexture, createStars } from '../src/astra/geometry';
import { starFragment, starVertex } from '../src/astra/shaders';
import { DEFAULT_FLOW_SPEED } from '../src/astra/studio';

const host = document.querySelector<HTMLElement>('#host')!;
const results = document.querySelector<HTMLElement>('#results')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const wait = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); results.textContent += `\nPASS ${message}`; };
const diagnostic = (canvas: HTMLCanvasElement) => JSON.parse(canvas.dataset.diagnostics!);

// Track one rendered star: a clock ticking or brightness twinkling cannot pass this check.
function checkCursorTravel() {
  const renderer = new WebGLRenderer(), target = new WebGLRenderTarget(192, 192);
  const geometry = createStars('cursor'), path = createCursorPathTexture();
  const size = geometry.getAttribute('aSize'), travel = geometry.getAttribute('aTravel');
  let index = 0;
  while (index < size.count - 1 && !(size.getX(index) > 6 && travel.getX(index) > .15 && travel.getX(index) < .25)) index++;
  geometry.setDrawRange(index, 1);
  const material = new ShaderMaterial({ vertexShader:starVertex, fragmentShader:starFragment, vertexColors:true, transparent:true,
    uniforms:{uTime:{value:0},uPixelRatio:{value:1},uScale:{value:1},uHalo:{value:0},uEnergy:{value:1},uSwirl:{value:0},uCursor:{value:1},uCursorPath:{value:path},uPathCount:{value:1},uCursorMask:{value:1},uFlowDistance:{value:0}},
  });
  const scene = new Scene(), camera = new PerspectiveCamera(45, 1, .1, 80);
  camera.position.z = 8.8; scene.add(new Points(geometry, material));
  const pixels = new Uint8Array(192 * 192 * 4);
  function centroid(time: number) {
    material.uniforms.uTime.value = time;
    material.uniforms.uFlowDistance.value = time * DEFAULT_FLOW_SPEED;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 192, 192, pixels);
    let weight = 0, x = 0, y = 0;
    for (let i = 0; i < 192 * 192; i++) {
      const intensity = pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2];
      weight += intensity; x += (i % 192) * intensity; y += Math.floor(i / 192) * intensity;
    }
    if (!weight) throw new Error('Cursor motion probe did not render a visible star');
    return [x / weight, y / weight];
  }
  try {
    const start = centroid(0), moved = centroid(2), reset = centroid(0);
    check(Math.hypot(moved[0] - start[0], moved[1] - start[1]) > 5, 'cursor: actual GPU star position travels along the outline');
    check(Math.hypot(reset[0] - start[0], reset[1] - start[1]) < .01, 'cursor: resetting time restores the exact rendered particle position');
  } finally {
    geometry.dispose(); path.dispose(); material.dispose(); target.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
}
button.onclick = async () => {
  button.disabled = true; results.textContent = 'Running real WebGL2 lifecycle checks';
  const errors: string[] = []; let controller: ToyController | null = null;
  try {
    checkCursorTravel();
    for (const shape of ['swirl', 'cursor'] as const) {
      const abort = new AbortController();
      controller = await mountAstra(host, {
        signal: abort.signal, theme: {background:'#000',foreground:'#fff',accent:'#fff',muted:'#aaa',surface:'#111',border:'#333'},
        preferences: { paused:false, reducedMotion:false, sound:false }, onInteractionChange() {}, onError(message) { errors.push(message); },
      }, shape, {persistStudio:false});
      const canvas = host.querySelector('canvas')!;
      await wait();
      check(diagnostic(canvas).geometries === 2 && diagnostic(canvas).programs === 1, `${shape}: both point clouds rendered with a compiled shader`);
      const running = diagnostic(canvas).frames; await wait();
      check(diagnostic(canvas).frames > running, `${shape}: live animation advances`);
      if (shape === 'cursor') {
        for (const id of ['heart','circle','infinity','flower','star','triangle','square','wave','cursor']) {
          host.querySelector<HTMLButtonElement>('.astra-shape-choice')!.click();
          host.querySelector<HTMLButtonElement>(`[aria-label="Use ${id} shape"]`)!.click(); await wait();
          const view = diagnostic(canvas);
          check(view.outline === id && view.geometries === 2 && view.textures === 1, `shape ${id}: switches and releases the previous GPU resources`);
        }
        const speed = host.querySelector<HTMLInputElement>('#astra-flow-speed')!;
        speed.value = '.25'; speed.dispatchEvent(new Event('input',{bubbles:true})); await wait();
        const slow = diagnostic(canvas); await wait(150); const later = diagnostic(canvas);
        check(Math.abs((later.flowDistance - slow.flowDistance) / (later.clock - slow.clock) - DEFAULT_FLOW_SPEED * .25) < .00001, 'speed slider changes particle travel without changing the animation clock');
        speed.value = '1'; speed.dispatchEvent(new Event('input',{bubbles:true}));
        host.querySelector<HTMLButtonElement>('.astra-draw-button')!.click(); await wait();
        const drawing = diagnostic(canvas); await wait();
        check(drawing.editing && diagnostic(canvas).clock === drawing.clock, 'drawing mode stops the background animation');
        Array.from(host.querySelectorAll<HTMLButtonElement>('.astra-draw-toolbar button')).find(button=>button.textContent==='Cancel')!.click(); await wait();
        check(!diagnostic(canvas).editing && diagnostic(canvas).clock > drawing.clock, 'canceling a drawing restores the live shape');
      }
      controller!.setPaused!(true); await wait(); const paused = diagnostic(canvas).frames; await wait();
      check(diagnostic(canvas).frames === paused, `${shape}: paused surface schedules no rendering`);
      controller!.setPaused!(false); controller!.setReducedMotion!(true); await wait();
      const reduced = diagnostic(canvas).frames; await wait();
      check(diagnostic(canvas).frames === reduced && !diagnostic(canvas).ambient, `${shape}: reduced motion renders a still, usable scene`);
      canvas.dispatchEvent(new KeyboardEvent('keydown', {code:'ArrowRight',bubbles:true}));
      canvas.dispatchEvent(new KeyboardEvent('keyup', {code:'ArrowRight',bubbles:true}));
      await wait();
      const orientation = diagnostic(canvas).orientation;
      check(Math.abs(orientation[1]) > .01, `${shape}: even a between-frame keyboard tap rotates the object`);
      host.style.width = '390px'; host.style.height = '700px'; await wait();
      check(JSON.stringify(orientation) === JSON.stringify(diagnostic(canvas).orientation), `${shape}: phone resize preserves orientation`);
      host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click(); await wait();
      check(diagnostic(canvas).zoom > 1, `${shape}: zoom controls work`);
      controller!.reset(); await wait();
      check(diagnostic(canvas).zoom === 1 && diagnostic(canvas).orientation[3] === 1, `${shape}: reset restores the camera and complete orientation`);
      host.querySelector<HTMLButtonElement>('[aria-label="Play starlight motion"]')!.click(); await wait();
      const playing = diagnostic(canvas).clock; await wait();
      check(diagnostic(canvas).clock > playing, `${shape}: explicit Play works after reduced-motion initialization`);
      controller!.dispose(); const stopped = diagnostic(canvas).frames; await wait();
      check(!host.childElementCount && diagnostic(canvas).frames === stopped, `${shape}: disposal removes owned DOM and cancels the animation`);
      controller!.dispose(); controller = null; abort.abort();
      host.style.width = '720px'; host.style.height = '520px';
    }
    for (let i = 0; i < 6; i++) {
      const abort = new AbortController();
      controller = await mountAstra(host, {signal:abort.signal, theme:{} as never, preferences:{paused:false,reducedMotion:true,sound:false},onInteractionChange(){},onError(message){errors.push(message);}}, i % 2 ? 'cursor' : 'swirl', {persistStudio:false});
      await wait(30); abort.abort(); check(!host.childElementCount, `switch ${i + 1}: abort releases the scene`); controller = null;
    }
    check(errors.length === 0, 'no renderer errors across all sessions');
    results.textContent += '\nALL CHECKS PASSED';
  } catch (error) { results.textContent += `\nFAIL ${error instanceof Error ? error.message : error}`; }
  finally { controller?.dispose(); button.disabled = false; }
};
