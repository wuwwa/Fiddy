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
  const result=await send('Runtime.evaluate',{expression,returnByValue:true});
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
  await viewport(480,480,true);
  await send('Page.navigate',{url:`${origin}/?toy=jelly`});
  await waitFor(data=>data.ready,'Ready');
  const ids=await evaluate(`[...document.querySelectorAll('.collection-item')].map(a=>new URL(a.href).searchParams.get('toy'))`);
  await mkdir(resolve('public/previews'),{recursive:true});
  for(const id of ids.filter(id=>!process.argv.some(a=>a.startsWith('--toy='))||process.argv.includes('--toy='+id))){
    await send('Page.navigate',{url:`${origin}/?toy=${id}`});
    await waitFor(data=>data.ready && data.toy===id,`Ready ${id}`);
    await evaluate(`(()=>{const style=document.createElement('style');style.textContent='.masthead,.interaction-dock,.mode-switch,button,input,label,.astra-speed,.astra-motion-controls,.astra-shape-bar,.astra-switch,.astra-angle-readout,.silk-palette,.slice-angle{visibility:hidden!important}';document.head.append(style)})()`);
    await delay(2200);
    const {data}=await send('Page.captureScreenshot',{format:'webp',quality:78,clip:{x:0,y:60,width:480,height:360,scale:0.5},captureBeyondViewport:false});
    await writeFile(resolve('public/previews',`${id}.webp`),Buffer.from(data,'base64'));
    console.log(`Captured ${id}`);
  }
} finally {
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},null);}catch{}socket.close();}
  await delay(300);if(chrome.exitCode===null)chrome.kill();
}

