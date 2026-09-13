import assert from 'node:assert/strict';

export async function runPuttyChecks({load,reset,click,send,evaluate,diagnostics,waitFor,delay,touch,viewport,screenshot,record}) {
  const neutral=await load('putty');let id=1000;
  assert.equal(neutral.audio.enabled,false);assert.equal(neutral.plastic.offset,0);
  record('putty mobile rest',{state:neutral,screenshot:await screenshot('putty-rest')});
  const press=async(point={x:195,y:423})=>{
    const finger={...point,id:++id};await touch('touchStart',[finger]);
    await waitFor(data=>data.state.contactCount===1,'Putty press must hit actual skin');return finger;
  };
  const release=async finger=>{await touch('touchEnd',[finger]);await waitFor(data=>data.state.contactCount===0,'Release must clear grip');};
  const memory=state=>{
    assert.ok(state.plastic.offset<=0.700001);assert.ok(state.plastic.compression<=0.260001);
    assert.ok(state.minVolumeRatio>0.65 && Math.abs(state.volumeRatio-1)<0.1);
    assert.equal(state.reaction.pops,0);assert.deepEqual(state.memory,neutral.memory);
  };
  const key=(type,code='Space')=>send('Input.dispatchKeyEvent',{type,code,key:code==='Space'?' ':code,windowsVirtualKeyCode:32});
  let finger=await press();await delay(140);await release(finger);await delay(500);
  let state=(await diagnostics()).state;assert.equal(state.plastic.offset,0);assert.equal(state.plastic.compression,0);
  await reset();
  finger=await press();await delay(4000);state=(await diagnostics()).state;
  assert.ok(state.plastic.offset>0.1);memory(state);
  record('held front dent',{state,screenshot:await screenshot('putty-front-held')});
  await release(finger);await delay(2000);state=(await diagnostics()).state;memory(state);
  assert.ok(state.displacement>0.05);record('retained front dent',{state,screenshot:await screenshot('putty-front-retained')});
  const idle=await waitFor(data=>data.state.sleeping,'Learned shape must stop rendering when quiet',20000);
  const frames=idle.state.frames,offset=idle.state.plastic.offset;
  await delay(250);state=(await diagnostics()).state;assert.equal(state.frames,frames);assert.equal(state.plastic.offset,offset);
  record('learned shape sleeps',{frames,plastic:state.plastic});
  await reset();
  // A short native touch focuses the canvas for a real keyboard top squeeze.
  finger=await press();await release(finger);await key('keyDown');
  await waitFor(data=>data.state.keyboardActive,'Keyboard squeeze did not start');await delay(4000);
  await key('keyUp');await delay(2000);state=(await diagnostics()).state;memory(state);
  assert.ok(state.plastic.compression>0.15);assert.ok(state.height<neutral.height*0.85);
  record('retained top squeeze',{state,screenshot:await screenshot('putty-flat')});await reset();
  await click('button[aria-label="Enable putty sounds"]');
  await waitFor(data=>data.state.audio.enabled,'Putty audio did not enable');
  let points=[{id:++id,x:153,y:424},{id:++id,x:239,y:424}];
  await touch('touchStart',points);await waitFor(data=>data.state.contactCount===2,'Two fingers did not both grip putty');
  for(let step=0;step<12;step++) {
    points=points.map((p,i)=>({...p,x:p.x+(i===0?-4.5:4.5),y:p.y-3}));
    await touch('touchMove',points);await delay(30);
  }
  await delay(3000);state=(await diagnostics()).state;memory(state);assert.ok(state.plastic.offset>0.12);
  assert.equal(state.audio.gestureActive,false,'A stationary fold should be quiet');
  await touch('touchEnd',[points[0]]);await waitFor(data=>data.state.contactCount===1,'Partial release lost remaining finger');
  await touch('touchEnd',[points[1]]);await delay(1800);state=(await diagnostics()).state;memory(state);
  record('two-finger folded shape',{state,screenshot:await screenshot('putty-folded')});
  await click('button[aria-label="Mute putty sounds"]');await waitFor(data=>!data.state.audio.enabled,'Mute failed');
  await reset();assert.equal((await diagnostics()).state.plastic.offset,0);
  finger=await press();await delay(2600);const held=(await diagnostics()).state.plastic.offset;
  await viewport(844,390);
  const interrupted=await waitFor(data=>data.state.contactCount===0 && data.state.pointerCount===0,'Resize retained grip');
  assert.ok(interrupted.state.plastic.offset>=held*0.95,'Resize discarded learned shape');await touch('touchCancel',[]);
  await viewport(390,844);await reset();
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'),true);
  finger=await press();await delay(3000);await release(finger);await delay(1500);
  state=(await diagnostics()).state;assert.ok(state.plastic.offset>0.08);memory(state);record('reduced motion keeps material memory',{state});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await viewport(1200,900);await reset();
  for(const type of ['mousePressed','mouseMoved']) {
    await send('Input.dispatchMouseEvent',{type,button:'left',buttons:1,clickCount:1,x:type==='mousePressed'?600:665,y:type==='mousePressed'?450:415});
    await delay(80);
  }
  await waitFor(data=>data.state.contactCount===1,'Desktop mouse could not pull putty');await delay(3000);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:665,y:415});await delay(1600);
  state=(await diagnostics()).state;memory(state);
  record('desktop pulled fold',{state,screenshot:await screenshot('putty-desktop')});
  await reset();state=(await diagnostics()).state;
  assert.deepEqual(state.plastic,{offset:0,compression:0,yielding:false});
  assert.ok(Math.abs(state.height-neutral.height)<0.005 && Math.abs(state.width-neutral.width)<0.005);
  memory(state);const trace=(await diagnostics()).trace;assert.ok(trace.length>0 && trace.every(event=>event.trusted));
  record('putty reset and trusted input passed',{state,trustedEvents:trace.length});
}
