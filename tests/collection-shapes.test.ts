import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three/webgpu';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { loopProfile, starProfile, dumplingProfile } from '../src/soft-body/profiles.ts';
import { SoftBodyPhysics, FLOOR, STEP } from '../src/soft-body/physics.ts';
import { SurfaceRipples } from '../src/soft-body/ripples.ts';
import { updateSoftSurface } from '../src/soft-body/surface.ts';

const profiles = [loopProfile, starProfile, dumplingProfile];

function assertSkin(geometry:BufferGeometry) {
  const positions=geometry.getAttribute('position'), normals=geometry.getAttribute('normal');
  for(let i=0;i<positions.count;i++) {
    assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) && Number.isFinite(positions.getZ(i)));
    assert.ok(positions.getY(i)>=FLOOR+0.005-1e-8);
    const length=Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i));
    assert.ok(Number.isFinite(length) && Math.abs(length-1)<0.01, `Invalid surface normal at ${i}: ${length}`);
  }
}

function signedVolume(geometry:BufferGeometry) {
  const p=geometry.getAttribute('position'), ids=geometry.index!.array;
  let volume=0;
  for(let i=0;i<ids.length;i+=3) {
    const a=ids[i],b=ids[i+1],c=ids[i+2];
    volume+=(p.getX(a)*(p.getY(b)*p.getZ(c)-p.getZ(b)*p.getY(c))+
      p.getY(a)*(p.getZ(b)*p.getX(c)-p.getX(b)*p.getZ(c))+
      p.getZ(a)*(p.getX(b)*p.getY(c)-p.getY(b)*p.getX(c)))/6;
  }
  return volume;
}

for(const profile of profiles) {
  test(`${profile.label}: geometry is smooth, welded, and closed with the correct topology`,()=>{
    const geometry=createSoftGeometry(profile.shape);
    try {
      assertSkin(geometry);
      geometry.computeBoundingBox();
      const size=geometry.boundingBox!.getSize(new Vector3());
      assert.ok(size.x>1.8 && size.y>1.3 && size.z>0.6);
      const positions=geometry.getAttribute('position'), ids=geometry.index!.array;
      assert.ok(positions.count<ids.length/2, 'The surface should share vertices for smooth normals');
      const edges=new Map<string,number>();
      for(let i=0;i<ids.length;i+=3) {
        assert.equal(new Set([ids[i],ids[i+1],ids[i+2]]).size,3);
        for(const [a,b] of [[ids[i],ids[i+1]],[ids[i+1],ids[i+2]],[ids[i+2],ids[i]]]) {
          const edge=a<b?`${a},${b}`:`${b},${a}`;
          edges.set(edge,(edges.get(edge)??0)+1);
        }
      }
      for(const uses of edges.values()) assert.equal(uses,2,'Each edge should join exactly two faces');
      const euler=positions.count-edges.size+ids.length/3;
      assert.equal(euler,profile.shape==='loop'?0:2,'The Loop needs one true topological opening');
      assert.ok(signedVolume(geometry)>0.2);
    } finally { geometry.dispose(); }
  });
}

test('the Loop opening is empty to pointer rays while its tube remains hittable',()=>{
  const geometry=createSoftGeometry('loop'), material=new MeshBasicMaterial();
  try {
    geometry.computeBoundingBox();
    const center=geometry.boundingBox!.getCenter(new Vector3());
    const mesh=new Mesh(geometry,material), ray=new Raycaster();
    for(const rise of [0,1.2]) {
      const origin=new Vector3(0,center.y+rise,5);
      ray.set(origin,center.clone().sub(origin).normalize());
      assert.equal(ray.intersectObject(mesh,false).length,0,'A pointer through the hole must miss');
    }
    ray.set(new Vector3(0.8,center.y,5),new Vector3(0,0,-1));
    const hit=ray.intersectObject(mesh,false)[0];
    assert.ok(hit && hit.point.z>0.2,'The surrounding tube must still receive a press');
  } finally { geometry.dispose(); material.dispose(); }
});

test('the Star has five rounded arms and the Dumpling has twelve modeled shoulder pleats',()=>{
  for(const shape of ['star','dumpling'] as const) {
    const geometry=createSoftGeometry(shape), material=new MeshBasicMaterial();
    try {
      geometry.computeBoundingBox();
      const positions=geometry.getAttribute('position');
      let centerY=0;
      for(let i=0;i<positions.count;i++) centerY+=positions.getY(i)/positions.count;
      const mesh=new Mesh(geometry,material), ray=new Raycaster(), radii:number[]=[];
      const count=180;
      for(let i=0;i<count;i++) {
        const angle=i/count*Math.PI*2, x=Math.cos(angle), other=Math.sin(angle);
        if(shape==='star') ray.set(new Vector3(x*3,centerY+other*3,0),new Vector3(-x,-other,0));
        else ray.set(new Vector3(x*3,geometry.boundingBox!.max.y-0.22,other*3),new Vector3(-x,0,-other));
        const hit=ray.intersectObject(mesh,false)[0];
        assert.ok(hit,'A radial ray should meet the closed silhouette');
        radii.push(3-hit.distance);
      }
      let peaks=0;
      for(let i=0;i<count;i++) if(radii[i]>radii[(i+count-1)%count] && radii[i]>=radii[(i+1)%count]) peaks++;
      assert.equal(peaks,shape==='star'?5:12);
      assert.ok(Math.max(...radii)-Math.min(...radii)>(shape==='star'?0.3:0.1), 'The sculpted contour should be visibly distinct');
    } finally { geometry.dispose(); material.dispose(); }
  }
});

for(const profile of profiles) {
  test(`${profile.label}: actual top and front contacts survive pressing, pulling, and recovery`,()=>{
    const geometry=createSoftGeometry(profile.shape);
    try {
      const body=new SoftBodyPhysics(profile.feel), ripples=new SurfaceRipples();
      const positions=geometry.getAttribute('position'), rest=new Float32Array(positions.array);
      const initialVolume=signedVolume(geometry);
      const bindings=Array.from({length:positions.count},(_,i)=>body.bind(rest[i*3],rest[i*3+1],rest[i*3+2]));
      const update=()=>{ updateSoftSurface(geometry,body,rest,bindings,ripples);assertSkin(geometry); };
      const point=(id:number)=>new Vector3(positions.getX(id),positions.getY(id),positions.getZ(id));
      const normal=(id:number)=>{
        const normals=geometry.getAttribute('normal');
        return new Vector3(normals.getX(id),normals.getY(id),normals.getZ(id));
      };
      const advance=(seconds:number,held:boolean)=>{
        for(let i=0;i<seconds/STEP;i++) {
          body.step();ripples.advance(STEP);
          assert.equal(body.diagnostics().grabbed,held,'A valid interaction must not silently reset');
        }
        update();
        const state=body.diagnostics();
        assert.ok(Math.abs(state.volumeRatio-1)<0.15 && state.minVolumeRatio>0.4,JSON.stringify(state));
        assert.ok(state.displacement<2.5,JSON.stringify(state));
        assert.ok(Math.abs(signedVolume(geometry)/initialVolume-1)<0.3,'The solid material should retain its volume');
      };
      let top=0, front=0;
      for(let i=1;i<positions.count;i++) {
        if(positions.getY(i)>positions.getY(top)) top=i;
        if(positions.getZ(i)>positions.getZ(front)) front=i;
      }
      // Keyboard uses an actual highest vertex, including the Dumpling's pucker.
      const topPoint=point(top);
      body.beginGrab(topPoint,normal(top));ripples.add(topPoint,profile.rippleStrength);
      advance(0.9,true);
      assert.ok(topPoint.y-point(top).y>0.1,'The actual keyboard contact should visibly squash');
      body.release();advance(0.15,false);

      // Re-grab the deformed front skin, including the Loop's nonconvex tube.
      const pulledFrom=point(front);
      body.beginGrab(pulledFrom,normal(front));
      body.setPressure(0);body.moveGrab({x:0.8,y:0.6,z:0.15});
      advance(1,true);
      assert.ok(point(front).distanceTo(pulledFrom)>0.35,'A substantial pull should move the touched material');
      body.release();advance(15,false);
      let error=0;
      for(let i=0;i<rest.length;i++) error=Math.max(error,Math.abs(positions.array[i]-rest[i]));
      assert.ok(error<0.02,`Residual shape error ${error}`);
      assert.ok(body.diagnostics().speed<0.02);
    } finally { geometry.dispose(); }
  });
}
