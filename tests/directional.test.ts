import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftBodyPhysics, STEP, FLOOR, type Point } from '../src/soft-body/physics.ts';
import { jellyProfile, cushionProfile } from '../src/soft-body/profiles.ts';
import { deformPoint, undoDeformation } from '../src/soft-body/pressure.ts';

function advance(body:SoftBodyPhysics,seconds:number) {for(let t=0;t<seconds;t+=STEP)body.step();}
function sample(body:SoftBodyPhysics,point:Point):Point {
  const rest=new Float32Array([point.x,point.y,point.z]),out=new Float32Array(3);
  body.deform(rest,out,[body.bind(point.x,point.y,point.z)]);
  return {x:out[0],y:out[1],z:out[2]};
}

test('a stationary front hold produces a deep inward dent without global downward squash',()=>{
  for(const profile of [jellyProfile,cushionProfile]) {
    const body=new SoftBodyPhysics(profile.feel),front={x:0,y:0.95,z:1};
    body.beginGrab(front,{x:0,y:0,z:1});advance(body,1.4);
    const pressed=sample(body,front),top=sample(body,{x:0,y:1.65,z:0});
    assert.ok(front.z-pressed.z>0.20,`${profile.label}: ${JSON.stringify(pressed)}`);
    assert.ok(Math.abs(pressed.y-front.y)<0.12,JSON.stringify(pressed));
    assert.ok(top.y>1.53,JSON.stringify(top));
    assert.equal(body.compressionAmount,0);
    assert.ok(Math.abs(body.diagnostics().twist)<0.001);
    assert.ok(body.diagnostics().minVolumeRatio>0.9);
    body.release();advance(body,9);
    const restored=sample(body,front);
    assert.ok(Math.hypot(restored.x-front.x,restored.y-front.y,restored.z-front.z)<0.02);
  }
});

test('side and back presses follow their respective inward normals',()=>{
  for(const [point,normal,axis] of [
    [{x:1,y:1,z:0},{x:1,y:0,z:0},'x'],
    [{x:-1,y:1,z:0},{x:-1,y:0,z:0},'x'],
    [{x:0,y:1,z:-1},{x:0,y:0,z:-1},'z'],
  ] as const) {
    const body=new SoftBodyPhysics();body.beginGrab(point,normal);advance(body,1);
    const pressed=sample(body,point);
    assert.ok((point[axis]-pressed[axis])*normal[axis]>0.2,JSON.stringify(pressed));
    assert.equal(body.compressionAmount,0);
    assert.ok(body.diagnostics().minVolumeRatio>0.9);
  }
});

test('an off-center front press creates torque and then untwists on release',()=>{
  for(const direction of [-1,1]) {
    const body=new SoftBodyPhysics();
    body.beginGrab({x:direction*0.75,y:1.3,z:0.85},{x:0,y:0,z:1});advance(body,1.2);
    assert.ok(body.twistAmount*direction>0.15,JSON.stringify(body.diagnostics()));
    body.release();advance(body,7);
    assert.ok(Math.abs(body.twistAmount)<0.002);
    assert.ok(Math.abs(body.diagnostics().twistSpeed)<0.01);
  }
});

test('sideways drags and explicit keyboard torsion turn the body in either direction',()=>{
  for(const direction of [-1,1]) {
    const body=new SoftBodyPhysics();
    body.beginGrab({x:0,y:1.3,z:1},{x:0,y:0,z:1});
    body.moveGrab({x:direction*0.7,y:0,z:0});advance(body,0.8);
    assert.ok(body.twistAmount*direction>0.2);
    body.reset();body.beginGrab({x:0,y:1.8,z:0},{x:0,y:1,z:0});
    body.setTwist(direction*0.7);advance(body,1);
    assert.ok(body.twistAmount*direction>0.3);
    body.reset();assert.equal(body.twistAmount,0);assert.equal(body.diagnostics().twistSpeed,0);
  }
});

test('combined pressure and torsion preserve volume, fix the base, and invert for re-grabs',()=>{
  for(const compression of [0,0.4,0.55]) for(const twist of [-0.68,0.68]) {
    for(const y of [FLOOR,0.8,1.6,2.3]) {
      const point={x:0.8,y,z:0.5},mapped=deformPoint(point,compression,twist),original=undoDeformation(mapped,compression,twist);
      assert.ok(Math.hypot(original.x-point.x,original.y-point.y,original.z-point.z)<1e-8);
      const e=1e-5,columns=(['x','y','z'] as const).map(axis=>{
        const next=deformPoint({...point,[axis]:point[axis]+e},compression,twist);
        return [(next.x-mapped.x)/e,(next.y-mapped.y)/e,(next.z-mapped.z)/e];
      });
      const [a,b,c]=columns;
      const volume=a[0]*(b[1]*c[2]-b[2]*c[1])-b[0]*(a[1]*c[2]-a[2]*c[1])+c[0]*(a[1]*b[2]-a[2]*b[1]);
      assert.ok(Math.abs(volume-1)<0.0001);
    }
    assert.deepEqual(deformPoint({x:0.8,y:FLOOR,z:0.5},compression,twist),deformPoint({x:0.8,y:FLOOR,z:0.5},compression,0));
  }
});

test('repeated directional re-grabs and extreme twist stay bounded on both toys',()=>{
  for(const profile of [jellyProfile,cushionProfile]) {
    const body=new SoftBodyPhysics(profile.feel);
    for(let i=0;i<60;i++) {
      const angle=i*0.73,point={x:Math.sin(angle),y:1.1,z:Math.cos(angle)};
      const warped=deformPoint(point,body.compressionAmount,body.twistAmount);
      body.beginGrab(warped,{x:Math.sin(angle),y:i%4===0?1:0,z:Math.cos(angle)});
      body.moveGrab({x:Math.sin(i)*100,y:Math.cos(i)*100,z:Math.cos(angle)*100});
      body.setTwist(i%2?100:-100);body.setPressure(1.3);advance(body,0.16);body.release();advance(body,0.06);
      const state=body.diagnostics();
      assert.ok(Math.abs(state.twist)<=0.8 && state.displacement<1.6,JSON.stringify(state));
      assert.ok(state.minVolumeRatio>0.75,JSON.stringify(state));
      for(let j=1;j<body.positions.length;j+=3) assert.ok(body.positions[j]>=FLOOR);
    }
    body.reset();assert.deepEqual(body.positions,body.rest);
    assert.equal(body.diagnostics().dentDepth,0);assert.equal(body.diagnostics().twistSpeed,0);
  }
});
