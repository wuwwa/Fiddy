import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { SoftBodyPhysics, STEP, FLOOR } from '../src/soft-body/physics';
import { createSoftGeometry } from '../src/soft-body/geometry';
import { doughProfile, puttyProfile } from '../src/soft-body/profiles';
import { DoughMouseFold, kneadingPressure } from '../src/soft-body/kneading';
import { DoughSurface } from '../src/soft-body/dough-surface';

const advance=(body:SoftBodyPhysics,seconds:number)=>{for(let i=0;i<Math.round(seconds/STEP);i++)body.step();};
const anchor={x:0.55,y:1.08,z:0.7},normal={x:0,y:0,z:1};

test('mouse tremor remains a palm press; a purposeful drag catches a flap without a modifier',()=>{
  const fold=new DoughMouseFold(100,100);
  fold.update({x:0.025,y:0,z:0},105,102);
  assert.equal(fold.engagement,0);assert.equal(fold.pressure,1);assert.equal(fold.offset.y,0);
  fold.update({x:0.4,y:0,z:0},165,100);
  assert.equal(fold.engagement,1);assert.ok(fold.pressure<0.12);assert.ok(fold.offset.y>0.3);
  fold.update({x:0,y:0,z:0},100,100);
  assert.equal(fold.pressure,1);assert.deepEqual(fold.offset,{x:0,y:0,z:0});
});

test('a short mouse stroke visibly lifts and carries the touched skin',()=>{
  const read=(body:SoftBodyPhysics)=>{
    const skin=new Float32Array(3);
    body.deform(new Float32Array([anchor.x,anchor.y,anchor.z]),skin,[body.bind(anchor.x,anchor.y,anchor.z)]);
    return new Vector3().fromArray(skin);
  };
  const body=new SoftBodyPhysics(doughProfile.feel),old=new SoftBodyPhysics(doughProfile.feel);
  const fold=new DoughMouseFold(100,100);
  for(const material of [body,old])material.beginGrab(anchor,normal);
  const start=read(body);
  for(let step=1;step<=72;step++) {
    const raw={x:0.55*step/72,y:0.08*step/72,z:0};
    const offset=fold.update(raw,100+90*step/72,100-12*step/72);
    body.setFold(fold.engagement);body.setPressure(fold.pressure);body.moveGrab(offset);body.step();
    old.setPressure(kneadingPressure(raw,normal));old.moveGrab(raw);old.step();
  }
  const lifted=read(body),previous=read(old);
  assert.ok(lifted.distanceTo(start)>0.35,`Visible travel ${lifted.distanceTo(start)}`);
  assert.ok(lifted.y-start.y>0.14,`Flap height ${lifted.y-start.y}`);
  assert.ok(lifted.distanceTo(start)>previous.distanceTo(start)*1.6,'Ordinary mouse movement should be substantially easier');
  const liftedPosition=new Float64Array(body.positions);
  for(let step=1;step<=120;step++) {
    const t=1-step/120,raw={x:0.55*t,y:0.08*t,z:0};
    body.moveGrab(fold.update(raw,100+90*t,100-12*t));body.setPressure(fold.pressure);body.step();
    assert.ok(body.diagnostics().minVolumeRatio>0.65);
  }
  assert.ok(read(body).y<lifted.y-0.12,'Returning the mouse lays the flap back down');
  assert.notDeepEqual(body.positions,liftedPosition);
  body.releaseAll();advance(body,15);
  assert.ok(body.diagnostics().plastic!.offset>0.025,'The fold retains material memory');
  assert.equal(body.isAtRest(),true);
});

test('mouse folds at the shoulder survive repeated outward and inward strokes',()=>{
  const body=new SoftBodyPhysics(doughProfile.feel);
  const shoulder={x:1,y:0.75,z:0.4},face={x:0.8,y:0.5,z:0.3};
  for(let cycle=0;cycle<6;cycle++) {
    const skin=new Float32Array(3);
    body.deform(new Float32Array(Object.values(shoulder)),skin,[body.bind(shoulder.x,shoulder.y,shoulder.z)]);
    body.beginGrab({x:skin[0],y:skin[1],z:skin[2]},face);
    const fold=new DoughMouseFold(200,200);
    for(let step=1;step<=240;step++) {
      const travel=Math.sin(step/240*Math.PI)*(cycle%2?-1:1);
      body.moveGrab(fold.update({x:travel*0.75,y:Math.abs(travel)*0.12,z:0},200+travel*110,200));
      body.setFold(fold.engagement);body.setPressure(fold.pressure);body.step();
      if(step%30===0) {
        const state=body.diagnostics();
        assert.equal(state.contactCount,1,'A fold must not trigger an emergency reset');
        assert.ok(state.minVolumeRatio>0.5,`Collapsed shoulder: ${state.minVolumeRatio}`);
        assert.ok(Math.abs(state.volumeRatio-1)<0.1);
      }
    }
    body.releaseAll();advance(body,0.25);
  }
  advance(body,15);assert.equal(body.isAtRest(),true);
});

test('a deliberate stroke works through resistance; a quick yank cannot fling dough',()=>{
  const dough=new SoftBodyPhysics(doughProfile.feel),putty=new SoftBodyPhysics(puttyProfile.feel);
  for(const body of [dough,putty]) {
    body.beginGrab(anchor,normal);body.setPressure(0.2);body.moveGrab({x:0.9,y:0.2,z:0});advance(body,0.12);
  }
  const short=dough.diagnostics().displacement;
  assert.ok(short<putty.diagnostics().displacement*0.65,'Dough must resist a quick drag more than putty');
  advance(dough,2);
  assert.ok(dough.diagnostics().displacement>short*2,'Sustained effort must visibly yield');
  dough.moveGrab({x:-2,y:0,z:0});
  const velocities=new Float64Array(dough.velocities);
  dough.release();assert.deepEqual(dough.velocities,velocities,'No new flick on release');
  assert.equal(dough.diagnostics().flickCount,0);
});

test('a slow top press sinks progressively, leaves memory, and settles',()=>{
  const body=new SoftBodyPhysics(doughProfile.feel);
  body.beginGrab({x:0,y:1.3,z:0},{x:0,y:1,z:0});advance(body,0.15);
  const brief=body.compressionAmount;advance(body,3.85);
  assert.ok(brief<0.08 && body.compressionAmount>0.23);
  body.releaseAll();advance(body,18);
  assert.ok(body.compressionAmount>0.1);assert.equal(body.isAtRest(),true);
});

test('sideways kneading keeps pressure while an outward pull peels free',()=>{
  assert.ok(kneadingPressure({x:0.9,y:0,z:0},normal)>0.9);
  assert.ok(kneadingPressure({x:0,y:0,z:0.9},normal)<0.28);
  assert.ok(kneadingPressure({x:0,y:0,z:-4},normal)<=1.18);
});

test('repeated strokes blend gradually and locally; idle time preserves the mixture',()=>{
  const body=new SoftBodyPhysics(doughProfile.feel),memory=body.kneading!;
  const near=body.bind(anchor.x,anchor.y,anchor.z),far=body.bind(-1,0.7,-1);
  advance(body,3);assert.equal(memory.blend(near),0);
  body.beginGrab(anchor,normal);body.setPressure(0.6);
  for(let stroke=0;stroke<8;stroke++) {
    body.moveGrab({x:stroke%2?-0.75:0.75,y:0.12,z:-0.1});advance(body,1.6);
    const state=body.diagnostics();
    assert.equal(state.contactCount,1);assert.ok(state.minVolumeRatio>0.65);
    assert.ok(Math.abs(state.volumeRatio-1)<0.1);
  }
  const mixed=memory.blend(near);
  assert.ok(mixed>0.1 && mixed<0.85,`Repeated effort should gradually blend: ${mixed}`);
  assert.ok(mixed>memory.blend(far)*3,'The worked patch must blend faster than the far side');
  body.releaseAll();const worked=new Float64Array(memory.worked);advance(body,20);
  assert.deepEqual(memory.worked,worked,'Free recovery and resting must not mix flour');
  assert.equal(body.isAtRest(),true);
});

test('dough skin remains closed, keeps volume when kneaded, and reset restores flour and folds',()=>{
  const geometry=createSoftGeometry('dough');
  try {
    const p=geometry.getAttribute('position'),original=new Float32Array(p.array),ids=geometry.index!.array;
    const volume=(positions:Float32Array)=>{
      let sum=0;
      for(let i=0;i<ids.length;i+=3) {
        const a=new Vector3().fromArray(positions,ids[i]*3),b=new Vector3().fromArray(positions,ids[i+1]*3),c=new Vector3().fromArray(positions,ids[i+2]*3);
        sum+=a.dot(b.cross(c))/6;
      }
      return sum;
    };
    const edges=new Map<string,number>();
    for(let i=0;i<ids.length;i+=3)for(const [a,b] of [[ids[i],ids[i+1]],[ids[i+1],ids[i+2]],[ids[i+2],ids[i]]]) {
      const key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)??0)+1);
    }
    assert.ok([...edges.values()].every(count=>count===2));assert.equal(p.count-edges.size+ids.length/3,2);
    const body=new SoftBodyPhysics(doughProfile.feel),skin=new Float32Array(original.length);
    const bindings=Array.from({length:p.count},(_,i)=>body.bind(p.getX(i),p.getY(i),p.getZ(i)));
    const surface=new DoughSurface(geometry,bindings,body.kneading!);
    const colors=new Float32Array(geometry.getAttribute('color').array);
    body.beginGrab(anchor,normal);body.setPressure(0.6);body.moveGrab({x:0.8,y:0.2,z:0});advance(body,4);
    body.deform(original,skin,bindings);surface.update();
    assert.ok(Math.abs(volume(skin)/volume(original)-1)<0.1);
    for(let i=1;i<skin.length;i+=3)assert.ok(skin[i]>=FLOOR+0.0049);
    assert.notDeepEqual(geometry.getAttribute('color').array,colors);
    body.reset();body.deform(original,skin,bindings);surface.update();
    assert.deepEqual(skin,original);assert.deepEqual(geometry.getAttribute('color').array,colors);
    assert.equal(body.kneading!.diagnostics().mostWorked,0);
  } finally {geometry.dispose();}
});
