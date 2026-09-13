import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,PerspectiveCamera,Raycaster,Vector2,Vector3} from 'three/webgpu';
import {createSoftGeometry} from '../src/soft-body/geometry.ts';
import {SoftBodyPhysics} from '../src/soft-body/physics.ts';
import {SurfaceRipples} from '../src/soft-body/ripples.ts';
import {updateSoftSurface} from '../src/soft-body/surface.ts';
import {pickSoftSurface} from '../src/soft-body/picking.ts';

function camera() {
  const width=390,height=844,viewHeight=2*Math.tan(35*Math.PI/360);
  const distance=Math.max(3.4/viewHeight*height/(height-245),3.85/(viewHeight*width/height))+0.5;
  const camera=new PerspectiveCamera(35,width/height,0.1,40);
  camera.position.set(0,distance*0.42,distance*0.91);camera.lookAt(0,0.8,0);camera.updateMatrixWorld();
  return camera;
}

test('a center press keeps hitting settled Star triangle seams after reset and numerical cage drift',()=>{
  const geometry=createSoftGeometry('star'),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material),view=camera();
  const body=new SoftBodyPhysics(),position=geometry.getAttribute('position'),rest=new Float32Array(position.array);
  const bindings=Array.from({length:position.count},(_,i)=>body.bind(rest[i*3],rest[i*3+1],rest[i*3+2]));
  const waves=new SurfaceRipples(),pointer=new Vector2(0,1-420/844*2),raycaster=new Raycaster();
  let exactMisses=0;
  try {
    for(let cycle=0;cycle<3;cycle++) {
      body.reset();
      for(let tick=0;tick<18;tick++) {
        body.step();updateSoftSurface(geometry,body,rest,bindings,waves);
        raycaster.setFromCamera(pointer,view);
        const ray=raycaster.ray.clone();
        if(!raycaster.intersectObject(mesh,false).length)exactMisses++;
        const hit=pickSoftSurface(raycaster,mesh,view,pointer);
        assert.ok(hit,`Center press missed at ${cycle}:${tick}`);
        const projected=hit.point.clone().project(view);
        assert.ok(Math.hypot((projected.x-pointer.x)*390/2,(projected.y-pointer.y)*844/2)<0.0001,'Retry must stay far below a visible pixel');
        assert.ok(hit.normal?.lengthSq());assert.ok(raycaster.ray.equals(ray),'Picking must restore the exact ray used for drag planes');
      }
    }
    assert.ok(exactMisses>0,'The fixture must exercise the reproduced triangle-edge precision miss');
  } finally {geometry.dispose();material.dispose();}
});

test('ordinary surface picks keep the exact hit point and normal',()=>{
  const geometry=createSoftGeometry('cushion'),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material),view=camera();
  const pointer=new Vector2(0.1,0.02),raycaster=new Raycaster();
  try {
    raycaster.setFromCamera(pointer,view);
    const expected=raycaster.intersectObject(mesh,false)[0],actual=pickSoftSurface(raycaster,mesh,view,pointer);
    assert.ok(expected && actual);assert.deepEqual(actual.point,expected.point);assert.deepEqual(actual.normal,expected.normal);
    assert.equal(actual.faceIndex,expected.faceIndex);assert.deepEqual(pointer,new Vector2(0.1,0.02));
  } finally {geometry.dispose();material.dispose();}
});

test('precision retries leave the Loop hole and space outside toys empty',()=>{
  const view=camera(),raycaster=new Raycaster(),material=new MeshBasicMaterial();
  try {
    for(const shape of ['loop','star','cushion'] as const) {
      const geometry=createSoftGeometry(shape),mesh=new Mesh(geometry,material);
      try {
        const points=shape==='loop'?[new Vector2(0,0.00474),new Vector2(-0.02,0.00474),new Vector2(0.02,0.00474)]:[];
        points.push(new Vector2(-0.9,0.8),new Vector2(0.9,0.8),new Vector2(0,-0.9));
        for(const pointer of points) {
          raycaster.setFromCamera(pointer,view);const ray=raycaster.ray.clone();
          assert.equal(pickSoftSurface(raycaster,mesh,view,pointer),undefined,`${shape}: empty ray must stay empty`);
          assert.ok(raycaster.ray.equals(ray));
        }
        if(shape==='loop') {
          const pointer=new Vector3(0.9,1,0).project(view),ndc=new Vector2(pointer.x,pointer.y);
          raycaster.setFromCamera(ndc,view);assert.ok(pickSoftSurface(raycaster,mesh,view,ndc),'Loop rim remains touchable');
        }
      } finally {geometry.dispose();}
    }
  } finally {material.dispose();}
});
