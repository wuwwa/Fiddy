import { mount } from '../src/ascii-tide/entry';
import { asciiTide } from '../src/toys/ascii-tide';
const host=document.querySelector<HTMLElement>('#surface')!, abort=new AbortController();
const controller=(await mount(host,{signal:abort.signal,theme:asciiTide.theme,preferences:{paused:false,reducedMotion:false,sound:false},onError:error=>{host.textContent=error;},onInteractionChange:()=>{}}))!;
const canvas=host.querySelector('canvas')!;
document.querySelector('#hold')!.addEventListener('click',()=>{canvas.focus();canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}));});
document.querySelector('#release')!.addEventListener('click',()=>canvas.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true})));
document.querySelector('#reset')!.addEventListener('click',()=>controller.reset());
window.addEventListener('pagehide',()=>{abort.abort();controller.dispose();},{once:true});
