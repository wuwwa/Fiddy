import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const baseline=process.argv.includes('--baseline');
const origin=process.env.QA_ORIGIN ?? 'http://127.0.0.1:5174';
const artifacts=resolve('qa/artifacts');await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'codex-player-'));
const chrome=spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run',
  '--no-default-browser-check','--mute-audio','--enable-unsafe-webgpu','--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank',
],{windowsHide:true,stdio:'ignore'});
let launchError,socket,session,sequence=0;
chrome.on('error',error=>{launchError=error;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map(),errors=[],results=[],navigationEvents=[];
const send=(method,params={},sessionId=session)=>new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},15000);
  pending.set(id,{resolve:result=>{clearTimeout(timer);resolve(result);},reject:error=>{clearTimeout(timer);reject(error);}});
  socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});
const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const state=()=>evaluate(`(()=>{
  const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
  const dialog=document.querySelector('dialog'),canvas=document.querySelector('canvas'),list=document.querySelector('.collection-list');
  return {url:location.href,title:document.title,documentId:window.__qaDocument,toy:document.querySelector('[data-toy-id]')?.dataset.toyId,
    ready:!!document.querySelector('.toy-player.is-ready'),width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,
    stage:document.querySelector('.toy')?rect(document.querySelector('.toy')):null,
    masthead:document.querySelector('.masthead')?rect(document.querySelector('.masthead')):null,
    dock:document.querySelector('.interaction-dock')?rect(document.querySelector('.interaction-dock')):null,
    controls:[...document.querySelectorAll('.control-pill button')].map(button=>({label:button.getAttribute('aria-label'),pressed:button.getAttribute('aria-pressed'),disabled:button.disabled,...rect(button)})),
    dialog:{open:!!dialog?.open,modal:!!dialog?.matches(':modal'),scroll:dialog?.scrollTop,close:dialog?rect(dialog.querySelector('.close-collection')):null,
      heading:dialog?rect(dialog.querySelector('.collection-heading')):null,list:list?rect(list):null,listScroll:list?.scrollTop},
    focus:{tag:document.activeElement?.tagName,className:document.activeElement?.className,href:document.activeElement?.getAttribute('href'),inDialog:!!dialog?.contains(document.activeElement)},
    cards:[...document.querySelectorAll('.collection-item')].map(a=>({text:a.querySelector('strong').textContent,href:a.getAttribute('href'),current:a.getAttribute('aria-current'),...rect(a)})),
    diagnostics:canvas?.dataset.diagnostics?JSON.parse(canvas.dataset.diagnostics):null};
})()`);
const waitFor=async(predicate,label,timeout=20000)=>{
  const started=Date.now();while(Date.now()-started<timeout){const data=await state();if(predicate(data))return data;await delay(30);}
  throw new Error(`${label}: ${JSON.stringify(await state())}`);
};
const record=(label,data)=>{results.push({label,...data});console.log(JSON.stringify({label,...data}));};
const screenshot=async label=>{
  const path=join(artifacts,`player-${baseline?'before':'after'}-${label}.png`);
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path,Buffer.from(data,'base64'));return path;
};
const click=async selector=>{
  if(await evaluate(`document.querySelector('dialog')?.getAnimations().some(a=>a.playState==='running')`))await delay(240);
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  assert.ok(point,`Missing ${selector}`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
};
const key=async(code,key,windowsVirtualKeyCode)=>{
  await send('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode});
  await send('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode});
};
const viewport=async(width,height,mobile=false)=>{
  await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
  await delay(120);
};
try {
  let port;
  for(let i=0;i<100;i++){
    if(launchError)throw launchError;
    try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}catch{await delay(100);}
  }
  assert.ok(port,'Chrome did not launch');
  socket=new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const request=pending.get(message.id);if(!request)return;pending.delete(message.id);if(message.error)request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown' || message.method==='Log.entryAdded' && message.params.entry.level==='error')errors.push(message);
    else if(message.method==='Page.frameNavigated' || message.method==='Page.navigatedWithinDocument')navigationEvents.push({method:message.method,params:message.params});
    else if(message.method==='Runtime.consoleAPICalled' && message.params.args.some(arg=>String(arg.value).includes('[vite]')))navigationEvents.push({method:message.method,messages:message.params.args.map(arg=>arg.value)});
  });
  const {targetId}=await send('Target.createTarget',{url:'about:blank'},null);
  ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__qaDocument=crypto.randomUUID()'});
  await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  const report={environment:'Desktop headless Chrome; emulated 390x844 touch viewport; not physical-phone results',entry:[],switches:[],sustained:[],http:[]};
  await viewport(390,844,true);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__toyFrames=[];let previous=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(t=>{if(previous&&t!==previous){window.__toyFrames.push(t-previous);if(window.__toyFrames.length>5000)window.__toyFrames.shift()}previous=t;fn(t)})`});
  for(const cacheDisabled of [true,false,false]){
    await send('Network.setCacheDisabled',{cacheDisabled});
    const prev=await evaluate('window.__qaDocument');
    await send('Page.navigate',{url:origin+'/?toy=jelly'});
    await waitFor(s=>s.ready&&s.documentId!==prev,'entry');
    report.entry.push({cacheDisabled,...await evaluate(`(()=>{const n=performance.getEntriesByType('navigation')[0];return{readyObservedMs:performance.now(),ttfbMs:n.responseStart,domContentLoadedMs:n.domContentLoadedEventEnd,transferredBytes:performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.transferSize,0)}})()`)});
  }
  for(let cycle=0;cycle<3;cycle++)for(const id of ['silk','magnetic-dust','ascii-tide','jelly']){
    await click('.collection-trigger');
    await delay(250); // Exclude the collection entrance animation from switch timing.
    const start=Date.now();await click(`.collection-item[href*="toy=${id}"]`);await waitFor(s=>s.ready&&s.toy===id,'switch');
    report.switches.push({cycle,id,observedMs:Date.now()-start});
  }
  for(const id of ['jelly','magnetic-dust','ascii-tide']){
    if((await state()).toy!==id){await click('.collection-trigger');await click(`.collection-item[href*="toy=${id}"]`);await waitFor(s=>s.ready&&s.toy===id,'sustained');}
    await delay(500);await evaluate('window.__toyFrames=[]');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:350,id:1}]});
    const started=Date.now();
    while(Date.now()-started<10000){const t=(Date.now()-started)/1000;await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190+40*Math.sin(t*3),y:350+30*Math.cos(t*2),id:1}]});await delay(50);}
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    report.sustained.push({id,durationMs:Date.now()-started,...await evaluate(`(()=>{const a=window.__toyFrames.slice().sort((a,b)=>a-b);return{samples:a.length,medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],over33ms:a.filter(n=>n>33.4).length}})()`)});
  }
  for(let i=0;i<4;i++){
    const start=performance.now();const response=await fetch('https://fid.fly.dev/');await response.arrayBuffer();
    report.http.push({request:i,label:i===0?'First observed request; cold state not established':'Subsequent request',status:response.status,totalMs:performance.now()-start});
  }
  report.errors=errors;await writeFile(join(artifacts,'daily-performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},null);}catch{}socket.close();}
  await delay(300);if(chrome.exitCode===null)chrome.kill();
}
