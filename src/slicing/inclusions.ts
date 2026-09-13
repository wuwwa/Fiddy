import * as THREE from 'three';
import type { BatchedGel } from './gel';
import type { SliceModel, Point } from './model';

const COUNT = 56;
const inside = (p: Point, polygon: Point[], margin: number) => polygon.every((a, i) => {
  const b = polygon[(i + 1) % polygon.length], dx = b.x - a.x, dz = b.z - a.z;
  return (dx * (p.z - a.z) - dz * (p.x - a.x)) / Math.hypot(dx, dz) > margin;
});

/** Tiny air cavities give the refracted interior scale and visible depth. */
export class GelInclusions {
  readonly mesh: THREE.InstancedMesh;
  private readonly points: { x: number; y: number; z: number; radius: number; part: number }[] = [];
  private readonly matrix = new THREE.Object3D();
  constructor(private gel: BatchedGel, mint: boolean) {
    let seed = 22117;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < COUNT; i++) this.points.push({ x: (random() - .5) * 2.4, z: (random() - .5) * 2.1, y: .12 + random() * (gel.height - .25), radius: .011 + random() ** 2 * .028, part: -1 });
    const material = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(mint ? '#83b8a8' : '#d798ae') } },
      vertexShader: 'varying vec2 disk; void main(){disk=uv*2.-1.;vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);p.xy+=position.xy*length(instanceMatrix[0].xyz);gl_Position=projectionMatrix*p;}',
      fragmentShader: `uniform vec3 tint; varying vec2 disk;
        void main(){float r=length(disk);if(r>.96)discard;
          float glint=exp(-dot(disk-vec2(-.35,.4),disk-vec2(-.35,.4))*38.);
          if(r<.72 && glint<.15)discard;
          vec3 color=mix(tint*.68,vec3(1.),glint*.9+smoothstep(.9,.75,r)*.3);
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthWrite: true,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), material, COUNT);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  rebuild(model: SliceModel) { for (const point of this.points) point.part = model.pieces.findIndex(piece => inside(point, piece.polygon, point.radius + .05)); }
  update() {
    let count = 0;
    for (const p of this.points) {
      if (p.part < 0) continue;
      const pose = this.gel.poses[p.part], origin = this.gel.origins[p.part], knife = this.gel.knife;
      const x = (p.x - origin.x) * (1 + pose.w * .35) + pose.x, z = (p.z - origin.z) * (1 + pose.w * .35) + pose.y;
      const d = x * knife.x + z * knife.y - knife.z, indent = Math.exp(-d * d * 30) * knife.w;
      this.matrix.position.set(x, p.y * (1 - pose.w * .7) - indent * (p.y / this.gel.height) ** 3, z);
      this.matrix.scale.setScalar(p.radius); this.matrix.updateMatrix(); this.mesh.setMatrixAt(count++, this.matrix.matrix);
    }
    this.mesh.count = count; this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.dispose(); }
}
