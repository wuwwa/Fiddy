import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three/webgpu';
import { UprightRotation } from '../src/soft-body/rotation.ts';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { FLOOR } from '../src/soft-body/physics.ts';
import { localDragDelta, dragPressure } from '../src/soft-body/input.ts';
import { pickSoftSurface } from '../src/soft-body/picking.ts';

test('background taps, vertical movement and small hand jitter do not rotate',()=>{
  const rotation=new UprightRotation();
  rotation.begin(50,390,0);
  for(const x of [50,53,48,55,50])rotation.move(x,100);
  rotation.release(150,true);
  assert.equal(rotation.angle,0);assert.equal(rotation.active,false);
});

test('dragging tracks both directions across complete revolutions without tilting',()=>{
  const rotation=new UprightRotation();
  rotation.begin(0,400,0);rotation.move(205,100);
  assert.ok(Math.abs(rotation.angle-Math.PI*0.75)<1e-12);
  rotation.step(0.05);
  assert.ok(Math.abs(rotation.angle-Math.PI*0.75)<1e-12,'A held turn must not coast');
  for(let i=1;i<=30;i++)rotation.move(205+i*200,100+i*50);
  assert.ok(Number.isFinite(rotation.angle) && Math.abs(rotation.angle)<=Math.PI);
  rotation.move(5,1800);
  assert.ok(Math.abs(rotation.angle)<1e-12,'Returning to the drag origin must undo every revolution');
});

test('released turns coast gently and settle consistently at different frame rates',()=>{
  const angles=[];
  for(const fps of [30,60,120]) {
    const rotation=new UprightRotation();
    rotation.begin(0,400,0);rotation.move(85,100);rotation.release(110,true);
    const start=rotation.angle,speed=rotation.velocity;
    for(let i=0;i<fps/2;i++)rotation.step(1/fps);
    assert.ok(Math.abs(rotation.angle-(start+speed*(1-Math.exp(-3))/6))<1e-12);
    angles.push(rotation.angle);
    for(let i=0;i<fps*2;i++)rotation.step(1/fps);
    assert.equal(rotation.active,false);
    assert.ok(rotation.angle-start<0.44,'Release should only add a small turn');
  }
  assert.ok(Math.max(...angles)-Math.min(...angles)<1e-12);
});

test('a held angle, reduced motion, cancellation and a fresh gesture stop coasting',()=>{
  for(const end of ['hold','reduced','cancel','new'] as const) {
    const rotation=new UprightRotation();
    rotation.begin(0,400,0);rotation.move(85,100);
    if(end==='cancel')rotation.stop();
    else if(end==='new')rotation.begin(85,400,110);
    else rotation.release(end==='hold'?250:110,end!=='reduced');
    const angle=rotation.angle;
    for(let i=0;i<120;i++)rotation.step(1/60);
    assert.equal(rotation.angle,angle,end);
    assert.equal(rotation.velocity,0,end);
    rotation.reset();assert.equal(rotation.angle,0);assert.equal(rotation.active,false);
  }
});

test('keyboard turns stop existing momentum and reset restores the original facing',()=>{
  const rotation=new UprightRotation();
  rotation.begin(0,400,0);rotation.move(85,100);rotation.release(110,true);
  rotation.rotate(-0.5);
  const angle=rotation.angle;rotation.step(0.05);
  assert.equal(rotation.angle,angle);assert.equal(rotation.active,false);
  rotation.reset();assert.equal(rotation.angle,0);assert.equal(rotation.velocity,0);
});

test('all six rotated surfaces retain floor height, local normals and outward pull mapping',()=>{
  const camera=new PerspectiveCamera(35,1,0.1,40);
  camera.position.set(0,3.4,7.5);camera.lookAt(0,0.8,0);camera.updateMatrixWorld();
  const raycaster=new Raycaster(),material=new MeshBasicMaterial();
  try {
    for(const shape of ['pebble','cushion','loop','star','dumpling','putty'] as const) {
      const geometry=createSoftGeometry(shape),mesh=new Mesh(geometry,material);
      try {
        const position=geometry.getAttribute('position'),point=new Vector3();
        for(const angle of [0,0.7,Math.PI/2,Math.PI]) {
          mesh.rotation.y=angle;mesh.updateMatrixWorld();
          for(let i=0;i<position.count;i++) {
            point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
            assert.equal(point.y,position.getY(i));assert.ok(point.y>=FLOOR);
          }
          const hit=[0,0.1,-0.1,0.2,-0.2,0.3,-0.3].map(x=>{
            const pointer=new Vector2(x,0);raycaster.setFromCamera(pointer,camera);
            return pickSoftSurface(raycaster,mesh,camera,pointer);
          }).find(hit=>hit && hit.point.y>0.4);
          assert.ok(hit?.normal,`${shape} must expose pickable skin at ${angle}`);
          const normal=hit.normal.clone().normalize();
          const worldPull=normal.clone().transformDirection(mesh.matrixWorld).multiplyScalar(0.3).add(hit.point);
          const local=localDragDelta(worldPull,hit.point,new Matrix4().copy(mesh.matrixWorld).invert(),new Vector3());
          assert.ok(local.distanceTo(normal.clone().multiplyScalar(0.3))<1e-12);
          assert.ok(dragPressure(local,normal)<0.45,'Pulling away from the rotated face must ease the dent');
          const localPoint=mesh.worldToLocal(hit.point.clone());
          assert.ok(mesh.localToWorld(localPoint).distanceTo(hit.point)<1e-12);
        }
      } finally {geometry.dispose();}
    }
  } finally {material.dispose();}
});
