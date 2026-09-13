import { writeFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { SoftBodyPhysics, STEP } from '../src/soft-body/physics';
import { createSoftGeometry } from '../src/soft-body/geometry';
import { puttyProfile } from '../src/soft-body/profiles';

const geometry=createSoftGeometry('putty'),position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
const rest=new Float32Array(position.array),skin=new Float32Array(rest.length),ids=geometry.index!.array;
function volume(p:Float32Array) {
  let sum=0;
  for(let i=0;i<ids.length;i+=3) {
    const a=ids[i]*3,b=ids[i+1]*3,c=ids[i+2]*3;
    sum+=p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]);
  }
  return Math.abs(sum/6);
}
const originalVolume=volume(rest),results=[];
for(const mode of ['tap','front','top','pull','repeated']) {
  const body=new SoftBodyPhysics(puttyProfile.feel),bindings=Array.from({length:position.count},(_,i)=>body.bind(position.getX(i),position.getY(i),position.getZ(i)));
  const target=mode==='top'?new Vector3(0,1.45,0):mode==='pull'?new Vector3(0.8,1.1,0.6):new Vector3(0,0.85,0.97);
  let best=Infinity,vertex=0;
  for(let i=0;i<position.count;i++) {const p=new Vector3().fromBufferAttribute(position,i),distance=p.distanceToSquared(target);if(distance<best){best=distance;vertex=i;}}
  const anchor=new Vector3().fromBufferAttribute(position,vertex),face=new Vector3().fromBufferAttribute(normal,vertex);
  const read=()=>{
    body.deform(rest,skin,bindings);const p=new Vector3().fromArray(skin,vertex*3),delta=p.clone().sub(anchor);
    return {depth:-delta.dot(face),travel:delta.length(),point:p.toArray(),surfaceVolume:volume(skin)/originalVolume,state:body.diagnostics(),sleeping:body.isAtRest()};
  };
  const cycles=mode==='repeated'?30:mode==='tap'?20:1;
  const seconds=mode==='tap'?0.18:mode==='repeated'?2:4;
  for(let cycle=0;cycle<cycles;cycle++) {
    body.deform(rest,skin,bindings);
    const current=new Vector3().fromArray(skin,vertex*3);body.beginGrab(current,face);
    if(mode==='pull' || mode==='repeated')body.setPressure(0);
    for(let i=0;i<seconds/STEP;i++) {
      if(mode==='pull')body.moveGrab({x:0.85,y:0.35,z:0});
      if(mode==='repeated')body.moveGrab({x:Math.sin(cycle*1.7)*1.8,y:Math.sin(cycle*0.7)*1.4,z:Math.cos(cycle*1.3)*1.8});
      body.step();
    }
    if(cycle===cycles-1)results.push({mode,phase:'held',...read()});
    body.releaseAll();for(let i=0;i<(mode==='tap'?1:0.2)/STEP;i++)body.step();
  }
  for(let i=0;i<10/STEP;i++)body.step();
  results.push({mode,phase:'retained',...read()});
  for(let i=0;i<20/STEP;i++)body.step();results.push({mode,phase:'idle',...read()});
  body.reset();results.push({mode,phase:'reset',...read()});
}
geometry.dispose();writeFileSync(new URL('./artifacts/putty-study.json',import.meta.url),JSON.stringify({results},null,2));
for(const r of results)console.log(JSON.stringify({mode:r.mode,phase:r.phase,depth:r.depth,travel:r.travel,
  surfaceVolume:r.surfaceVolume,plastic:r.state.plastic,minVolume:r.state.minVolumeRatio,sleeping:r.sleeping}));
