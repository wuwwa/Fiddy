import test from 'node:test';
import assert from 'node:assert/strict';
import { JellyBonusRound } from '../src/free-jelly/bonus-round';

function visit() {
  const round=new JellyBonusRound(); round.start(); round.step(0.01,'transformed');
  for(let i=0;i<7;i++)round.step(0.05,'transformed');
  assert.equal(round.phase,'visiting');return round;
}
test('the visit unfolds and ends without any input, score or completion requirement',()=>{
  const round=visit();
  assert.deepEqual(round.snapshot,{phase:'visiting'});
  for(let i=0;i<481;i++)round.step(0.05,'transformed');
  assert.equal(round.phase,'farewell');
  for(let i=0;i<61;i++)round.step(0.05,'transformed');
  assert.equal(round.phase,'returning');
  round.step(0.05,'ordinary');assert.equal(round.phase,'idle');
});
test('interaction and unsettled material cannot change the experience after awakening',()=>{
  const watching=visit(), moving=visit();
  for(let i=0;i<541;i++){
    watching.step(0.05,'transformed');
    moving.step(0.05,i%2?'waiting':'entering');
    assert.deepEqual(moving.snapshot,watching.snapshot);
    assert.equal(moving.delight,watching.delight);
    assert.equal(moving.age,watching.age);
  }
  assert.equal(watching.phase,'returning');
  moving.step(0.05,'leaving');assert.equal(moving.phase,'returning','Physical exit still waits for a safe morph');
  moving.step(0.05,'ordinary');assert.equal(moving.phase,'idle');
});
test('entry and exit respect safe material transitions; an early exit resets cleanly for replay',()=>{
  const round=new JellyBonusRound();assert.ok(round.start());assert.equal(round.start(),false);
  for(let i=0;i<80;i++)round.step(0.05,'waiting');
  assert.equal(round.phase,'waiting');
  round.finish();round.step(0.05,'leaving');assert.equal(round.phase,'returning');
  round.step(0.05,'ordinary');assert.equal(round.phase,'idle');
  assert.ok(round.start());assert.equal(round.age,0);assert.equal(round.delight,0);
});
test('paused, invalid and stalled time never skips the visit or produces a catch-up ending',()=>{
  const round=visit(), before=round.age;
  for(const dt of [0,-1,NaN,Infinity])round.step(dt,'transformed');
  assert.equal(round.age,before);
  round.step(60,'transformed');assert.equal(round.age,before+0.05);assert.equal(round.phase,'visiting');
  let sawHappy=false;
  for(let i=0;i<100;i++){round.step(0.05,'transformed');sawHappy ||= round.delight>0.9;}
  assert.ok(sawHappy,'The companion has happy moments without being fed or handled');
});
