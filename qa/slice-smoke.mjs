import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const origin = process.env.QA_ORIGIN ?? 'http://127.0.0.1:5174';
const artifacts = resolve('qa/artifacts'); await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'codex-jelly-slice-'));
const chrome = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--enable-unsafe-swiftshader', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, session, sequence = 0, launchError;
chrome.on('error', error => { launchError = error; });
const pending = new Map(), errors = [], results = [];
const send = (method, params = {}, sessionId = session) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20000);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: value => { clearTimeout(timer); reject(value); } });
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const stats = () => evaluate(`JSON.parse(document.querySelector('.slice-canvas')?.dataset.diagnostics ?? 'null')`);
const waitFor = async (predicate, label, timeout = 16000) => {
  const begin = Date.now();
  while (Date.now() - begin < timeout) { const data = await stats(); if (predicate(data)) return data; await delay(40); }
  throw new Error(`${label}: ${JSON.stringify(await stats())}`);
};
const record = (label, data = {}) => { results.push({ label, ...data }); console.log(JSON.stringify({ label, ...data })); };
const screenshot = async label => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const path = join(artifacts, `slice-${label}.png`); await writeFile(path, Buffer.from(data, 'base64')); return path;
};
const mouse = (type, point) => send('Input.dispatchMouseEvent', { type, ...point, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const click = async selector => {
  const p = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  assert.ok(p, `Missing ${selector}`); await mouse('mousePressed', p); await mouse('mouseReleased', p);
};
const world = (x, z) => evaluate(`(async () => {
  const T=await import('/node_modules/three/build/three.module.js');
  const r=document.querySelector('canvas').getBoundingClientRect(), aspect=r.width/r.height;
  const c=new T.PerspectiveCamera(34,aspect,.1,50);
  c.position.set(4.5,5.6,6.5).normalize().multiplyScalar(Math.max(10.7,9.0/aspect));c.position.y+=.45;c.lookAt(0,.45,0);c.updateMatrixWorld();
  const h=JSON.parse(document.querySelector('canvas').dataset.diagnostics).kind==='slab'?1.02:1.22;
  const p=new T.Vector3(${x},h+.01,${z}).project(c);return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
})()`);
const drag = async (a, b, touch = false, duration = 500, inspect) => {
  const start = await world(...a), end = await world(...b);
  const dispatch = (type, p) => touch ? send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ ...p, id: 1, radiusX: 8, radiusY: 8 }] }) : mouse(type, p);
  await dispatch(touch ? 'touchStart' : 'mousePressed', start);
  for (let i = 1; i <= 20; i++) {
    await dispatch(touch ? 'touchMove' : 'mouseMoved', { x: start.x + (end.x - start.x) * i / 20, y: start.y + (end.y - start.y) * i / 20 });
    if (duration) await delay(duration / 20);
    if (i === 12 && inspect) await inspect();
  }
  await dispatch(touch ? 'touchEnd' : 'mouseReleased', end); await delay(80);
};
const key = (type, code, key = code) => send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: code === 'Space' ? 32 : code === 'KeyQ' ? 81 : code === 'KeyE' ? 69 : 0 });
const reset = async () => { await click('button[aria-label^="Reset "]'); await waitFor(s => s?.pieces === 1 && s.pointer === null && s.cuts === 0, 'Reset'); };
try {
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); break; } catch { await delay(100); }
  }
  assert.ok(port, 'Chrome startup'); socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); if (message.error) request?.reject(message.error); else request?.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, null);
  ({ sessionId: session } = await send('Target.attachToTarget', { targetId, flatten: true }, null));
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__sliceAudio=[];const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);window.__sliceAudio.push(this)}};` });
  for (const toy of ['jelly-slice', 'jelly-prism']) {
    await send('Page.navigate', {url:`${origin}/?toy=${toy}`});
    await waitFor(s=>s?.knife?.canCut, `${toy} ready`);await delay(200);
    const baseline=await stats();record(`${toy} new gel and knife`,{state:baseline,screenshot:await screenshot(`${toy}-desktop`)});
    await drag([-2.7,0],[2.7,0],false,160);
    await waitFor(s=>s.pieces===2&&s.pointer===null,'Mouse swipe splits the jelly');
    assert.equal((await stats()).cuts,1); assert.equal((await stats()).memory.rebuilds,baseline.memory.rebuilds+1);
    assert.equal(await evaluate(`document.querySelector('.slice-count').textContent`),'2 / 48 pieces');
    record(`${toy} mouse swipe`,{state:await stats(),screenshot:await screenshot(`${toy}-swipe`)});
    await reset();
    await drag([-2.7,0],[0,0],false,100);assert.equal((await stats()).pieces,1,'A partial swipe cannot cut');
    await drag([-2.7,2.5],[2.7,2.5],false,100);assert.equal((await stats()).pieces,1,'Empty space cannot cut');
    const point=await world(0,0);
    await mouse('mousePressed',point);await delay(150);await mouse('mouseReleased',point);
    await waitFor(s=>s.knife.phase==='idle','Tap lifted the knife');assert.equal((await stats()).pieces,1,'Tap split immediately');
    await click('button[aria-label^="Enable "]');await waitFor(s=>s.audio.enabled,'Sound enabled');
    await mouse('mousePressed',point);
    await waitFor(s=>s.knife.depth>.38,'Slow entry');
    const halfway=await stats();assert.equal(halfway.pieces,1);assert.ok(halfway.audio.level>.1);
    record(`${toy} continuous knife and sound`,{state:halfway,screenshot:await screenshot(`${toy}-cutting`)});
    assert.equal(await evaluate(`document.querySelector('.slice-tension').hidden`),true,'A stationary hold should keep the cue quiet');
    await mouse('mouseMoved',{x:point.x,y:point.y+30});
    await waitFor(s=>s.knife.tension>.73,'Downward pull loads the wire');
    assert.equal(await evaluate(`document.querySelector('.slice-tension').hidden`),false);
    assert.equal(await evaluate(`document.querySelector('.slice-tension strong').textContent`),'Drag down for more tension');
    record(`${toy} visible pull tension`,{state:await stats(),screenshot:await screenshot(`${toy}-tension`)});
    await mouse('mouseMoved',{x:point.x,y:point.y+85});
    await waitFor(s=>s.knife.tension>.98,'Full pull tension');
    assert.equal(await evaluate(`document.querySelector('.slice-tension strong').textContent`),'Full tension · keep holding');
    await waitFor(s=>s.knife.phase==='complete','Full slow knife cut');assert.equal((await stats()).pieces,2);
    assert.equal(await evaluate(`document.querySelector('.slice-tension').hidden`),true,'Completed cuts clear the pull cue');
    await delay(400);assert.equal((await stats()).pieces,2,'Holding repeated the cut');
    await mouse('mouseReleased',point);await waitFor(s=>s.knife.phase==='idle','Knife lifted');
    await delay(2100);const resting=await stats();await delay(120);assert.equal((await stats()).frames,resting.frames,'Resting gel kept rendering');
    assert.equal(resting.audio.level,0);assert.equal(resting.pointer,null);
    record(`${toy} first cut`,{state:resting,screenshot:await screenshot(`${toy}-halves`)});
    for(let i=0;i<6;i++)await click('button[aria-label="Rotate wire clockwise"]');
    await evaluate(`document.querySelector('canvas').focus()`);
    await key('keyDown','Space',' ');await waitFor(s=>s.knife.phase==='complete','Keyboard hold cut');await key('keyUp','Space',' ');
    await waitFor(s=>s.knife.phase==='idle','Keyboard release');assert.ok((await stats()).pieces>=3);
    record(`${toy} angled pieces`,{state:await stats(),screenshot:await screenshot(`${toy}-quarters`)});
    await reset();await mouse('mousePressed',point);await delay(800);await mouse('mouseReleased',point);
    await waitFor(s=>s.knife.phase==='idle','Partial hold lifted');assert.equal((await stats()).pieces,1);
    await mouse('mousePressed',point);await evaluate(`document.querySelector('.collection-trigger').click()`);
    await waitFor(s=>s.paused&&s.pointer===null&&s.knife.phase==='idle','Collection cancels knife');const paused=await stats();await delay(100);assert.equal((await stats()).frames,paused.frames);
    await click('.close-collection');await waitFor(s=>!s.paused,'Resume');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await delay(100);
    record(`${toy} mobile`,{screenshot:await screenshot(`${toy}-phone`)});
    await drag([0,-2.7],[0,2.7],true,180);
    await waitFor(s=>s.pieces===2&&s.pointer===null,'Touch swipe splits the jelly');
    record(`${toy} touch swipe`,{state:await stats(),screenshot:await screenshot(`${toy}-phone-swipe`)});
    await reset();
    const p=await world(0,0);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
    await delay(250);await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y+110,id:1}]});
    await waitFor(s=>s.knife.pressure>.9,'Touch pressure');
    await waitFor(s=>s.knife.tension>.98,'Touch tension');
    assert.equal(await evaluate(`document.querySelector('.slice-tension').hidden`),false);
    record(`${toy} mobile tension`,{state:await stats(),screenshot:await screenshot(`${toy}-phone-tension`)});
    await waitFor(s=>s.knife.phase==='complete','Slow touch cut');await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await waitFor(s=>s.knife.phase==='idle','Touch lift');assert.equal((await stats()).pieces,2);
    const vp=await evaluate(`({width:innerWidth,height:innerHeight,scrollX,scrollY,scale:visualViewport.scale})`);assert.deepEqual(vp,{width:390,height:844,scrollX:0,scrollY:0,scale:1});
    record(`${toy} mobile slice`,{state:await stats(),screenshot:await screenshot(`${toy}-phone-cut`)});
    await send('Emulation.setDeviceMetricsOverride',{width:430,height:820,deviceScaleFactor:1,mobile:true});await delay(80);assert.equal((await stats()).pieces,2);
    await reset();const p2=await world(0,0);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p2,id:1}]});
    await delay(300);await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await waitFor(s=>s.pointer===null&&s.knife.phase==='idle','Cancel');assert.equal((await stats()).pieces,1);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await waitFor(s=>s.reduced,'Reduced motion');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p2,id:1}]});await delay(300);assert.equal((await stats()).pieces,1,'Reduced motion skipped the physical cut');
    await waitFor(s=>s.knife.phase==='complete','Reduced motion cut');await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitFor(s=>s.knife.phase==='idle','Reduced lift');
    assert.equal((await stats()).moving,false);
    await reset();
    await drag([-2.7,0],[2.7,0],true,100);
    assert.equal((await stats()).pieces,2); assert.equal((await stats()).moving,false,'Reduced motion also applies to swipes');
    await reset();
    const cancelStart=await world(-2.7,0),cancelEnd=await world(0,0);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...cancelStart,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...cancelEnd,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await waitFor(s=>s.pointer===null,'Swipe cancelled');assert.equal((await stats()).pieces,1);
    assert.equal(await evaluate(`document.querySelector('.slice-stroke').classList.contains('is-active')`),false);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(80);
    for(let i=0;i<160&&(await stats()).pieces<48;i++){
      const a=i*2.399963,o=Math.sin(i*8.1)*1.2;
      const start=await world(-3.5*Math.cos(a)-o*Math.sin(a),-3.5*Math.sin(a)+o*Math.cos(a));
      const end=await world(3.5*Math.cos(a)-o*Math.sin(a),3.5*Math.sin(a)+o*Math.cos(a));
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(20);
    }
    const capped=await stats();assert.equal(capped.pieces,48,'The piece limit is reachable through real swipes');
    assert.equal(await evaluate(`document.querySelector('.slice-limit').hidden`),false);
    assert.equal(capped.memory.geometries,baseline.memory.geometries);assert.equal(capped.memory.textures,baseline.memory.textures);
    record(`${toy} visible piece limit`,{state:capped,screenshot:await screenshot(`${toy}-phone-limit`)});
    await drag([-2.7,0],[2.7,0],true,0);
    assert.equal((await stats()).pieces,48);assert.equal((await stats()).memory.rebuilds,capped.memory.rebuilds,'Capped swipes do no more geometry work');
    await click('.slice-limit button');await waitFor(s=>s.pieces===1&&s.cuts===0,'Limit prompt resets the jelly');
    assert.equal(await evaluate(`document.querySelector('.slice-limit').hidden`),true);
    await drag([-2.7,0],[2.7,0],true,100);assert.equal((await stats()).pieces,2,'Reset restores swipe cutting');
    await click('button[aria-label^="Mute "]');assert.equal((await stats()).audio.enabled,false);
    await click('.collection-trigger');await click('a[href*="toy=jelly"]');await delay(500);
    assert.equal(await evaluate(`window.__sliceAudio.every(c=>c.state==='closed')`),true,'Retired audio context');
    record(`${toy} input, cancellation, pause, reduced motion, and cleanup passed`);
    await send('Emulation.setEmulatedMedia',{features:[]});await send('Emulation.setDeviceMetricsOverride',{width:1100,height:800,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  }
  await click('.collection-trigger');
  const performanceResult=await evaluate(`(async()=>{
    const {SliceRenderer}=await import('/src/slicing/render.ts'),{SliceModel}=await import('/src/slicing/model.ts'),{KnifePress,findCut,DEFAULT_CUT_ANGLE}=await import('/src/slicing/knife.ts');
    const {jellySlice}=await import('/src/toys/slicing.tsx');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:1100px;height:800px;z-index:100';document.body.append(canvas);
    const view=new SliceRenderer(canvas,'slab',jellySlice.theme),model=new SliceModel('slab'),press=new KnifePress();
    const line=findCut(model,{x:0,z:0},DEFAULT_CUT_ANGLE);press.begin(line);press.depth=.5;
    view.resize(1100,800);view.rebuild(model);
    const measure=async()=>{const samples=[],versions=[view.gel.geometry.attributes.position.version,view.gel.geometry.attributes.normal.version];
      for(let i=0;i<100;i++){await new Promise(requestAnimationFrame);const before=performance.now();model.step(1/60,false);view.update(model,press,line,false);view.render();view.renderer.getContext().finish();if(i>10)samples.push(performance.now()-before);}
      samples.sort((a,b)=>a-b);return {pieces:model.pieces.length,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],memory:view.diagnostics,versions,versionsAfter:[view.gel.geometry.attributes.position.version,view.gel.geometry.attributes.normal.version]};};
    try {const one=await measure();
      for(let i=0;i<110;i++){const a=i*2.399963,o=Math.sin(i*8.1)*1.2;model.beginStroke();model.slice({x:-8*Math.cos(a)-o*Math.sin(a),z:-8*Math.sin(a)+o*Math.cos(a)},{x:8*Math.cos(a)-o*Math.sin(a),z:8*Math.sin(a)+o*Math.cos(a)},true);}
      const before=performance.now();view.rebuild(model);const rebuildMs=performance.now()-before,many=await measure();
      return {one,many,rebuildMs};
    } finally {view.dispose();canvas.remove();}
  })()`);
  assert.equal(performanceResult.many.pieces,48);
  assert.equal(performanceResult.one.memory.drawCalls,performanceResult.many.memory.drawCalls);
  assert.equal(performanceResult.one.memory.textures,performanceResult.many.memory.textures);
  assert.equal(performanceResult.one.memory.geometries,performanceResult.many.memory.geometries);
  assert.deepEqual(performanceResult.many.versions,performanceResult.many.versionsAfter);
  record('One versus 48 pieces: fixed draw count and zero animated surface uploads',performanceResult);
  const voiceResult=await evaluate(`(async()=>{
    const {SliceAudio}=await import('/src/slicing/audio.ts'),ctx=new AudioContext(),connected=new Set();let peak=0;
    const adapter=new Proxy(ctx,{get(target,key){if(key==='createBufferSource')return()=>{const s=ctx.createBufferSource(),connect=s.connect.bind(s),disconnect=s.disconnect.bind(s);s.connect=(...a)=>{connected.add(s);peak=Math.max(peak,connected.size);return connect(...a);};s.disconnect=(...a)=>{connected.delete(s);return disconnect(...a);};return s;};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});
    const audio=new SliceAudio(1,()=>adapter);await audio.setEnabled(true);
    for(let i=0;i<100;i++){audio.move(.3,true,.5,.8);audio.finish();audio.reset();}
    await audio.setEnabled(false);await new Promise(r=>setTimeout(r,110));const muted=audio.diagnostics;
    await audio.setEnabled(true);audio.move(.3,true,.5,.8);audio.finish();audio.move(0,false);
    await new Promise(r=>setTimeout(r,800));const resting=connected.size;audio.dispose();await new Promise(r=>setTimeout(r,130));
    return {peak,resting,muted,remaining:connected.size,closed:ctx.state==='closed'};
  })()`);
  assert.ok(voiceResult.peak<=3&&voiceResult.resting===1&&voiceResult.remaining===0&&voiceResult.closed);
  assert.equal(voiceResult.muted.enabled,false);assert.equal(voiceResult.muted.level,0);
  record('100 rapid cuts and resets keep audio voices bounded and dispose their connections',voiceResult);
  const audioResult=await evaluate(`(async()=>{
    const {SliceAudio}=await import('/src/slicing/audio.ts');const offline=new OfflineAudioContext(2,48000*5,48000);let now=0;
    const adapter=new Proxy(offline,{get(target,key){if(key==='resume'||key==='close')return async()=>{};if(key==='currentTime')return now;if(key==='state')return 'running';const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});
    const audio=new SliceAudio(1,()=>adapter);await audio.setEnabled(true);
    for(let t=.2;t<3.4;t+=1/60){now=t;audio.move(.3,true,(t-.2)/3.2,.4+.5*Math.sin((t-.2)/3.2*Math.PI),-.2);}
    now=3.4;audio.finish();for(let t=3.4;t<4.1;t+=1/60){now=t;audio.move(0,false,1,0);}
    now=4.1;await audio.setEnabled(false);const buffer=await offline.startRendering(),data=buffer.getChannelData(0);
    const rms=(start,end)=>{let sum=0;for(let i=Math.floor(start*48000);i<Math.floor(end*48000);i++)sum+=data[i]*data[i];return Math.sqrt(sum/((end-start)*48000));};
    const windows=[.6,1.2,1.8,2.4,3].map(t=>rms(t,t+.2));
    const right=buffer.getChannelData(1);let stereo=0;for(let i=48000;i<144000;i++)stereo+=(data[i]-right[i])**2;
    const pcm=new Uint8Array(44+data.length*4),header=new DataView(pcm.buffer);
    const tag=(offset,text)=>{for(let i=0;i<text.length;i++)pcm[offset+i]=text.charCodeAt(i)};
    tag(0,'RIFF');header.setUint32(4,pcm.length-8,true);tag(8,'WAVE');tag(12,'fmt ');header.setUint32(16,16,true);header.setUint16(20,1,true);header.setUint16(22,2,true);header.setUint32(24,48000,true);header.setUint32(28,192000,true);header.setUint16(32,4,true);header.setUint16(34,16,true);tag(36,'data');header.setUint32(40,data.length*4,true);
    for(let i=0;i<data.length;i++){header.setInt16(44+i*4,Math.round(Math.max(-1,Math.min(1,data[i]))*32767),true);header.setInt16(46+i*4,Math.round(Math.max(-1,Math.min(1,right[i]))*32767),true);}
    let binary='';for(let i=0;i<pcm.length;i+=8192)binary+=String.fromCharCode(...pcm.subarray(i,i+8192));
    // DFT of the actual exit: the audible weight should be low and the finish
    // should stand above the quiet pull, not become a continuous pitched scrape.
    const n=8192,start=Math.round(3.4*48000),power=[];
    for(let bin=1;bin<=340;bin++){let re=0,im=0;for(let i=0;i<n;i++){const v=data[start+i]*(.5-.5*Math.cos(2*Math.PI*i/(n-1))),phase=2*Math.PI*bin*i/n;re+=v*Math.cos(phase);im-=v*Math.sin(phase);}power.push({hz:bin*48000/n,energy:re*re+im*im});}
    const energy=power.reduce((s,p)=>s+p.energy,0),bass=power.filter(p=>p.hz<600).reduce((s,p)=>s+p.energy,0);
    const dominantHz=power.reduce((a,b)=>b.energy>a.energy?b:a).hz;
    const result={before:rms(0,.18),windows,release:rms(3.42,3.58),settled:rms(3.9,4.05),muted:rms(4.7,4.9),peak:data.reduce((a,b)=>Math.max(a,Math.abs(b)),0),stereoDifference:Math.sqrt(stereo/96000),lowFrequencyShare:bass/energy,dominantHz,wav:btoa(binary)};audio.dispose();return result;
  })()`);
  await writeFile(join(artifacts,'wire-plop-preview.wav'),Buffer.from(audioResult.wav,'base64'));delete audioResult.wav;
  assert.ok(audioResult.before<.00001&&audioResult.muted<.00001&&audioResult.peak<.7,'Silent when inactive, with headroom');
  assert.ok(audioResult.windows.every(n=>n>.0003&&n<audioResult.release/5),'The pull should remain quiet beneath the plop');
  assert.ok(audioResult.release>.025&&audioResult.settled<.001,'A distinct short plop, with no ringing tail');
  assert.ok(audioResult.lowFrequencyShare>.95&&audioResult.dominantHz<180,'The plop should have low-pitched weight');
  record('Quiet pull followed by one short bass plop',audioResult);
  assert.equal(errors.length,0,JSON.stringify(errors));record('passed',{errors});
} catch (error) {
  console.error(error); process.exitCode = 1;
  try { record('failure', { error: String(error), state: await stats(), screenshot: await screenshot('failure') }); } catch {}
} finally {
  await writeFile(join(artifacts, 'slice-results.json'), JSON.stringify({ results, errors }, null, 2));
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close', {}, null); } catch {} socket.close(); }
  await delay(300); if (chrome.exitCode === null) chrome.kill();
}

