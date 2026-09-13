import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Trusted input in an isolated browser. No user browser or tab is touched.
const backend=process.argv.includes('--webgl')?'webgl':'webgpu';
const probe=process.argv.includes('--probe');
const layoutOnly=process.argv.includes('--layout-only');
const origin=process.env.QA_ORIGIN ?? 'http://127.0.0.1:5174';
const artifacts=resolve('qa/artifacts');
const reportPath=join(artifacts,`resize-${backend}${probe?'-probe':layoutOnly?'-layout':''}-results.json`);
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'codex-jelly-resize-'));
const chrome=spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,
  '--no-first-run','--no-default-browser-check','--mute-audio',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows','--enable-unsafe-webgpu',
  '--enable-unsafe-swiftshader','about:blank',
],{windowsHide:true,stdio:'ignore'});
let launchError;
chrome.on('error',error=>{launchError=error;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,session,sequence=0,touchId=100;
const pending=new Map(),errors=[],results=[];
const send=(method,params={},sessionId=session)=>new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},15000);
  pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
  socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});
const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{expression,returnByValue:true});
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const diagnostics=()=>evaluate(`(()=>{
  const canvas=document.querySelector('canvas');
  return {state:canvas?.dataset.diagnostics?JSON.parse(canvas.dataset.diagnostics):null,
    grabbing:!!canvas?.classList.contains('is-grabbing'),
    toy:document.querySelector('.toy-player')?.dataset.toyId,
    viewport:{width:innerWidth,height:innerHeight,canvasWidth:canvas?.clientWidth,canvasHeight:canvas?.clientHeight},
    trace:window.__qaPointerEvents ?? []};
})()`);
const waitFor=async(predicate,label,timeout=15000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout) {
    const data=await diagnostics();
    if(predicate(data))return data;
    await delay(30);
  }
  throw new Error(`${label}: ${JSON.stringify(await diagnostics())}`);
};
const record=(label,data={})=>{const entry={label,...data};results.push(entry);console.log(JSON.stringify(entry));};
const screenshot=async label=>{
  const path=join(artifacts,`resize-${backend}-${label}.png`);
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path,Buffer.from(data,'base64'));
  return path;
};
const viewport=(width,height,deviceScaleFactor=1)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor,mobile:true});
const mouse=(type,point)=>send('Input.dispatchMouseEvent',{
  type,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...point,
});
const touch=(type,points)=>send('Input.dispatchTouchEvent',{
  type,touchPoints:points.map(point=>({...point,radiusX:10,radiusY:10,force:0.65})),
});
const key=(type,code)=>send('Input.dispatchKeyEvent',{
  type,code,key:code==='Space'?' ':code,windowsVirtualKeyCode:code==='Space'?32:code==='ArrowUp'?38:39,
});
const click=async selector=>{
  const point=await evaluate(`(()=>{
    const element=document.querySelector(${JSON.stringify(selector)});
    if(!element || element.disabled)return null;
    const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
  })()`);
  assert.ok(point,`Missing enabled control: ${selector}`);
  await mouse('mousePressed',point);await mouse('mouseReleased',point);
};
const released=data=>data.state?.contactCount===0 && data.state.pointerCount===0 && data.state.keyboardActive===false && !data.grabbing;
const contacts=async(count,label)=>waitFor(data=>data.state?.pointerCount===count && data.state.contactCount===count && data.grabbing===(count>0),label);
const assertFinite=state=>{
  for(const name of ['height','width','displacement','speed'])assert.ok(Number.isFinite(state[name]),`${name} must remain finite`);
  assert.ok(state.volumeRatio>0.6 && state.volumeRatio<1.6,'The lattice must retain a bounded volume');
};
const load=async toy=>{
  await viewport(390,844);
  await send('Page.navigate',{url:`${origin}/?toy=${toy}${backend==='webgl'?'&renderer=webgl':''}`});
  const data=await waitFor(data=>data.toy===toy && data.state?.entrance>=0.95 && data.state.reaction?.fatigue!==undefined,'Toy readiness',30000);
  await evaluate(`(()=>{
    window.__qaPointerEvents=[];
    for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,event=>{
      window.__qaPointerEvents.push({type,pointerType:event.pointerType,trusted:event.isTrusted,id:event.pointerId,x:event.clientX,y:event.clientY});
      if(window.__qaPointerEvents.length>30)window.__qaPointerEvents.shift();
    },true);
  })()`);
  assert.equal(data.state.backend,backend==='webgl'?'WebGLBackend':'WebGPUBackend');
  record(`${toy} ready`,{backend:data.state.backend,viewport:data.viewport});
  return data;
};
const reset=async()=>{
  await click('button[aria-label^="Reset "]');
  await waitFor(data=>released(data) && data.state.reaction.fatigue===0 && data.state.displacement<0.04,'Reset must clear current input and restore the material');
  await delay(80);
};
const assertResizeRelease=async(label,before,width,height)=>{
  await viewport(width,height);
  const after=await waitFor(data=>data.viewport.width===width && data.viewport.height===height && released(data),`${label}: stale interaction survived the CSS resize`);
  assertFinite(after.state);
  assert.equal(after.state.interactionCount,before.state.interactionCount,'Resize must not start a replacement interaction');
  assert.ok(after.state.displacement>0.08,'Resize must release the deformed skin, not reset it');
  assert.equal(after.state.reaction.pops,before.state.reaction.pops,'Resize must not rupture or reset the material');
  record(label,{before,after});
  return after;
};
const assertFreshGesture=async(point,label)=>{
  await mouse('mousePressed',point);
  const held=await contacts(1,`${label}: fresh skin grab failed`);
  assertFinite(held.state);
  await mouse('mouseReleased',point);
  await waitFor(released,`${label}: fresh gesture did not release`);
  record(label,{interactionCount:held.state.interactionCount});
};

try {
  let portInfo;
  for(let i=0;i<100;i++) {
    if(launchError)throw launchError;
    try {portInfo=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}
    catch {await delay(100);}
  }
  if(!portInfo)throw new Error('Isolated Chrome did not start');
  socket=new WebSocket(`ws://127.0.0.1:${portInfo[0]}${portInfo[1]}`);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id) {
      const request=pending.get(message.id);if(!request)return;
      pending.delete(message.id);
      if(message.error)request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result);
    } else if(message.method==='Runtime.exceptionThrown' || message.method==='Log.entryAdded' && message.params.entry.level==='error')errors.push(message);
  });
  const {targetId}=await send('Target.createTarget',{url:'about:blank'},null);
  ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await load('cushion');
  if(!layoutOnly) {
  await mouse('mousePressed',{x:195,y:405});
  await waitFor(data=>data.state?.pointerCount===1 && data.grabbing,'Mouse did not grab skin');
  for(let step=1;step<=10;step++) {
    await mouse('mouseMoved',{x:195-step*5,y:405-step*7});await delay(25);
  }
  const before=await diagnostics();
  assert.ok(before.state.displacement>0.15,'Resize must interrupt meaningful deformation');
  await viewport(844,390);
  await delay(160);
  const after=await diagnostics();
  record('held mouse across orientation change',{before,after,screenshot:await screenshot('mouse-landscape')});
  if(probe) {
    record('probe result',{released:released(after)});
  } else {
    assert.equal(released(after),true,'A camera size change must release the old grip');
    assert.ok(after.state.displacement>0.08,'Resize must allow the deformed body to recover naturally');
    assertFinite(after.state);
  }
  await mouse('mouseReleased',{x:145,y:335});
  await waitFor(released,'Late mouse release did not settle input');
  if(!probe) {
    // Restore a neutral body before checking new hit targets in landscape.
    await reset();
    await assertFreshGesture({x:422,y:185},'Fresh landscape mouse input');
    const landscape=(await diagnostics()).viewport;
    assert.equal(landscape.canvasWidth,844);assert.equal(landscape.canvasHeight,390);
    record('landscape layout',{viewport:landscape,screenshot:await screenshot('landscape')});

    await load('cushion');
    let points=[{id:++touchId,x:159,y:423},{id:++touchId,x:233,y:423}];
    await touch('touchStart',points);
    await contacts(2,'Two independent fingers must grab');
    for(let step=1;step<=8;step++) {
      points=[{...points[0],x:159-step*6,y:423-step*4},{...points[1],x:233+step*6,y:423-step*4}];
      await touch('touchMove',points);await delay(25);
    }
    const twoBefore=await diagnostics();
    await assertResizeRelease('Two fingers across orientation change',twoBefore,844,390);
    // A touch move after cancellation must not reattach either former contact.
    await touch('touchMove',points.map(point=>({...point,x:point.x+10})));
    await touch('touchEnd',[points[1]]);await touch('touchCancel',[]);
    await delay(100);
    assert.ok(released(await diagnostics()),'Late move/end/cancel must leave both contacts released');
    await viewport(390,844);await delay(100);await reset();
    points=[{id:++touchId,x:159,y:423},{id:++touchId,x:233,y:423}];
    await touch('touchStart',points);await contacts(2,'New two-finger gesture after rotation');
    await reset();
    await touch('touchCancel',[]);await waitFor(released,'Held reset and late two-finger cancellation');
    record('Late touch events and new two-finger gesture',{state:(await diagnostics()).state});

    await reset();
    await assertFreshGesture({x:195,y:405},'Focus canvas for keyboard');
    await key('keyDown','Space');await key('keyDown','ArrowUp');
    await waitFor(data=>data.state?.keyboardActive && data.state.contactCount===1 && data.state.displacement>0.2,'Keyboard stretch did not become active');
    const keyboardBefore=await diagnostics();
    await assertResizeRelease('Keyboard hold across orientation change',keyboardBefore,844,390);
    await key('keyUp','Space');await key('keyUp','ArrowUp');await delay(100);
    assert.ok(released(await diagnostics()),'Late keyup must leave the keyboard grip released');
    await reset();await assertFreshGesture({x:422,y:185},'Focus landscape canvas for keyboard');
    await key('keyDown','Space');
    await waitFor(data=>data.state?.keyboardActive && data.state.contactCount===1,'Fresh keyboard gesture after rotation');
    await key('keyUp','Space');await waitFor(released,'Fresh keyboard release');
    record('Fresh keyboard gesture',{state:(await diagnostics()).state});

    await load('cushion');
    points=[{id:++touchId,x:195,y:405}];
    await touch('touchStart',points);await contacts(1,'Single touch before resolution-only change');
    await viewport(390,844,2);await delay(160);
    const resolution=await diagnostics();
    assert.equal(resolution.state.contactCount,1,'Pixel density change with unchanged CSS size must retain the grip');
    assert.equal(resolution.grabbing,true);
    record('Same CSS viewport retains held grip',{viewport:resolution.viewport,state:resolution.state});
    await touch('touchEnd',points);await waitFor(released,'Resolution-only gesture release');
    await viewport(390,844,1);

    await load('jelly');
    await mouse('mousePressed',{x:195,y:405});await contacts(1,'Jelly fatigue grip');
    for(let step=1;step<=8;step++) {
      await mouse('mouseMoved',{x:195+step*16,y:405-step*26});await delay(25);
    }
    const fatigueBefore=await waitFor(data=>data.state?.reaction.fatigue>0.13 && data.state.reaction.phase==='ready','Subcritical strain did not accumulate fatigue');
    const fatigueAfter=await assertResizeRelease('Jelly retains fatigue across orientation change',fatigueBefore,844,390);
    assert.ok(fatigueAfter.state.reaction.fatigue>fatigueBefore.state.reaction.fatigue*0.7,'Resize must not wipe accumulated material fatigue');
    assert.equal(fatigueAfter.state.reaction.pops,0);
    await mouse('mouseReleased',{x:323,y:197});
    await reset();
    record('Reset after interrupted strain',{state:(await diagnostics()).state});

    // Keep a touch active while the collection pauses the old scene, then
    // switch toys and deliver that old gesture's final event to the new canvas.
    await load('cushion');
    points=[{id:++touchId,x:195,y:405}];
    await touch('touchStart',points);await contacts(1,'Touch before toy switch');
    await click('button[aria-label="Open toy collection"]');
    await waitFor(data=>!data.grabbing,'Collection must release the old interaction');
    await click('a.collection-item[href*="toy=jelly"]');
    await waitFor(data=>data.toy==='jelly' && data.state?.entrance>=0.95,'New toy did not finish loading',30000);
    await touch('touchEnd',points);await delay(100);
    assert.ok(released(await diagnostics()),'The disposed scene must not carry contacts into the new toy');
    await viewport(844,390);await delay(100);await reset();
    await assertFreshGesture({x:422,y:185},'New scene remains interactive after disposal and resize');
    record('Switch disposal',{state:(await diagnostics()).state});
    await load('cushion');
  }
  }
  if(!probe) {
    await viewport(844,280);await delay(200);
    const shortViewport=await evaluate(`(()=>{
      const rect=selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}:null;};
      return {canvas:rect('canvas'),dock:rect('.control-pill'),header:rect('.masthead'),scrollHeight:document.documentElement.scrollHeight,height:innerHeight};
    })()`);
    assert.equal(shortViewport.canvas.height,280,'Short landscape canvas must fit the actual viewport');
    assert.equal(shortViewport.scrollHeight,280,'Short landscape must not overflow vertically');
    assert.ok(shortViewport.dock.bottom<=280,'Sound and reset must remain fully visible');
    record('Short landscape visual check',{layout:shortViewport,screenshot:await screenshot('short-landscape')});
  }
  if(errors.length)throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  record('finished',{errors});
  await writeFile(reportPath,JSON.stringify({backend,results,errors},null,2));
} catch(error) {
  console.error(error);
  try {record('failure screenshot',{screenshot:await screenshot('failure')});}catch {}
  await writeFile(reportPath,JSON.stringify({backend,results,errors,failure:String(error)},null,2));
  process.exitCode=1;
} finally {
  if(socket?.readyState===WebSocket.OPEN) {
    try {await send('Browser.close',{},null);}catch {}
    socket.close();
  }
  await delay(400);
  if(chrome.exitCode===null)chrome.kill();
}
