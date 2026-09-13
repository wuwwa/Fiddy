import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftBodyPhysics, FLOOR, STEP } from '../src/soft-body/physics.ts';
import { SurfaceRipples } from '../src/soft-body/ripples.ts';

function advance(p:SoftBodyPhysics,seconds:number) {for(let i=0;i<seconds/STEP;i++)p.step();}

test('unforced jelly stays at rest and bindings reproduce its surface',()=>{
  const p=new SoftBodyPhysics();advance(p,1);
  assert.ok(p.diagnostics().displacement<1e-10);
  const original=new Float32Array([0,1.8,0,0.9,0.5,0.2]);
  const result=new Float32Array(original.length);
  p.deform(original,result,[p.bind(0,1.8,0),p.bind(0.9,0.5,0.2)]);
  assert.ok(result.every((value,i)=>Math.abs(value-original[i])<1e-7));
});

test('a held poke dents locally, preserves volume, and rebounds after release',()=>{
  const p=new SoftBodyPhysics();
  p.beginGrab({x:0,y:1.8,z:0});p.moveGrab({x:0,y:-0.45,z:0});advance(p,0.6);
  const held=p.diagnostics();
  assert.ok(held.displacement>0.1,JSON.stringify(held));
  assert.ok(Math.abs(held.volumeRatio-1)<0.08,JSON.stringify(held));
  assert.ok(held.minVolumeRatio>0,JSON.stringify(held));
  const start=Array.from(p.positions);
  p.release();advance(p,0.15);
  assert.ok(start.some((v,i)=>Math.abs(p.positions[i]-v)>0.02));
  advance(p,8);
  assert.ok(p.diagnostics().displacement<0.015,JSON.stringify(p.diagnostics()));
  assert.ok(p.diagnostics().speed<0.05,JSON.stringify(p.diagnostics()));
});

test('extreme repeated drags remain bounded, above the floor, and reset exactly',()=>{
  const p=new SoftBodyPhysics();
  for(let gesture=0;gesture<40;gesture++) {
    p.beginGrab({x:Math.sin(gesture)*0.8,y:1.5,z:Math.cos(gesture)*0.8});
    p.moveGrab({x:Math.sin(gesture)*100,y:gesture%2 ? -100:100,z:Math.cos(gesture)*100});
    advance(p,0.2);p.release();advance(p,0.1);
    const state=p.diagnostics();
    assert.ok(Number.isFinite(state.displacement) && state.displacement<1,JSON.stringify(state));
    assert.ok(Math.abs(state.volumeRatio-1)<0.12,JSON.stringify(state));
    assert.ok(state.minVolumeRatio>0,JSON.stringify(state));
    for(let i=1;i<p.positions.length;i+=3)assert.ok(p.positions[i]>=FLOOR);
  }
  p.reset();
  assert.deepEqual(p.positions,p.rest);
  assert.equal(p.diagnostics().speed,0);
  assert.equal(p.diagnostics().grabbed,false);
});

test('reduced motion settles faster after an equal bounce',()=>{
  const normal=new SoftBodyPhysics(),reduced=new SoftBodyPhysics();reduced.reducedMotion=true;
  normal.bounce();reduced.bounce();advance(normal,1);advance(reduced,1);
  assert.ok(reduced.diagnostics().speed<normal.diagnostics().speed);
  advance(reduced,3);
  assert.ok(reduced.diagnostics().displacement<0.01);
});

test('an instant tap moves the jelly even without a held simulation step',()=>{
  const p=new SoftBodyPhysics(),point={x:0,y:1.85,z:0.25};
  p.beginGrab(point);p.impulse(point,{x:0,y:-1,z:0},2.8);p.release();
  advance(p,0.12);
  assert.ok(p.diagnostics().displacement>0.015,JSON.stringify(p.diagnostics()));
  assert.ok(p.diagnostics().minVolumeRatio>0.95);
  advance(p,8);
  assert.ok(p.diagnostics().displacement<0.005);
});

test('surface ripples stay above the floor and fully expire',()=>{
  const ripples=new SurfaceRipples();
  const original=new Float32Array([0,1.8,0, 0.4,1.6,0.3, 0.1,FLOOR+0.01,0.1]);
  const normals=new Float32Array([0,1,0, 0.5,0.8,0.3, 0,-1,0]);
  ripples.add({x:0,y:1.8,z:0});ripples.advance(0.08);
  const output=new Float32Array(original);
  ripples.apply(original,normals,output);
  assert.ok(output.some((v,i)=>Math.abs(v-original[i])>0.001));
  assert.ok(output[7]>=FLOOR);
  ripples.advance(2);output.set(original);ripples.apply(original,normals,output);
  assert.deepEqual(output,original);
});

test('rapid tap impulses cannot accumulate into an unstable jelly',()=>{
  const p=new SoftBodyPhysics();
  for(let i=0;i<120;i++){
    const angle=i*0.63;
    p.impulse({x:Math.sin(angle)*0.8,y:1.5,z:Math.cos(angle)*0.8},{x:-Math.sin(angle)*0.7,y:-0.7,z:-Math.cos(angle)*0.7},2.8);
    p.step();p.step();
    const state=p.diagnostics();
    assert.ok(state.displacement<1.2,JSON.stringify(state));
    assert.ok(state.minVolumeRatio>0.8,JSON.stringify(state));
  }
  advance(p,10);
  assert.ok(p.diagnostics().displacement<0.01,JSON.stringify(p.diagnostics()));
});

