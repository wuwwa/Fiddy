import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { dragPressure, localDragDelta } from '../src/soft-body/input.ts';
import { entranceAt, entranceStretchAt } from '../src/soft-body/entrance.ts';
import { FLOOR } from '../src/soft-body/physics.ts';

function entranceMatrix(time:number) {
  const entrance=entranceAt(time,false), stretch=entranceStretchAt(time,false);
  const width=entrance.scale/Math.sqrt(stretch), height=entrance.scale*stretch;
  return new Matrix4().compose(
    new Vector3(0,FLOOR*(1-height)+entrance.lift,0),
    new Quaternion(),new Vector3(width,height,width),
  );
}

test('a stationary world pointer stays still while the entrance grows and lands',()=>{
  const worldAnchor=new Vector3(0.5,1,1).applyMatrix4(entranceMatrix(0.2));
  const output=new Vector3();
  for(const time of [0.1,0.2,0.3,0.5,0.95]) {
    localDragDelta(worldAnchor,worldAnchor,entranceMatrix(time).invert(),output);
    assert.equal(output.lengthSq(),0,`Invented a drag at entrance time ${time}`);
  }
  // Regression witness: mixing a current inverse with the cached local anchor
  // manufactured a sizable drag even though the pointer had not moved.
  const oldOffset=worldAnchor.clone().applyMatrix4(entranceMatrix(0.3).invert())
    .sub(new Vector3(0.5,1,1));
  assert.ok(oldOffset.length()>0.18);
});

test('moving the toy does not add translation to a real pointer drag',()=>{
  const anchor=new Vector3(4,5,6), current=new Vector3(4.3,4.8,6.5);
  const output={x:0,y:0,z:0};
  for(const translation of [new Vector3(),new Vector3(100,-80,30)]) {
    const inverse=new Matrix4().makeTranslation(translation).invert();
    localDragDelta(current,anchor,inverse,output);
    assert.ok(Math.abs(output.x-0.3)<1e-12);
    assert.ok(Math.abs(output.y+0.2)<1e-12);
    assert.ok(Math.abs(output.z-0.5)<1e-12);
  }
});

test('rotated and nonuniformly scaled toys retain drag direction and distance',()=>{
  const transform=new Matrix4().compose(
    new Vector3(-3,2,8),
    new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2),
    new Vector3(2,3,0.5),
  );
  const inverse=transform.clone().invert();
  const anchor=new Vector3(4,5,6), current=new Vector3(5.5,11,4);
  // A local (1,2,3) drag scales to (2,6,1.5), then turns to (1.5,6,-2).
  const returned=localDragDelta(current,anchor,inverse,current);
  assert.equal(returned,current,'Reuse the supplied output, including the input point');
  assert.ok(current.distanceTo(new Vector3(1,2,3))<1e-12);
  assert.deepEqual(anchor,new Vector3(4,5,6));
  assert.deepEqual(inverse,transform.clone().invert());
});

test('stationary holds retain full pressure on every face',()=>{
  for(const normal of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]) {
    assert.equal(dragPressure({x:0,y:0,z:0},normal),1);
  }
  assert.ok(dragPressure({x:0.02,y:0,z:0},{x:0,y:0,z:1})>0.99,
    'Small lateral hand movements should not cancel a hold');
});

test('pulling outward from the top continuously unloads the press',()=>{
  let previous=1;
  for(const y of [0.05,0.1,0.2,0.4,0.6,0.8]) {
    const pressure=dragPressure({x:0,y,z:0},{x:0,y:1,z:0});
    assert.ok(pressure>0 && pressure<previous);
    previous=pressure;
  }
  assert.ok(dragPressure({x:0,y:0.6,z:0},{x:0,y:1,z:0})<0.12);
});

test('front drags release pressure sideways and upward through the camera plane',()=>{
  const normal={x:0,y:0,z:1};
  let previous=1;
  for(const x of [0.05,0.1,0.2,0.4,0.8]) {
    const pressure=dragPressure({x,y:0,z:0},normal);
    assert.ok(pressure>0 && pressure<previous);
    assert.equal(pressure,dragPressure({x:-x,y:0,z:0},normal));
    previous=pressure;
  }
  assert.ok(previous<0.02);
  // Camera-plane up includes inward Z. It must still release the original dent.
  assert.ok(dragPressure({x:0,y:0.76,z:-0.25},normal)<0.15);
});

test('a deliberate inward side push increases pressure within a modest bound',()=>{
  let previous=1;
  for(const x of [-0.05,-0.1,-0.3,-1,-10]) {
    const pressure=dragPressure({x,y:0,z:0},{x:1,y:0,z:0});
    assert.ok(pressure>previous && pressure<=1.3);
    previous=pressure;
  }
});

test('diagonal drags cross the press and pull directions without a jump or kink',()=>{
  const normal={x:0,y:0,z:1}, epsilon=1e-4;
  const sample=(t:number)=>dragPressure({x:0.2+t,y:0.1+t*0.5,z:t},normal);
  let previous=sample(-0.5);
  for(let t=-0.498;t<=0.5;t+=0.002) {
    const pressure=sample(t);
    assert.ok(Number.isFinite(pressure) && pressure>=0 && pressure<=1.3);
    assert.ok(Math.abs(pressure-previous)<0.01);
    previous=pressure;
  }
  for(const t of [-0.3,0,0.3]) {
    const left=(sample(t)-sample(t-epsilon))/epsilon;
    const right=(sample(t+epsilon)-sample(t))/epsilon;
    assert.ok(Math.abs(left-right)<0.01,`Slope changed abruptly at ${t}`);
  }
});
