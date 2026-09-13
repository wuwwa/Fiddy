import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { SoftBodyPhysics, STEP } from '../src/soft-body/physics';
import { createSoftGeometry } from '../src/soft-body/geometry';
import { jellyProfile, cushionProfile, loopProfile } from '../src/soft-body/profiles';
import { dragPressure } from '../src/soft-body/input';
import { PairTurnPressure } from '../src/soft-body/pair-turn';

// Measure actual skinned contact points using a mobile camera, not a global
// twist diagnostic. Compare the old automatic press to pair-aware pressure.
const width=390,height=844,viewHeight=2*Math.tan(35*Math.PI/360);
const distance=Math.max(3.4/viewHeight*height/(height-245),3.85/(viewHeight*width/height))+0.5;
const camera=new PerspectiveCamera(35,width/height,0.1,40);
camera.position.set(0,distance*.42,distance*.91);camera.lookAt(0,.8,0);camera.updateMatrixWorld();
const right=new Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new Vector3(0,1,0).applyQuaternion(camera.quaternion);
const results=[];
for(const profile of [jellyProfile,cushionProfile,loopProfile]) {
  const geometry=createSoftGeometry(profile.shape),positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
  const indices=[-.65,.65].map(x=>{
    let best=Infinity,chosen=0;
    for(let i=0;i<positions.count;i++) {
      const error=(positions.getX(i)-x)**2+(positions.getY(i)-1.15)**2+(positions.getZ(i)-.8)**2;
      if(error<best) {best=error;chosen=i;}
    }
    return chosen;
  });
  const anchors=indices.map(i=>new Vector3().fromBufferAttribute(positions,i));
  const normal=indices.map(i=>new Vector3().fromBufferAttribute(normals,i));
  const center=anchors[0].clone().add(anchors[1]).multiplyScalar(.5);
  const projected=anchors.map(p=>({x:p.clone().sub(center).dot(right),y:p.clone().sub(center).dot(up)}));
  const initialSpan=anchors[1].clone().sub(anchors[0]);
  const initialAngle=Math.atan2(initialSpan.dot(up),initialSpan.dot(right));
  for(const gesture of ['pinch','translation','rotate15','rotate60']) for(const mode of ['auto','pair']) {
    const body=new SoftBodyPhysics(profile.feel),turns=new PairTurnPressure();
    const rest=new Float32Array(anchors.flatMap(p=>p.toArray())),skin=new Float32Array(6);
    const bindings=anchors.map(p=>body.bind(p.x,p.y,p.z));
    const screen=(point:Vector3)=>{const p=point.clone().project(camera);return {x:(p.x+1)*width*.5,y:(1-p.y)*height*.5};};
    for(let i=0;i<2;i++) {
      body.beginGrab(anchors[i],normal[i],i);
      const p=screen(anchors[i]);turns.begin(i,p.x,p.y);
    }
    let targets:Vector3[]=[],pressures:number[]=[];
    let minimumVolume=1,largestVolumeError=0;
    for(let frame=0;frame<144;frame++) {
      const progress=Math.min(1,(frame+1)/36);targets=[];
      const offsets:Vector3[]=[];
      for(let i=0;i<2;i++) {
        const p=projected[i];let dx=0,dy=0;
        if(gesture==='pinch')dx=(i===0?1:-1)*.3*progress;
        else if(gesture==='translation') {dx=.2*progress;dy=.15*progress;}
        else {
          const theta=Number(gesture.slice(6))*Math.PI/180*progress;
          dx=p.x*Math.cos(theta)-p.y*Math.sin(theta)-p.x;
          dy=p.x*Math.sin(theta)+p.y*Math.cos(theta)-p.y;
        }
        const offset=right.clone().multiplyScalar(dx).addScaledVector(up,dy);
        offsets.push(offset);targets.push(anchors[i].clone().add(offset));
        const q=screen(targets[i]);turns.move(i,q.x,q.y);
      }
      turns.step(STEP);
      pressures=offsets.map((offset,i)=>{
        const base=dragPressure(offset,normal[i]);
        const pressure=mode==='auto'?base:turns.pressure(i,base);
        body.setPressure(pressure,i);body.moveGrab(offset,i);return pressure;
      });
      body.step();
      const health=body.diagnostics();minimumVolume=Math.min(minimumVolume,health.minVolumeRatio);
      largestVolumeError=Math.max(largestVolumeError,Math.abs(health.volumeRatio-1));
    }
    const read=()=>{
      body.deform(rest,skin,bindings);
      const pair=[new Vector3().fromArray(skin,0),new Vector3().fromArray(skin,3)];
      const span=pair[1].clone().sub(pair[0]);
      return {pair,angle:(Math.atan2(span.dot(up),span.dot(right))-initialAngle)*180/Math.PI};
    };
    const held=read();
    const entry={profile:profile.shape,mode,gesture,pressures,actualAngle:held.angle,
      trackingError:held.pair.map((p,i)=>p.distanceTo(targets[i])),minimumVolume,largestVolumeError,
      partialRelease:{maxSkinStep:0,remainingContacts:0,restoredPressure:0},release:[] as {seconds:number;angle:number}[]};
    const previous=new Float32Array(skin);
    body.release(0);turns.end(0);
    body.deform(rest,skin,bindings);assert.deepEqual(skin,previous,'Partial release must not teleport the skin');
    for(let frame=0;frame<180;frame++) {
      turns.step(STEP);
      const offset=targets[1].clone().sub(anchors[1]),base=dragPressure(offset,normal[1]);
      body.setPressure(mode==='pair'?turns.pressure(1,base):base,1);body.step();read();
      let distance=0;for(let j=0;j<6;j++)distance=Math.max(distance,Math.abs(skin[j]-previous[j]));
      entry.partialRelease.maxSkinStep=Math.max(entry.partialRelease.maxSkinStep,distance);previous.set(skin);
    }
    entry.partialRelease.remainingContacts=body.diagnostics().contactCount;
    entry.partialRelease.restoredPressure=turns.pressure(1,1);
    assert.equal(entry.partialRelease.remainingContacts,1);
    assert.ok(entry.partialRelease.maxSkinStep<0.08,'Surviving pressure must restore without a sharp jump');
    assert.ok(entry.partialRelease.restoredPressure>0.99);
    assert.ok(minimumVolume>0.75 && largestVolumeError<0.1,'Local and total volume must remain plausible');
    body.releaseAll();
    for(let frame=1;frame<=120;frame++) {body.step();if([18,60,120].includes(frame))entry.release.push({seconds:frame*STEP,angle:read().angle});}
    results.push(entry);
  }
  geometry.dispose();
}
for(const profile of [jellyProfile,cushionProfile,loopProfile]) {
  for(const gesture of ['rotate15','pinch','translation']) {
    const before=results.find(r=>r.profile===profile.shape && r.mode==='auto' && r.gesture===gesture)!;
    const after=results.find(r=>r.profile===profile.shape && r.mode==='pair' && r.gesture===gesture)!;
    if(gesture==='rotate15') {
      assert.ok(after.actualAngle>before.actualAngle+1.5,`${profile.shape} must turn more visibly`);
      assert.ok(after.trackingError.every((error,i)=>error<before.trackingError[i]*0.55),`${profile.shape} must reduce unintended indentation`);
    } else {
      assert.equal(after.actualAngle,before.actualAngle,`${gesture} must be unchanged`);
      assert.deepEqual(after.trackingError,before.trackingError);
    }
    console.log(JSON.stringify({profile:profile.shape,gesture,before:before.actualAngle,after:after.actualAngle,
      beforeError:before.trackingError,afterError:after.trackingError,minVolume:after.minimumVolume,maxSkinStep:after.partialRelease.maxSkinStep}));
  }
}
mkdirSync(new URL('./artifacts/',import.meta.url),{recursive:true});
writeFileSync(new URL('./artifacts/pair-turn-study.json',import.meta.url),JSON.stringify({results},null,2));
