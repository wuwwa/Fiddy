import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOOR } from './physics';
import type { SoftToyShape } from './profiles';

export function createSoftGeometry(shape: SoftToyShape) {
  if(shape==='dough') return createDough();
  if(shape==='loop') return createLoop();
  if(shape==='star' || shape==='dumpling') return createSculptedShape(shape);
  // Uniform triangles avoid pinched poles. A smooth implicit superellipsoid
  // replaces signed coordinate powers, whose slopes jumped across the axes.
  const surface=new THREE.IcosahedronGeometry(1,31);
  const position=surface.getAttribute('position');
  const jelly=shape==='pebble';
  const putty=shape==='putty';
  const exponent=jelly?2.08:putty?2.8:4.2;
  const width=jelly?1.16:putty?1.22:1.10, height=jelly?0.93:putty?0.72:0.79, depth=jelly?1.03:0.97;
  const center=jelly?0.91:putty?0.70:0.78, angle=-0.26;
  for(let i=0;i<position.count;i++) {
    const nx=position.getX(i),ny=position.getY(i),nz=position.getZ(i);
    const radius=(Math.abs(nx)**exponent+Math.abs(ny)**exponent+Math.abs(nz)**exponent)**(-1/exponent);
    const fullness=jelly?1+0.018*Math.sin(ny*2.4+nz*1.7):1;
    const x=nx*radius*width*fullness, z=nz*radius*depth;
    const raw=ny*radius*height+center;
    // A rounded transition into the contact patch, with no clipped normal seam.
    const y=0.5*(raw+0.008+Math.sqrt((raw-0.008)**2+0.016**2));
    position.setXYZ(i,x*Math.cos(angle)-z*Math.sin(angle)+(jelly?0.018*y:0),
      FLOOR+y,x*Math.sin(angle)+z*Math.cos(angle));
  }
  return finishSurface(surface);
}

function createDough() {
  const surface=new THREE.IcosahedronGeometry(1,31);
  const position=surface.getAttribute('position');
  for(let i=0;i<position.count;i++) {
    const nx=position.getX(i),ny=position.getY(i),nz=position.getZ(i);
    const radius=(Math.abs(nx)**2.15+Math.abs(ny)**2.15+Math.abs(nz)**2.15)**(-1/2.15);
    const fullness=1+0.075*Math.sin(nx*4+nz*3)*Math.cos(ny*2)+0.035*Math.cos(nz*6-nx*3);
    const x=nx*radius*1.2*fullness,z=nz*radius*1.04*fullness;
    const top=THREE.MathUtils.smoothstep(ny,-0.1,0.6);
    // A thick, uneven flap and palm dents give the mound a worked shape.
    const seam=z+0.02-0.17*Math.sin(x*3+0.7);
    const flap=(0.14*Math.exp(-(((seam+0.2)/0.19)**2))-0.13*Math.exp(-((seam/0.12)**2)))
      *Math.exp(-((x/0.99)**6));
    const palm=0.1*Math.exp(-(((x+0.43)/0.3)**2+((z-0.34)/0.36)**2));
    const gather=0.055*Math.sin(x*12+z*4)*Math.exp(-(((x-0.67)/0.31)**2+((z+0.15)/0.65)**2));
    const y=ny*radius*0.6+(flap-palm+gather)*top;
    position.setXYZ(i,x+ny*0.085,y,z+0.055*(nx*nx-0.3));
  }
  return restOnFloor(surface);
}

function finishSurface(surface:THREE.BufferGeometry) {
  surface.deleteAttribute('uv');surface.deleteAttribute('normal');
  const geometry=mergeVertices(surface,0.00005);
  surface.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

function restOnFloor(surface:THREE.BufferGeometry) {
  const position=surface.getAttribute('position');
  let lowest=Infinity;
  for(let i=0;i<position.count;i++) lowest=Math.min(lowest,position.getY(i));
  for(let i=0;i<position.count;i++) {
    const y=position.getY(i)-lowest-0.014;
    const rounded=0.5*(y+0.008+Math.sqrt((y-0.008)**2+0.016**2));
    position.setY(i,FLOOR+rounded);
  }
  return finishSurface(surface);
}

/** Upright torus: the opening is empty geometry, including for raycasting. */
function createLoop() {
  const surface=new THREE.TorusGeometry(0.74,0.32,56,144);
  const position=surface.getAttribute('position');
  for(let i=0;i<position.count;i++) {
    position.setXYZ(i,position.getX(i)*1.08,position.getY(i)*0.93,position.getZ(i)*1.15);
  }
  return restOnFloor(surface);
}

/** Rounded lobes and pleats are part of the mesh, so they move with the skin. */
function createSculptedShape(shape:'star'|'dumpling') {
  const surface=new THREE.IcosahedronGeometry(1,31);
  const position=surface.getAttribute('position');
  for(let i=0;i<position.count;i++) {
    const nx=position.getX(i),ny=position.getY(i),nz=position.getZ(i);
    if(shape==='star') {
      const radial=Math.hypot(nx,ny),angle=Math.atan2(ny,nx)-Math.PI/2;
      // Fading the five-fold wave toward the face center avoids pinched normals.
      const lobes=Math.cos(angle*5)*radial**5;
      const radius=0.91+0.25*lobes;
      position.setXYZ(i,nx*radius*1.05,ny*radius*0.88,nz*0.52*(1-0.08*lobes));
    } else {
      const radial=Math.hypot(nx,nz),angle=Math.atan2(nz,nx);
      const shoulder=THREE.MathUtils.smoothstep(ny,0.05,0.84);
      const pleats=Math.cos(angle*12+ny*0.28)*shoulder;
      const belly=1+0.10*Math.exp(-(((ny+0.25)/0.55)**2))-0.26*THREE.MathUtils.smoothstep(ny,0.25,0.95);
      const radius=belly+0.095*pleats;
      const pucker=0.12*Math.exp(-((radial/0.20)**2))*THREE.MathUtils.smoothstep(ny,0.65,1);
      position.setXYZ(i,nx*radius*1.08,ny*0.78-pucker,nz*radius*0.97);
    }
  }
  return restOnFloor(surface);
}
