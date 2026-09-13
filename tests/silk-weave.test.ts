import test from 'node:test';
import assert from 'node:assert/strict';
import { SilkField, type SilkPointer } from '../src/silk/model.ts';

const input = (): SilkPointer => ({x:.85,y:.15,grabU:.3,grabV:.5,grabId:1,lift:1,dx:0,dy:0,inside:true,down:true,keyboard:false,samples:[]});
function maxStretch(field:SilkField) {
  let maximum=0; const spacing=3.5/(field.side-1);
  for(let row=0;row<field.side;row++)for(let col=0;col<field.side;col++) {
    const i=row*field.side+col;
    for(const [dc,dr] of [[1,0],[0,1],[1,1],[-1,1]]) {
      if(col+dc<0||col+dc>=field.side||row+dr>=field.side)continue;
      const j=(row+dr)*field.side+col+dc,dx=dc*spacing,dz=dr*spacing,dy=field.surfaceBase[j]-field.surfaceBase[i];
      maximum=Math.max(maximum,Math.hypot(dx+field.offsetX[j]-field.offsetX[i],dy+field.height[j]-field.height[i],dz+field.offsetZ[j]-field.offsetZ[i])/Math.hypot(dx,dy,dz));
    }
  }
  return maximum;
}

test('silk gathers across its weave instead of doubling thread lengths during a long diagonal pull',()=>{
  const field=new SilkField(),pointer=input();
  for(let i=0;i<240;i++)field.step(1/60,pointer,false);
  assert.ok(Math.max(...field.offsetX)>.6,'A constrained weave must still follow a substantial pull');
  assert.ok(maxStretch(field)<1.25,'The actual rendered thread directions must resist rubber-like stretching');
});

test('corner grips and rapid reversals preserve finite cloth above its support surface',()=>{
  const field=new SilkField(),pointer=input();
  for(let i=0;i<240;i++) {
    if(i%60===0) {pointer.grabId!++;pointer.grabU=i%120===0?.06:.94;pointer.grabV=i%120===0?.15:.85;}
    pointer.x=.5+Math.sin(i*.05)*1.1;pointer.y=.5+Math.cos(i*.08)*1.1;
    field.step(1/30,pointer,false);
    if(i%12===0)assert.ok(maxStretch(field)<1.5,'Reversing an extreme grip must not tear the weave apart');
    for(let j=0;j<field.count;j++)assert.ok(Number.isFinite(field.height[j]) && field.surfaceBase[j]+field.height[j]>=-.70001);
  }
  pointer.down=pointer.inside=false;
  for(let i=0;i<900;i++)field.step(1/60,pointer,false);
  for(const values of [field.height,field.velocity,field.offsetX,field.offsetZ,field.velocityX,field.velocityZ])assert.ok(values.every(value=>Math.abs(value)<.0001));
});

test('normal and reduced-motion resting folds cannot accumulate constraint impulses',()=>{
  for(const reduced of [false,true]) {
    const field=new SilkField(),pointer=input();pointer.down=pointer.inside=false;
    for(let i=0;i<360;i++)field.step(1/30,pointer,reduced);
    for(const values of [field.height,field.velocity,field.offsetX,field.offsetZ,field.velocityX,field.velocityZ])assert.ok(values.every(value=>value===0));
    field.reset();assert.deepEqual(field.surfaceBase,new SilkField().surfaceBase);
  }
});

test('silk held shape remains consistent at 30 and 120 render frames per second',()=>{
  const slow=new SilkField(),fast=new SilkField(),pointer=input();
  for(let i=0;i<60;i++)slow.step(1/30,pointer,true);
  for(let i=0;i<240;i++)fast.step(1/120,pointer,true);
  let difference=0;
  for(let i=0;i<slow.count;i++)difference=Math.max(difference,Math.abs(slow.height[i]-fast.height[i]),Math.abs(slow.offsetX[i]-fast.offsetX[i]),Math.abs(slow.offsetZ[i]-fast.offsetZ[i]));
  assert.ok(difference<.015,`The same hold diverged by ${difference} world units across frame rates`);
});
