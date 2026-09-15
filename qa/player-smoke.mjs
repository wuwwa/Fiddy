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
    mode:document.querySelector('[data-toy-mode]')?.dataset.toyMode, modeSwitch:!!document.querySelector('.mode-switch'), ready:!!document.querySelector('.toy-player.is-ready'),width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,
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
  await viewport(1440,900);
  await send('Page.navigate',{url:`${origin}/?toy=switchboard&renderer=webgl&qa=keep#controls`});
  let data=await waitFor(data=>data.ready && data.diagnostics?.frames>2,'Initial toy readiness');
  assert.equal(data.mode, 'free'); assert.equal(data.modeSwitch, false);
  const documentId=data.documentId;
  record('unknown route',{...data,screenshot:await screenshot('desktop')});
  if(!baseline){assert.equal(new URL(data.url).searchParams.get('toy'),'jelly');assert.equal(new URL(data.url).searchParams.get('renderer'),'webgl');assert.equal(new URL(data.url).searchParams.get('qa'),'keep');assert.equal(new URL(data.url).hash,'#controls');}
  await click('.collection-trigger');
  await waitFor(data=>data.dialog.open,'Collection did not open');
  await delay(150);
  const paused=(await state()).diagnostics.frames;
  await delay(300);assert.equal((await state()).diagnostics.frames,paused,'The collection should pause the background toy');
  for(let i=0;i<16;i++){
    await key('Tab','Tab',9);const tabbed=await state();
    assert.ok(tabbed.dialog.modal,'Collection must remain a native modal');
    // Native dialogs may yield focus to browser chrome at the end of the tab
    // order, represented by BODY. Background page controls must stay inert.
    assert.ok(tabbed.focus.inDialog || tabbed.focus.tag==='BODY','Tab reached a background page control');
  }
  await key('Escape','Escape',27);
  data=await waitFor(data=>!data.dialog.open,'Escape did not close collection');
  assert.ok(data.focus.className.split(' ').includes('collection-trigger'),'Closing the collection should restore its opener');
  await click('.control-pill button[aria-pressed]');
  await waitFor(data=>data.controls.some(control=>control.pressed==='true' && !control.disabled),'Sound did not enable');
  for(const toy of ['cushion','loop']){
    await click('.collection-trigger');await waitFor(data=>data.dialog.open,'Collection did not reopen');
    await click(`.collection-item[href*="toy=${toy}"]`);
    data=await waitFor(data=>data.toy===toy && data.ready && !data.dialog.open && data.diagnostics?.entrance>=0.95,`${toy} selection`);
    assert.equal(data.mode, 'resting'); assert.equal(data.modeSwitch, false);
    assert.equal(data.documentId,documentId,'The document reloaded while selecting a toy');
    assert.equal(data.controls.find(control=>control.pressed!==null).pressed,'true','Sound preference did not follow selection');
    assert.equal(new URL(data.url).searchParams.get('renderer'),'webgl');
    if(!baseline)assert.equal(new URL(data.url).hash,'#controls','Toy selection should preserve the current fragment');
  }
  const history=await send('Page.getNavigationHistory');
  await send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id});
  data=await waitFor(data=>data.toy==='cushion' && data.ready && data.diagnostics?.entrance>=0.95,'History navigation did not restore Cushion');
  assert.equal(data.documentId,documentId,'The document reloaded during Back navigation');
  assert.equal(data.controls.find(control=>control.pressed!==null).pressed,'true');
  record('desktop navigation and sound',{...data});
  await viewport(390,844,true);
  await click('.collection-trigger');await waitFor(data=>data.dialog.open,'Mobile collection did not open');
  record('mobile collection',{...await state(),screenshot:await screenshot('mobile-collection')});
  await evaluate(`(()=>{const list=document.querySelector('.collection-list'),dialog=document.querySelector('dialog');const scroller=getComputedStyle(list).overflowY==='auto'?list:dialog;scroller.scrollTop=scroller.scrollHeight;})()`);
  record('mobile collection at bottom',{...await state(),screenshot:await screenshot('mobile-collection-bottom')});
  if(!baseline){
    data=await state();
    assert.ok(data.dialog.close.y>=0 && data.dialog.close.bottom<data.height,'Close must remain visible at the end of the collection');
    assert.equal(await evaluate(`(()=>{const e=document.querySelector('.close-collection'),r=e.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.close-collection');})()`),true);
    await click('.close-collection');await waitFor(data=>!data.dialog.open,'Pinned close did not dismiss the collection');
    await click('.collection-trigger');await waitFor(data=>data.dialog.open,'Collection did not reopen');
    assert.equal((await state()).focus.className,'close-collection');
    const cards=(await state()).cards;
    for(let i=0;i<cards.length*2-1;i++)await key('Tab','Tab',9);
    data=await state();const last=data.cards.at(-1);
    assert.equal(data.focus.href,last.href,'Keyboard focus did not reach the final toy');
    assert.ok(last.y>=data.dialog.list.y && last.bottom<=data.dialog.list.bottom,'The focused final card must stay fully visible below the header');
    record('last collection card focused',{...data,screenshot:await screenshot('last-card-focused')});
    await click('.collection-card:last-child .collection-item');
    const lastId=new URL(last.href,origin).searchParams.get('toy');
    await waitFor(data=>data.toy===lastId && data.ready && !data.dialog.open,'The final card did not select by pointer');
    const back=await send('Page.getNavigationHistory');
    await send('Page.navigateToHistoryEntry',{entryId:back.entries[back.currentIndex-1].id});
    await waitFor(data=>data.toy==='cushion' && data.ready && data.diagnostics?.entrance>=0.95,'Return from final card');
  }else{await key('Escape','Escape',27);await waitFor(data=>!data.dialog.open,'Mobile collection did not close');}
  for(const [width,height] of [[844,390],[568,320],[844,280]]){
    await viewport(width,height,true);
    data=await state();record(`landscape controls ${width}x${height}`,{...data,screenshot:await screenshot(`landscape-${width}x${height}`)});
    if(!baseline){assert.ok(data.scrollHeight<=data.height,'Landscape should fit in one screen');for(const control of data.controls){assert.ok(control.y>=0 && control.bottom<=data.height,'Shared controls must remain visible in landscape');}}
  }
  assert.equal(errors.length,0,JSON.stringify(errors));record('passed',{baseline,errors});
} catch(error){console.error(error);try{record('failure',{...await state(),screenshot:await screenshot('failure')});}catch{};process.exitCode=1;results.push({failure:String(error)});}
finally{
  await writeFile(join(artifacts,`player-${baseline?'before':'after'}-results.json`),JSON.stringify({baseline,results,errors,navigationEvents},null,2));
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},null);}catch{}socket.close();}
  await delay(300);if(chrome.exitCode===null)chrome.kill();
}
