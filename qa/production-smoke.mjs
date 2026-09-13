import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const baseline=process.argv.includes('--baseline');
const origin=process.env.QA_ORIGIN ?? 'http://127.0.0.1:4173';
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

  const originHeaders=await fetch(origin+'/');
  assert.match(originHeaders.headers.get('content-security-policy')??'',/frame-ancestors 'none'/);
  assert.equal(originHeaders.headers.get('x-content-type-options'),'nosniff');
  assert.equal(originHeaders.headers.get('x-frame-options'),'DENY');
  record('production headers',Object.fromEntries(originHeaders.headers));
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"\nwindow.__audit={callbacks:0,durations:[],intervals:[],last:0,contexts:[],devices:[],submits:0,draws:0};\nconst a=window.__audit,raf=requestAnimationFrame.bind(window);\nwindow.requestAnimationFrame=fn=>raf(t=>{const start=performance.now();if(a.last&&t!==a.last)a.intervals.push(t-a.last);a.last=t;a.callbacks++;try{fn(t);}finally{a.durations.push(performance.now()-start);if(a.durations.length>1200)a.durations.shift();if(a.intervals.length>1200)a.intervals.shift();}});\nconst getContext=HTMLCanvasElement.prototype.getContext,seen=new WeakSet();\nHTMLCanvasElement.prototype.getContext=function(...args){const ctx=getContext.apply(this,args);if(ctx&&!seen.has(ctx)){seen.add(ctx);if(args[0]==='webgl2'||args[0]==='webgl'){const item={kind:args[0],ref:new WeakRef(ctx),resources:{}};a.contexts.push(item);for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const draw=ctx[method].bind(ctx);ctx[method]=(...x)=>{a.draws++;return draw(...x);};}for(const kind of ['Texture','Buffer','Framebuffer','Renderbuffer','Program','Shader','VertexArray']){const create=ctx['create'+kind].bind(ctx),remove=ctx['delete'+kind].bind(ctx);item.resources[kind]=0;ctx['create'+kind]=(...x)=>{const value=create(...x);if(value)item.resources[kind]++;return value;};ctx['delete'+kind]=value=>{if(value)item.resources[kind]--;return remove(value);};}}}return ctx;};\nif(window.GPUAdapter){const requestDevice=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...args){const device=await requestDevice.apply(this,args),item={destroyed:false};a.devices.push(item);const destroy=device.destroy.bind(device);device.destroy=()=>{item.destroyed=true;return destroy();};return device;};const submit=GPUQueue.prototype.submit;GPUQueue.prototype.submit=function(...args){a.submits++;return submit.apply(this,args);};}\nwindow.__auditState=()=>({callbacks:a.callbacks,submits:a.submits,draws:a.draws,activeDevices:a.devices.filter(d=>!d.destroyed).length,activeContexts:a.contexts.filter(c=>{const gl=c.ref.deref();return gl&&!gl.isContextLost();}).map(c=>({kind:c.kind,resources:c.resources})),durations:a.durations,intervals:a.intervals});\n"});
  const backend=process.argv.includes('--webgl')?'webgl':'webgpu';
  await viewport(1200,900);
  await send('Page.navigate',{url:origin+'/?toy=jelly&renderer='+backend});
  await waitFor(s=>s.toy==='jelly'&&s.ready,'Production Jelly ready');
  await delay(1100);
  const initial=await evaluate('window.__auditState()');
  assert.ok(backend==='webgpu'?initial.activeDevices===1:initial.activeDevices===0&&initial.activeContexts.length===1,'Actual '+backend+' backend');
  const toyIds=process.argv.includes('--webgl')?['jelly','jelly-slice','astra-cursor']:await evaluate("[...document.querySelectorAll('.collection-item')].map(e=>new URL(e.href).searchParams.get('toy'))");
  const select=async toy=>{await click('.collection-trigger');await waitFor(s=>s.dialog.open,'Collection open');await click('.collection-item[href*="toy='+toy+'"]');await waitFor(s=>s.toy===toy&&s.ready&&!s.dialog.open,toy+' ready');await delay(150);};
  const percentile=(values,p)=>{const sorted=values.toSorted((a,b)=>a-b);return +(sorted[Math.floor((sorted.length-1)*p)]??0).toFixed(2);};
  for(const toy of toyIds){
    if((await state()).toy!==toy)await select(toy);
    await evaluate('window.__audit.durations=[];window.__audit.intervals=[];window.__audit.last=0');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:600,y:445,button:'left',buttons:1,clickCount:1});
    for(let i=0;i<30;i++){await delay(50);await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:600+Math.sin(i/7)*80,y:445+Math.sin(i/5)*45,button:'left',buttons:1});}
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:550,y:445,button:'left',buttons:0,clickCount:1});
    const runtime=await evaluate('window.__auditState()');
    assert.ok(runtime.callbacks>0);assert.ok(runtime.activeContexts.length+runtime.activeDevices<=1,toy+' retired renderer leaked');
    const resources=await evaluate("performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.decodedBodySize}))");
    assert.ok(resources.every(r=>new URL(r.name).origin===locationOrigin()),'Unexpected third-party request');
    function locationOrigin(){return new URL(origin).origin;}
    const payload=resources.filter(r=>r.name.endsWith('.js')).reduce((n,r)=>n+r.bytes,0);
    record(toy+' production interaction',{backend,rafMedianMs:percentile(runtime.intervals,.5),rafP95Ms:percentile(runtime.intervals,.95),callbackMedianMs:percentile(runtime.durations,.5),callbackP95Ms:percentile(runtime.durations,.95),activeContexts:runtime.activeContexts,activeDevices:runtime.activeDevices,totalLoadedJsBytes:payload});
    await click('.collection-trigger');await waitFor(s=>s.dialog.open,'Pause');await delay(280);
    const before=await evaluate('window.__auditState()');await delay(240);
    const after=await evaluate('window.__auditState()');assert.equal(after.submits,before.submits,toy+' submits GPU work while paused');assert.equal(after.draws,before.draws,toy+' draws while paused');
    await click('.close-collection');await waitFor(s=>!s.dialog.open,'Resume');await click('button[aria-label^="Reset "]');
    assert.equal(await evaluate("!!document.querySelector('.error-panel')"),false);
    if(toy==='jelly-slice'){
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:600,y:445,button:'left',buttons:1,clickCount:1});
      const cutStart=Date.now();while(Date.now()-cutStart<8000 && !await evaluate("document.querySelector('.slice-status').textContent.includes('pieces')"))await delay(50);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:600,y:445,button:'left',buttons:0,clickCount:1});
      assert.match(await evaluate("document.querySelector('.slice-status').textContent"),/pieces/);
      await click('button[aria-label^="Reset "]');
    }
    if(toy==='jelly'){
      await click('.control-pill button[aria-pressed]');await waitFor(s=>s.controls.some(c=>c.pressed==='true'&&!c.disabled),'Enable audio');
      await click('.control-pill button[aria-pressed]');
    }
  }
  for(let cycle=0;cycle<3;cycle++){
    for(const toy of ['jelly','jelly-slice','astra-cursor','liquid-light'])await select(toy);
    await send('HeapProfiler.collectGarbage');
    const runtime=await evaluate('window.__auditState()');assert.equal(runtime.activeContexts.length,1);assert.equal(runtime.activeDevices,0);
    record('renderer lifecycle cycle '+cycle,{activeContexts:runtime.activeContexts,activeDevices:runtime.activeDevices,heap:await send('Runtime.getHeapUsage')});
  }
  await viewport(390,844,true);await select('jelly');await delay(1000);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:170,y:420,id:1},{x:220,y:430,id:2}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:125,y:380,id:1},{x:260,y:460,id:2}]});await delay(250);
  await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal(await evaluate("document.querySelector('canvas').classList.contains('is-grabbing')"),false);
  await click('button[aria-label^="Reset "]');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  record('mobile cancellation and reduced motion',{screenshot:await screenshot('production-'+backend+'-mobile')});
  assert.equal(errors.length,0,JSON.stringify(errors));record('passed',{backend,errors});
}catch(error){console.error(error);process.exitCode=1;results.push({failure:String(error)});}
finally{
 await writeFile(join(artifacts,'production-'+(process.argv.includes('--webgl')?'webgl':'webgpu')+'-results.json'),JSON.stringify({results,errors},null,2));
 if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},null);}catch{}socket.close();}
 await delay(300);if(chrome.exitCode===null)chrome.kill();
}
