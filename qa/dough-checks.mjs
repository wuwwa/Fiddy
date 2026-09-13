import assert from 'node:assert/strict';

export async function runDoughChecks({load,reset,click,send,evaluate,diagnostics,waitFor,delay,touch,viewport,screenshot,record}) {
  if(process.argv.includes('--surface')) {
    const {runDoughSurfaceChecks}=await import('./dough-surface-checks.mjs');
    return runDoughSurfaceChecks({load,send,viewport,delay,waitFor,screenshot,record});
  }
  const neutral=await load('dough');
  assert.equal(neutral.kneading.mostWorked,0);
  record('dough mobile rest',{screenshot:await screenshot('dough-rest')});
  let finger={id:501,x:195,y:422};
  await touch('touchStart',[finger]);
  await waitFor(data=>data.state.contactCount===1,'Finger must grip dough');
  await delay(1800);
  for(let stroke=0;stroke<6;stroke++)for(let step=1;step<=24;step++) {
    const t=step/24;
    finger={...finger,x:195+Math.sin((stroke+t)*Math.PI)*65,y:422-Math.sin(t*Math.PI)*16};
    await touch('touchMove',[finger]);await delay(55);
  }
  let state=(await diagnostics()).state;
  assert.equal(state.contactCount,1);assert.ok(state.kneading.mostWorked>0.1);
  assert.ok(state.minVolumeRatio>0.65);assert.ok(state.fold.folds>0 || state.fold.phase!=='idle');
  record('dough worked',{kneading:state.kneading,plastic:state.plastic,screenshot:await screenshot('dough-worked')});
  await touch('touchEnd',[finger]);
  await waitFor(data=>data.state.contactCount===0,'Release');
  const mixed=(await diagnostics()).state.kneading.mixed;
  await delay(500);assert.equal((await diagnostics()).state.kneading.mixed,mixed);
  await reset();assert.equal((await diagnostics()).state.kneading.mostWorked,0);
  await click('button[aria-label="Enable dough sounds"]');
  await waitFor(data=>data.state.audio.enabled,'Sound enables');
  const points=[{id:502,x:160,y:421},{id:503,x:230,y:421}];
  await touch('touchStart',points);await waitFor(data=>data.state.contactCount===2,'Two-finger kneading');
  await touch('touchMove',points.map((p,i)=>({...p,x:p.x+(i?-35:15),y:p.y-18})));await delay(1000);
  await touch('touchCancel',[]);await waitFor(data=>data.state.contactCount===0,'Cancellation clears hands');
  await reset();
  await viewport(1280,900);await send('Emulation.setTouchEmulationEnabled',{enabled:false});await delay(150);
  const resting=(await diagnostics()).state;
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:640,y:438,button:'left',buttons:1,clickCount:1});
  await waitFor(data=>data.state.contactCount===1,'Desktop mouse grip');
  for(let i=1;i<=20;i++) {await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:640+i*5.5,y:438-i,button:'left',buttons:1});await delay(30);}
  const lifted=(await diagnostics()).state;
  assert.ok(lifted.fold.angle>0.3,'A short mouse drag must turn material over');
  assert.ok(lifted.height>resting.height+0.08,'Dragging should lift, not only squash');
  record('mouse lifts a fold',{height:lifted.height,displacement:lifted.displacement,screenshot:await screenshot('dough-mouse-lift')});
  for(let i=1;i<=30;i++) {await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:750-i*110/30,y:418+i*20/30,button:'left',buttons:1});await delay(30);}
  await delay(200);
  const folded=(await diagnostics()).state;
  assert.ok(folded.minVolumeRatio>0.65);
  record('mouse lays the fold down',{height:folded.height,screenshot:await screenshot('dough-mouse-folded')});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:640,y:438,button:'left',buttons:0,clickCount:1});
  const united=await waitFor(data=>data.state.fold.phase==='idle' && data.state.fold.folds>0,'The folded layers must merge',10000);
  record('mouse fold merged',{fold:united.state.fold,screenshot:await screenshot('dough-mouse-merged')});
  // Successive folds expose the contact rim from the sides and the front.
  for(const [name,from,to] of [
    ['right',{x:750,y:475},{x:565,y:440}],
    ['front',{x:640,y:565},{x:640,y:375}],
    ['left',{x:530,y:475},{x:715,y:440}],
  ]) {
    const folds=(await diagnostics()).state.fold.folds;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1});
    await waitFor(data=>data.state.contactCount===1,`${name} fold grip`);
    for(let step=1;step<=24;step++) {
      const t=step/24;
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,button:'left',buttons:1});
      await delay(25);
    }
    await waitFor(data=>data.state.fold.angle>0.9,`${name} edge must curl`);
    record(`${name} underside during curl`,{screenshot:await screenshot(`dough-bottom-${name}-lift`)});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,clickCount:1});
    await waitFor(data=>data.state.fold.phase==='idle' && data.state.fold.folds>folds,`${name} fold must settle`,10000);
    record(`${name} base after merging`,{screenshot:await screenshot(`dough-bottom-${name}-merged`)});
  }
  await reset();
  await click('canvas');
  await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' ',windowsVirtualKeyCode:32});
  await waitFor(data=>data.state.keyboardActive,'Keyboard knead');
  await send('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowRight',key:'ArrowRight',windowsVirtualKeyCode:39});await delay(1800);
  await send('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowRight',key:'ArrowRight',windowsVirtualKeyCode:39});
  await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32});
  state=(await waitFor(data=>!data.state.keyboardActive,'Keyboard release')).state;
  assert.ok(state.fold.angle>Math.PI/2 || state.fold.folds>0,'Keyboard must also turn the flap over');
  record('dough desktop knead',{screenshot:await screenshot('dough-desktop-worked')});
  await reset();record('dough desktop rest',{screenshot:await screenshot('dough-desktop-rest')});
  await click('.collection-trigger');await delay(150);
  const before=(await diagnostics()).state.frames;await delay(200);assert.equal((await diagnostics()).state.frames,before);
  assert.ok(await evaluate("!!document.querySelector('.collection-item[href*=\"toy=dough\"]')"));
  await click('.close-collection');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await delay(100);await reset();
  assert.equal(await evaluate("!!document.querySelector('.error-panel')"),false);
  assert.deepEqual((await diagnostics()).state.memory,neutral.memory);
}
