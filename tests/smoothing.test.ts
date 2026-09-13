import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftBodyPhysics, STEP, FLOOR, type Point } from '../src/soft-body/physics.ts';
import { pressureFrame, undoPressure } from '../src/soft-body/pressure.ts';
import { SurfaceRipples } from '../src/soft-body/ripples.ts';
import { entranceStretchAt, ENTRANCE_DURATION } from '../src/soft-body/entrance.ts';

function advance(body:SoftBodyPhysics,seconds:number) {for(let t=0;t<seconds;t+=STEP)body.step();}
function transform(point:Point,compression:number):Point {
  const frame=pressureFrame(point.y,compression);
  return {x:point.x*frame.width,y:frame.y,z:point.z*frame.width};
}

test('the rounded pressure mapping preserves local volume and reverses accurately',()=>{
  for(const compression of [-0.15,0,0.3,0.55]) for(const y of [FLOOR,0.3,1,1.8,2.6]) {
    const point={x:0.7,y,z:-0.4},mapped=transform(point,compression),inverse=undoPressure(mapped,compression);
    assert.ok(Math.hypot(point.x-inverse.x,point.y-inverse.y,point.z-inverse.z)<1e-9);
    const epsilon=1e-5;
    const columns=(['x','y','z'] as const).map(axis=>{
      const next=transform({...point,[axis]:point[axis]+epsilon},compression);
      return [(next.x-mapped.x)/epsilon,(next.y-mapped.y)/epsilon,(next.z-mapped.z)/epsilon];
    });
    const [a,b,c]=columns;
    const determinant=a[0]*(b[1]*c[2]-b[2]*c[1])-b[0]*(a[1]*c[2]-a[2]*c[1])+c[0]*(a[1]*b[2]-a[2]*b[1]);
    assert.ok(Math.abs(determinant-1)<0.0001);
  }
});

test('the surface has continuous curvature when a dent crosses a lattice boundary',()=>{
  const body=new SoftBodyPhysics();
  // Alternating displacements deliberately expose interpolation creases.
  for(let i=0;i<body.positions.length;i+=3) body.positions[i+1]+=0.15*Math.sin(i*1.7);
  const sample=(x:number)=>{
    const rest=new Float32Array([x,1.15,0.15]),out=new Float32Array(3);
    body.deform(rest,out,[body.bind(x,1.15,0.15)]);
    return out[1];
  };
  const step=0.01;
  const left=(sample(-2*step)-2*sample(-step)+sample(0))/(step*step);
  const right=(sample(0)-2*sample(step)+sample(2*step))/(step*step);
  assert.ok(Math.abs(left-right)<0.025,`${left} versus ${right}`);
  for(const x of [-1,-0.3,0,0.7,1.2]) {
    const binding=body.bind(x,1.1,0.3);
    assert.ok(binding.weights.every(weight=>weight>=0));
    assert.ok(Math.abs(binding.weights.reduce((a,b)=>a+b,0)-1)<1e-10);
  }
});

test('catching a rising jelly preserves momentum instead of snapping down',()=>{
  const body=new SoftBodyPhysics();
  body.beginGrab({x:0,y:1.7,z:0.2});advance(body,1);body.release();advance(body,0.1);
  const before=body.diagnostics().compressionSpeed;
  assert.ok(before<-1);
  body.beginGrab({x:0,y:1.1,z:0.2});
  const after=body.diagnostics().compressionSpeed;
  assert.ok(after-before<=body.feel.tapKick);
  assert.ok(after<0,'The initial upward momentum should survive the catch');
});

test('a full-pressure rebound never reaches the emergency extension clamp',()=>{
  const body=new SoftBodyPhysics();
  body.beginGrab({x:0,y:1.7,z:0});body.setPressure(1.3);advance(body,2);body.release();
  let minimum=0;
  for(let i=0;i<2/STEP;i++){body.step();minimum=Math.min(minimum,body.diagnostics().compression);}
  assert.ok(minimum>-0.15 && minimum<-0.07,`${minimum}`);
});

test('unloading while still grabbed allows a smooth upward stretch',()=>{
  const body=new SoftBodyPhysics(),released=new SoftBodyPhysics();
  for(const toy of [body,released]) {toy.beginGrab({x:0,y:1.7,z:0});advance(toy,1);}
  assert.ok(body.compressionAmount>0.4);
  body.setPressure(0);body.moveGrab({x:0.1,y:0.7,z:0});advance(body,0.6);
  released.release();advance(released,0.6);
  assert.ok(Math.abs(body.compressionAmount)<0.03,'Only a small material rebound should remain');
  assert.ok(Math.abs(body.compressionAmount-released.compressionAmount)<0.001,
    'The unloaded pull must retain the same compression rebound as a release');
  assert.equal(body.diagnostics().grabbed,true);
  assert.ok(body.diagnostics().minVolumeRatio>0.8);
});

test('adding a ripple does not instantly change the surface',()=>{
  const ripples=new SurfaceRipples();
  const original=new Float32Array([0.25,1.7,0,0.4,1.5,0.2]),normals=new Float32Array([0,1,0,0,1,0]);
  ripples.add({x:0,y:1.8,z:0});
  const out=new Float32Array(original);ripples.apply(original,normals,out);
  assert.deepEqual(out,original);
  ripples.advance(0.06);ripples.apply(original,normals,out);
  assert.ok(out.some((value,i)=>Math.abs(value-original[i])>0.001));
});

test('the entrance lands with a volume-preserving squash and settles exactly',()=>{
  let compressed=false,stretched=false;
  for(let t=0;t<ENTRANCE_DURATION;t+=STEP) {
    const height=entranceStretchAt(t,false),width=1/Math.sqrt(height);
    assert.ok(height>0.8 && height<1.15);
    assert.ok(Math.abs(height*width*width-1)<1e-12);
    compressed ||= height<0.9;stretched ||= height>1.05;
  }
  assert.ok(compressed && stretched);
  assert.equal(entranceStretchAt(ENTRANCE_DURATION,false),1);
  assert.equal(entranceStretchAt(0.4,true),1);
});
