import { createFluid } from '../src/liquid-light/engine';
import type { FieldPointer } from '../src/fields/input';

const output=document.querySelector('#results')!,button=document.querySelector<HTMLButtonElement>('#run')!;
// Deliver the same straight gesture as a coalesced event burst at three sampling
// rates. Read the actual floating-point simulation targets after production
// projection/transport, rather than testing a copy of the injection formula.
button.onclick=()=>{
  button.disabled=true;
  const results:{rate:number;dye:number;momentum:number}[]=[];
  try {
    for(const rate of [30,60,120]) {
      const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2')!;
      const buffers:WebGLFramebuffer[]=[],create=gl.createFramebuffer.bind(gl);
      gl.createFramebuffer=()=>{const buffer=create();if(buffer)buffers.push(buffer);return buffer;};
      const engine=createFluid(canvas);
      try {
        engine.resize(390,390,1);
        const pointer:FieldPointer={x:.7,y:.5,dx:0,dy:0,down:false,inside:false,keyboard:false,samples:[]};
        const duration=.4,count=Math.round(rate*duration);
        for(let i=1;i<=count;i++)pointer.samples.push({x:.3+.4*i/count,y:.5,dx:.4/count,dy:0,dt:duration/count,down:true,start:false});
        engine.draw(1/60,1,pointer,false);
        function integral(indices:number[],size:number,channels:number){
          let total=0;
          for(const index of indices){
            gl.bindFramebuffer(gl.FRAMEBUFFER,buffers[index]);
            const pixels=new Float32Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.FLOAT,pixels);
            if(gl.getError()!==gl.NO_ERROR)throw new Error('Float readback unavailable');
            for(let i=0;i<pixels.length;i+=4)for(let c=0;c<channels;c++){
              if(!Number.isFinite(pixels[i+c]))throw new Error('Nonfinite simulation value');
              total+=Math.abs(pixels[i+c]);
            }
          }
          return total/indices.length/(size*size);
        }
        results.push({rate,dye:integral([2,3],512,3),momentum:integral([0,1],128,2)});
      }finally{engine.dispose();}
    }
    const spread=(key:'dye'|'momentum')=>Math.max(...results.map(r=>r[key]))/Math.min(...results.map(r=>r[key]));
    const dyeRatio=spread('dye'),momentumRatio=spread('momentum');
    output.textContent=JSON.stringify({status:dyeRatio<1.12&&momentumRatio<1.12?'passed':'failed',dyeRatio,momentumRatio,results},null,2);
  }catch(error){output.textContent=JSON.stringify({status:'failed',error:String(error),results},null,2);}
  finally{button.disabled=false;}
};
