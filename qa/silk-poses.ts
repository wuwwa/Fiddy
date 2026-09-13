import { mount } from '../src/silk/entry';
import { silk } from '../src/toys/silk';

const host=document.querySelector<HTMLElement>('#surface')!,status=document.querySelector<HTMLOutputElement>('#status')!;
const abort=new AbortController();
const controller=(await mount(host,{signal:abort.signal,theme:silk.theme,preferences:{paused:false,reducedMotion:false,sound:false},onInteractionChange:()=>{},onError:message=>{status.value=message;}}))!;
const canvas=host.querySelector('canvas')!;
const captures=new Set<number>();canvas.setPointerCapture=id=>{captures.add(id);};canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>{captures.delete(id);};
function touch(type:string,x:number,y:number){const rect=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:rect.left+x*rect.width,clientY:rect.top+y*rect.height}));}
let generation=0;
const frames=async(count:number)=>{for(let i=0;i<count;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));};
async function pose(corner:boolean){
  const current=++generation;controller.setPaused!(false);controller.reset();
  touch('pointerdown',corner?.31:.5,corner?.52:.5);await frames(15);if(current!==generation)return;
  touch('pointermove',corner?.23:.6,corner?.32:.39);await frames(60);if(current!==generation)return;
  const stats=JSON.parse(canvas.dataset.silk!);status.value=stats.held?'Held pose — release to watch it settle':'No surface hit';controller.setPaused!(true);
}
document.querySelector('#center')!.addEventListener('click',()=>void pose(false));
document.querySelector('#corner')!.addEventListener('click',()=>void pose(true));
document.querySelector('#release')!.addEventListener('click',()=>{generation++;touch('pointerup',.5,.5);controller.setPaused!(false);status.value='Released';});
document.querySelector('#reset')!.addEventListener('click',()=>{generation++;controller.setPaused!(false);controller.reset();status.value='Ready';});
window.addEventListener('pagehide',()=>{abort.abort();controller.dispose();},{once:true});
