import * as THREE from 'three/webgpu';
import type { JellyBonusRound } from './bonus-round';

/** Decorative company for the slime: nothing to aim at, collect or unlock. */
export function createBonusEffects(scene: THREE.Scene, camera: THREE.Camera) {
  const group = new THREE.Group(); scene.add(group); group.visible = false;
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.15 : 0.32;
    if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const starGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.025, bevelThickness: 0.025 });
  const ringGeometry = new THREE.TorusGeometry(0.46, 0.014, 6, 64);
  const moteGeometry = new THREE.CircleGeometry(0.09, 16);
  const gold = new THREE.MeshPhysicalNodeMaterial({color:'#ffe297', emissive:'#ffbb45', emissiveIntensity:0.28, roughness:0.24, metalness:0.3, transparent:true, depthWrite:false, side:THREE.DoubleSide});
  const light = new THREE.MeshBasicNodeMaterial({color:'#b8f1ff', transparent:true, depthWrite:false});
  const ringMaterial = new THREE.MeshBasicNodeMaterial({color:'#9defff', transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending});
  const awakeningRing = new THREE.Mesh(ringGeometry, ringMaterial); group.add(awakeningRing);
  const stars = Array.from({length:7}, () => {const m=new THREE.Mesh(starGeometry,gold);group.add(m);return m;});
  const motes = Array.from({length:18}, () => {const m=new THREE.Mesh(moteGeometry,light);group.add(m);return m;});
  const focusWorld = new THREE.Vector3();
  let time=0, previousPhase='idle', disposed=false;
  return {
    focusWorld,
    update(dt: number, round: JellyBonusRound, center: {x:number;y:number;z:number}, reduced: boolean, amount: number) {
      if (disposed) return;
      if (round.phase==='waiting' && previousPhase!=='waiting') time=0;
      previousPhase=round.phase;
      time+=dt;
      group.visible=round.active && amount>0.12;
      const fade=THREE.MathUtils.smoothstep(amount,0.15,0.9);
      const farewell=round.phase==='farewell' ? 1-THREE.MathUtils.smoothstep(round.age,0,3)*0.55 : 1;
      gold.opacity=fade*farewell*0.9; light.opacity=fade*farewell*0.45;
      const t=reduced?0:time, bloom=reduced?0:round.delight;
      stars.forEach((m,i)=>{
        const a=i/stars.length*Math.PI*2+t*0.36;
        const radius=1.16+Math.sin(t*0.8+i)*0.08+bloom*0.12;
        m.position.set(center.x+Math.cos(a)*radius,center.y+0.52+Math.sin(a)*0.65,center.z+Math.sin(a*1.3)*0.7);
        m.quaternion.copy(camera.quaternion);m.rotateZ(reduced?0:Math.sin(t+i)*0.22);
        m.scale.setScalar((0.16+i%3*0.035)*(1+bloom*0.2));
        if(i===0)focusWorld.copy(m.position);
      });
      motes.forEach((m,i)=>{
        const a=i*2.399+t*0.21, phase=(i/motes.length+t*0.07)%1;
        const radius=1.05+Math.sin(i*3.1)*0.3;
        m.visible=!reduced;
        m.position.set(center.x+Math.cos(a)*radius,center.y-0.35+phase*2.1,center.z+Math.sin(a)*0.85);
        m.quaternion.copy(camera.quaternion);
        m.scale.setScalar((0.17+i%3*0.08)*Math.sin(phase*Math.PI));
      });
      awakeningRing.visible=!reduced && round.phase==='intro' && round.age<0.35;
      if(awakeningRing.visible){
        const age=round.age/0.35;
        awakeningRing.position.set(center.x,center.y,center.z+0.1);
        awakeningRing.quaternion.copy(camera.quaternion);
        awakeningRing.scale.setScalar(1.3+age*5);
        ringMaterial.opacity=0.55*(1-age)**2;
      }
    },
    dispose() {
      if(disposed)return;
      disposed=true;group.removeFromParent();
      starGeometry.dispose();ringGeometry.dispose();moteGeometry.dispose();
      gold.dispose();light.dispose();ringMaterial.dispose();
    },
  };
}
