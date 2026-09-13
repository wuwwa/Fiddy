import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftBodyPhysics, STEP, FLOOR, type Point } from '../src/soft-body/physics.ts';
import { jellyProfile, cushionProfile, loopProfile, starProfile, dumplingProfile } from '../src/soft-body/profiles.ts';

const anchor={x:0,y:1.15,z:0.85},normal={x:0,y:0,z:1};
function begin(body=new SoftBodyPhysics(),id=1) {
  body.beginGrab(anchor,normal,id);body.setPressure(0,id);return body;
}
function advance(body:SoftBodyPhysics,seconds:number) {for(let i=0;i<Math.round(seconds/STEP);i++)body.step();}
function difference(a:ArrayLike<number>,b:ArrayLike<number>) {
  let largest=0;for(let i=0;i<a.length;i++)largest=Math.max(largest,Math.abs(a[i]-b[i]));return largest;
}
function assertBounded(body:SoftBodyPhysics) {
  const state=body.diagnostics();
  assert.ok(Number.isFinite(state.speed) && state.speed<20,`Speed ${state.speed}`);
  assert.ok(state.displacement<2.5,`Displacement ${state.displacement}`);
  assert.ok(state.minVolumeRatio>0.7,`Local volume ${state.minVolumeRatio}`);
  assert.ok(Math.abs(state.volumeRatio-1)<0.12,`Total volume ${state.volumeRatio}`);
  for(let i=1;i<body.positions.length;i+=3) assert.ok(body.positions[i]>=FLOOR-1e-9);
}

for(const axis of ['x','y','z'] as const) for(const sign of [-1,1]) {
  test(`a between-step ${sign>0?'positive':'negative'} ${axis} flick moves the actual skin in that direction`,()=>{
    const body=begin(),tap=begin();
    body.moveGrab({x:0,y:0,z:0,[axis]:sign*0.8},1);
    const before=new Float64Array(body.positions);
    body.release(1);tap.release(1);
    assert.deepEqual(body.positions,before,'Release must not teleport the skin');
    assert.ok(body.diagnostics().meanVelocity[axis]*sign>0.1);
    const rest=new Float32Array([anchor.x,anchor.y,anchor.z]),skin=new Float32Array(3),tapSkin=new Float32Array(3);
    const binding=[body.bind(anchor.x,anchor.y,anchor.z)];
    advance(body,0.075);advance(tap,0.075);
    body.deform(rest,skin,binding);tap.deform(rest,tapSkin,binding);
    assert.ok((skin[['x','y','z'].indexOf(axis)]-tapSkin[['x','y','z'].indexOf(axis)])*sign>0.01);
    assertBounded(body);
  });
}

test('a consumed drag, pressure change, or stationary release cannot add momentum twice',()=>{
  for(const pressure of [0,0.5,1.3]) {
    const body=begin();body.moveGrab({x:0.6,y:0.2,z:0},1);body.step();body.setPressure(pressure,1);
    const velocity=new Float64Array(body.velocities),positions=new Float64Array(body.positions);
    body.release(1);assert.deepEqual(body.velocities,velocity);assert.deepEqual(body.positions,positions);
    assert.equal(body.diagnostics().flickCount,0);
  }
  const body=begin();body.moveGrab({x:0.8,y:0,z:0},1);body.moveGrab({x:0,y:0,z:0},1);body.release(1);
  assert.equal(body.diagnostics().flickCount,0,'Returning to the consumed position must cancel the pending delta');
});

test('the last unconsumed reversal follows its new direction, not old target lag',()=>{
  const body=begin();body.moveGrab({x:0.8,y:0,z:0},1);advance(body,0.5);
  const before=body.diagnostics().meanVelocity.x;
  body.moveGrab({x:0.5,y:0,z:0},1);body.release(1);
  assert.ok(body.diagnostics().meanVelocity.x<before-0.1);
  assert.ok(body.diagnostics().lastFlick!.x<0);
});

test('cancel, global clear, reset, and late duplicate releases discard pending input',()=>{
  for(const action of ['cancel','clear','reset']) {
    const body=begin();advance(body,0.1);body.moveGrab({x:0.8,y:0.8,z:0},1);
    const velocity=new Float64Array(body.velocities);
    if(action==='cancel') body.release(1,false);
    else if(action==='clear') body.releaseAll();
    else body.reset();
    body.release(1);assert.equal(body.diagnostics().flickCount,0);
    assert.deepEqual(body.velocities,action==='reset'?new Float64Array(body.velocities.length):velocity);
  }
  const body=begin();body.moveGrab({x:0.8,y:0,z:0},1);body.release(1);
  const velocity=new Float64Array(body.velocities);body.release(1);
  assert.deepEqual(body.velocities,velocity);assert.equal(body.diagnostics().flickCount,1);
});

test('releasing one finger retains the other finger and its unprocessed movement',()=>{
  const body=begin();body.beginGrab({x:-0.7,y:1.15,z:0.6},normal,2);body.setPressure(0,2);
  body.moveGrab({x:0.65,y:0,z:0},1);body.moveGrab({x:-0.65,y:0.2,z:0},2);
  body.release(1);assert.equal(body.diagnostics().contactCount,1);assert.equal(body.diagnostics().flickCount,1);
  body.release(2);assert.equal(body.diagnostics().contactCount,0);assert.equal(body.diagnostics().flickCount,2);
  assert.ok(body.diagnostics().lastFlick!.x<0);
  advance(body,0.15);assertBounded(body);
});

test('subdividing unprocessed input does not multiply a flick; render rate after release does not change recovery',()=>{
  const results:Float64Array[]=[];
  for(const fps of [30,60,120,144]) {
    const body=begin();
    for(let i=1;i<=fps;i++)body.moveGrab({x:0.8*i/fps,y:0.3*i/fps,z:0},1);
    body.release(1);
    let accumulator=0;
    for(let frame=0;frame<fps;frame++) {
      accumulator+=1/fps;
      while(accumulator+1e-12>=STEP) {body.step();accumulator-=STEP;}
    }
    results.push(new Float64Array(body.positions));assertBounded(body);
  }
  for(const result of results) assert.ok(difference(result,results[0])<1e-12);
});

test('retained flicks preserve a substantial part of a matched one-tick pull on every axis',()=>{
  for(const axis of ['x','y','z'] as const) {
    const retained=begin(),consumed=begin(),rest=new Float32Array([anchor.x,anchor.y,anchor.z]);
    const binding=[retained.bind(anchor.x,anchor.y,anchor.z)],out=new Float32Array(3),component=['x','y','z'].indexOf(axis);
    for(const body of [retained,consumed]) body.moveGrab({x:0,y:0,z:0,[axis]:0.8},1);
    consumed.step();retained.release(1);consumed.release(1);
    const peaks=[0,0];
    for(let tick=0;tick<30;tick++) for(const [index,body] of [retained,consumed].entries()) {
      body.step();body.deform(rest,out,binding);peaks[index]=Math.max(peaks[index],out[component]-anchor[axis]);
    }
    assert.ok(peaks[0]>peaks[1]*0.3,`${axis}: retained ${peaks[0]}, consumed ${peaks[1]}`);
    assert.ok(peaks[0]<peaks[1]*1.1,`${axis}: retention must not amplify a matched drag`);
  }
});

test('a last sample beyond the upward shoulder or floor cannot bypass held stretch limits',()=>{
  const up=begin();up.moveGrab({x:0,y:1.2,z:0},1);advance(up,0.4);
  up.moveGrab({x:0,y:2,z:0},1);up.release(1);
  assert.ok(up.diagnostics().lastFlick!.y>0 && up.diagnostics().lastFlick!.y<0.3);
  advance(up,0.4);assertBounded(up);
  const down=begin();down.moveGrab({x:0,y:-10,z:0},1);advance(down,0.1);
  const velocity=new Float64Array(down.velocities);
  down.moveGrab({x:0,y:-100,z:0},1);down.release(1);
  assert.deepEqual(down.velocities,velocity,'Both samples are already stopped at the same floor');
});

test('a horizontal flick on compressed, twisted material stays horizontal on the visible skin',()=>{
  const body=new SoftBodyPhysics(),front={x:0.1,y:1,z:1};
  body.beginGrab(front,normal,1);body.setPressure(0,1);body.setTwist(0.7,1);
  body.beginGrab({x:0,y:1.8,z:0},{x:0,y:1,z:0},2);advance(body,1.5);
  assert.ok(body.compressionAmount>0.4 && body.twistAmount>0.4);
  const rest=new Float32Array([front.x,front.y,front.z]),bindings=[body.bind(front.x,front.y,front.z)];
  const before=new Float32Array(3),after=new Float32Array(3),positions=new Float64Array(body.positions),velocities=new Float64Array(body.velocities);
  body.deform(rest,before,bindings);body.moveGrab({x:0.05,y:0,z:0},1);body.release(1);
  // Measure the visible direction of only the added velocity, independently of
  // the rebound already in progress. Keep pressure/twist fixed for this sample.
  for(let i=0;i<body.positions.length;i++) body.positions[i]+=(body.velocities[i]-velocities[i])*0.001;
  body.deform(rest,after,bindings);body.positions.set(positions);
  const x=after[0]-before[0],y=after[1]-before[1],z=after[2]-before[2];
  assert.ok(x>0.0001);assert.ok(Math.hypot(y,z)<x*0.05,`Added skin motion ${x}, ${y}, ${z}`);
  assert.equal(body.diagnostics().contactCount,1);
});

test('reduced motion retains direction with a smaller release kick',()=>{
  const full=begin(),reduced=begin();reduced.reducedMotion=true;
  for(const body of [full,reduced]) {body.moveGrab({x:0.8,y:0,z:0},1);body.release(1);}
  assert.ok(reduced.diagnostics().meanVelocity.x>0);
  assert.ok(reduced.diagnostics().meanVelocity.x<full.diagnostics().meanVelocity.x*0.3);
  advance(reduced,3);assert.ok(reduced.diagnostics().displacement<0.005);
});

test('nonfinite movement is ignored, tiny movement is quiet, and huge movement saturates smoothly',()=>{
  for(const offset of [{x:NaN,y:0,z:0},{x:0,y:Infinity,z:0},{x:0,y:0,z:-Infinity}]) {
    const body=begin();body.moveGrab(offset,1);body.release(1);assert.equal(body.diagnostics().flickCount,0);
  }
  const tiny=begin();tiny.moveGrab({x:1e-7,y:0,z:0},1);tiny.release(1);assert.equal(tiny.diagnostics().flickCount,0);
  for(const amount of [100,1e20,1e300]) {
    const body=begin();body.moveGrab({x:amount,y:amount,z:amount},1);body.release(1);
    assert.ok(body.diagnostics().speed<=10);advance(body,0.2);assertBounded(body);
  }
});

test('rapid five-finger flicks remain bounded across every soft material and recover',()=>{
  const anchors:Point[]=[{x:-0.7,y:1,z:0.6},{x:0.7,y:1,z:0.6},{x:0,y:1.65,z:0},{x:0,y:1,z:-0.75},{x:0,y:1,z:0.85}];
  for(const profile of [jellyProfile,cushionProfile,loopProfile,starProfile,dumplingProfile]) {
    const body=new SoftBodyPhysics(profile.feel);
    for(let cycle=0;cycle<25;cycle++) {
      for(let id=0;id<5;id++) {
        assert.ok(body.beginGrab(anchors[id],normal,id));body.setPressure(0,id);
        body.moveGrab({x:Math.sin(cycle*3.1+id)*100,y:Math.cos(id+cycle)*100,z:Math.sin(cycle*0.7-id)*100},id);
      }
      for(let id=0;id<5;id++) body.release(id);
      assert.equal(body.diagnostics().flickCount,(cycle+1)*5,'Containment must never silently reset the body');
      advance(body,0.025);assertBounded(body);
    }
    advance(body,10);assertBounded(body);assert.ok(body.diagnostics().displacement<0.005,profile.label);
  }
});
