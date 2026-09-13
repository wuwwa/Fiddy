import test from 'node:test';
import assert from 'node:assert/strict';
import { MaterialResponse, POP_DURATION, REFORM_START } from '../src/soft-body/reactions.ts';
import { SoftBodyPhysics, STEP, type Point, type StrainSample } from '../src/soft-body/physics.ts';
import { createSoftGeometry } from '../src/soft-body/geometry.ts';
import { jellyProfile, loopProfile, starProfile, cushionProfile, dumplingProfile, type SoftToyProfile } from '../src/soft-body/profiles.ts';

const sample=():StrainSample=>({strain:0,point:{x:0,y:0,z:0},direction:{x:0,y:-1,z:0}});
function advance(response:MaterialResponse,seconds:number,strain=0) {
  let popped=false;
  for(let i=0;i<Math.round(seconds/STEP);i++) popped=response.step(STEP,{strain}) || popped;
  return popped;
}
function contact(profile:SoftToyProfile,axis:'Y'|'Z') {
  const geometry=createSoftGeometry(profile.shape);
  try {
    const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');let best=0;
    for(let i=1;i<positions.count;i++) if(positions[`get${axis}`](i)>positions[`get${axis}`](best)) best=i;
    return {point:{x:positions.getX(best),y:positions.getY(best),z:positions.getZ(best)},
      normal:{x:normals.getX(best),y:normals.getY(best),z:normals.getZ(best)}};
  } finally {geometry.dispose();}
}
function deformPoint(body:SoftBodyPhysics,point:Point) {
  const output=new Float32Array(3);
  body.deform(new Float32Array([point.x,point.y,point.z]),output,[body.bind(point.x,point.y,point.z)]);
  return {x:output[0],y:output[1],z:output[2]};
}
function physicalHold(profile:SoftToyProfile,kind:'top'|'front'|'pull') {
  const body=new SoftBodyPhysics(profile.feel),response=new MaterialResponse(profile.reaction),state=sample();
  const touched=contact(profile,kind==='top'?'Y':'Z');body.beginGrab(touched.point,touched.normal);
  body.setPressure(kind==='pull'?0:1.3);
  if(kind==='pull') body.moveGrab({x:0,y:0.8,z:0});
  else if(kind==='front') body.moveGrab({x:-touched.normal.x*0.3,y:-touched.normal.y*0.3,z:-touched.normal.z*0.3});
  let time=0;
  for(let frame=0;frame<9/STEP;frame++) {
    body.step();body.measureStrain(state);time=(frame+1)*STEP;
    assert.ok(state.strain>=0 && state.strain<=1);
    assert.ok(Object.values(state.point).every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(state.direction.x,state.direction.y,state.direction.z)-1)<1e-8);
    if(response.step(STEP,state)) break;
  }
  assert.equal(body.diagnostics().grabbed,true,'Sustained strain must not silently reset a held contact');
  assert.equal(response.count,1,`${profile.shape} ${kind} did not rupture by ${time}s`);
  return time;
}

test('only sufficient deformation over time ruptures gels; short high-strain pulses recover',()=>{
  const times:number[]=[];
  for(const profile of [jellyProfile,loopProfile]) {
    const response=new MaterialResponse(profile.reaction);let time=0;
    while(!response.bursting && time<5) {response.step(STEP,{strain:1});time+=STEP;}
    assert.ok(time>=1.9 && time<3);times.push(time);
    response.reset();
    for(let tap=0;tap<300;tap++) {
      assert.equal(advance(response,0.05,1),false);
      assert.equal(advance(response,0.2,0.1),false);
    }
    assert.equal(response.count,0);
    assert.ok(response.fatigue<0.2);
    assert.equal(advance(response,120,0.6),false,'A long light deformation must heal faster than fatigue builds');
  }
  assert.ok(times[1]>times[0]+0.7,'Loop must tolerate more sustained strain');
});

test('real firm top and inward front squeezes rupture Jelly after 2–4 s, with Loop tougher',()=>{
  for(const kind of ['top','front'] as const) {
    const jelly=physicalHold(jellyProfile,kind),loop=physicalHold(loopProfile,kind);
    assert.ok(jelly>=2 && jelly<=4,`${kind}: Jelly ${jelly}s`);
    assert.ok(loop>jelly+0.6 && loop<5,`${kind}: Jelly ${jelly}s; Loop ${loop}s`);
  }
});

test('real sustained upward pulls accumulate fatigue without more pointer events',()=>{
  const jelly=physicalHold(jellyProfile,'pull'),loop=physicalHold(loopProfile,'pull');
  assert.ok(jelly>=2 && jelly<4,`Jelly: ${jelly}s`);
  assert.ok(loop>jelly && loop<6,`Loop: ${loop}s`);
});

test('strong and off-screen upward pulls yield while preserving held strain and recovery',()=>{
  for(const profile of [jellyProfile,loopProfile,cushionProfile]) {
    const touched=contact(profile,'Z');let ordinaryLift=0;
    for(const distance of [0.8,1.2,100]) {
      const body=new SoftBodyPhysics(profile.feel),state=sample();
      body.beginGrab(touched.point,touched.normal);body.setPressure(0);body.moveGrab({x:0,y:distance,z:0});
      for(let frame=0;frame<6/STEP;frame++) {
        body.step();
        if(frame%30===0) {
          const health=body.diagnostics();
          assert.equal(health.grabbed,true,`${profile.shape}, raw upward ${distance}: held contact disappeared`);
          assert.ok(health.displacement<2.8,JSON.stringify(health));
          assert.ok(health.minVolumeRatio>0.25 && Math.abs(health.volumeRatio-1)<0.15,
            `${profile.shape}, raw upward ${distance}: ${JSON.stringify(health)}`);
        }
      }
      const lift=deformPoint(body,touched.point).y-touched.point.y;
      if(distance===0.8) ordinaryLift=lift;
      else assert.ok(lift>ordinaryLift+0.01,`${profile.shape}: stronger pull should retain more lift (${lift} vs ${ordinaryLift})`);
      assert.ok(body.measureStrain(state).strain>0.7,'A resisted extreme pull must retain physical strain');
      body.release();
      for(let frame=0;frame<12/STEP;frame++) body.step();
      assert.ok(body.measureStrain(state).strain<0.005,'Yielding must not leave permanent cage damage');
    }
  }
});

test('real rapid taps remain safe because the shape recovers between taps',()=>{
  for(const profile of [jellyProfile,loopProfile]) {
    const body=new SoftBodyPhysics(profile.feel),response=new MaterialResponse(profile.reaction),state=sample();
    const top=contact(profile,'Y');
    for(let tap=0;tap<60;tap++) {
      body.beginGrab(deformPoint(body,top.point),top.normal);
      for(let frame=0;frame<6;frame++) {body.step();body.measureStrain(state);assert.equal(response.step(STEP,state),false);}
      body.release();
      for(let frame=0;frame<24;frame++) {body.step();body.measureStrain(state);assert.equal(response.step(STEP,state),false);}
    }
    assert.equal(response.count,0);
  }
});

test('strain measures the changed skin, reuses caller storage, and follows the dominant held patch',()=>{
  const body=new SoftBodyPhysics(jellyProfile.feel),state=sample(),touched=contact(jellyProfile,'Z');
  const point=state.point,direction=state.direction;
  body.beginGrab(touched.point,touched.normal);body.setPressure(0);body.moveGrab({x:0,y:0.8,z:0});
  assert.equal(body.measureStrain(state),state);
  assert.equal(state.strain,0,'An input request alone is not measured deformation');
  for(let frame=0;frame<120;frame++) body.step();
  body.measureStrain(state);
  const skin=deformPoint(body,touched.point);
  assert.equal(state.point,point);assert.equal(state.direction,direction);
  assert.ok(state.strain>0.8);
  assert.ok(Math.hypot(state.point.x-skin.x,state.point.y-skin.y,state.point.z-skin.z)<1e-6);
  assert.ok(state.direction.y>0.98,'Upward strain should rupture along the actual pull');
  body.release();
  assert.ok(body.measureStrain(state).strain>0.8,'Release must not erase remaining physical strain');
  for(let frame=0;frame<12/STEP;frame++) body.step();
  assert.ok(body.measureStrain(state).strain<0.001);
  body.reset();assert.equal(body.measureStrain(state).strain,0);
});

test('pauses freeze fatigue; physical relaxation heals gradually; explicit reset clears it',()=>{
  const response=new MaterialResponse(jellyProfile.reaction);
  advance(response,1,1);const fatigue=response.fatigue;
  assert.ok(fatigue>0.4);
  for(let i=0;i<300;i++) response.step(0,{strain:1});
  assert.equal(response.fatigue,fatigue);
  advance(response,0.1,0);assert.ok(response.fatigue>0 && response.fatigue<fatigue);
  advance(response,12,0);assert.equal(response.fatigue,0);assert.equal(response.active,false);
  advance(response,1,1);response.reset();assert.equal(response.fatigue,0);assert.equal(response.count,0);
});

test('fatigue integration is independent of frame rate and solids never rupture',()=>{
  const values:number[]=[];
  for(const dt of [1/120,1/60,1/20]) {
    const response=new MaterialResponse(jellyProfile.reaction);
    for(let i=0;i<1/dt;i++) response.step(dt,{strain:0.9});
    values.push(response.fatigue);
  }
  for(const value of values) assert.ok(Math.abs(value-values[0])<1e-10);
  for(const profile of [starProfile,cushionProfile,dumplingProfile]) {
    const response=new MaterialResponse(profile.reaction);
    assert.equal(advance(response,180,1),false);assert.equal(response.fatigue,0);assert.equal(response.active,false);
  }
});

test('reformation completes once before accepting new strain and rejects invalid time',()=>{
  const response=new MaterialResponse(jellyProfile.reaction);
  advance(response,2,1);assert.equal(response.count,1);assert.equal(response.bursting,true);
  const age=response.age;
  for(const dt of [0,-1,NaN,Infinity]) response.step(dt,{strain:1});
  assert.equal(response.age,age);
  advance(response,POP_DURATION-age,1);
  assert.equal(response.bursting,false);assert.equal(response.count,1);assert.equal(response.fatigue,0);
  assert.equal(response.age,POP_DURATION);assert.ok(REFORM_START>0 && REFORM_START<POP_DURATION);
  advance(response,2,1);assert.equal(response.count,2);
  response.reset();assert.equal(response.count,0);assert.equal(response.active,false);assert.equal(response.age,POP_DURATION);
});
