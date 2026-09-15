import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const backend=process.argv.includes('--webgl')?'webgl':'webgpu';
const artifacts=resolve('qa/artifacts');
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'codex-jelly-audio-'));
const chrome=spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,
  '--no-first-run','--no-default-browser-check','--mute-audio',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows','--enable-unsafe-webgpu',
  '--enable-unsafe-swiftshader','about:blank',
],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,session,sequence=0;
const pending=new Map(),contexts=new Map(),contextEvents=[],errors=[],results=[];
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
    text:document.body.innerText,url:location.href};
})()`);
const waitFor=async(predicate,label,timeout=10000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout) {
    const data=await diagnostics();
    if(predicate(data))return data;
    await delay(75);
  }
  throw new Error(`${label}: ${JSON.stringify(await diagnostics())}`);
};
const record=async label=>{
  const {state}=await diagnostics();
  const entry={label,backend:state?.backend,contacts:state?.contactCount,audio:state?.audio};
  results.push(entry);console.log(JSON.stringify(entry));return state;
};
const click=async selector=>{
  const point=await evaluate(`(()=>{
    const element=document.querySelector(${JSON.stringify(selector)});
    if(!element || element.disabled)return null;
    const rect=element.getBoundingClientRect();
    return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  })()`);
  if(!point)throw new Error(`No enabled UI control: ${selector}`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
};
const touch=(type,points)=>send('Input.dispatchTouchEvent',{
  type,touchPoints:points.map(({id,x,y})=>({id,x,y,radiusX:12,radiusY:12,force:0.6})),
});
const moveHands=async points=>{
  let active=false;
  for(let step=0;step<16;step++) {
    const moved=points.map((point,index)=>({id:point.id,x:point.x+Math.sin(step*0.6)*22*(index? -1:1),y:point.y+Math.cos(step*0.6)*12}));
    await touch('touchMove',moved);await delay(55);
    const {state}=await diagnostics();
    if(state?.audio?.gestureActive && state.contactCount===points.length)active=true;
    if((state?.audio?.transientVoices??0)>3)throw new Error('Transient voice limit exceeded');
  }
  if(!active)throw new Error(`Moving hands never activated gesture audio: ${JSON.stringify(await diagnostics())}`);
};
try {
  let portInfo;
  for(let i=0;i<100;i++) {
    try {portInfo=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}
    catch {await delay(100);}
  }
  if(!portInfo)throw new Error('Isolated Chrome did not start');
  socket=new WebSocket(`ws://127.0.0.1:${portInfo[0]}${portInfo[1]}`);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id) {
      const request=pending.get(message.id);if(!request)return;pending.delete(message.id);
      if(message.error)request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result);
    } else if(message.method==='WebAudio.contextCreated' || message.method==='WebAudio.contextChanged') {
      const context=message.params.context;contexts.set(context.contextId,context.contextState);
      contextEvents.push({event:message.method,id:context.contextId,state:context.contextState});
    } else if(message.method==='WebAudio.contextWillBeDestroyed') {
      contexts.set(message.params.contextId,'destroyed');contextEvents.push({event:message.method,id:message.params.contextId});
    } else if(message.method==='Runtime.exceptionThrown' || message.method==='Log.entryAdded' && message.params.entry.level==='error')errors.push(message);
  });
  const {targetId}=await send('Target.createTarget',{url:'about:blank'},null);
  ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await send('WebAudio.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await send('Page.navigate',{url:`http://127.0.0.1:5174/?toy=cushion${backend==='webgl'?'&renderer=webgl':''}`});
  await waitFor(data=>data.state?.entrance>=0.95,'Toy readiness',25000);
  await record('initially muted');
  await click('button[aria-label="Enable cushion sounds"]');
  await waitFor(data=>data.state?.audio?.enabled && data.state.audio.contextState==='running','UI sound enable');
  await record('enabled through trusted UI click');

  const points=[{id:10,x:159,y:423},{id:20,x:233,y:423}];
  await touch('touchStart',points);await moveHands(points);
  await record('two fingers moving');
  await waitFor(data=>data.state?.contactCount===2 && !data.state.audio.gestureActive && data.state.audio.transientVoices===0,'Stationary hands must fall quiet');
  await record('held still is quiet');
  await moveHands(points);await touch('touchEnd',[points[1]]);await moveHands([points[0]]);
  await record('one finger released, other still moving');
  await touch('touchEnd',[]);
  await waitFor(data=>data.state?.contactCount===0 && !data.state.audio.gestureActive && data.state.audio.transientVoices===0,'Release must finish all voices');
  await record('release finishes voices');

  await touch('touchStart',[{id:30,x:195,y:423}]);await moveHands([{id:30,x:195,y:423}]);
  await click('button[aria-label="Mute cushion sounds"]');await touch('touchEnd',[]);
  await waitFor(data=>data.state?.audio && !data.state.audio.enabled && !data.state.audio.gestureActive && data.state.audio.transientVoices===0,'Mute must clear audio');
  await record('mute while moving clears audio');
  for(let index=0;index<4;index++) {
    await click('button[aria-label$="cushion sounds"]');await delay(65);
  }
  await waitFor(data=>data.state?.audio && !data.state.audio.enabled && !data.state.audio.gestureActive,'Rapid toggles finish muted');
  await record('rapid toggles finish muted');

  await click('button[aria-label="Enable cushion sounds"]');
  await waitFor(data=>data.state?.audio?.enabled,'Re-enable before switching');
  const oldContexts=[...contexts].filter(([,state])=>state==='running').map(([id])=>id);
  if(oldContexts.length!==1)throw new Error(`Expected one shared context before switch: ${JSON.stringify([...contexts])}`);
  await click('button[aria-label="Open toy collection"]');await delay(150);
  await click('a[href*="toy=jelly"]');
  await waitFor(data=>data.state?.shape==='jelly' || data.state?.shape==='pebble' && data.state?.entrance>=0.95,'Toy switch readiness',25000);
  await waitFor(()=>oldContexts.every(id=>['closed','destroyed'].includes(contexts.get(id))),'Old audio context must close');
  await record('toy switch closes old context');
  if(errors.length)throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({label:'passed',contextEvents}));
  await writeFile(join(artifacts,`audio-${backend}-results.json`),JSON.stringify({backend,results,contextEvents,errors},null,2));
} catch(error) {
  console.error(error);
  await writeFile(join(artifacts,`audio-${backend}-results.json`),JSON.stringify({backend,results,contextEvents,errors,failure:String(error)},null,2));
  process.exitCode=1;
} finally {
  if(socket?.readyState===WebSocket.OPEN) {
    try {await send('Browser.close',{},null);} catch {}
    socket.close();
  }
  await delay(400);if(chrome.exitCode===null)chrome.kill();
}
