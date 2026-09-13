import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute } from 'three/webgpu';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { SoftBodyPhysics, STEP, FLOOR } from '../src/soft-body/physics.ts';
import { jellyProfile, cushionProfile, loopProfile, starProfile, dumplingProfile, type SoftToyProfile } from '../src/soft-body/profiles.ts';
import { SurfaceRipples } from '../src/soft-body/ripples.ts';
import { updateSoftSurface } from '../src/soft-body/surface.ts';

function pressedSurface(profile: SoftToyProfile) {
  const geometry = createSoftGeometry(profile.shape);
  const body = new SoftBodyPhysics(profile.feel);
  const rest = new Float32Array(geometry.getAttribute('position').array);
  const restNormals = new Float32Array(geometry.getAttribute('normal').array);
  const bindings = Array.from({ length: rest.length / 3 }, (_, i) =>
    body.bind(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]));
  body.beginGrab({ x: 0.55, y: 1.25, z: 0.85 }, { x: 0, y: 0, z: 1 });
  body.moveGrab({ x: 0.55, y: 0.12, z: 0 });
  body.setTwist(0.7);
  for (let i = 0; i < 1.4 / STEP; i++) body.step();
  const ripples = new SurfaceRipples();
  const update = () => updateSoftSurface(geometry, body, rest, bindings, ripples);
  update();
  return { geometry, restNormals, ripples, update };
}

test('ripples move along the dented and twisted skin instead of its old rest normals', () => {
  for (const profile of [jellyProfile, cushionProfile]) {
    const { geometry, restNormals, ripples, update } = pressedSurface(profile);
    try {
      const baseline = new Float32Array(geometry.getAttribute('position').array);
      const skinNormals = new Float32Array(geometry.getAttribute('normal').array);
      ripples.add({ x: 0.55, y: 1.25, z: 0.85 });
      ripples.advance(0.12);
      update();
      const displaced = geometry.getAttribute('position').array;
      let measured = 0, changedDirection = 0;
      for (let i = 0; i < baseline.length; i += 3) {
        const dx = displaced[i] - baseline[i];
        const dy = displaced[i + 1] - baseline[i + 1];
        const dz = displaced[i + 2] - baseline[i + 2];
        const distance = Math.hypot(dx, dy, dz);
        if (distance < 0.001 || baseline[i + 1] < FLOOR + 0.05) continue;
        const alignment = Math.abs((dx * skinNormals[i] + dy * skinNormals[i + 1] + dz * skinNormals[i + 2]) / distance);
        assert.ok(alignment > 0.9999, `${profile.shape}: ripple left the current normal at vertex ${i / 3}`);
        const oldAlignment = Math.abs((dx * restNormals[i] + dy * restNormals[i + 1] + dz * restNormals[i + 2]) / distance);
        if (oldAlignment < 0.98) changedDirection++;
        measured++;
      }
      assert.ok(measured > 100, 'Exercise a visible patch of the surface');
      assert.ok(changedDirection > 100, 'The deformation must differ enough to expose the old-normal regression');
    } finally { geometry.dispose(); }
  }
});

test('overlapping waves respect the floor and expire to the unchanged underlying deformation', () => {
  const { geometry, ripples, update } = pressedSurface(jellyProfile);
  try {
    const baseline = new Float32Array(geometry.getAttribute('position').array);
    for (const x of [-0.45, -0.15, 0.15, 0.45]) ripples.add({ x, y: FLOOR + 0.12, z: 0.65 });
    assert.equal(ripples.active, true);
    let changed = false;
    for (let frame = 0; frame < 21; frame++) {
      ripples.advance(0.08);
      update();
      const position = geometry.getAttribute('position').array;
      for (let i = 0; i < position.length; i += 3) {
        assert.ok(Number.isFinite(position[i]) && Number.isFinite(position[i + 1]) && Number.isFinite(position[i + 2]));
        assert.ok(position[i + 1] >= FLOOR + 0.005 - 1e-8);
        changed ||= Math.abs(position[i] - baseline[i]) > 0.001 || Math.abs(position[i + 1] - baseline[i + 1]) > 0.001;
      }
    }
    assert.equal(changed, true);
    assert.equal(ripples.active, false);
    assert.deepEqual(geometry.getAttribute('position').array, baseline, 'Expired waves must leave no accumulated displacement');
  } finally { geometry.dispose(); }
});

for(const profile of [jellyProfile,cushionProfile,loopProfile,starProfile,dumplingProfile]) {
  test(`${profile.label}: optimized full skin updates match the reference through holds, waves, and release`,()=>{
    const geometry=createSoftGeometry(profile.shape),reference=geometry.clone(),body=new SoftBodyPhysics(profile.feel);
    const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
    assert.ok(position instanceof BufferAttribute && normal instanceof BufferAttribute);
    const rest=new Float32Array(position.array),bindings=Array.from({length:position.count},(_,i)=>body.bind(rest[i*3],rest[i*3+1],rest[i*3+2]));
    const waves=new SurfaceRipples();
    const pointArray=position.array,normalArray=normal.array,index=geometry.index;
    const contact=(x:number,id:number)=>{
      let nearest=0,distance=Infinity;
      for(let i=0;i<position.count;i++) {
        const d=(position.getX(i)-x)**2+(position.getY(i)-1.1)**2+(position.getZ(i)-0.75)**2;
        if(d<distance){distance=d;nearest=i;}
      }
      const point={x:position.getX(nearest),y:position.getY(nearest),z:position.getZ(nearest)};
      body.beginGrab(point,{x:normal.getX(nearest),y:normal.getY(nearest),z:normal.getZ(nearest)},id);
      body.setPressure(0.35,id);body.moveGrab({x:x*0.8,y:0.12,z:0},id);body.setTwist(id===1?0.6:-0.25,id);
      return point;
    };
    try {
      const left=contact(-0.6,1),right=contact(0.6,2);
      for(let tick=0;tick<120;tick++)body.step();
      updateSoftSurface(geometry,body,rest,bindings,waves);
      const box=geometry.boundingBox,sphere=geometry.boundingSphere;
      for(let frame=0;frame<18;frame++) {
        if(frame===2)waves.add(left,0.7);
        if(frame===4) {waves.add(right,0.6);waves.add({x:0,y:1.4,z:0.6},0.5);}
        if(frame===6)body.release(1);
        if(frame===8)body.release(2);
        if(frame===14)waves.clear();
        for(let tick=0;tick<3;tick++)body.step();waves.advance(STEP*3);
        const alpha=(frame%4)/3;
        const referencePosition=reference.getAttribute('position') as BufferAttribute;
        body.deform(rest,referencePosition.array as Float32Array,bindings,alpha);
        if(waves.active) {
          reference.computeVertexNormals();
          waves.apply(rest,reference.getAttribute('normal').array as Float32Array,referencePosition.array as Float32Array);
        }
        reference.computeVertexNormals();reference.computeBoundingBox();reference.computeBoundingSphere();
        const version:number=normal.version,positionVersion:number=position.version;
        updateSoftSurface(geometry,body,rest,bindings,waves,alpha);
        assert.deepEqual(position.array,referencePosition.array,`Skin changed at frame ${frame}`);
        assert.deepEqual(normal.array,reference.getAttribute('normal').array,`Highlights changed at frame ${frame}`);
        assert.ok(geometry.boundingBox!.equals(reference.boundingBox!));
        assert.ok(geometry.boundingSphere!.equals(reference.boundingSphere!));
        assert.equal(normal.version,version+1,'Only the final pass marks normals for upload, including on ripple frames');
        assert.equal(position.version,positionVersion+1);
        assert.equal(position.array,pointArray);assert.equal(normal.array,normalArray);assert.equal(geometry.index,index);
        assert.equal(geometry.boundingBox,box);assert.equal(geometry.boundingSphere,sphere);
      }
    } finally {geometry.dispose();reference.dispose();}
  });
}
