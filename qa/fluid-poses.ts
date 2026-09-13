import { createFluid } from '../src/liquid-light/engine';
import type { FieldPointer } from '../src/fields/input';
const canvas = document.querySelector('canvas')!, host = document.querySelector<HTMLElement>('#surface')!, status = document.querySelector('#status')!;
const engine = createFluid(canvas);
const idle = (): FieldPointer => ({x:.5,y:.5,dx:0,dy:0,down:false,inside:false,keyboard:false,samples:[]});
let time = 0;
function frame(dt:number,input = idle()) { time += dt; engine.draw(dt,time,input,false); }
function reset() { time = 0; engine.resize(host.clientWidth,host.clientHeight,1); engine.reset(false); frame(0); }
function pose(name:string) {
  reset();
  if(name === 'slow' || name === 'fast' || name === 'late') {
    const count = name === 'fast' ? 12 : 80, dt = name === 'fast' ? 1/120 : 1/30;
    let lastX=.18,lastY=.5;
    for(let i=0;i<=count;i++) {
      const x=.18+.64*i/count,y=.5+Math.sin(i/count*Math.PI*2)*.19;
      const input=idle(); input.x=x;input.y=y;input.down=input.inside=true;
      input.samples=[{x,y,dx:x-lastX,dy:y-lastY,dt,down:true,start:i===0}];
      frame(dt,input);lastX=x;lastY=y;
    }
    for(let i=0;i<(name === 'late'?600:45);i++) frame(1/60);
  } else if(name === 'taps') {
    for(let i=0;i<7;i++) {
      const input=idle(),angle=i*Math.PI*2/7;
      input.samples=[{x:.5+Math.cos(angle)*.23,y:.5+Math.sin(angle)*.23,dx:0,dy:0,dt:1/60,down:true,start:true}];
      frame(1/60,input); for(let j=0;j<8;j++) frame(1/60);
    }
  }
  status.textContent=`${name} · frozen at ${time.toFixed(2)} s · ${canvas.width} × ${canvas.height}`;
}
document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(button=>button.addEventListener('click',()=>pose(button.dataset.pose!)));
document.querySelector('#phone')!.addEventListener('click',()=>{host.classList.toggle('phone');pose('slow');});
window.addEventListener('pagehide',()=>engine.dispose(),{once:true});
pose('seed');
