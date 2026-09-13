import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Trusted input in an isolated browser; the user's preview is never navigated.
const backend=process.argv.includes('--webgl')?'webgl':'webgpu';
const baseline=process.argv.includes('--baseline');
const phase=baseline?'baseline':'after';
const selectedToys=process.argv.find(value=>value.startsWith('--toys='))?.slice(7).split(',') ?? ['cushion','jelly','loop','star','dumpling'];
const reportSuffix=selectedToys.length<5?'-'+selectedToys.join('-'):'';
const origin=process.env.QA_ORIGIN ?? 'http://127.0.0.1:5174';
const artifacts=resolve('qa/artifacts');
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'codex-jelly-surface-'));
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
let socket,session,targetId,reducedMotion=false,sequence=0,touchId=100;
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
    grabbing:!!canvas?.classList.contains('is-grabbing'),text:document.body?.innerText ?? '',
    inputTrace:window.__qaPointerEvents ?? [],
    captureTrace:window.__qaCaptureEvents ?? [],documentFocus:document.hasFocus(),visibility:document.visibilityState,
    reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
    viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,scale:visualViewport?.scale}};
})()`);
const waitFor=async(predicate,label,timeout=12000)=>{
  const started=Date.now();
  while(Date.now()-started<timeout) {
    const data=await diagnostics();
    if(predicate(data))return data;
    await delay(25);
  }
  throw new Error(`${label}: ${JSON.stringify(await diagnostics())}`);
};
const record=(label,data={})=>{const entry={label,...data};results.push(entry);console.log(JSON.stringify(entry));};
const screenshot=async label=>{
  const path=join(artifacts,`surface-${backend}-${phase}-${label}.png`);
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
const key=(type,code)=>send('Input.dispatchKeyEvent',{
  type,code,key:code==='Space'?' ':code,windowsVirtualKeyCode:code==='Space'?32:38,
});
const tap=async(point,mode='touch',hold=100)=>{
  const contact={...point,id:++touchId};
  if(mode==='mouse')await mouse('mousePressed',point);
  else await touch('touchStart',[contact]);
  await delay(hold);
  assert.equal((await diagnostics()).grabbing,true,`The ${mode} tap must hit actual visible skin`);
  if(mode==='mouse')await mouse('mouseReleased',point);
  else await touch('touchEnd',[contact]);
  return diagnostics();
};
const click=async selector=>{
  const point=await evaluate(`(()=>{
    const element=document.querySelector(${JSON.stringify(selector)});
    if(!element || element.disabled)return null;
    const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
  })()`);
  assert.ok(point,`Missing enabled control: ${selector}`);
  await mouse('mousePressed',point);await mouse('mouseReleased',point);
};
const assertReady=state=>{
  assert.equal(state.reaction.phase,'ready');
  assert.equal(state.contactCount,0);assert.equal(state.pointerCount,0);
  assert.equal(state.keyboardActive,false);
  assert.deepEqual(state.burst,{active:false,phase:'ready',droplets:0});
};
const assertFinite=state=>{
  for(const name of ['height','width','displacement','speed'])assert.ok(Number.isFinite(state[name]),`${name} must remain finite`);
  for(const name of ['fatigue','strain'])assert.ok(state.reaction[name]>=0 && state.reaction[name]<=1,`${name} must be bounded`);
  assert.equal(state.burst.droplets,0,'Rupture uses the existing continuous skin, without droplets');
  const surface=state.surface;
  assert.ok(surface && Number.isFinite(surface.sphereRadius) && surface.sphereRadius>0,'Updated raycasting bounds must be finite');
  assert.ok(surface.normalSample.every(value=>Number.isFinite(value) && Math.abs(value)<=1.000001),'Uploaded surface normals must remain finite');
  if(!baseline)assert.equal(surface.normalVersion,surface.positionVersion+1,'Each position refresh must mark final normals exactly once');
};
const assertSurfaceAdvanced=(before,after)=>{
  assert.ok(after.surface.positionVersion>before.surface.positionVersion,'Deformation must refresh the position buffer');
  assert.ok(after.surface.normalVersion>before.surface.normalVersion,'Deformation must refresh the normal buffer');
  assert.ok(after.surface.normalSample.some((value,i)=>Math.abs(value-before.surface.normalSample[i])>0.0001),'Visible deformation must change the lighting normals');
};
const reset=async()=>{
  const frameBefore=(await diagnostics()).state.frames;
  await click('button[aria-label^="Reset "]');
  const data=await waitFor(data=>data.state?.frames>frameBefore && data.state.reaction?.phase==='ready' && data.state.reaction.pops===0 && data.state.reaction.fatigue===0 && data.state.contactCount===0,'Reset did not clear material response');
  assertReady(data.state);assert.equal(data.state.reaction.fatigue,0);
  return data;
};
const load=async toy=>{
  const previousTarget=targetId;
  ({targetId}=await send('Target.createTarget',{url:'about:blank'},null));
  ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Page.bringToFront');
  await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reducedMotion?'reduce':'no-preference'}]});
  await send('Page.navigate',{url:`${origin}/?toy=${toy}${backend==='webgl'?'&renderer=webgl':''}`});
  const data=await waitFor(data=>data.state?.entrance>=0.95 && data.state.reaction?.fatigue!==undefined,'Toy readiness',30000);
  // Each toy gets a fresh target and native touch device; all repeated Jelly
  // rupture/recovery/resource checks still run in the same target and scene.
  if(previousTarget)await send('Target.closeTarget',{targetId:previousTarget},null);
  await evaluate(`(()=>{
    window.__qaPointerEvents=[];
    window.__qaCaptureEvents=[];
    const nativeCapture=Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture=function(id){
      try{const result=nativeCapture.call(this,id);window.__qaCaptureEvents.push({id,ok:true});return result;}
      catch(error){window.__qaCaptureEvents.push({id,error:String(error)});throw error;}
    };
    for(const type of ['pointerdown','pointerup','pointercancel'])document.addEventListener(type,event=>{
      window.__qaPointerEvents.push({type,pointerType:event.pointerType,trusted:event.isTrusted,button:event.button,buttons:event.buttons,id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target.tagName});
      if(window.__qaPointerEvents.length>16)window.__qaPointerEvents.shift();
    },true);
  })()`);
  assert.equal(data.state.backend,backend==='webgl'?'WebGLBackend':'WebGPUBackend');
  assert.deepEqual(data.viewport,{width:390,height:844,scrollX:0,scrollY:0,scale:1});
  assertReady(data.state);
  record(`${toy} ready`,{state:data.state,baseline:await screenshot(`${toy}-baseline`)});
  return data.state;
};
const findGrip=async candidates=>{
  for(const point of candidates) {
    await mouse('mousePressed',point);await delay(35);
    const data=await diagnostics();
    await mouse('mouseReleased',point);
    if(data.grabbing) {await reset();return point;}
  }
  throw new Error(`No actual skin hit at ${JSON.stringify(candidates)}: ${JSON.stringify(await diagnostics())}`);
};
const focusSkin=async point=>{await tap(point,'mouse',30);await delay(80);};
// Movement is followed by an uninterrupted hold: no repeated presses generate fatigue.
const beginStrain=async(point,mode='mouse')=>{
  if(mode==='keyboard') {
    await focusSkin(point);await key('keyDown','Space');
    await waitFor(data=>data.state.keyboardActive,'Trusted keyboard press did not grab');
    return async()=>key('keyUp','Space');
  }
  if(mode==='touch') {
    const first={id:++touchId,x:159,y:423},second={id:++touchId,x:233,y:423};
    await touch('touchStart',[first,second]);
    await waitFor(data=>data.state.contactCount===2,'Two shoulder grips did not both hit');
    for(let step=1;step<=8;step++) {
      const t=step/8;
      await touch('touchMove',[
        {...first,x:first.x+(65-first.x)*t,y:first.y+(250-first.y)*t},
        {...second,x:second.x+(325-second.x)*t,y:second.y+(250-second.y)*t},
      ]);
      await delay(25);
    }
    return async()=>touch('touchEnd',[{...first,x:65,y:250},{...second,x:325,y:250}]);
  }
  await mouse('mousePressed',point);
  await waitFor(data=>data.grabbing,'Trusted mouse press did not grab');
  const target={x:365,y:110};
  for(let step=1;step<=8;step++) {
    const t=step/8;
    await mouse('mouseMoved',{x:point.x+(target.x-point.x)*t,y:point.y+(target.y-point.y)*t});
    await delay(25);
  }
  return async()=>mouse('mouseReleased',target);
};
const strainUntil=async(point,{mode='mouse',label='sustained strain',stopAtFatigue,timeout=9000}={})=>{
  const initial=(await diagnostics()).state.reaction.pops;
  const started=Date.now(),samples=[];
  const end=await beginStrain(point,mode);
  let data;
  try {
    while(Date.now()-started<timeout) {
      data=await diagnostics();assertFinite(data.state);
      const {reaction,contactCount,displacement}=data.state;
      samples.push({elapsed:(Date.now()-started)/1000,strain:reaction.strain,fatigue:reaction.fatigue,pops:reaction.pops,contactCount,displacement});
      if(reaction.pops>initial || stopAtFatigue!==undefined && reaction.fatigue>=stopAtFatigue)break;
      assert.ok(contactCount>0,'A held strain lost its physics contact before rupture');
      await delay(40);
    }
  } finally {await end();}
  record(label,{mode,samples});
  if(stopAtFatigue!==undefined) {
    assert.equal(data.state.reaction.pops,initial,'Subcritical strain ruptured before release');
    assert.ok(data.state.reaction.fatigue>=stopAtFatigue,'Held deformation did not accumulate measurable fatigue');
  } else {
    assert.equal(data.state.reaction.pops,initial+1,`Sustained excessive ${mode} deformation never ruptured`);
    assert.equal(data.state.contactCount,0);assert.equal(data.state.pointerCount,0);
    assert.equal(data.state.keyboardActive,false);
  }
  return data.state;
};
const observeCycle=async(baseline,label,{reduced=false}={})=>{
  const count=(await diagnostics()).state.reaction.pops;
  const captures=new Map(),samples=[];
  const windows=[['release',0.15],['settled',0.55],['recover',1.45]];
  const started=Date.now();
  while(Date.now()-started<7000) {
    const data=await diagnostics(),state=data.state;
    assertFinite(state);
    assert.equal(state.reaction.pops,count,'A single held gesture ruptured more than once');
    assert.equal(state.contactCount,0);assert.equal(state.pointerCount,0);
    assert.equal(state.keyboardActive,false);
    assert.deepEqual(state.memory,baseline.memory,'Rupture allocated additional graphics resources');
    assert.ok(state.height>baseline.height*0.1 && state.width>baseline.width*0.45,'Continuous body disappeared during rupture');
    samples.push({age:state.reaction.age,height:state.height,width:state.width,phase:state.burst.phase});
    if(state.reaction.phase==='ready') {
      assertReady(state);
      assert.ok(Math.abs(state.height-baseline.height)<0.035,'Reformation did not restore original height');
      assert.ok(Math.abs(state.width-baseline.width)<0.035,'Reformation did not restore original width');
      record(`${label} ready`,{state,samples,screenshot:await screenshot(`${label}-ready`)});
      assert.equal(captures.size,3,'Missed a release, settled, or recovery visual checkpoint');
      return state;
    }
    assert.equal(state.burst.active,true);
    for(const [name,age] of windows) if(!captures.has(name) && state.reaction.age>=age) {
      assert.ok(state.reaction.age<age+0.22,`Missed ${name} screenshot window`);
      if(name==='settled') {
        assert.equal(state.burst.phase,'settle');
        if(reduced)assert.ok(state.height>baseline.height*0.45,'Reduced motion must retain a compact complete body');
        else {
          assert.ok(state.height<baseline.height*0.25,'Released gel should settle into a shallow puddle');
          assert.ok(state.width>baseline.width*1.2,'Released gel should spread continuously across the floor');
        }
      }
      if(name==='recover' && !reduced) {
        assert.equal(state.burst.phase,'recover');
        assert.ok(state.height>baseline.height*0.4 && state.height<baseline.height*0.85,'Recovery must rise gradually from the puddle');
      }
      const path=await screenshot(`${label}-${name}`);
      captures.set(name,{...state,screenshot:path});
      record(`${label} ${name}`,{state,screenshot:path});
    }
    await delay(25);
  }
  throw new Error(`${label} did not recover: ${JSON.stringify(await diagnostics())}`);
};

try {
  let portInfo;
  for(let i=0;i<100;i++) {
    if(launchError)throw launchError;
    try {portInfo=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);break;}
    catch {await delay(100);}
  }
  assert.ok(portInfo,'Isolated Chrome did not start');
  socket=new WebSocket(`ws://127.0.0.1:${portInfo[0]}${portInfo[1]}`);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id) {
      const request=pending.get(message.id);if(!request)return;pending.delete(message.id);
      if(message.error)request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result);
    } else if(message.method==='Runtime.exceptionThrown' || message.method==='Log.entryAdded' && message.params.entry.level==='error')errors.push(message);
  });

  for(const toy of selectedToys) {
    const neutral=await load(toy);
    const point=await findGrip(toy==='loop'?[{x:250,y:420},{x:245,y:405},{x:195,y:350}]:[{x:195,y:420},{x:195,y:400},{x:195,y:440}]);
    await mouse('mousePressed',point);await delay(260);
    let state=(await diagnostics()).state;
    assert.equal(state.contactCount,1);assertFinite(state);
    record(toy+' held press',{state,screenshot:await screenshot(toy+'-press')});
    for(let step=1;step<=6;step++) {
      await mouse('mouseMoved',{x:point.x+step*5,y:point.y-step*4});await delay(20);
    }
    state=(await diagnostics()).state;assert.equal(state.contactCount,1);assertFinite(state);
    assertSurfaceAdvanced(neutral,state);
    record(toy+' stretched',{state,screenshot:await screenshot(toy+'-stretch')});
    await mouse('mouseReleased',{x:point.x+30,y:point.y-24});await delay(70);
    state=(await diagnostics()).state;assertFinite(state);
    assert.equal(state.contactCount,0);assert.deepEqual(state.memory,neutral.memory);
    record(toy+' release ripples',{state,screenshot:await screenshot(toy+'-release')});
    if(toy==='cushion') {
      await reset();await focusSkin(point);
      await key('keyDown','Space');await key('keyDown','KeyE');
      const compressed=await waitFor(data=>data.state.compression>0.15 && Math.abs(data.state.twist)>0.1,'Compressed and twisted Cushion',6000);
      assertFinite(compressed.state);
      record('cushion compressed and twisted',{state:compressed.state,screenshot:await screenshot('cushion-twisted')});
      await key('keyUp','KeyE');await key('keyUp','Space');
    }
    if(toy==='cushion' || toy==='jelly') {
      await reset();
      const first={id:++touchId,x:159,y:423},second={id:++touchId,x:233,y:423};
      await touch('touchStart',[first,second]);
      await waitFor(data=>data.state.contactCount===2 && data.state.pointerCount===2,'Two actual skin contacts');
      for(let step=1;step<=8;step++) {
        await touch('touchMove',[{...first,x:159-step*4,y:423-step*5},{...second,x:233+step*4,y:423+step*4}]);
        await delay(25);
      }
      const multi=(await diagnostics()).state;assertFinite(multi);assert.equal(multi.contactCount,2);
      assert.deepEqual(multi.memory,neutral.memory);
      record(toy+' two-finger twist',{state:multi,screenshot:await screenshot(toy+'-multitouch')});
      await touch('touchCancel',[]);await waitFor(data=>data.state.contactCount===0,'Native touch cancellation');
    }
    if(toy==='jelly' || toy==='loop') {
      await reset();
      await strainUntil(point,{mode:toy==='jelly'?'keyboard':'mouse',label:toy+' rupture after sustained strain',timeout:11000});
      await observeCycle(neutral,toy+'-cycle-1');
      if(toy==='jelly') {
        await strainUntil(point,{mode:'keyboard',label:'jelly second rupture',timeout:11000});
        await observeCycle(neutral,'jelly-cycle-2');
      }
    }
    await reset();
    const restored=(await diagnostics()).state;
    assertFinite(restored);assert.deepEqual(restored.memory,neutral.memory);
    record(toy+' restored',{state:restored});
    if(toy==='jelly') {
      assert.equal('airPockets' in restored,false,'Removed bubbles must not remain active');
      await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
      await reset();await delay(200);
      record('jelly desktop rest',{state:(await diagnostics()).state,screenshot:await screenshot('jelly-desktop')});
      await mouse('mousePressed',{x:600,y:440});await delay(350);
      await waitFor(data=>data.state.contactCount===1 && data.state.displacement>.08,'Desktop press');
      record('jelly desktop press',{screenshot:await screenshot('jelly-desktop-press')});
      await mouse('mouseReleased',{x:600,y:440});await reset();
      assert.deepEqual((await diagnostics()).state.memory,neutral.memory,'Desktop resize retained graphics resources');
    }
  }
  assert.equal(errors.length,0,'Browser errors: '+JSON.stringify(errors));
  record('passed',{backend,phase,errors});
  await writeFile(join(artifacts,'surface-'+backend+'-'+phase+reportSuffix+'-results.json'),JSON.stringify({backend,phase,results,errors},null,2));
} catch(error) {
  console.error(error);
  try {record('failure',{...await diagnostics(),screenshot:await screenshot('failure')});}catch {}
  await writeFile(join(artifacts,'surface-'+backend+'-'+phase+reportSuffix+'-results.json'),JSON.stringify({backend,phase,results,errors,failure:String(error)},null,2));
  process.exitCode=1;
} finally {
  if(socket?.readyState===WebSocket.OPEN) {
    try {await send('Browser.close',{},null);}catch {}
    socket.close();
  }
  await delay(400);if(chrome.exitCode===null)chrome.kill();
}
