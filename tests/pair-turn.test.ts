import test from 'node:test';
import assert from 'node:assert/strict';
import { PairTurnPressure } from '../src/soft-body/pair-turn';
import { STEP } from '../src/soft-body/physics';

function pair() {
  const turns=new PairTurnPressure();turns.begin(1,100,200);turns.begin(2,200,200);return turns;
}
function turn(turns:PairTurnPressure,degrees:number) {
  const angle=degrees*Math.PI/180;
  turns.move(1,150-50*Math.cos(angle),200-50*Math.sin(angle));
  turns.move(2,150+50*Math.cos(angle),200+50*Math.sin(angle));
}
function advance(turns:PairTurnPressure,seconds:number) {
  for(let i=0;i<Math.round(seconds/STEP);i++)turns.step(STEP);
}

test('a deliberate gentle turn in either direction eases inward pressing gradually and stays unloaded while held',()=>{
  for(const direction of [-1,1]) {
    const turns=pair();turn(turns,15*direction);
    turns.step(STEP);assert.equal(turns.pressure(1,1),1,'No single-event pressure jump');
    advance(turns,0.1);assert.ok(turns.relief(1)>0.2 && turns.relief(1)<0.85);
    advance(turns,0.5);assert.ok(turns.pressure(1,1)<0.02);
    assert.equal(turns.relief(1),turns.relief(2));
    advance(turns,2);assert.ok(turns.pressure(1,1)<0.001,'A held turn must not become a poke again');
    turn(turns,0);advance(turns,1.5);assert.ok(turns.pressure(1,1)>0.99);
  }
});

test('stationary holds, touch jitter, radial pinches, and common translation keep ordinary pressure',()=>{
  for(const gesture of ['still','jitter','pinch','translation']) {
    const turns=pair();
    for(let i=1;i<=240;i++) {
      const t=i/240;
      if(gesture==='jitter')turn(turns,Math.sin(i)*1.5);
      if(gesture==='pinch') {turns.move(1,100+30*t,200);turns.move(2,200-30*t,200);}
      if(gesture==='translation') {turns.move(1,100+110*t,200-70*t);turns.move(2,200+110*t,200-70*t);}
      turns.step(STEP);
      assert.equal(turns.pressure(1,0.7),0.7,gesture);assert.equal(turns.pressure(2,1.2),1.2,gesture);
    }
  }
});

test('one briefly staggered move cannot latch a false turn',()=>{
  const turns=pair();turns.move(1,100,220);turns.step(STEP);
  turns.move(2,200,220);advance(turns,0.5);
  assert.equal(turns.relief(1),0);assert.equal(turns.relief(2),0);
});

test('a predominantly radial pinch retains most pressure even with a small rotation',()=>{
  const turns=pair(),angle=10*Math.PI/180;
  turns.move(1,150-30*Math.cos(angle),200-30*Math.sin(angle));
  turns.move(2,150+30*Math.cos(angle),200+30*Math.sin(angle));
  advance(turns,1);assert.ok(turns.pressure(1,1)>0.9);
});

test('partial release restores the survivor gradually, and fresh contacts do not replay old movement',()=>{
  const turns=pair();turn(turns,15);advance(turns,0.8);
  const before=turns.pressure(2,1);turns.end(1);
  assert.equal(turns.pressure(2,1),before);assert.equal(turns.diagnostics().pairs,0);
  turns.step(STEP);assert.ok(turns.pressure(2,1)<before+0.04);
  advance(turns,0.3);assert.ok(turns.pressure(2,1)>0.5 && turns.pressure(2,1)<0.85);
  turns.begin(3,100,100);advance(turns,1.5);
  assert.ok(turns.pressure(2,1)>0.99);assert.equal(turns.pressure(3,1),1);
});

test('ending an unrelated third contact leaves a held pair turn engaged',()=>{
  const turns=pair();turns.begin(3,150,100);turn(turns,15);advance(turns,0.8);
  turns.end(3);advance(turns,0.5);
  assert.ok(turns.pressure(1,1)<0.01);assert.equal(turns.diagnostics().pairs,1);
});

test('coincident fingers and a collapsed crossing rebase before a fresh turn',()=>{
  for(const startCoincident of [false,true]) {
    const turns=new PairTurnPressure();turns.begin(1,100,200);turns.begin(2,startCoincident?100:200,200);
    if(!startCoincident) {turns.move(1,148,200);turns.move(2,152,200);turns.step(STEP);}
    turns.move(1,200,200);turns.move(2,100,200);advance(turns,0.5);
    assert.equal(turns.relief(1),0,'Separating or crossing is not a 180 degree turn');
    const angle=15*Math.PI/180;
    turns.move(1,150+50*Math.cos(angle),200+50*Math.sin(angle));
    turns.move(2,150-50*Math.cos(angle),200-50*Math.sin(angle));
    advance(turns,0.8);assert.ok(turns.pressure(1,1)<0.01);
  }
});

test('reset, invalid input, missing contacts, and the contact cap remain bounded',()=>{
  const turns=pair();turn(turns,15);advance(turns,0.8);
  const before=turns.diagnostics();
  for(const dt of [NaN,Infinity,-1,0])turns.step(dt);
  turns.move(1,NaN,200);turns.move(2,200,Infinity);turns.move(99,10,10);
  assert.deepEqual(turns.diagnostics(),before);
  assert.equal(turns.begin(1,10,10),false);assert.equal(turns.begin(3,NaN,10),false);
  for(let i=3;i<=5;i++)assert.equal(turns.begin(i,i*40,100),true);
  assert.equal(turns.begin(6,300,100),false);assert.equal(turns.diagnostics().pairs,10);
  turns.step(100);assert.ok(turns.diagnostics().contacts.every(c=>c.relief>=0 && c.relief<=1));
  turns.clear();assert.deepEqual(turns.diagnostics(),{pairs:0,contacts:[]});
  assert.equal(turns.pressure(1,1),1);assert.equal(turns.pressure(1,NaN),0);
  assert.equal(turns.pressure(1,-1),0);assert.equal(turns.pressure(1,5),1.3);
});

test('fixed physics ticks give the same held response at different rendering rates',()=>{
  const results=[];
  for(const fps of [30,60,120]) {
    const turns=pair();turn(turns,15);let accumulator=0;
    for(let frame=0;frame<fps;frame++) {
      accumulator+=1/fps;
      while(accumulator>=STEP) {turns.step(STEP);accumulator-=STEP;}
    }
    results.push(turns.relief(1));
  }
  assert.ok(Math.max(...results)-Math.min(...results)<1e-10);
});
