import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Native mouse/touch events in disposable isolated Chrome, never the user's tab.
const backend=process.argv.includes('--webgl')?'webgl':'webgpu';
const probe=process.argv.includes('--probe');
const visualOnly=process.argv.includes('--visual-only');
const origin=process.env.QA_ORIGIN ?? 'http://127.0.0.1:5174';
const artifacts=resolve('qa/artifacts');
await mkdir(artifacts,{recursive:true});
const reportPath=join(artifacts,`flick-${backend}${probe?'-probe':visualOnly?'-visual':''}-results.json`);
const profile=await mkdtemp(join(tmpdir(),'codex-jelly-flick-'));
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
    trace:window.__qaPointerEvents ?? []};
})()`);
const waitFor=async(predicate,label,timeout=15000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout) {
    const data=await diagnostics();
    if(predicate(data))return data;
    await delay(20);
  }
  throw new Error(`${label}: ${JSON.stringify(await diagnostics())}`);
};
const record=(label,data={})=>{
  const entry={label,...data};results.push(entry);
  console.log(JSON.stringify(data.samples?{label,maxDisplacement:data.maxDisplacement,maxSpeed:data.maxSpeed,flickCount:data.after.state.flickCount,lastFlick:data.after.state.lastFlick,samples:data.samples.length}:entry));
};
const screenshot=async label=>{
  const path=join(artifacts,`flick-${backend}-${label}.png`);
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path,Buffer.from(data,'base64'));
  return path;
};
const mouse=(type,point)=>send('Input.dispatchMouseEvent',{
  type,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...point,
});
const touch=(type,points)=>send('Input.dispatchTouchEvent',{
  type,touchPoints:points.map(point=>({...point,radiusX:10,radiusY:10,force:0.65})),
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
const contacts=(count,label)=>waitFor(data=>data.state?.pointerCount===count && data.state.contactCount===count && data.grabbing===(count>0),label);
const assertFinite=state=>{
  for(const name of ['height','width','displacement','speed'])assert.ok(Number.isFinite(state[name]),`${name} must remain finite`);
  assert.ok(state.volumeRatio>0.6 && state.volumeRatio<1.6,'The lattice must retain bounded volume');
};
const reset=async()=>{
  await click('button[aria-label^="Reset "]');
  await waitFor(data=>released(data) && data.state.displacement<0.01,'Reset must restore the body');
  await delay(80);
  await evaluate('window.__qaPointerEvents=[]');
};
const observe=async(duration=400)=>{
  const started=Date.now(),samples=[];
  while(Date.now()-started<duration) {
    const data=await diagnostics();assertFinite(data.state);
    samples.push({elapsed:Date.now()-started,...data.state});
    await delay(16);
  }
  return {samples,maxDisplacement:Math.max(...samples.map(sample=>sample.displacement)),maxSpeed:Math.max(...samples.map(sample=>sample.speed)),after:await diagnostics()};
};
const mouseTrial=async(label,{move,up={x:195,y:405},hold=100,settle=0,cancel=false,capture=false}={})=>{
  await reset();
  await mouse('mousePressed',{x:195,y:405});
  await waitFor(data=>data.grabbing,'Native mouse must hit actual skin');
  await delay(hold);
  const before=capture?{state:(await diagnostics()).state,screenshot:await screenshot('before-release')}:null;
  if(move)await mouse('mouseMoved',move);
  if(settle)await delay(settle);
  if(cancel)await evaluate(`document.querySelector('button[aria-label^="Reset "]').focus()`);
  else await mouse('mouseReleased',up);
  await waitFor(released,`${label}: release must clear its grip`);
  const after=capture?{state:(await diagnostics()).state,screenshot:await screenshot('after-release')}:null;
  const observed=await observe();
  if(cancel)await mouse('mouseReleased',up);
  record(label,observed);
  if(capture)record(`${label} visual checkpoints`,{before,after});
  return observed;
};
const assertFlick=(observed,{x=0,y=0,count=1}={})=>{
  const state=observed.after.state;
  assert.equal(state.flickCount,count,'Only the intended normal release may transfer pending motion');
  if(!count) {assert.equal(state.lastFlick,null);return;}
  assert.ok(state.lastFlick,'A pending final movement must produce a recorded kick');
  if(x)assert.ok(state.lastFlick.x*x>0.1,'Release must preserve horizontal direction');
  if(y)assert.ok(state.lastFlick.y*y>0.1,'Release must preserve vertical direction');
  assert.ok(Math.hypot(state.lastFlick.x,state.lastFlick.y,state.lastFlick.z)<=8.001,'A release kick must remain bounded');
  if(x)assert.ok(observed.samples.some(sample=>sample.meanOffset.x*x>0.002),'The physical body must follow the horizontal release');
};
const touchTrial=async(label,{cancel=false,finalOnly=false}={})=>{
  await reset();
  const start={id:++touchId,x:195,y:405};
  await touch('touchStart',[start]);await contacts(1,'Touch must grab actual skin');
  await delay(70);
  if(!finalOnly)await touch('touchMove',[{...start,x:219,y:389}]);
  if(cancel)await touch('touchCancel',[]);
  else await touch('touchEnd',[{...start,x:260,y:350}]);
  await waitFor(released,`${label}: native touch must release`);
  const observed=await observe();record(label,observed);
  assertFlick(observed,cancel?{count:0}:{x:1,y:1});
  return observed;
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
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await send('Page.navigate',{url:`${origin}/?toy=cushion${backend==='webgl'?'&renderer=webgl':''}`});
  const ready=await waitFor(data=>data.state?.entrance>=0.95,'Toy readiness',30000);
  assert.equal(ready.state.backend,backend==='webgl'?'WebGLBackend':'WebGPUBackend');
  await evaluate(`(()=>{
    window.__qaPointerEvents=[];
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,event=>{
      window.__qaPointerEvents.push({type,pointerType:event.pointerType,trusted:event.isTrusted,id:event.pointerId,x:event.clientX,y:event.clientY,time:event.timeStamp});
      if(window.__qaPointerEvents.length>30)window.__qaPointerEvents.shift();
    },true);
  })()`);
  record('ready',{backend:ready.state.backend});
  if(visualOnly) {
    assertFlick(await mouseTrial('Visual release-position-only move',{up:{x:260,y:350},capture:true}),{x:1,y:1});
  } else {
  const control=await mouseTrial('Stationary release');
  const endpoint=await mouseTrial('Release-position-only move',{up:{x:260,y:350}});
  record('Endpoint comparison',{control:control.maxDisplacement,endpoint:endpoint.maxDisplacement,trace:endpoint.after.trace});
  if(!probe) {
    assertFlick(control,{count:0});assertFlick(endpoint,{x:1,y:1});
    assert.ok(endpoint.after.trace.some(event=>event.type==='pointerup' && event.x===260 && event.trusted),'Endpoint-only sample must come from trusted pointerup');
    assert.equal(endpoint.after.trace.some(event=>event.type==='pointermove'),false,'Endpoint case must not depend on a separate move event');
    assertFlick(await mouseTrial('Quick mouse flick',{move:{x:224,y:389},up:{x:260,y:350}}),{x:1,y:1});
    assertFlick(await mouseTrial('Leftward final movement',{up:{x:115,y:405}}),{x:-1});
    assertFlick(await mouseTrial('Upward final movement',{up:{x:195,y:330}}),{y:1});
    assertFlick(await mouseTrial('Movement consumed before release',{move:{x:235,y:385},up:{x:235,y:385},settle:250}),{count:0});
    assertFlick(await mouseTrial('Blur discards final pending movement',{move:{x:240,y:380},up:{x:240,y:380},cancel:true}),{count:0});
    await touchTrial('Quick native touch flick');
    await touchTrial('Native touch release-position-only move',{finalOnly:true});
    await touchTrial('Touch cancellation discards pending movement',{cancel:true});

    await reset();
    const first={id:++touchId,x:159,y:423},second={id:++touchId,x:233,y:423};
    await touch('touchStart',[first,second]);await contacts(2,'Two independent fingers must grab');
    await delay(80);
    await touch('touchEnd',[{...first,x:115,y:390}]);
    const partial=await contacts(1,'Releasing one finger must preserve the remaining contact');
    assert.equal(partial.state.flickCount,1);assert.ok(partial.state.lastFlick.x<0);
    const remainingTrace=partial.trace.filter(event=>event.type==='pointerdown');
    assert.equal(remainingTrace.length,2);
    assert.equal(partial.state.lastFlick.id,remainingTrace[0].id,'The kick belongs to the released finger');
    await touch('touchMove',[{...second,x:265,y:390}]);await delay(120);
    const remaining=await contacts(1,'The retained finger must still move its contact');
    assertFinite(remaining.state);assert.equal(remaining.state.flickCount,1);
    await touch('touchCancel',[]);await waitFor(released,'Remaining finger cancellation');
    const completed=await diagnostics();assert.equal(completed.state.flickCount,1);
    record('Independent partial release',{partial,remaining,completed});
    assertFlick(await mouseTrial('Extreme release remains bounded',{up:{x:-600,y:-500}}),{x:-1,y:1});
    await reset();
    const final=await diagnostics();assert.equal(final.state.flickCount,0);assert.equal(final.state.lastFlick,null);
    record('Reset clears release state',{state:final.state});
  }
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
