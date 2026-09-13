import { vertex, fragments } from '../src/liquid-light/shaders';

// Uses the production shaders and an analytically translating dye pulse. The
// reference is exact translation, not a second copy of the transport algorithm.
const output = document.querySelector<HTMLPreElement>('#results')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
button.addEventListener('click', () => {
  button.disabled = true;
  const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2')!;
  const textures: WebGLTexture[] = [], buffers: WebGLFramebuffer[] = [], shaders: WebGLShader[] = [], programs: WebGLProgram[] = [];
  let vao: WebGLVertexArrayObject | null = null;
  const size = 64;
  function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
  type Target = { texture: WebGLTexture; buffer: WebGLFramebuffer };
  try {
    check(gl?.getExtension('EXT_color_buffer_float'), 'Floating-point WebGL2 is required');
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    function compile(type: number, text: string) {
      const shader = gl.createShader(type)!; shaders.push(shader); gl.shaderSource(shader,text); gl.compileShader(shader);
      check(gl.getShaderParameter(shader,gl.COMPILE_STATUS), gl.getShaderInfoLog(shader) || 'Shader compilation failed'); return shader;
    }
    const vert = compile(gl.VERTEX_SHADER,vertex), handles = new Map<string,WebGLProgram>();
    for (const name of ['advect','correct','divergence','pressure','project'] as const) {
      const handle = gl.createProgram()!; programs.push(handle);
      gl.attachShader(handle,vert); gl.attachShader(handle,compile(gl.FRAGMENT_SHADER,fragments[name])); gl.linkProgram(handle);
      check(gl.getProgramParameter(handle,gl.LINK_STATUS), gl.getProgramInfoLog(handle) || 'Shader link failed'); handles.set(name,handle);
    }
    function target(data: Float32Array | null = null): Target {
      const texture = gl.createTexture()!, buffer = gl.createFramebuffer()!; textures.push(texture); buffers.push(buffer);
      gl.bindTexture(gl.TEXTURE_2D,texture); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,size,size,0,gl.RGBA,gl.FLOAT,data);
      gl.bindFramebuffer(gl.FRAMEBUFFER,buffer); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      check(gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE,'Incomplete target');
      if (!data) { gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); }
      return {texture,buffer};
    }
    function draw(name: string, destination: Target, values: Record<string,number | number[] | Target>) {
      const handle = handles.get(name)!; gl.useProgram(handle); let unit = 0;
      for (const [key,value] of Object.entries(values)) {
        const uniform = gl.getUniformLocation(handle,key); if (uniform === null) continue;
        if (typeof value === 'number') gl.uniform1f(uniform,value);
        else if (Array.isArray(value)) gl.uniform2f(uniform,value[0],value[1]);
        else { gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,value.texture); gl.uniform1i(uniform,unit++); }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,destination.buffer); gl.viewport(0,0,size,size); gl.drawArrays(gl.TRIANGLES,0,3);
    }
    function read(t: Target) { const values = new Float32Array(size*size*4); gl.bindFramebuffer(gl.FRAMEBUFFER,t.buffer); gl.readPixels(0,0,size,size,gl.RGBA,gl.FLOAT,values); return values; }
    const initial = new Float32Array(size*size*4), motion = initial.slice();
    const gaussian = (x: number,y: number) => Math.exp(-(((x-17)/3)**2)-((y-32)/9)**2);
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
      const i=(y*size+x)*4; initial[i]=gaussian(x,y); initial[i+1]=initial[i]*.4; initial[i+3]=1; motion[i]=30;
    }
    const velocity = target(motion), forward = target(), reverse = target();
    const common = {velocity,texel:[1/size,1/size],sourceSize:[size,size],dt:1/60,decay:0};
    function transport(corrected: boolean) {
      let source=target(initial), destination=target();
      for(let i=0;i<36;i++) {
        if(corrected) {
          draw('advect',forward,{...common,source}); draw('advect',reverse,{...common,source:forward,dt:-1/60});
          draw('correct',destination,{...common,source,forwardDye:forward,reverseDye:reverse});
        } else draw('advect',destination,{...common,source});
        [source,destination]=[destination,source];
      }
      const pixels=read(source); let error=0,peak=0,min=Infinity,max=-Infinity;
      for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
        const value=pixels[(y*size+x)*4]; check(Number.isFinite(value),'Non-finite transported dye');
        error+=Math.abs(value-gaussian(x-18,y)); peak=Math.max(peak,value); min=Math.min(min,value); max=Math.max(max,value);
      }
      return {error,peak,min,max};
    }
    const firstOrder=transport(false), corrected=transport(true);
    check(corrected.error < firstOrder.error*.6,'Corrected advection did not materially improve exact-translation accuracy');
    check(corrected.peak > firstOrder.peak*1.2,'Corrected advection lost fine pulse detail');
    check(corrected.min >= -1e-6 && corrected.max <= 1.00001,'Correction introduced dye extrema');
    // Divergent input with wavelengths well resolved by the simulation grid.
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) { const i=(y*size+x)*4; motion[i]=20*Math.sin((x+.5)*Math.PI/8); motion[i+1]=20*Math.sin((y+.5)*Math.PI/8); }
    const unprojected=target(motion), divergence=target(), projected=target(); let pressure=target(), pressureWrite=target();
    draw('divergence',divergence,{velocity:unprojected,texel:common.texel});
    for(let i=0;i<26;i++) { draw('pressure',pressureWrite,{pressure,divergence,texel:common.texel}); [pressure,pressureWrite]=[pressureWrite,pressure]; }
    draw('project',projected,{velocity:unprojected,pressure,texel:common.texel});
    function divergenceRms(values:Float32Array) {
      let sum=0,count=0; for(let y=2;y<size-2;y++) for(let x=2;x<size-2;x++) {
        const i=(y*size+x)*4, value=.5*(values[i+4]-values[i-4]+values[i+size*4+1]-values[i-size*4+1]); sum+=value*value; count++;
      } return Math.sqrt(sum/count);
    }
    const before=divergenceRms(motion), after=divergenceRms(read(projected));
    check(after < before*.5,'Pressure projection did not remove most resolved divergence');
    check(gl.getError() === gl.NO_ERROR,'GPU accuracy test produced WebGL errors');
    output.textContent=JSON.stringify({status:'passed',firstOrder,corrected,errorRatio:corrected.error/firstOrder.error,divergence:{before,after}},null,2);
  } catch(error) { output.textContent=JSON.stringify({status:'failed',error:String(error)},null,2); }
  finally {
    textures.forEach(t=>gl.deleteTexture(t)); buffers.forEach(b=>gl.deleteFramebuffer(b)); programs.forEach(p=>gl.deleteProgram(p)); shaders.forEach(s=>gl.deleteShader(s));
    if(vao) gl.deleteVertexArray(vao); gl?.getExtension('WEBGL_lose_context')?.loseContext(); button.disabled=false;
  }
});
