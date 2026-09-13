import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { SoftBodyPhysics, STEP, FLOOR } from '../src/soft-body/physics';
import { createSoftGeometry } from '../src/soft-body/geometry';
import { puttyProfile } from '../src/soft-body/profiles';

const geometry=createSoftGeometry('putty'),position=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
const original=new Float32Array(position.array),indices=geometry.index!.array;
function volume(p:Float32Array) {
  let sum=0;
  for(let i=0;i<indices.length;i+=3) {
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    sum+=p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]);
  }
  return Math.abs(sum/6);
}
const initialVolume=volume(original);
function setup(target=new Vector3(0,0.85,0.97)) {
  const body=new SoftBodyPhysics(puttyProfile.feel);
  const bindings=Array.from({length:position.count},(_,i)=>body.bind(position.getX(i),position.getY(i),position.getZ(i)));
  const skin=new Float32Array(original.length);let best=Infinity,vertex=0;
  for(let i=0;i<position.count;i++) {
    const distance=new Vector3().fromBufferAttribute(position,i).distanceToSquared(target);
    if(distance<best) {best=distance;vertex=i;}
  }
  const anchor=new Vector3().fromBufferAttribute(position,vertex),normal=new Vector3().fromBufferAttribute(normals,vertex);
  const read=()=>{
    body.deform(original,skin,bindings);const point=new Vector3().fromArray(skin,vertex*3),delta=point.clone().sub(anchor);
    return {point,depth:-delta.dot(normal),travel:delta.length(),volume:volume(skin)/initialVolume};
  };
  return {body,anchor,normal,read,skin};
}
function advance(body:SoftBodyPhysics,seconds:number) {for(let i=0;i<Math.round(seconds/STEP);i++)body.step();}
function healthy(body:SoftBodyPhysics) {
  const state=body.diagnostics();
  assert.ok(state.minVolumeRatio>0.65,`Cell volume ${state.minVolumeRatio}`);
  assert.ok(Math.abs(state.volumeRatio-1)<0.1,`Cage volume ${state.volumeRatio}`);
  assert.ok(state.plastic!.offset<=0.700000001);assert.ok(state.plastic!.compression<=0.260000001);
  for(let j=0;j<body.positions.length;j++) {
    assert.ok(Number.isFinite(body.positions[j]) && Number.isFinite(body.velocities[j]));
    if(j%3===1)assert.ok(body.positions[j]>=FLOOR-1e-9);
  }
}

test('brief touches remain elastic even when repeated; old unloaded contact time cannot prime a quick pull',()=>{
  const {body,anchor,normal,read}=setup();
  for(let i=0;i<20;i++) {body.beginGrab(anchor,normal);advance(body,0.18);body.releaseAll();advance(body,0.4);}
  assert.equal(body.diagnostics().plastic!.offset,0);assert.equal(body.diagnostics().plastic!.compression,0);
  advance(body,10);assert.ok(read().travel<0.0001);
  body.beginGrab(anchor,normal);body.setPressure(0);advance(body,4);
  body.moveGrab({x:0.9,y:0.4,z:0});advance(body,0.2);body.releaseAll();advance(body,2);
  assert.equal(body.diagnostics().plastic!.offset,0);
});

test('a sustained front press leaves a visible dent, returns elastically partway, and stops moving at its new shape',()=>{
  const {body,anchor,normal,read,skin}=setup();body.beginGrab(anchor,normal);advance(body,4);
  const held=read();assert.ok(held.depth>0.32);
  const before=new Float32Array(skin);body.releaseAll();read();assert.deepEqual(skin,before,'Release is continuous');
  advance(body,10);const retained=read();assert.ok(retained.depth>0.09 && retained.depth<held.depth*0.7);
  assert.ok(Math.abs(retained.volume-1)<0.025);assert.equal(body.isAtRest(),true);healthy(body);
  advance(body,20);assert.ok(read().point.distanceTo(retained.point)<0.00001,'Idle shape must not creep away');
});

test('a long top squeeze keeps a flatter, wider body while conserving actual surface volume',()=>{
  const {body,anchor,normal,read}=setup(new Vector3(0,1.45,0));body.beginGrab(anchor,normal);advance(body,4);
  const held=read();body.releaseAll();advance(body,10);const retained=read();
  assert.ok(retained.depth>0.25 && retained.depth<held.depth*0.8);
  assert.ok(Math.abs(retained.volume-1)<0.01);assert.equal(body.isAtRest(),true);healthy(body);
});

test('pulling leaves a rounded fold that can be kneaded into a different direction',()=>{
  const {body,anchor,normal,read}=setup(new Vector3(0.8,1.1,0.6));
  body.beginGrab(anchor,normal);body.setPressure(0);body.moveGrab({x:0.85,y:0.35,z:0});advance(body,4);
  body.releaseAll();advance(body,8);const fold=read();
  assert.ok(fold.travel>0.18 && fold.point.x>anchor.x+0.1);assert.ok(Math.abs(fold.volume-1)<0.025);
  body.beginGrab(fold.point,normal);body.setPressure(0);body.moveGrab({x:-0.8,y:-0.2,z:0.3});advance(body,4);
  body.releaseAll();advance(body,8);const kneaded=read();
  assert.ok(kneaded.point.distanceTo(fold.point)>0.1);assert.ok(kneaded.point.x<fold.point.x-0.05);
  assert.ok(Math.abs(kneaded.volume-1)<0.035);healthy(body);
});

test('heavy five-finger kneading stays bounded through replacement, partial release, and recovery',()=>{
  const {body,read}=setup();
  const anchors=[{x:-0.7,y:1,z:0.7},{x:0.7,y:1,z:0.7},{x:0,y:1.4,z:0},{x:-0.8,y:0.7,z:-0.4},{x:0.8,y:0.7,z:-0.4}];
  for(let cycle=0;cycle<16;cycle++) {
    for(let id=0;id<5;id++) {body.beginGrab(anchors[id],{x:0,y:0,z:1},id);body.setPressure(id===2?1:0,id);}
    for(let step=0;step<150;step++) {
      for(let id=0;id<5;id++)body.moveGrab({x:Math.sin(cycle+id*1.3)*4,y:Math.cos(cycle*.7+id)*3,z:Math.sin(id-cycle*.3)*4},id);
      body.step();
      if(step%30===0) {assert.equal(body.diagnostics().contactCount,5,'No emergency reset');healthy(body);}
    }
    body.release(0);assert.equal(body.diagnostics().contactCount,4);advance(body,0.1);
    body.releaseAll();advance(body,0.2);
  }
  advance(body,12);assert.ok(Math.abs(read().volume-1)<0.08);assert.equal(body.isAtRest(),true);healthy(body);
});

test('reset restores the original geometry and removes every learned dent and dwell',()=>{
  const {body,anchor,normal,read,skin}=setup();body.beginGrab(anchor,normal);advance(body,4);
  assert.ok(body.diagnostics().plastic!.offset>0.1);body.reset();read();
  assert.deepEqual(skin,original);assert.deepEqual(body.diagnostics().plastic,{offset:0,compression:0,yielding:false});
  assert.equal(body.diagnostics().contactCount,0);assert.equal(body.isAtRest(),true);
  body.beginGrab(anchor,normal);advance(body,0.2);body.releaseAll();advance(body,2);
  assert.equal(body.diagnostics().plastic!.offset,0);
});

test('reduced motion retains the same material memory and fixed ticks keep it independent of render frequency',()=>{
  const shapes=[];
  for(const fps of [30,60,120]) {
    const {body,anchor,normal,read,skin}=setup();body.reducedMotion=true;body.beginGrab(anchor,normal);
    let accumulator=0;
    for(let frame=0;frame<fps*4;frame++) {
      accumulator+=1/fps;while(accumulator>=STEP){body.step();accumulator-=STEP;}
    }
    body.releaseAll();advance(body,10);assert.ok(read().depth>0.09);assert.equal(body.isAtRest(),true);healthy(body);
    shapes.push(new Float32Array(skin));
  }
  assert.deepEqual(shapes[0],shapes[1]);assert.deepEqual(shapes[0],shapes[2]);
});
