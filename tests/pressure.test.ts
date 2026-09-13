import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftBodyPhysics, FLOOR, STEP } from '../src/soft-body/physics.ts';
import { jellyProfile, cushionProfile } from '../src/soft-body/profiles.ts';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { entranceAt, ENTRANCE_DURATION } from '../src/soft-body/entrance.ts';

function advance(body: SoftBodyPhysics, seconds: number) {
  for(let i=0;i<seconds/STEP;i++) body.step();
}

test('holding the top without dragging lowers the actual surface and spreads its sides', () => {
  const body=new SoftBodyPhysics();
  const geometry=createSoftGeometry('pebble');
  const original=new Float32Array(geometry.getAttribute('position').array);
  const output=new Float32Array(original.length);
  const bindings=Array.from({length:original.length/3},(_,i)=>body.bind(original[i*3],original[i*3+1],original[i*3+2]));
  geometry.computeBoundingBox();
  const rest=geometry.boundingBox!.clone();
  body.beginGrab({x:0,y:1.8,z:0},{x:0,y:1,z:0});
  advance(body,0.75);body.deform(original,output,bindings);
  geometry.getAttribute('position').array.set(output);geometry.computeBoundingBox();
  const held=geometry.boundingBox!;
  assert.ok(held.max.y-held.min.y < (rest.max.y-rest.min.y)*0.68);
  assert.ok(held.max.x-held.min.x > (rest.max.x-rest.min.x)*1.2);
  assert.ok(held.min.y>=FLOOR && held.min.y<FLOOR+0.06);
  assert.ok(Math.abs(body.diagnostics().volumeRatio-1)<0.08);
  body.release();advance(body,2.5);
  assert.ok(Math.abs(body.diagnostics().compression)<0.002);
  geometry.dispose();
});

test('the cushion presses more slowly, creeps under a hold, and keeps its shape briefly after release', () => {
  const jelly=new SoftBodyPhysics(jellyProfile.feel), cushion=new SoftBodyPhysics(cushionProfile.feel);
  for(const body of [jelly,cushion]) { body.beginGrab({x:0,y:1.5,z:0.3});advance(body,0.3); }
  assert.ok(jelly.diagnostics().compression > cushion.diagnostics().compression*1.8);
  const early=cushion.diagnostics().compression;
  for(const body of [jelly,cushion]) advance(body,1.2);
  assert.ok(cushion.diagnostics().compression > early+0.12);
  for(const body of [jelly,cushion]) { body.release();advance(body,0.6); }
  assert.ok(cushion.diagnostics().compression>0.12);
  assert.ok(Math.abs(jelly.diagnostics().compression)<0.055);
  advance(cushion,6);
  assert.ok(Math.abs(cushion.diagnostics().compression)<0.002);
});

test('jelly rebounds beyond rest while the dense cushion recovers without a fast oscillation', () => {
  for(const profile of [jellyProfile,cushionProfile]) {
    const body=new SoftBodyPhysics(profile.feel);
    body.beginGrab({x:0,y:1.6,z:0});advance(body,1.5);body.release();
    let minimum=1;
    for(let i=0;i<2/STEP;i++){body.step();minimum=Math.min(minimum,body.diagnostics().compression);}
    if(profile===jellyProfile) assert.ok(minimum < -0.07);
    else assert.ok(minimum > 0);
  }
});

test('repeated full-pressure drags stay bounded on both materials and reset clears pressure', () => {
  for(const profile of [jellyProfile,cushionProfile]) {
    const body=new SoftBodyPhysics(profile.feel);
    for(let i=0;i<70;i++) {
      body.beginGrab({x:Math.sin(i)*0.8,y:1.2,z:Math.cos(i)*0.8});
      body.moveGrab({x:Math.sin(i)*50,y:i%2?-50:50,z:Math.cos(i)*50});
      body.setPressure(100);advance(body,0.1);body.release();advance(body,0.04);
      const state=body.diagnostics();
      assert.ok(state.compression>=-0.16 && state.compression<=0.58,JSON.stringify(state));
      assert.ok(state.minVolumeRatio>0.7,JSON.stringify(state));
      assert.ok(state.displacement<1.5,JSON.stringify(state));
    }
    body.reset();
    assert.equal(body.diagnostics().compression,0);
    assert.equal(body.diagnostics().compressionSpeed,0);
    assert.deepEqual(body.positions,body.rest);
  }
});

test('both shapes have finite surface normals, useful height, and stay above the floor', () => {
  for(const shape of ['pebble','cushion'] as const) {
    const geometry=createSoftGeometry(shape);
    geometry.computeBoundingBox();
    const box=geometry.boundingBox!;
    assert.ok(box.min.y>=FLOOR);
    assert.ok(box.max.y-box.min.y>1.4);
    for(const value of geometry.getAttribute('normal').array) assert.ok(Number.isFinite(value));
    geometry.dispose();
  }
});

test('entrance starts small, grows without inversion, lands once, and respects reduced motion', () => {
  assert.ok(entranceAt(0,false).scale<0.05);
  let largest=0;
  for(let t=0;t<ENTRANCE_DURATION;t+=STEP) {
    const state=entranceAt(t,false);
    assert.ok(state.scale>0 && state.scale<1.2);
    assert.ok(state.lift>=0 && state.shadow>=0 && state.shadow<=1);
    largest=Math.max(largest,state.scale);
  }
  assert.ok(largest>1);
  assert.deepEqual(entranceAt(ENTRANCE_DURATION,false),{scale:1,lift:0,shadow:1});
  assert.deepEqual(entranceAt(0,true),{scale:1,lift:0,shadow:1});
});
