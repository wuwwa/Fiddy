import assert from 'node:assert/strict';

export async function runDoughSurfaceChecks({load,send,viewport,delay,waitFor,screenshot,record}) {
  await load('dough');
  await viewport(1280,900);await send('Emulation.setTouchEmulationEnabled',{enabled:false});await delay(300);
  const variant=process.env.QA_VARIANT??'smooth';
  for(let cycle=0;cycle<(process.argv.includes('--worked')?4:1);cycle++)for(const [side,from,to] of [
    ['right',{x:760,y:490},{x:655,y:460}],
    ['front',{x:640,y:565},{x:640,y:310}],
  ]) {
    const name=cycle?`${side}-${cycle+1}`:side;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1});
    await waitFor(data=>data.state.contactCount===1,`${name} grip`);
    for(let step=1;step<=24;step++) {
      const t=step/24;
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,button:'left',buttons:1});await delay(25);
    }
    const curl=await waitFor(data=>data.state.fold.angle>1,`${name} curl`);await delay(400);
    record(`${name} curled underside`,{fold:curl.state.fold,screenshot:await screenshot(`dough-surface-${variant}-${name}-curl`)});
    const foldCount=curl.state.fold.folds;
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,clickCount:1});
    const merged=await waitFor(data=>data.state.fold.folds>foldCount && data.state.fold.phase==='idle',`${name} merging`,10000);
    assert.ok(merged.state.height>0.5);
    record(`${name} merged underside`,{screenshot:await screenshot(`dough-surface-${variant}-${name}-merged`)});
  }
}
