import assert from 'node:assert/strict';

export async function checkFever({origin,backend,send,evaluate,state,waitFor,click,viewport,delay,record,screenshot}) {
  const bonus=()=>evaluate("JSON.parse(document.querySelector('canvas').dataset.bonus || 'null')");
  const character=()=>evaluate("JSON.parse(document.querySelector('canvas').dataset.character || 'null')");
  const waitBonus=async predicate=>{
    const start=Date.now();
    while(Date.now()-start<40000){const value=await bonus();if(value&&predicate(value))return value;await delay(50);}
    throw new Error('Bonus wait: '+JSON.stringify(await bonus()));
  };
  const start=async()=>{
    const began=Date.now();await click('.bonus-invitation .bonus-start');await waitBonus(b=>b.phase==='visiting');
    record('bonus arrival',{milliseconds:Date.now()-began});
  };
  await viewport(390,844,true);
  await send('Page.navigate',{url:`${origin}/?toy=jelly&bonus=demo&renderer=${backend}`});
  await waitFor(s=>s.ready&&s.diagnostics,'Companion ready');
  await start();
  assert.ok((await character())?.visible && (await character())?.attached);
  assert.equal(await evaluate("!!document.querySelector('.bonus-stars,.bonus-instruction,.bonus-finale')"),false,'No score, directions or winning screen');
  assert.equal('caught' in await bonus(),false,'No hidden performance counter');
  const initial=await evaluate('window.__auditState()');
  // The full visit must happen for someone who only watches.
  await click('.collection-trigger');await waitFor(s=>s.dialog.open,'collection');await delay(350);
  const before=await evaluate('window.__auditState()'),beforeBonus=await bonus();await delay(500);
  const after=await evaluate('window.__auditState()');
  assert.equal(after.submits,before.submits);assert.equal(after.draws,before.draws);assert.deepEqual(await bonus(),beforeBonus);
  await click('.close-collection');
  await waitBonus(b=>b.phase==='visiting'&&b.age>3);
  record('companion visit',{screenshot:await screenshot(`companion-${backend}-visit`)});
  await waitBonus(b=>b.phase==='farewell');
  assert.equal((await state()).diagnostics.interactionCount,0,'No fidget input was needed for the entire visit');
  assert.equal((await character()).expression,'sleepy');
  record('unprompted farewell',{screenshot:await screenshot(`companion-${backend}-farewell`)});
  await waitBonus(b=>b.phase==='idle');
  await waitFor(s=>s.diagnostics.transformation==='ordinary','ordinary after visit');
  assert.equal((await character()).visible,false);
  assert.equal((await state()).diagnostics.resets,0,'No solver safety resets');
  // Handling is still fully available, but reset and touch cannot earn or restart the visit.
  await start();
  const next=await evaluate('window.__auditState()');
  assert.equal(next.activeContexts.length+next.activeDevices,1);
  assert.equal(next.activeDevices,initial.activeDevices);
  const visitAge=(await bonus()).age;
  await click('button[aria-label="Reset jelly"]');await delay(700);
  assert.ok((await bonus()).age>visitAge);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:555,id:1}]});
  await waitFor(s=>s.diagnostics.grabbed,'touching companion');
  for(let i=1;i<=25;i++){
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195+40*i/25,y:555-145*i/25,id:1}]});
    await delay(25);
  }
  assert.ok((await character()).visible);
  assert.equal((await bonus()).phase,'visiting');
  record('freely handled companion',{screenshot:await screenshot(`companion-${backend}-touch`)});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [width,height] of [[320,568],[844,390]]){
    await viewport(width,height,true);await delay(200);
    const controls=await evaluate("[...document.querySelectorAll('.bonus-hud button')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})");
    assert.ok(controls.every(r=>r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height));
    record(`companion ${width}x${height}`,{screenshot:await screenshot(`companion-${backend}-${width}x${height}`)});
  }
  await click('.bonus-exit');await waitBonus(b=>b.phase==='idle');
  await click('.collection-trigger');await waitFor(s=>s.dialog.open,'collection');
  await click('.collection-item[href*="toy=dumpling"]');await waitFor(s=>s.toy==='dumpling'&&s.ready,'Dumpling');
  assert.equal(await evaluate("!!document.querySelector('.bonus-event')"),false);
  const resources=await evaluate('window.__auditState()');
  assert.equal(resources.activeDevices+resources.activeContexts.length,1);
  record('Passive visit, touch, pause, replay, reduced motion and cleanup passed',{backend});
}
