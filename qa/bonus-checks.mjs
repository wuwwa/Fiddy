import assert from 'node:assert/strict';

/** Development demonstration checks, using the existing renderer/lifecycle driver. */
export async function checkBonus({origin,backend,send,evaluate,state,waitFor,click,viewport,delay,record,screenshot}) {
  const go = async query => {
    await send('Page.navigate', {url: `${origin}/?toy=jelly&renderer=${backend}${query}`});
    await waitFor(s => s.toy === 'jelly' && s.ready && s.diagnostics, 'Jelly ready');
  };
  const button = transformed => `.bonus-preview button:${transformed ? 'last' : 'first'}-of-type`;
  const material = state => waitFor(s => s.diagnostics?.transformation === state, state, 30000);
  const pressKey = (type,code,key,windowsVirtualKeyCode) => send('Input.dispatchKeyEvent',{type,code,key,windowsVirtualKeyCode});
  await go('');
  assert.equal(await evaluate("!!document.querySelector('.bonus-preview')"),false,'Ordinary visits have no preview controls');
  await go('&bonus=materials');
  await material('ordinary');
  await waitFor(s => s.diagnostics.sleeping, 'ordinary settles');
  const documentId = (await state()).documentId;
  const memory = (await state()).diagnostics.memory;
  record('ordinary Jelly', {screenshot: await screenshot(`bonus-${backend}-ordinary`)});
  await click(button(true)); await material('transformed');
  await waitFor(s => s.diagnostics.sleeping, 'transformed settles');
  assert.equal((await state()).documentId, documentId);
  assert.deepEqual((await state()).diagnostics.memory, memory, 'Material changes reuse the same geometry and textures');
  record('transformed Jelly', {screenshot: await screenshot(`bonus-${backend}-transformed`)});

  // Reset geometry without resetting the preview choice.
  await click('button[aria-label="Reset jelly"]');
  await waitFor(s => s.diagnostics.transformation === 'transformed' && s.diagnostics.sleeping, 'reset retains transformed feel');
  assert.equal(await evaluate(`${JSON.stringify(button(true))} && document.querySelector(${JSON.stringify(button(true))}).getAttribute('aria-pressed')`),'true');

  // Request while a keyboard grab remains held; a synthetic click here avoids
  // stealing focus so it can specifically test deferred transitions.
  await evaluate("document.querySelector('canvas').focus()");
  await pressKey('keyDown','Space',' ',32);
  await waitFor(s => s.diagnostics.grabbed, 'keyboard grip');
  await evaluate(`document.querySelector(${JSON.stringify(button(false))}).click()`);
  await delay(250);
  assert.equal((await state()).diagnostics.transformationAmount,1,'Held input freezes parameters');
  assert.equal(await evaluate("document.querySelector('[data-transformation]').dataset.transformation"),'waiting');
  await pressKey('keyDown','ArrowUp','ArrowUp',38); await delay(650);
  await pressKey('keyUp','ArrowUp','ArrowUp',38);
  record('transformed lift', {screenshot: await screenshot(`bonus-${backend}-lift`)});
  await pressKey('keyUp','Space',' ',32);
  await material('ordinary');

  // Collection pauses an in-flight blend and resume uses the existing loop.
  await click(button(true));
  await waitFor(s => s.diagnostics.transformationAmount > 0 && s.diagnostics.transformationAmount < 1, 'partial transition');
  await click('.collection-trigger'); await waitFor(s => s.dialog.open,'collection pause'); await delay(300);
  const paused = await evaluate('window.__auditState()'); const pausedAmount = (await state()).diagnostics.transformationAmount;
  await delay(500);
  const stillPaused = await evaluate('window.__auditState()');
  assert.equal(stillPaused.submits,paused.submits); assert.equal(stillPaused.draws,paused.draws);
  assert.equal((await state()).diagnostics.transformationAmount,pausedAmount);
  await click('.close-collection'); await material('transformed');

  // Hidden tabs freeze the prototype; elapsed wall time cannot finish a blend.
  await click(button(false));
  await waitFor(s => s.diagnostics.transformationAmount > 0 && s.diagnostics.transformationAmount < 1, 'partial exit');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
  await delay(250); const hidden = await evaluate('window.__auditState()');
  const hiddenAmount = (await state()).diagnostics.transformationAmount;
  await delay(500); const later = await evaluate('window.__auditState()');
  assert.equal(later.submits,hidden.submits); assert.equal(later.draws,hidden.draws);
  assert.equal((await state()).diagnostics.transformationAmount,hiddenAmount);
  await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
  await material('ordinary');

  // Trusted touch, cancellation, compact layouts and reduced motion.
  await viewport(390,844,true); await click('button[aria-label="Reset jelly"]');
  await waitFor(s => s.diagnostics.sleeping, 'phone settled');
  await click(button(true)); await material('transformed');
  await waitFor(s => s.diagnostics.sleeping, 'phone transformed settled');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:550,id:1}]});
  await waitFor(s => s.diagnostics.grabbed,'touch hits transformed Jelly'); await delay(600);
  record('transformed touch press', {screenshot:await screenshot(`bonus-${backend}-phone-press`)});
  await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await waitFor(s => !s.diagnostics.grabbed, 'touch cancellation');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await click(button(false)); await material('ordinary'); await click(button(true)); await material('transformed');
  for (const [width,height] of [[320,568],[844,390]]) {
    await viewport(width,height,true);
    const boxes = await evaluate("[...document.querySelectorAll('.bonus-preview button')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}})");
    assert.ok(boxes.every(b=>b.left>=0&&b.right<=width&&b.top>=0&&b.bottom<=height&&b.width>=48&&b.height>=48));
    record(`bonus layout ${width}x${height}`,{screenshot:await screenshot(`bonus-${backend}-${width}x${height}`)});
  }
  // Repeated reversals settle without rebuilding the renderer.
  for (let i=0;i<8;i++) { await click(button(i%2===1)); await delay(60); }
  await material('transformed');
  const runtime=await evaluate('window.__auditState()');
  assert.equal(runtime.activeContexts.length+runtime.activeDevices,1);
  assert.equal((await state()).diagnostics.resets,0);
  await click('.collection-trigger'); await waitFor(s=>s.dialog.open,'switch collection');
  await click('.collection-item[href*="toy=dumpling"]'); await waitFor(s=>s.toy==='dumpling'&&s.ready,'Dumpling ready');
  assert.equal(await evaluate("!!document.querySelector('.bonus-preview')"),false);
  await waitFor(s=>s.diagnostics?.shape==='dumpling','Dumpling diagnostics');
  assert.equal((await state()).diagnostics.transformationAmount,0,'Other shapes stay ordinary');
  await go('&bonus=materials'); await material('ordinary');
  record('bonus preview input, lifecycle, renderer reuse and isolation passed',{backend});
}
