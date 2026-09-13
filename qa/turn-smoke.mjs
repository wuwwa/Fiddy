import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const backend=process.argv.includes('--webgl')?'webgl':'webgpu';
const interruptionsOnly=process.argv.includes('--interruptions-only');
const puttyOnly=process.argv.includes('--putty');
const reportName=`${puttyOnly?'putty':'turn'}-${backend}${interruptionsOnly?'-interruptions':''}-results.json`;
const origin=process.env.QA_ORIGIN ?? 'http://127.0.0.1:5174';
const artifacts=resolve('qa/artifacts');await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'codex-jelly-turn-'));
const chrome=spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,
  '--no-first-run','--no-default-browser-check','--mute-audio',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows','--enable-unsafe-webgpu',
  '--enable-unsafe-swiftshader','about:blank',
],{windowsHide:true,stdio:'ignore'});
let launchError;chrome.on('error',error=>{launchError=error;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,session,targetId,sequence=0,touchId=100;
const pending=new Map(),errors=[],results=[];
const send=(method,params={},sessionId=session)=>new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},15000);
  pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
  socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});
const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{expression,returnByValue:true});
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;
};
const diagnostics=()=>evaluate(`(()=>{
  const canvas=document.querySelector('canvas');
  return {state:canvas?.dataset.diagnostics?JSON.parse(canvas.dataset.diagnostics):null,
    trace:window.__turnEvents ?? [],viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,scale:visualViewport?.scale}};
})()`);
const waitFor=async(predicate,label,timeout=12000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout) {const data=await diagnostics();if(predicate(data))return data;await delay(25);}
  throw new Error(`${label}: ${JSON.stringify(await diagnostics())}`);
};
const screenshot=async label=>{
  const path=join(artifacts,`turn-${backend}-${label}.png`);
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path,Buffer.from(data,'base64'));return path;
};
const record=(label,data={})=>{results.push({label,...data});console.log(JSON.stringify({label,...data}));};
const touch=(type,points)=>send('Input.dispatchTouchEvent',{
  type,touchPoints:points.map(point=>({...point,radiusX:10,radiusY:10,force:0.65})),
});
const click=async selector=>{
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;
    const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  assert.ok(point,selector);
  for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1,...point});
};
const empty=state=>state.contactCount===0 && state.pointerCount===0 && state.pairTurn.contacts.length===0 && state.pairTurn.pairs===0;
const reset=async()=>{
  const before=(await diagnostics()).state.frames;await click('button[aria-label^="Reset "]');
  await waitFor(data=>data.state?.frames>before && empty(data.state) && data.state.reaction.fatigue===0 &&
    (!data.state.plastic || data.state.plastic.offset===0 && data.state.plastic.compression===0),'Reset did not clear pairs and material memory');
};
const viewport=(width,height)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
const load=async toy=>{
  const oldTarget=targetId;
  ({targetId}=await send('Target.createTarget',{url:'about:blank'},null));
  ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await send('Page.bringToFront');
  await viewport(390,844);await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await send('Page.navigate',{url:`${origin}/?toy=${toy}${backend==='webgl'?'&renderer=webgl':''}`});
  const data=await waitFor(data=>data.state?.entrance>=0.95 && data.state.pairTurn,'Toy readiness',30000);
  if(oldTarget)await send('Target.closeTarget',{targetId:oldTarget},null);
  await evaluate(`(()=>{window.__turnEvents=[];for(const type of ['pointerdown','pointerup','pointercancel'])
    document.addEventListener(type,event=>window.__turnEvents.push({type,trusted:event.isTrusted,id:event.pointerId}),true);})()`);
  assert.equal(data.state.backend,backend==='webgpu'?'WebGPUBackend':'WebGLBackend');
  assert.deepEqual(data.viewport,{width:390,height:844,scrollX:0,scrollY:0,scale:1});return data.state;
};
const begin=async toy=>{
  const points=toy==='loop'?[{id:++touchId,x:144,y:420},{id:++touchId,x:248,y:420}]
    :[{id:++touchId,x:159,y:423},{id:++touchId,x:233,y:423}];
  await touch('touchStart',points);
  await waitFor(data=>data.state.contactCount===2 && data.state.pairTurn.pairs===1,'Both touches must hit the skin');return points;
};
const rotate=async points=>{
  const cx=(points[0].x+points[1].x)/2,cy=(points[0].y+points[1].y)/2;
  let moved;
  for(let step=1;step<=12;step++) {
    const angle=15*Math.PI/180*step/12;
    moved=points.map(p=>({...p,x:cx+(p.x-cx)*Math.cos(angle)-(p.y-cy)*Math.sin(angle),
      y:cy+(p.x-cx)*Math.sin(angle)+(p.y-cy)*Math.cos(angle)}));
    await touch('touchMove',moved);await delay(25);
  }
  return moved;
};

try {
  let info;
  for(let i=0;i<100;i++) {
    if(launchError)throw launchError;
    try {info=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}
    catch {await delay(100);}
  }
  assert.ok(info,'Chrome did not start');socket=new WebSocket(`ws://127.0.0.1:${info[0]}${info[1]}`);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id) {const request=pending.get(message.id);if(!request)return;pending.delete(message.id);
      if(message.error)request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result);
    } else if(message.method==='Runtime.exceptionThrown' || message.method==='Log.entryAdded' && message.params.entry.level==='error')errors.push(message);
  });
  if(puttyOnly) {
    const {runPuttyChecks}=await import('./putty-checks.mjs');
    await runPuttyChecks({load,reset,click,send,evaluate,diagnostics,waitFor,delay,touch,viewport,screenshot,record});
  }
  if(interruptionsOnly && !puttyOnly) {
    const neutral=await load('cushion');
    for(const mode of ['cancel','blur','reduced']) {
      await reset();
      if(mode==='reduced')await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      const points=await begin('cushion');await rotate(points);
      await waitFor(data=>data.state.pairTurn.contacts.length===2 && data.state.pairTurn.contacts.every(c=>c.relief>0.9),'Turn before interruption');
      if(mode==='blur')await evaluate('document.querySelector("canvas").blur()');
      else await touch('touchCancel',[]);
      const data=await waitFor(data=>empty(data.state),'Interruption retained a pair');
      assert.ok(data.state.minVolumeRatio>0.75);assert.deepEqual(data.state.memory,neutral.memory);
      if(mode==='blur')await touch('touchCancel',[]);
      record(mode+' clears held turn',{state:data.state});
    }
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await reset();
  }
  for(const toy of interruptionsOnly || puttyOnly?[]:['cushion','jelly','loop']) {
    const neutral=await load(toy);await reset();
    await screenshot(`${toy}-rest`);
    for(const gesture of ['pinch','translation']) {
      let points=await begin(toy);
      for(let step=1;step<=10;step++) {
        points=points.map((p,i)=>({...p,x:p.x+(gesture==='pinch'?(i===0?1:-1):0.8),y:p.y+(gesture==='translation'?-0.6:0)}));
        await touch('touchMove',points);await delay(25);
      }
      await delay(250);const data=await diagnostics();
      assert.equal(data.state.contactCount,2);
      assert.ok(data.state.pairTurn.contacts.every(c=>c.relief<0.005),`${gesture} falsely detected as rotation`);
      record(`${toy} ${gesture}`,{relief:data.state.pairTurn,compression:data.state.compression});
      await touch('touchCancel',[]);await reset();
    }
    let points=await begin(toy);await delay(200);const pressed=(await diagnostics()).state;
    await screenshot(`${toy}-pressed`);points=await rotate(points);
    const turning=await waitFor(data=>data.state.pairTurn.contacts.length===2 && data.state.pairTurn.contacts.every(c=>c.relief>0.95),'Gentle turn did not ease pressure');
    assert.equal(turning.state.contactCount,2);assert.ok(turning.state.surface.positionVersion>pressed.surface.positionVersion);
    assert.ok(turning.state.surface.normalSample.some((n,i)=>Math.abs(n-pressed.surface.normalSample[i])>0.0001));
    assert.ok(turning.state.minVolumeRatio>0.75);assert.equal(turning.state.reaction.pops,0);
    record(`${toy} turn`,{state:turning.state,screenshot:await screenshot(`${toy}-turned`)});
    // CDP touchEnd supplies the contacts being removed, so this lifts only one.
    await touch('touchEnd',[points[0]]);
    const partial=await waitFor(data=>data.state.contactCount===1 && data.state.pairTurn.contacts.length===1,'Partial release lost survivor');
    assert.equal(partial.state.pairTurn.pairs,0);assert.ok(partial.state.pairTurn.contacts[0].relief>0.3,'Survivor snapped back to full pressure');
    const restored=await waitFor(data=>data.state.contactCount===1 && data.state.pairTurn.contacts[0].relief<0.03,'Survivor did not regain pressure');
    assert.ok(restored.state.minVolumeRatio>0.75);await touch('touchEnd',[points[1]]);
    await waitFor(data=>empty(data.state),'Final release retained pair state');await reset();
    const single=toy==='loop'?{id:++touchId,x:248,y:420}:{id:++touchId,x:195,y:420};
    await touch('touchStart',[single]);
    const fresh=await waitFor(data=>data.state.contactCount===1 && data.state.displacement>0.08,'Fresh single press failed');
    assert.equal(fresh.state.pairTurn.contacts[0].relief,0);await touch('touchCancel',[]);await reset();
    points=await begin(toy);await rotate(points);
    await waitFor(data=>data.state.pairTurn.contacts.every(c=>c.relief>0.8),'Turn before reset');
    await reset();await touch('touchCancel',[]);
    points=await begin(toy);await rotate(points);await viewport(844,390);
    await waitFor(data=>empty(data.state),'Orientation change retained pair state');await touch('touchCancel',[]);
    await viewport(390,844);await reset();
    const final=await diagnostics();assert.deepEqual(final.state.memory,neutral.memory);
    assert.ok(final.trace.length>0 && final.trace.every(event=>event.trusted),'Input must be native trusted events');
    assert.deepEqual(final.viewport,{width:390,height:844,scrollX:0,scrollY:0,scale:1});
    record(`${toy} complete`,{memory:final.state.memory,trustedEvents:final.trace.length});
  }
  assert.equal(errors.length,0,JSON.stringify(errors));record('passed',{backend,errors});
  await writeFile(join(artifacts,reportName),JSON.stringify({backend,results,errors},null,2));
} catch(error) {
  console.error(error);try {record('failure',{...await diagnostics(),screenshot:await screenshot('failure')});}catch {}
  await writeFile(join(artifacts,reportName),JSON.stringify({backend,results,errors,failure:String(error)},null,2));process.exitCode=1;
} finally {
  if(socket?.readyState===WebSocket.OPEN) {try {await send('Browser.close',{},null);}catch {}socket.close();}
  await delay(400);if(chrome.exitCode===null)chrome.kill();
}
