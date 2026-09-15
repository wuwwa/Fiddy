import assert from 'node:assert/strict';

/** Mode-specific scenarios run through the same Chrome driver as production QA. */
export async function checkModes({origin,backend,send,evaluate,state,waitFor,click,viewport,delay,record,screenshot}) {
  const go=async(query,expected,mode='resting')=>{
    await send('Page.navigate',{url:origin+'/?'+query+'&renderer='+backend});
    await waitFor(s=>s.ready&&s.toy===expected&&s.mode===mode,query+' ready');
  };
  const choose=async mode=>{
    await click('.mode-switch button[data-mode="'+mode+'"]');
    await waitFor(s=>s.ready&&s.mode===mode,mode+' ready');
    assert.equal(await evaluate("document.querySelectorAll('canvas').length"),1);
    assert.equal(await evaluate("document.activeElement?.getAttribute('aria-pressed')"),'true','Toggle focus should survive remount');
  };
  const collect=async toy=>{
    await click('.collection-trigger');await waitFor(s=>s.dialog.open,'collection open');
    await click('.collection-item[href*="toy='+toy+'"]');await waitFor(s=>s.ready&&s.toy===toy&&!s.dialog.open,toy+' selected');
  };
  await go('toy=free-jelly','jelly','free');
  assert.equal(new URL((await state()).url).searchParams.get('toy'),'jelly');
  assert.equal(await evaluate("document.querySelectorAll('.collection-item[href*=\"free-jelly\"]').length"),0);
  await choose('resting');
  assert.equal(new URL((await state()).url).searchParams.has('mode'),false);
  await collect('cushion'); await choose('free'); await collect('jelly');
  assert.equal((await state()).mode,'resting');
  await collect('cushion'); assert.equal((await state()).mode,'free','Remember each toy separately');
  await send('Page.reload'); await waitFor(s=>s.ready&&s.toy==='cushion'&&s.mode==='free','reload saved mode');
  await collect('star');
  const history=await send('Page.getNavigationHistory');
  await send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id});
  await waitFor(s=>s.ready&&s.toy==='cushion'&&s.mode==='free','history restores mode');
  await send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex].id});
  await waitFor(s=>s.ready&&s.toy==='star'&&s.mode==='resting','forward restores mode');
  for(const toy of ['jelly','cushion','loop','star','dumpling']){
    await go('toy='+toy,toy); await choose('free'); await delay(1400);
    // The keyboard target must find actual material, including the rim of Loop.
    await click('canvas');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' ',windowsVirtualKeyCode:32});await delay(250);
    assert.equal(await evaluate("document.querySelector('canvas').classList.contains('is-grabbing')"),true,toy+' keyboard contact');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowUp',key:'ArrowUp',windowsVirtualKeyCode:38});await delay(600);
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowUp',key:'ArrowUp',windowsVirtualKeyCode:38});
    record(toy+' free shape',{screenshot:await screenshot('mode-'+toy+'-'+backend)});
    await send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32});
    await choose('resting');
    assert.equal(await evaluate("document.querySelector('canvas').classList.contains('is-grabbing')"),false);
    await choose('free');
    const runtime=await evaluate('window.__auditState()');
    assert.equal(runtime.activeContexts.length+runtime.activeDevices,1,toy+' retired renderer leak');
  }
  await go('toy=jelly','jelly');
  for(let i=0;i<8;i++){await click('.mode-switch button[data-mode="'+(i%2?'resting':'free')+'"]');await delay(35);}
  await waitFor(s=>s.ready&&s.mode==='resting','rapid switches settle');
  await delay(500);
  assert.equal(await evaluate("document.querySelectorAll('canvas').length"),1);
  const runtime=await evaluate('window.__auditState()');
  assert.equal(runtime.activeContexts.length+runtime.activeDevices,1,'rapid switching leaked a renderer');
  for(const [width,height] of [[390,844],[320,568],[844,390]]){
    await viewport(width,height,true);await choose('free');
    const boxes=await evaluate("[...document.querySelectorAll('.mode-switch button')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}})");
    assert.ok(boxes.every(b=>b.width>=48&&b.height>=44&&b.x>=0&&b.right<=width&&b.y>=0&&b.bottom<height));
    record('mode controls '+width+'x'+height,{screenshot:await screenshot('modes-'+backend+'-'+width+'x'+height)});
    await choose('resting');
  }
  await go('toy=dough&mode=free','dough');
  assert.equal(await evaluate("!!document.querySelector('.mode-switch')"),false);
  assert.equal(new URL((await state()).url).searchParams.has('mode'),false);
  await evaluate("localStorage.setItem('fiddy-preferences-v1',JSON.stringify({version:1,favoriteIds:['free-jelly','jelly','cushion'],lastToyId:'free-jelly'}))");
  await go('qa=migration','jelly','free');
  const migrated=await evaluate("JSON.parse(localStorage.getItem('fiddy-preferences-v1'))");
  assert.deepEqual(migrated.favoriteIds,['jelly','cushion']);assert.equal(migrated.toyModes.jelly,'free');
  const blocked=await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked')}})"});
  await go('toy=cushion','cushion');await choose('free');await choose('resting');
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:blocked.identifier});
  record('mode persistence, compatibility, switching and controls passed',{backend});
}
