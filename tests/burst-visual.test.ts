import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute } from 'three/webgpu';
import { BurstVisual, BURST_DURATION } from '../src/soft-body/burst-visual.ts';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { FLOOR } from '../src/soft-body/physics.ts';
import { jellyProfile, loopProfile } from '../src/soft-body/profiles.ts';

for(const profile of [jellyProfile,loopProfile]) {
  test(`${profile.label}: rupture preserves the held skin at onset, stays continuous, and reforms exactly`,()=>{
    const geometry=createSoftGeometry(profile.shape),position=geometry.getAttribute('position');
    const rest=new Float32Array(position.array),burst=new BurstVisual(geometry,rest);
    for(let i=0;i<position.count;i++) {
      const y=position.getY(i);
      position.setXYZ(i,position.getX(i)+0.16*y*y,FLOOR+(y-FLOOR)*0.8,position.getZ(i));
    }
    const held=new Float32Array(position.array),attribute=position,array=position.array;
    burst.trigger({x:0.5,y:1.4,z:0.6},{x:0.7,y:0.2,z:0.5});
    burst.update(0,false);
    assert.deepEqual(position.array,held,'A rupture cannot swap out, shrink, or teleport the held skin');
    let previous=new Float32Array(position.array),puddleHeight=Infinity,puddleWidth=0;
    for(let frame=1;frame<=Math.ceil(BURST_DURATION*120);frame++) {
      const age=Math.min(BURST_DURATION,frame/120);
      burst.update(age,false);
      assert.equal(geometry.getAttribute('position'),attribute);
      assert.equal(position.array,array);
      const bounds=geometry.boundingBox!;
      const height=bounds.max.y-bounds.min.y,width=bounds.max.x-bounds.min.x;
      assert.ok(height>0.12 && width>1,'The body must remain visible through the whole rupture');
      assert.ok(bounds.min.y>=FLOOR-1e-6,'The gel must remain above the ground');
      assert.ok(width<4.4 && height<2.5,'The material must stay within a bounded footprint');
      let largestStep=0;
      for(let j=0;j<position.array.length;j++) {
        assert.ok(Number.isFinite(position.array[j]));
        largestStep=Math.max(largestStep,Math.abs(position.array[j]-previous[j]));
      }
      assert.ok(largestStep<0.18,`Surface jumped ${largestStep} at ${age}`);
      assert.ok(geometry.getAttribute('normal').array.every(Number.isFinite));
      if(age>0.4 && age<0.8) {puddleHeight=Math.min(puddleHeight,height);puddleWidth=Math.max(puddleWidth,width);}
      previous.set(position.array);
    }
    assert.ok(puddleHeight<0.35,'The released skin must settle into low gel');
    assert.ok(puddleWidth>2.8,'The collapse must spread instead of shrinking out of existence');
    assert.deepEqual(position.array,rest);
    assert.deepEqual(burst.diagnostics(),{active:false,phase:'ready',droplets:0});
    burst.dispose();geometry.dispose();
  });
}

test('release location and direction change the wave and the settled footprint',()=>{
  const geometry=createSoftGeometry('pebble'),rest=new Float32Array(geometry.getAttribute('position').array);
  const burst=new BurstVisual(geometry,rest);
  burst.trigger({x:1,y:1,z:0},{x:1,y:0,z:0});burst.update(0.12,false);
  const rightWave=geometry.getAttribute('position').array.slice();
  burst.update(0.55,false);const rightPuddle=geometry.getAttribute('position').array.slice();
  burst.update(BURST_DURATION,false);
  burst.trigger({x:-1,y:1,z:0},{x:-1,y:0,z:0});burst.update(0.12,false);
  assert.notDeepEqual(geometry.getAttribute('position').array,rightWave);
  burst.update(0.55,false);
  assert.notDeepEqual(geometry.getAttribute('position').array,rightPuddle);
  burst.dispose();geometry.dispose();
});

test('reduced motion relaxes the same visible body, and repeated cycles reuse all geometry',()=>{
  const geometry=createSoftGeometry('pebble'),position=geometry.getAttribute('position');
  const rest=new Float32Array(position.array),burst=new BurstVisual(geometry,rest);
  const normal=geometry.getAttribute('normal'),indices=geometry.index;
  for(let cycle=0;cycle<20;cycle++) {
    burst.trigger({x:0,y:1.7,z:0},{x:0,y:-1,z:0});
    for(let age=0;age<BURST_DURATION;age+=0.04) {
      burst.update(age,true);
      assert.ok(geometry.boundingBox!.max.y-geometry.boundingBox!.min.y>1.7);
      assert.equal(burst.diagnostics().droplets,0);
    }
    burst.update(BURST_DURATION,true);
    assert.deepEqual(position.array,rest);
    assert.equal(geometry.getAttribute('normal'),normal);assert.equal(geometry.index,indices);
  }
  burst.trigger({x:0,y:1,z:1},{x:0,y:0,z:1});burst.update(0.4,false);
  burst.clear();const cleared=position.array.slice();burst.update(0.7,false);
  assert.deepEqual(position.array,cleared,'A cleared animation cannot keep writing to the surface');
  burst.trigger({x:0,y:1,z:1},{x:0,y:0,z:1});burst.update(Number.NaN,false);
  assert.deepEqual(position.array,rest);
  let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
  burst.dispose();burst.dispose();
  assert.equal(disposed,0,'The animation must not dispose geometry owned by the scene');
  burst.trigger({x:0,y:1,z:1},{x:0,y:0,z:1});burst.update(0.4,false);
  assert.deepEqual(position.array,rest);geometry.dispose();
});

test('enabling reduced motion during a rupture rebases on the visible surface without a jump',()=>{
  for(const age of [0.12,0.6,1.5]) {
    const geometry=createSoftGeometry('pebble'),position=geometry.getAttribute('position');
    const rest=new Float32Array(position.array),burst=new BurstVisual(geometry,rest);
    burst.trigger({x:0,y:1.7,z:0},{x:0,y:-1,z:0});burst.update(age,false);
    const visible=position.array.slice();
    burst.update(age,true);
    assert.deepEqual(position.array,visible,'Changing the preference must not move any visible vertex');
    burst.update(age,false);
    assert.deepEqual(position.array,visible,'Disabling the preference again must not resume the collapse');
    burst.update(BURST_DURATION,false);
    assert.deepEqual(position.array,rest);
    burst.dispose();geometry.dispose();
  }
});

test('rupture and quiet recovery retain reference normals and bounds without replacing buffers',()=>{
  for(const profile of [jellyProfile,loopProfile]) for(const reduced of [false,true]) {
    const geometry=createSoftGeometry(profile.shape),position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
    assert.ok(position instanceof BufferAttribute && normal instanceof BufferAttribute);
    const rest=new Float32Array(position.array),burst=new BurstVisual(geometry,rest);
    for(let i=0;i<position.count;i++) {
      const x=position.getX(i),y=position.getY(i),z=position.getZ(i),a=y*0.3;
      position.setXYZ(i,x*Math.cos(a)+z*Math.sin(a)+y*0.2,FLOOR+(y-FLOOR)*0.75,z*Math.cos(a)-x*Math.sin(a));
    }
    try {
      burst.trigger({x:0.6,y:1.3,z:0.7},{x:1,y:-0.3,z:0.4});
      for(const age of [0,0.08,0.2,0.55,1.45,BURST_DURATION]) {
        const version:number=normal.version;
        burst.update(age,reduced);
        const reference=geometry.clone();
        try {
          reference.computeVertexNormals();reference.computeBoundingBox();reference.computeBoundingSphere();
          assert.deepEqual(normal.array,reference.getAttribute('normal').array);
          assert.ok(geometry.boundingBox!.equals(reference.boundingBox!));
          assert.ok(geometry.boundingSphere!.equals(reference.boundingSphere!));
          assert.equal(normal.version,version+1);assert.equal(geometry.getAttribute('position'),position);
          assert.equal(geometry.getAttribute('normal'),normal);
        } finally {reference.dispose();}
      }
    } finally {burst.dispose();geometry.dispose();}
  }
});
