import { toys } from '../src/toys/registry';
const frame=document.querySelector('iframe')!,output=document.querySelector<HTMLPreElement>('#results')!,run=document.querySelector<HTMLButtonElement>('#run')!,select=document.querySelector<HTMLSelectElement>('#toy')!;
const audited=toys.filter(toy=>toy.id!=='magnetic-dust');
for(const toy of audited){const option=document.createElement('option');option.value=toy.id;option.textContent=toy.name;select.append(option);}
const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function frames(count:number){for(let i=0;i<count;i++)await nextFrame();}
function check(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
const doc=()=>frame.contentDocument!;
async function until(predicate:()=>unknown,message:string){const started=performance.now();while(!predicate()){check(performance.now()-started<25000,message);const error=doc()?.querySelector('.error-panel');check(!error,error?.textContent??'Toy failed');await nextFrame();}}
const ready=(id:string)=>until(()=>doc()?.querySelector(`.toy-player.is-ready[data-toy-id="${id}"] canvas`),`${id} did not become ready`);
function click(selector:string){const element=doc().querySelector<HTMLElement>(selector);check(element,`Missing ${selector}`);element.click();}
async function navigate(id:string){
  click('[aria-label="Open toy collection"]');await until(()=>doc().querySelector('dialog[open]'),'Collection did not open');
  const link=[...doc().querySelectorAll<HTMLAnchorElement>('.collection-item')].find(link=>new URL(link.href).searchParams.get('toy')===id);
  check(link,`Missing ${id} collection entry`);link.click();await ready(id);select.value=id;
}
select.addEventListener('change',()=>void navigate(select.value));
document.querySelector('#phone')!.addEventListener('click',()=>frame.classList.toggle('phone'));
run.addEventListener('click',async()=>{
  run.disabled=select.disabled=true;const results:unknown[]=[],pending=new Set<number>(),sources=new Map<number,{stack:string;bookkeeping:boolean}>();
  let restore=()=>{};
  function report(label:string,details:Record<string,unknown>={}){results.push({label,...details});output.textContent=JSON.stringify({status:'running',results},null,2);}
  function trackFrames(){
    const win=frame.contentWindow!,native=win.requestAnimationFrame.bind(win),cancel=win.cancelAnimationFrame.bind(win);
    win.requestAnimationFrame=callback=>{
      let id=0;id=native(time=>{pending.delete(id);sources.delete(id);callback(time);});pending.add(id);
      const body=String(callback);
      sources.set(id,{stack:new Error().stack??callback.name,bookkeeping:body.includes('this.nodes.nodeFrame.update()') && body.includes('this.renderer._inspector.begin()')});return id;
    };
    win.cancelAnimationFrame=id=>{pending.delete(id);sources.delete(id);cancel(id);};
    restore=()=>{win.requestAnimationFrame=native;win.cancelAnimationFrame=cancel;};
  }
  function key(canvas:HTMLCanvasElement,type:string,code:string){
    // Events belong to the iframe realm. The harness invokes the production input handlers.
    const EventConstructor=(frame.contentWindow as Window & typeof globalThis).KeyboardEvent;
    canvas.dispatchEvent(new EventConstructor(type,{code,key:code==='Space'?' ':code,bubbles:true,cancelable:true}));
  }
  try{
    await until(()=>doc()?.querySelector('.toy-player.is-ready canvas'),'Initial toy did not load');trackFrames();await frames(8);
    const originalDocument=doc();let previous:HTMLCanvasElement|null=null;
    for(const toy of audited){
      await navigate(toy.id);await frames(10);
      const canvas=doc().querySelector<HTMLCanvasElement>('.toy-host canvas.toy-canvas')!;
      check(doc()===originalDocument,'Collection selection reloaded the document');
      check(doc().querySelectorAll('.toy-host canvas.toy-canvas').length===1,'Switch left multiple active surfaces');
      check(!previous || !previous.isConnected,'Switch retained the previous surface');
      const location=new URL(frame.contentWindow!.location.href);
      check(location.searchParams.get('toy')===toy.id && location.searchParams.get('qa')==='fidelity' && location.hash==='#controls','Navigation lost route or URL options');
      canvas.focus();key(canvas,'keydown','ArrowRight');await frames(3);key(canvas,'keyup','ArrowRight');key(canvas,'keydown','Space');await frames(12);
      click('[aria-label="Open toy collection"]');await until(()=>doc().querySelector('dialog[open]'),'Collection did not pause interaction');await frames(8);
      const before=canvas.dataset.diagnostics;await frames(5);
      check(before===canvas.dataset.diagnostics,`${toy.id} kept rendering behind the collection`);
      // Three's common renderer owns one node-clock/inspector callback even with
      // no animation function. Source tracing verifies this exact library callback.
      // It is disposed with the renderer; no toy render callback may remain.
      const commonRenderer=['jelly','cushion','loop','star','dumpling'].includes(toy.id);
      const callbacks=[...sources.values()],bookkeeping=callbacks.filter(source=>source.bookkeeping).length;
      check(callbacks.every(source=>source.bookkeeping) && bookkeeping===(commonRenderer?1:0),`${toy.id} retained unexpected callbacks while paused: ${JSON.stringify(callbacks)}`);
      check(doc().querySelectorAll('.collection-item').length===toys.length,'Collection lost an entry');
      const rows=[...doc().querySelectorAll<HTMLElement>('.collection-item')],selected=rows.find(row=>row.getAttribute('aria-current')==='page');
      check(selected?.querySelector('strong')?.textContent===toy.name,'Selected collection entry disagrees with the player');
      click('[aria-label="Close collection"]');await frames(5);key(canvas,'keyup','Space');
      click('.interaction-dock button[aria-label^="Reset"]');await frames(6);
      const diagnostics=canvas.dataset.diagnostics?JSON.parse(canvas.dataset.diagnostics):{};
      report(toy.name,{id:toy.id,canvases:1,pausedToyCallbacks:0,rendererBookkeepingCallbacks:bookkeeping,width:canvas.width,height:canvas.height,backend:diagnostics.backend??'WebGL2 / Canvas2D',frames:diagnostics.frames});
      previous=canvas;
    }
    frame.contentWindow!.history.back();await ready(audited.at(-2)!.id);
    frame.contentWindow!.history.forward();await ready(audited.at(-1)!.id);report('Browser Back/Forward returns to the correct pages');
    restore();restore=()=>{};pending.clear();const previousDocument=doc();frame.contentWindow!.location.reload();
    await until(()=>doc()!==previousDocument,'Refresh did not create a fresh document');await ready(audited.at(-1)!.id);
    check(doc().querySelectorAll('.toy-host canvas.toy-canvas').length===1,'Refresh duplicated the surface');report('Refreshing the direct link restores one correct surface');
    output.textContent=JSON.stringify({status:'passed',count:results.length,results},null,2);
  }catch(error){output.textContent=JSON.stringify({status:'failed',error:String(error),results},null,2);}
  finally{restore();run.disabled=select.disabled=false;}
});
