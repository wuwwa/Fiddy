import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const backend=process.argv.includes('--webgl')?'webgl':'webgpu';
const origin=process.env.QA_ORIGIN ?? 'http://127.0.0.1:5173';
const artifacts=resolve('qa/artifacts');await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'codex-upright-rotation-'));
const chrome=spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,
  '--no-first-run','--no-default-browser-check','--mute-audio',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--enable-unsafe-webgpu','--enable-unsafe-swiftshader','about:blank',
],{windowsHide:true,stdio:'ignore'});
let launchError;chrome.on('error',error=>{launchError=error;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,session,targetId,sequence=0,touchId=100;
const pending=new Map(),errors=[],results=[];
const send=(method,params={},sessionId=session)=>new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`));},15000);
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
const waitFor=async(predicate,label,timeout=15000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout) {const data=await diagnostics();if(predicate(data))return data;await delay(30);}
  throw new Error(`${label}: ${JSON.stringify(await diagnostics())}`);
};
const screenshot=async label=>{
  const path=join(artifacts,`rotation-${backend}-${label}.png`);
  const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path,Buffer.from(data,'base64'));return path;
};
const record=(label,data={})=>{results.push({label,...data});console.log(JSON.stringify({label,...data}));};
const touch=(type,points)=>send('Input.dispatchTouchEvent',{
  type,touchPoints:points.map(point=>({...point,radiusX:10,radiusY:10,force:0.65})),
});
const mouse=(type,x,y,pressed=false)=>send('Input.dispatchMouseEvent',{
  type,x,y,button:type==='mouseMoved'?'none':'left',buttons:pressed?1:0,clickCount:type==='mouseMoved'?0:1,
});
const click=async selector=>{
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;
    const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  assert.ok(point,selector);
  await mouse('mousePressed',point.x,point.y,true);await mouse('mouseReleased',point.x,point.y);
};
const empty=s=>s.contactCount===0 && s.pointerCount===0 && s.rotation.pointerCount===0 && !s.rotation.keyboardActive;
const reset=async()=>{
  const before=(await diagnostics()).state.frames;await click('button[aria-label^="Reset "]');
  await waitFor(d=>d.state?.frames>before && empty(d.state) && d.state.rotation.angle===0 && d.state.rotation.velocity===0 && d.state.reaction.fatigue===0,'Reset must restore the original facing and clear gestures');
};
const viewport=async(width,height,mobile=true)=>{
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
};
const load=async toy=>{
  const oldTarget=targetId;
  ({targetId}=await send('Target.createTarget',{url:'about:blank'},null));
  ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await send('Page.bringToFront');
  await viewport(390,844);
  await send('Page.navigate',{url:`${origin}/?toy=${toy}${backend==='webgl'?'&renderer=webgl':''}`});
  const data=await waitFor(d=>d.state?.sleeping && d.state.rotation,'Toy readiness',30000);
  if(oldTarget)await send('Target.closeTarget',{targetId:oldTarget},null);
  await evaluate(`(()=>{window.__turnEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,event=>window.__turnEvents.push({type,trusted:event.isTrusted,id:event.pointerId}),true);})()`);
  assert.equal(data.state.backend,backend==='webgpu'?'WebGPUBackend':'WebGLBackend');return data.state;
};
const beginTurn=async()=>{
  let finger={id:++touchId,x:35,y:423};await touch('touchStart',[finger]);
  await waitFor(d=>d.state.rotation.pointerCount===1 && d.state.contactCount===0,'Background should capture a turn without pressing');
  for(let step=0;step<10;step++) {
    finger={...finger,x:finger.x+12};await touch('touchMove',[finger]);await delay(20);
  }
  await waitFor(d=>d.state.rotation.angle>1,'Background swipe must visibly rotate');return finger;
};
const key=async(type,code)=>send('Input.dispatchKeyEvent',{
  type,code,key:code==='Space'?' ':code,windowsVirtualKeyCode:code==='Space'?32:code==='ArrowLeft'?37:code==='ArrowRight'?39:code==='KeyE'?69:81,
});
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

  for(const toy of ['jelly','cushion','loop','star','dumpling','putty']) {
    const neutral=await load(toy);
    if(toy==='loop' || toy==='star')await screenshot(`${toy}-front`);
    let finger=await beginTurn();
    // Crossing onto the skin and adding a second finger must retain rotation.
    const extra={id:++touchId,x:195,y:423};
    await touch('touchStart',[finger,extra]);await delay(130);
    let data=await diagnostics();assert.equal(data.state.contactCount,0);assert.equal(data.state.rotation.pointerCount,1);
    await touch('touchEnd',[extra]);
    await delay(120);await touch('touchEnd',[finger]);
    data=await waitFor(d=>empty(d.state) && d.state.sleeping,'Held turn should stay at its chosen angle and sleep');
    const angle=data.state.rotation.angle;
    assert.equal(data.state.rotation.velocity,0);assert.ok(angle>1);
    assert.ok(data.state.displacement<0.001);assert.equal(data.state.reaction.fatigue,0);
    assert.equal(data.state.interactionCount,neutral.interactionCount);
    assert.deepEqual(data.state.memory,neutral.memory);
    if(toy==='loop' || toy==='star')await screenshot(`${toy}-rotated`);
    // Press actual visible skin after rotation. A miss is a background gesture;
    // cancel it before trying the next screen sample, preserving orientation.
    let grip;
    for(const x of [195,215,175,235,155]) {
      const point={id:++touchId,x,y:423};await touch('touchStart',[point]);await delay(160);
      if((await diagnostics()).state.contactCount===1) {grip=point;break;}
      await touch('touchCancel',[]);
    }
    assert.ok(grip,`${toy}: newly exposed skin must remain pickable`);
    const other={id:++touchId,x:35,y:423};await touch('touchStart',[grip,other]);
    for(let step=0;step<6;step++) {
      grip={...grip,x:grip.x+4,y:grip.y-3};
      await touch('touchMove',[grip,other]);await delay(25);
    }
    data=await waitFor(d=>d.state.contactCount===1 && d.state.displacement>0.03,'Rotated material must still stretch');
    assert.equal(data.state.rotation.angle,angle);assert.equal(data.state.rotation.pointerCount,0);
    assert.ok(data.state.minVolumeRatio>0.75);
    await touch('touchCancel',[]);await reset();
    data=await diagnostics();assert.ok(data.trace.every(e=>e.trusted));
    assert.deepEqual(data.viewport,{width:390,height:844,scrollX:0,scrollY:0,scale:1});
    record(`${toy}: touch rotation, gesture ownership, rotated stretch and reset`,{angle,events:data.trace.length});
  }

  await load('cushion');
  for(const mode of ['cancel','blur','resize','collection']) {
    const finger=await beginTurn();
    if(mode==='cancel')await touch('touchCancel',[]);
    if(mode==='blur')await evaluate('document.querySelector("canvas").blur()');
    if(mode==='resize')await viewport(844,390);
    if(mode==='collection') {await click('.collection-trigger');await click('.close-collection');}
    if(mode!=='cancel')await touch('touchCancel',[]);
    let data=await waitFor(d=>empty(d.state) && d.state.rotation.velocity===0 && d.state.sleeping,`${mode} must clear turning and momentum`);
    const angle=data.state.rotation.angle;await delay(180);
    assert.equal((await diagnostics()).state.rotation.angle,angle);assert.ok(angle>1);
    if(mode==='resize')await viewport(390,844);
    await reset();record(`${mode}: keeps angle and clears input`);
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  let finger=await beginTurn();await touch('touchEnd',[finger]);
  let data=await waitFor(d=>empty(d.state) && d.state.rotation.velocity===0,'Reduced motion must not coast');
  const reducedAngle=data.state.rotation.angle;await delay(250);
  assert.equal((await diagnostics()).state.rotation.angle,reducedAngle);
  await reset();await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  finger=await beginTurn();await touch('touchEnd',[finger]);
  data=await waitFor(d=>empty(d.state) && d.state.sleeping,'A flicked turn must settle');
  assert.ok(data.state.rotation.angle>reducedAngle+0.01);assert.ok(data.state.rotation.angle<reducedAngle+0.44);
  await reset();record('reduced motion stops at release; ordinary release coasts briefly and sleeps');

  await viewport(1100,800,false);await delay(200);
  // Keyboard shortcuts work immediately, even before the canvas receives focus.
  await evaluate('document.querySelector("canvas").blur()');
  await key('keyDown','KeyE');
  data=await waitFor(d=>d.state.keyboardActive && d.state.twist>0.035,'Q/E should begin a visible twist without Space or canvas focus');
  const directTwist=data.state.twist;
  await key('keyUp','KeyE');
  await waitFor(d=>!d.state.keyboardActive,'Releasing Q/E should release its keyboard contact');
  await reset();record('direct Q/E twist works without Space or canvas focus',{twist:directTwist});
  await mouse('mousePressed',150,350,true);
  for(let i=0;i<12;i++) {await mouse('mouseMoved',150+(i+1)*30,350,true);await delay(20);}
  await delay(120);await mouse('mouseReleased',510,350);
  data=await waitFor(d=>d.state.sleeping && empty(d.state) && Math.abs(d.state.rotation.angle)>1,'Mouse background drag should rotate');
  const mouseAngle=data.state.rotation.angle;
  assert.equal(data.state.contactCount,0);
  await screenshot('desktop-rotated');
  await key('keyDown','ArrowLeft');
  await waitFor(d=>d.state.rotation.keyboardActive,'Arrow key should start rotation');await delay(250);
  await key('keyUp','ArrowLeft');
  data=await waitFor(d=>!d.state.rotation.keyboardActive && d.state.rotation.angle<mouseAngle-0.2,'Keyboard turns left');
  const keyboardAngle=data.state.rotation.angle;
  await key('keyDown','Space');await waitFor(d=>d.state.keyboardActive,'Space must still press');
  await key('keyDown','ArrowRight');await key('keyDown','KeyE');await delay(350);
  await key('keyUp','ArrowRight');await key('keyUp','KeyE');
  data=await diagnostics();assert.equal(data.state.rotation.angle,keyboardAngle);assert.ok(data.state.displacement>0.03);
  await key('keyUp','Space');await reset();
  // Short key taps must work even before the next animation frame.
  await mouse('mousePressed',120,350,true);await mouse('mouseReleased',120,350);
  await key('keyDown','ArrowRight');await key('keyUp','ArrowRight');
  await waitFor(d=>d.state.rotation.angle>0.05 && !d.state.rotation.keyboardActive,'Short arrow tap must turn');
  await reset();record('desktop mouse, continuous and tapped arrows, Space stretch and Q/E twist');

  for(const [width,height,mobile] of [[320,568,true],[390,844,true],[844,390,true],[710,800,false],[1100,800,false]]) {
    await viewport(width,height,mobile);await delay(150);
    const layout=await evaluate(`(()=>{
      const dock=document.querySelector('.interaction-dock'),r=dock.getBoundingClientRect();
      const hint=document.querySelector('.rotation-instructions'),style=getComputedStyle(hint);
      return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,
        scroll:document.documentElement.scrollWidth,hintVisible:style.display!=='none',text:hint.textContent};
    })()`);
    assert.ok(layout.left>=0 && layout.right<=layout.width,JSON.stringify(layout));
    assert.ok(layout.bottom<=layout.height && layout.scroll===layout.width);
    assert.equal(layout.hintVisible,height>450);assert.equal(layout.text,'Drag beside the shape to rotate');
    if(width===320 || width===710)await screenshot(`layout-${width}`);
  }
  assert.equal(errors.length,0,JSON.stringify(errors));record('passed',{backend,errors});
  await writeFile(join(artifacts,`rotation-${backend}-results.json`),JSON.stringify({backend,results,errors},null,2));
} catch(error) {
  console.error(error);try {record('failure',{...await diagnostics(),screenshot:await screenshot('failure')});}catch {}
  await writeFile(join(artifacts,`rotation-${backend}-results.json`),JSON.stringify({backend,results,errors,failure:String(error)},null,2));process.exitCode=1;
} finally {
  if(socket?.readyState===WebSocket.OPEN) {try {await send('Browser.close',{},null);}catch {}socket.close();}
  await delay(400);if(chrome.exitCode===null)chrome.kill();
}
