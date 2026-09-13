// Paired CPU comparison of the full skin update at unchanged mesh resolution.
// Run: node --import tsx qa/surface-bench.ts
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import type {BufferAttribute} from 'three/webgpu';
import {createSoftGeometry} from '../src/soft-body/geometry.ts';
import {SoftBodyPhysics} from '../src/soft-body/physics.ts';
import {cushionProfile} from '../src/soft-body/profiles.ts';
import {SurfaceRipples} from '../src/soft-body/ripples.ts';
import {updateSoftSurface} from '../src/soft-body/surface.ts';

const body=new SoftBodyPhysics(cushionProfile.feel),geometry=createSoftGeometry('cushion'),reference=geometry.clone();
const position=geometry.getAttribute('position') as BufferAttribute,rest=new Float32Array(position.array);
const bindings=Array.from({length:position.count},(_,i)=>body.bind(rest[i*3],rest[i*3+1],rest[i*3+2]));
body.beginGrab({x:0.55,y:1.25,z:0.85},{x:0,y:0,z:1});
body.moveGrab({x:0.55,y:0.12,z:0});body.setTwist(0.7);
for(let i=0;i<180;i++)body.step();
const waves=new SurfaceRipples();
const normal=()=>updateSoftSurface(geometry,body,rest,bindings,waves);
const original=()=>{
  const p=reference.getAttribute('position') as BufferAttribute;
  body.deform(rest,p.array as Float32Array,bindings);
  if(waves.active){reference.computeVertexNormals();waves.apply(rest,reference.getAttribute('normal').array as Float32Array,p.array as Float32Array);}
  p.needsUpdate=true;reference.computeVertexNormals();reference.computeBoundingBox();reference.computeBoundingSphere();
};
const results=[];
try {
  for(const count of [0,4]) {
    waves.clear();
    for(let i=0;i<count;i++)waves.add({x:-0.6+i*0.4,y:0.9+i*0.1,z:0.7},0.7);
    waves.advance(0.14);original();normal();
    assert.deepEqual(position.array,reference.getAttribute('position').array);
    assert.deepEqual(geometry.getAttribute('normal').array,reference.getAttribute('normal').array);
    assert.ok(geometry.boundingBox!.equals(reference.boundingBox!));assert.ok(geometry.boundingSphere!.equals(reference.boundingSphere!));
    for(let i=0;i<35;i++){original();normal();}
    const times=[[],[]] as number[][];
    const measure=(which:number)=>{
      const fn=which===0?original:normal,start=performance.now();
      for(let i=0;i<100;i++)fn();times[which].push((performance.now()-start)/100);
    };
    for(let batch=0;batch<5;batch++) {measure(batch%2);measure(1-batch%2);}
    times.forEach(values=>values.sort((a,b)=>a-b));
    const row={waves:count,vertices:position.count,referenceMs:times[0][2],optimizedMs:times[1][2],speedup:times[0][2]/times[1][2],samples:times};
    results.push(row);console.log(JSON.stringify(row));
  }
  mkdirSync('qa/artifacts',{recursive:true});
  writeFileSync('qa/artifacts/surface-bench-results.json',JSON.stringify({runtime:process.version,exactSurfaceEquality:true,results},null,2));
} finally {geometry.dispose();reference.dispose();}
