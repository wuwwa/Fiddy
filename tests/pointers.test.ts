import test from 'node:test';
import assert from 'node:assert/strict';
import { CapturedPointers } from '../src/soft-body/pointers.ts';

function captureTarget() {
  const captured=new Set<number>(), capturedIds:number[]=[], releasedIds:number[]=[];
  return {
    captured,capturedIds,releasedIds,
    onLostCapture:(_id:number)=>{},
    setPointerCapture(id:number) { captured.add(id);capturedIds.push(id); },
    hasPointerCapture(id:number) { return captured.has(id); },
    releasePointerCapture(id:number) {
      captured.delete(id);releasedIds.push(id);this.onLostCapture(id);
    },
  };
}

test('moving and releasing one finger preserves the other finger and its capture',()=>{
  const target=captureTarget();
  const pointers=new CapturedPointers<{anchor:number;drag:number}>(target,5);
  const first={anchor:0.3,drag:0},second={anchor:-0.4,drag:0};
  pointers.begin(11,first);pointers.begin(22,second);
  pointers.get(11)!.drag=0.8;
  assert.equal(pointers.get(22)!.drag,0,'Each touch needs independent drag state');
  const ended:number[]=[];
  const end=(id:number)=>{ if(pointers.end(id)) ended.push(id); };
  target.onLostCapture=end;
  end(11);
  assert.deepEqual(ended,[11],'The capture-loss event must not release the same contact twice');
  assert.equal(pointers.size,1,'The UI should stay active while another finger remains');
  assert.equal(pointers.get(22),second);
  assert.equal(target.hasPointerCapture(22),true);
  end(22);
  assert.equal(pointers.size,0);
});

test('a browser-cancelled finger leaves the other contact live',()=>{
  const target=captureTarget();
  const pointers=new CapturedPointers<{label:string}>(target,5);
  pointers.begin(7,{label:'cancelled'});pointers.begin(8,{label:'still held'});
  // The browser can remove capture before delivering pointercancel/lostcapture.
  target.captured.delete(7);
  assert.equal(pointers.end(7)?.label,'cancelled');
  assert.equal(pointers.end(7),undefined);
  assert.equal(pointers.get(8)?.label,'still held');
  assert.equal(target.hasPointerCapture(8),true);
  assert.deepEqual(target.releasedIds,[]);
});

test('five captures are bounded and a released slot can accept a new finger',()=>{
  const target=captureTarget();
  const pointers=new CapturedPointers<{value:number}>(target,5);
  for(let id=1;id<=5;id++) assert.equal(pointers.begin(id,{value:id}),true);
  assert.equal(pointers.begin(6,{value:6}),false);
  assert.equal(pointers.begin(2,{value:200}),false);
  assert.equal(pointers.get(2)?.value,2,'A duplicate down must not replace its anchor');
  assert.deepEqual(target.capturedIds,[1,2,3,4,5]);
  pointers.end(3);
  assert.equal(pointers.begin(6,{value:6}),true);
  assert.equal(pointers.size,5);
});

test('global cancellation clears every record before capture callbacks and ignores late events',()=>{
  const target=captureTarget();
  const pointers=new CapturedPointers<{value:number}>(target,5);
  for(const id of [1,2,3]) pointers.begin(id,{value:id});
  target.onLostCapture=id=>{
    assert.equal(pointers.size,0,'Reset must be atomic across simultaneous touches');
    assert.equal(pointers.end(id),undefined);
  };
  pointers.clear();
  assert.deepEqual(target.releasedIds,[1,2,3]);
  assert.equal(target.captured.size,0);
  assert.equal(pointers.begin(9,{value:9}),true);
  for(const lateId of [1,2,3]) assert.equal(pointers.end(lateId),undefined);
  assert.equal(pointers.get(9)?.value,9,'Old up/cancel events must not end a new touch');
  assert.equal(target.hasPointerCapture(9),true);
});

test('a failed capture does not occupy a contact or displace existing fingers',()=>{
  const target=captureTarget();
  const pointers=new CapturedPointers<{value:number}>(target,5);
  pointers.begin(1,{value:1});
  target.setPointerCapture=()=>{ throw new Error('Pointer is no longer active'); };
  assert.equal(pointers.begin(2,{value:2}),false);
  assert.equal(pointers.has(2),false);
  assert.equal(pointers.size,1);
  assert.equal(pointers.get(1)?.value,1);
  assert.equal(target.hasPointerCapture(1),true);
});
