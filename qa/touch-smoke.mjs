import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const browserPath=process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const backend=process.argv.includes('--webgpu')?'webgpu':'webgl';
const probeOnly=process.argv.includes('--probe');
const artifacts=resolve('qa/artifacts');
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'codex-jelly-touch-'));
const chrome=spawn(browserPath,[
  '--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,
  '--no-first-run','--no-default-browser-check','--disable-background-timer-throttling',
  '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--enable-unsafe-webgpu','--enable-unsafe-swiftshader','about:blank',
],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
const pending=new Map();
const errors=[];
let sequence=0,session;
const send=(method,params={},sessionId=session)=>new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},15000);
  pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
  socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});
const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
const diagnostics=()=>evaluate(`(()=>{
  const canvas=document.querySelector('canvas');
  return {state:canvas?.dataset.diagnostics?JSON.parse(canvas.dataset.diagnostics):null,
    viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,scale:visualViewport?.scale},
    controls:[...document.querySelectorAll('button')].map(button=>({label:button.getAttribute('aria-label'),text:button.textContent})),
    text:document.body.innerText};
})()`);
const waitFor=async(predicate,label,timeout=15000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout) {
    const current=await diagnostics();
    if(predicate(current)) return current;
    await delay(100);
  }
  throw new Error(`${label}: ${JSON.stringify(await diagnostics())}`);
};
const screenshot=async label=>{
  const path=join(artifacts,`touch-${backend}-${label}.png`);
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path,Buffer.from(data,'base64'));
  return path;
};
const touch=(type,points)=>send('Input.dispatchTouchEvent',{
  type,touchPoints:points.map(({id,x,y})=>({id,x,y,radiusX:12,radiusY:12,force:0.6})),
});
const results=[];
const record=(label,data)=>{results.push({label,...data});console.log(JSON.stringify({label,...data}));};
const check=async(label,count)=>{
  const data=await waitFor(data=>data.state?.contactCount===count && data.state?.pointerCount===count,label);
  record(label,{contactCount:data.state.contactCount,pointerCount:data.state.pointerCount,
    viewport:data.viewport,compression:data.state.compression,displacement:data.state.displacement});
  if(data.viewport.scrollX!==0 || data.viewport.scrollY!==0 || data.viewport.scale!==1) throw new Error(`${label}: page scrolled or zoomed`);
  return data;
};
try {
  let portInfo;
  for(let i=0;i<100;i++) {
    try { portInfo=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break; }
    catch { await delay(100); }
  }
  if(!portInfo) throw new Error('Isolated Chrome did not start');
  socket=new WebSocket(`ws://127.0.0.1:${portInfo[0]}${portInfo[1]}`);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id) {
      const request=pending.get(message.id);if(!request)return;
      pending.delete(message.id);
      if(message.error) request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result);
    } else if(message.method==='Runtime.exceptionThrown' || message.method==='Log.entryAdded' && message.params.entry.level==='error') errors.push(message);
  });
  const {targetId}=await send('Target.createTarget',{url:'about:blank'},null);
  ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await send('Page.navigate',{url:`http://127.0.0.1:5174/?toy=cushion${backend==='webgl'?'&renderer=webgl':''}`});
  const ready=await waitFor(data=>data.state?.entrance>=0.95,'Toy did not become ready',25000);
  const expectedBackend=backend==='webgl'?'WebGLBackend':'WebGPUBackend';
  if(ready.state.backend!==expectedBackend) throw new Error(`Expected ${expectedBackend}, got ${ready.state.backend}`);
  record('ready',{backend:ready.state.backend,viewport:ready.viewport,screenshot:await screenshot('baseline')});
  if(!probeOnly) {
    let points=[{id:10,x:159,y:423},{id:20,x:233,y:423}];
    await touch('touchStart',[points[0]]);await check('first finger',1);
    await touch('touchStart',[points[1]]);await check('second non-primary finger',2);
    await delay(500);record('two held',{screenshot:await screenshot('held')});
    for(let step=1;step<=8;step++) {
      points=[{id:10,x:159+step*2.5,y:423},{id:20,x:233-step*2.5,y:423}];
      await touch('touchMove',points);await delay(35);
    }
    await check('pinch inward',2);
    for(let step=1;step<=12;step++) {
      points=[{id:10,x:179-step*5,y:423-step*2},{id:20,x:213+step*5,y:423-step*2}];
      await touch('touchMove',points);await delay(35);
    }
    await check('pull apart',2);record('apart held',{screenshot:await screenshot('apart')});
    // Chromium's WebTouch path accepts the changed point on touchEnd. A subset
    // touchMove changes that point's position; it does not end omitted fingers.
    await touch('touchEnd',[points[1]]);await check('partial release',1);
    await touch('touchCancel',[]);await check('cancel remaining',0);
    await delay(800);
    points=[{id:30,x:159,y:423},{id:40,x:233,y:423}];
    await touch('touchStart',points);await check('two before reset',2);
    await evaluate(`document.querySelector('button[aria-label="Reset cushion"]').click()`);
    await check('reset clears both',0);await touch('touchEnd',[]);
    await delay(250);
    points=[{id:50,x:159,y:423},{id:60,x:233,y:423}];
    await touch('touchStart',points);await check('two before blur',2);
    await evaluate(`document.querySelector('button[aria-label="Reset cushion"]').focus()`);
    await check('canvas blur clears both',0);await touch('touchEnd',[]);
    if(errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
    record('finished',{errors});
  }
  await writeFile(join(artifacts,`touch-${backend}-results.json`),JSON.stringify({backend,results,errors},null,2));
} catch(error) {
  console.error(error);
  try { record('failure screenshot',{screenshot:await screenshot('failure')}); } catch {}
  await writeFile(join(artifacts,`touch-${backend}-results.json`),JSON.stringify({backend,results,errors,failure:String(error)},null,2));
  process.exitCode=1;
} finally {
  if(socket?.readyState===WebSocket.OPEN) {
    try { await send('Browser.close',{},null); } catch {}
    socket.close();
  }
  await delay(400);
  if(chrome.exitCode===null) chrome.kill();
}
