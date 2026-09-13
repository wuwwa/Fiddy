import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshPhysicalNodeMaterial, Raycaster, Vector3 } from 'three/webgpu';
import { DoughFold } from '../src/dough/fold';
import { DoughVolume } from '../src/dough/volume';
import { SoftBodyPhysics } from '../src/soft-body/physics';
import { doughProfile } from '../src/soft-body/profiles';

test('a flap overturns its material, then merges permanently rather than stretching back',()=>{
  const fold=new DoughFold();
  let outer=0;
  for(let i=0;i<fold.original.length;i+=3)if(fold.original[i]>fold.original[outer])outer=i;
  fold.begin(1,{x:1,y:0.8,z:0});fold.move(1,{x:-0.9,y:0,z:0});
  for(let i=0;i<60;i++)fold.step(1/60);
  assert.ok(fold.angle>Math.PI/2);assert.ok(fold.positions[outer]<0.25,'The outside edge must cross to the inside');
  assert.ok(fold.positions[outer+1]>fold.original[outer+1],'The turned edge lies over the main body');
  fold.release(1);
  for(let i=0;i<140;i++)fold.step(1/60);
  assert.equal(fold.folds,1);assert.equal(fold.phase,'idle');
  assert.notDeepEqual(fold.rest,fold.original);
  assert.ok(fold.mixed.some(amount=>amount>0.1));
  const settled=new Float32Array(fold.positions);
  for(let i=0;i<100;i++)fold.step(1/60);
  assert.deepEqual(fold.positions,settled,'Idle time cannot unfold joined layers');
  fold.reset();assert.deepEqual(fold.positions,fold.original);assert.equal(fold.folds,0);
});

test('cancelling an early fold restores it, while an already joined fold keeps merging',()=>{
  const fold=new DoughFold();fold.begin(1,{x:1,y:0.7,z:0});fold.move(1,{x:-0.2,y:0,z:0});
  for(let i=0;i<10;i++)fold.step(1/60);fold.release(1,false);
  for(let i=0;i<30;i++)fold.step(1/60);
  assert.equal(fold.phase,'idle');assert.deepEqual(fold.positions,fold.original);
  fold.begin(2,{x:1,y:0.7,z:0});fold.move(2,{x:-0.9,y:0,z:0});
  for(let i=0;i<70;i++)fold.step(1/60);
  assert.equal(fold.phase,'merging');fold.release(2,false);
  for(let i=0;i<100;i++)fold.step(1/60);
  assert.equal(fold.folds,1);
});

test('the resting half stays planted and a lifting underside never pinches down into the table',()=>{
  for(const direction of [0,Math.PI/2,2.2,Math.PI]) {
    const fold=new DoughFold(),x=Math.cos(direction),z=Math.sin(direction);
    fold.begin(1,{x,y:0.8,z});fold.move(1,{x:-x,y:0,z:-z});
    for(let frame=0;frame<63;frame++) {
      fold.step(1/60);
      for(let i=0;i<fold.original.length;i+=3) {
        const q=fold.original[i]*x+fold.original[i+2]*z;
        if(q<=0) {
          for(let axis=0;axis<3;axis++)assert.ok(Math.abs(fold.positions[i+axis]-fold.original[i+axis])<1e-6,'The supported base must not follow the flap');
        }
        if(fold.original[i+1]<0.6)assert.ok(fold.positions[i+1]>=fold.original[i+1]-1e-6,'The curl must lift the bottom instead of crushing it into feet');
      }
    }
  }
});

test('the rebuilt surface conserves volume through overlap, is finite, and is restored by reset',()=>{
  const material=new MeshPhysicalNodeMaterial({side:DoubleSide});
  const volume=new DoughVolume(new SoftBodyPhysics(doughProfile.feel),material);
  const mesh=new Mesh(volume.geometry,material),ray=new Raycaster();
  const measure=()=>{
    const p=volume.geometry.getAttribute('position'),n=volume.geometry.getAttribute('normal'),color=volume.geometry.getAttribute('color'),count=volume.geometry.drawRange.count;
    let total=0,contactVertices=0;
    for(let i=0;i<count;i+=3) {
      const a=new Vector3().fromBufferAttribute(p,i),b=new Vector3().fromBufferAttribute(p,i+1),c=new Vector3().fromBufferAttribute(p,i+2);
      total+=a.dot(b.cross(c))/6;
    }
    for(let i=0;i<count;i++) {
      assert.ok(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)));
      assert.ok(p.getY(i)>=0.0449);
      assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<0.001);
      assert.ok(Math.min(color.getX(i),color.getY(i),color.getZ(i))>0.6,'The surface must not interpolate black patches from empty space');
      if(p.getY(i)<0.04501 && n.getY(i)<-0.98)contactVertices++;
    }
    assert.ok(contactVertices>12,'The base needs a flat contact patch with downward normals');
    return total;
  };
  try {
    const initial=measure(),initialPositions=new Float32Array(volume.geometry.getAttribute('position').array);
    volume.fold.begin(1,{x:1,y:0.8,z:0});volume.fold.move(1,{x:-0.9,y:0,z:0});
    let overhang=0,largestGap=0;
    for(let frame=0;frame<170;frame++) {
      volume.update(1/60);
      if(frame%20===0)assert.ok(Math.abs(measure()/initial-1)<0.06,'Overlapping layers must retain the same amount of dough');
      if([30,36,44,54].includes(frame)) {
        // The crease moves as the starting mound and fold direction change.
        // Sample the flap's area instead of relying on one exact ray at z=0.
        for(let z=-0.64;z<0.65;z+=0.16)for(let x=-0.9;x<0.91;x+=0.08) {
          ray.set(new Vector3(x,3,z),new Vector3(0,-1,0));
          const hits=ray.intersectObject(mesh).map(hit=>hit.distance);
          const unique=hits.filter((distance,index)=>index===0 || Math.abs(distance-hits[index-1])>0.001);
          if(unique.length>=4){overhang++;largestGap=Math.max(largestGap,unique[2]-unique[1]);}
        }
      }
    }
    assert.ok(overhang>=5 && largestGap>0.12,'The lifted flap needs an actual underside above the base');
    assert.equal(volume.fold.folds,1);
    for(let cycle=0;cycle<8;cycle++) {
      const angle=cycle*1.7,x=Math.cos(angle),z=Math.sin(angle);
      volume.fold.begin(cycle+2,{x,y:0.8,z});volume.fold.move(cycle+2,{x:-x,y:0,z:-z});
      for(let step=0;step<180;step++)volume.fold.step(1/60);
      volume.update(0);
      assert.equal(volume.fold.folds,cycle+2);
      assert.ok(Math.abs(measure()/initial-1)<0.08,'Repeated folds must preserve material');
    }
    volume.reset();assert.ok(Math.abs(measure()-initial)<1e-8);
    assert.deepEqual(volume.geometry.getAttribute('position').array.slice(0,volume.geometry.drawRange.count*3),initialPositions.slice(0,volume.geometry.drawRange.count*3));
  } finally {volume.geometry.dispose();material.dispose();}
});
