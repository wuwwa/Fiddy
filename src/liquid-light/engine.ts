import { clamp, type FieldPointer } from '../fields/input';
import type { FieldEngine } from '../fields/surface';
import { vertex, fragments } from './shaders';

type Target = { texture: WebGLTexture; buffer: WebGLFramebuffer; width: number; height: number };
type Pair = { read: Target; write: Target };
type Program = { handle: WebGLProgram; uniforms: Map<string, WebGLUniformLocation> };
type Uniform = number | number[] | Target;

export function fluidColor(time: number): [number, number, number] {
  const colors = [[.025, .85, 1.2], [.42, .075, 1.15], [1.15, .16, .23], [.08, 1, .78]];
  const phase = ((time * .16) % colors.length + colors.length) % colors.length;
  const i = Math.floor(phase), f = phase - i, blend = f * f * (3 - 2 * f);
  return colors[i].map((value, channel) => value + (colors[(i + 1) % colors.length][channel] - value) * blend) as [number, number, number];
}

export function createFluid(canvas: HTMLCanvasElement): FieldEngine {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('Liquid Light needs WebGL 2. Try a browser with hardware acceleration enabled.');
  const programs = new Map<keyof typeof fragments, Program>();
  const targets = new Set<Target>();
  const shaders = new Set<WebGLShader>();
  const handles = new Set<WebGLProgram>();
  let vao: WebGLVertexArrayObject | null = null;
  let disposed = false;
  function destroy() {
    if (disposed) return;
    disposed = true;
    for (const target of [...targets]) removeTarget(target);
    for (const handle of handles) gl!.deleteProgram(handle);
    for (const shader of shaders) gl!.deleteShader(shader);
    if (vao) gl!.deleteVertexArray(vao);
    programs.clear(); handles.clear(); shaders.clear();
    gl!.getExtension('WEBGL_lose_context')?.loseContext();
  }
  function removeTarget(target: Target) {
    gl!.deleteTexture(target.texture); gl!.deleteFramebuffer(target.buffer); targets.delete(target);
  }
  function compile(type: number, source: string) {
    const shader = gl!.createShader(type);
    if (!shader) throw new Error('Could not allocate the fluid renderer.');
    shaders.add(shader); gl!.shaderSource(shader, source); gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error(gl!.getShaderInfoLog(shader));
      throw new Error('Liquid Light could not start its graphics shaders. Try updating your browser.');
    }
    return shader;
  }
  function target(width: number, height: number): Target {
    const texture = gl!.createTexture(), buffer = gl!.createFramebuffer();
    if (!texture || !buffer) {
      if (texture) gl!.deleteTexture(texture);
      if (buffer) gl!.deleteFramebuffer(buffer);
      throw new Error('Not enough graphics memory for Liquid Light.');
    }
    const result = { texture, buffer, width, height }; targets.add(result);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA16F, width, height, 0, gl!.RGBA, gl!.HALF_FLOAT, null);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, buffer);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, texture, 0);
    if (gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) !== gl!.FRAMEBUFFER_COMPLETE) throw new Error('This device cannot render the floating-point textures Liquid Light needs.');
    gl!.viewport(0, 0, width, height); gl!.clearColor(0, 0, 0, 0); gl!.clear(gl!.COLOR_BUFFER_BIT);
    return result;
  }
  function pair(w: number, h: number): Pair { return { read: target(w, h), write: target(w, h) }; }
  function swap(pair: Pair) { [pair.read, pair.write] = [pair.write, pair.read]; }
  function draw(name: keyof typeof fragments, destination: Target | null, values: Record<string, Uniform>) {
    const program = programs.get(name)!;
    gl!.useProgram(program.handle);
    let unit = 0;
    for (const [name, value] of Object.entries(values)) {
      const location = program.uniforms.get(name);
      if (location === undefined) continue;
      if (typeof value === 'number') gl!.uniform1f(location, value);
      else if (Array.isArray(value)) {
        if (value.length === 2) gl!.uniform2f(location, value[0], value[1]);
        else gl!.uniform3f(location, value[0], value[1], value[2]);
      } else {
        gl!.activeTexture(gl!.TEXTURE0 + unit); gl!.bindTexture(gl!.TEXTURE_2D, value.texture);
        gl!.uniform1i(location, unit++);
      }
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, destination?.buffer ?? null);
    gl!.viewport(0, 0, destination?.width ?? canvas.width, destination?.height ?? canvas.height);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }
  let flow: Pair, dye: Pair, pressure: Pair, divergence: Target, curl: Target, forwardDye: Target, reverseDye: Target;
  let width = 1, height = 1, aspect = 1, ready = false, colorTravel = 0;
  function dimensions(shortSide: number) {
    return aspect >= 1 ? [Math.round(shortSide * Math.min(aspect, 3)), shortSide] : [shortSide, Math.round(shortSide / Math.max(aspect, 1 / 3))];
  }
  function clearAll() {
    for (const t of targets) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, t.buffer); gl!.viewport(0, 0, t.width, t.height);
      gl!.clearColor(0, 0, 0, 0); gl!.clear(gl!.COLOR_BUFFER_BIT);
    }
  }
  function momentum(x: number, y: number, dx: number, dy: number, radius: number) {
    draw('splat', flow.write, { source: flow.read, point: [x, y], amount: [clamp(dx, -450, 450), clamp(dy, -450, 450), 0], aspect, radius }); swap(flow);
  }
  function splat(x: number, y: number, dx: number, dy: number, color: number[], radius: number, density = 1) {
    const point = [x, y];
    momentum(x, y, dx, dy, radius);
    draw('splat', dye.write, { source: dye.read, point, amount: color.map(c => c * density), aspect, radius }); swap(dye);
  }
  function step(dt: number, reduced: boolean) {
    const texel = [1 / flow.read.width, 1 / flow.read.height];
    // Transport velocity before projecting it, so dye sees a divergence-reduced field.
    draw('advect', flow.write, { source: flow.read, velocity: flow.read, texel, sourceSize: [flow.read.width, flow.read.height], dt, decay: reduced ? 2.8 : .22 }); swap(flow);
    // Dissipate unresolved cell-scale eddies before confinement can amplify them.
    draw('viscosity', flow.write, { velocity: flow.read, texel, dt, strength: reduced ? 28 : 18 }); swap(flow);
    draw('curl', curl, { velocity: flow.read, texel });
    draw('vorticity', flow.write, { velocity: flow.read, curl, texel, dt, strength: reduced ? .8 : 2.4 }); swap(flow);
    draw('divergence', divergence, { velocity: flow.read, texel });
    // A fresh pressure solve avoids carrying stale pressure across gestures.
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, pressure.read.buffer); gl!.clear(gl!.COLOR_BUFFER_BIT);
    for (let i = 0; i < 26; i++) {
      draw('pressure', pressure.write, { pressure: pressure.read, divergence, texel }); swap(pressure);
    }
    draw('project', flow.write, { velocity: flow.read, pressure: pressure.read, texel }); swap(flow);
    const sourceSize = [dye.read.width, dye.read.height];
    // Limited MacCormack transport retains fine ribbons without ringing or negative dye.
    // See GPU Gems 3, chapter 30: forward, reverse, then donor-bounded correction.
    draw('advect', forwardDye, { source: dye.read, velocity: flow.read, texel, sourceSize, dt, decay: 0 });
    draw('advect', reverseDye, { source: forwardDye, velocity: flow.read, texel, sourceSize, dt: -dt, decay: 0 });
    draw('correct', dye.write, { source: dye.read, forwardDye, reverseDye, velocity: flow.read, texel, sourceSize, dt, decay: reduced ? .9 : .1 }); swap(dye);
  }
  function seed(reduced: boolean) {
    clearAll(); colorTravel = 0;
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2.4;
      const radius = .028 + i * .0045;
      splat(.5 + Math.cos(angle) * radius / aspect, .52 + Math.sin(angle) * radius,
        -Math.sin(angle) * (reduced ? 8 : 28), Math.cos(angle) * (reduced ? 8 : 28), fluidColor(i * .72), .00055, 1.05);
    }
    // Advance the seed into a connected swirl before the first usable frame.
    for (let i = 0; i < 12; i++) step(1 / 60, reduced);
  }
  try {
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Liquid Light needs floating-point graphics support. Try another browser or device.');
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vert = compile(gl.VERTEX_SHADER, vertex);
    for (const [name, fragment] of Object.entries(fragments)) {
      const frag = compile(gl.FRAGMENT_SHADER, fragment), handle = gl.createProgram();
      if (!handle) throw new Error('Could not create the fluid renderer.');
      handles.add(handle); gl.attachShader(handle, vert); gl.attachShader(handle, frag); gl.linkProgram(handle);
      if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error('Liquid Light could not link its graphics shaders.');
      const uniforms = new Map<string, WebGLUniformLocation>();
      for (let i = 0; i < gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS); i++) {
        const info = gl.getActiveUniform(handle, i)!;
        const location = gl.getUniformLocation(handle, info.name);
        if (location !== null) uniforms.set(info.name, location);
      }
      programs.set(name as keyof typeof fragments, { handle, uniforms });
    }
    for (const shader of shaders) gl.deleteShader(shader);
    shaders.clear();
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
  } catch (error) { destroy(); throw error; }
  return {
    resize(w, h, pixelRatio) {
      width = w; height = h; aspect = width / height;
      canvas.width = Math.round(w * pixelRatio); canvas.height = Math.round(h * pixelRatio);
      const [sw, sh] = dimensions(width < 600 ? 128 : 160), [dw, dh] = dimensions(width < 600 ? 512 : 768);
      if (ready && flow.read.width === sw && flow.read.height === sh && dye.read.width === dw && dye.read.height === dh) return;
      // Allocate first, then release the old set so a failed allocation can be cleaned up atomically.
      const previous = [...targets], previousFlow = flow, previousDye = dye;
      flow = pair(sw, sh); dye = pair(dw, dh); pressure = pair(sw, sh);
      divergence = target(sw, sh); curl = target(sw, sh);
      forwardDye = target(dw, dh); reverseDye = target(dw, dh);
      if (ready) {
        draw('resample', flow.read, { source: previousFlow.read, sourceSize: [previousFlow.read.width, previousFlow.read.height], amount: [sw / previousFlow.read.width, sh / previousFlow.read.height, 1] });
        draw('resample', dye.read, { source: previousDye.read, sourceSize: [previousDye.read.width, previousDye.read.height], amount: [1, 1, 1] });
      }
      previous.forEach(removeTarget); ready = true;
    },
    reset(reduced) { if (ready) seed(reduced); },
    draw(dt, time, pointer: FieldPointer, reduced) {
      if (!ready || disposed) return;
      if (dt > 0) {
        const samples = pointer.samples.filter(sample => sample.down);
        const subdivisions = Math.min(24, Math.max(1, Math.floor(128 / Math.max(1, samples.length))));
        for (const sample of samples) {
          if (sample.start) {
            splat(sample.x, 1 - sample.y, 0, 0, fluidColor(time + colorTravel), .0008, .85);
            // A balanced rosette opens a tap into a bloom instead of a stationary dot.
            // Bound extra passes when a whole burst of taps arrives between frames.
            const budget = Math.floor(96 / samples.length) - 2;
            const petals = budget < 2 ? 0 : Math.min(6, budget);
            for (let i = 0; i < petals; i++) {
              const angle = i / petals * Math.PI * 2 + colorTravel, c = Math.cos(angle), s = Math.sin(angle);
              const gain = reduced ? .2 : 1;
              momentum(sample.x + c * .022 / aspect, 1 - sample.y + s * .022,
                (c * 12 - s * 9) * gain, (s * 12 + c * 9) * gain, .00024);
            }
            colorTravel += .4;
            continue;
          }
          const dx = sample.dx * aspect, dy = -sample.dy;
          const distance = Math.hypot(dx, dy);
          const count = Math.min(subdivisions, Math.max(1, Math.ceil(distance / .012)));
          const gain = reduced ? .3 : 1;
          // Integrate force and dye over the segment. Event frequency and spatial
          // subdivision must not multiply the impulse of an identical gesture.
          // Faster strokes still deliver their momentum over a shorter interval.
          for (let i = 1; i <= count; i++) {
            const f = i / count;
            splat(sample.x - sample.dx * (1 - f), 1 - sample.y + sample.dy * (1 - f),
              dx * 2880 * gain / count,
              dy * 2880 * gain / count,
              fluidColor(time + colorTravel + f * distance * 10), .00045, (Math.min(sample.dt, .1) * 5 + distance * 2) / count);
          }
          colorTravel += distance * 10;
        }
        if (!samples.length && pointer.down && pointer.inside) {
          splat(pointer.x, 1 - pointer.y, 0, 0, fluidColor(time + colorTravel), .00045, dt * 5);
        }
      }
      if (dt > 0) step(Math.min(dt, 1 / 30), reduced);
      draw('display', null, { source: dye.read, sourceSize: [dye.read.width, dye.read.height] });
    },
    dispose: destroy,
  };
}
