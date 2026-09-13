import * as THREE from 'three';
import { area, center, MAX_PIECES, type Piece } from './model';
import { createGelSurface } from './surface';

const CAPACITY = 131072;
const deformation = `
  vec3 deformGel(vec3 p, vec4 pose) {
    float u = max(0., (p.y - .015) / gelHeight);
    p.xz *= 1.0 + pose.w * .35; p.y *= 1.0 - pose.w * .7;
    p.xz += pose.xy + vec2(.8, .6) * pose.z * u * u;
    float distance = dot(p.xz, gelKnife.xy) - gelKnife.z;
    float indent = exp(-distance * distance * 30.0) * gelKnife.w;
    p.y -= indent * pow(clamp(p.y / gelHeight, 0.0, 1.0), 3.0);
    p.xz += gelKnife.xy * distance * indent * .3 * (1. - gelSoftness);
    return p;
  }
  vec3 deformGelNormal(vec3 p, vec3 n, vec4 pose) {
    float u = max(0., (p.y - .015) / gelHeight);
    n.xz /= 1. + pose.w * .35;
    n.y = (n.y - dot(vec2(.8, .6) * pose.z * 2. * u / gelHeight, n.xz)) / (1. - pose.w * .7);
    return n;
  }
`;
/** One surface, one material, and fixed buffers for the entire cut block. */
export class BatchedGel {
  readonly geometry = new THREE.BufferGeometry();
  readonly material: THREE.MeshPhysicalMaterial;
  readonly mesh: THREE.Mesh;
  readonly backMaterial: THREE.ShaderMaterial;
  readonly backMesh: THREE.Mesh;
  readonly backScene = new THREE.Scene();
  readonly backTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  readonly backSize = new THREE.Vector2(1, 1);
  readonly poses = Array.from({ length: MAX_PIECES }, () => new THREE.Vector4());
  readonly bounds = Array.from({ length: MAX_PIECES }, () => new THREE.Vector4());
  readonly origins: { x: number; z: number }[] = [];
  readonly knife = new THREE.Vector4(0, 0, 0, 0);
  rebuilds = 0;
  vertices = 0;
  private readonly positions = new Float32Array(CAPACITY * 3);
  private readonly normals = new Float32Array(CAPACITY * 3);
  private readonly indices = new Float32Array(CAPACITY);
  private readonly sizes = new Float32Array(MAX_PIECES);
  constructor(readonly height: number, private readonly mint: boolean) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('gelPart', new THREE.BufferAttribute(this.indices, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.MeshPhysicalMaterial({
      color: mint ? '#dcffeb' : '#ffe9ee', roughness: mint ? .12 : .045, metalness: 0,
      transmission: mint ? .92 : .96, ior: mint ? 1.35 : 1.46, thickness: height, attenuationColor: new THREE.Color(mint ? '#278a64' : '#d21d52'),
      attenuationDistance: mint ? 1.65 : 2.65, clearcoat: mint ? .45 : 1, clearcoatRoughness: mint ? .10 : .035, envMapIntensity: mint ? .8 : .92,
    });
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { gelPoses: { value: this.poses }, gelBounds: { value: this.bounds }, gelHeight: { value: height }, gelSoftness: { value: Number(mint) }, gelKnife: { value: this.knife }, gelBack: { value: this.backTarget.texture }, gelBackSize: { value: this.backSize } });
      shader.vertexShader = `attribute float gelPart; uniform vec4 gelPoses[48]; uniform float gelHeight; uniform float gelSoftness; uniform vec4 gelKnife;
        varying float vGelPart; varying vec3 vGelLocal; varying float vGelHeight;\n${deformation}` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec4 gelPose = gelPoses[int(gelPart + 0.5)];
        objectNormal = deformGelNormal(position, objectNormal, gelPose);`);
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vGelPart = gelPart; vGelLocal = position; vGelHeight = position.y * (1. - gelPose.w * .7);
        transformed = deformGel(transformed, gelPose);`);
      shader.fragmentShader = `uniform vec4 gelBounds[48]; uniform float gelHeight; uniform float gelSoftness; uniform vec4 gelKnife; uniform sampler2D gelBack; uniform vec2 gelBackSize;
        varying float vGelPart; varying vec3 vGelLocal; varying float vGelHeight;
        float gelDepth(vec3 direction, vec3 viewPosition) {
          vec4 back = texture2D(gelBack, gl_FragCoord.xy / gelBackSize);
          if (abs(back.a * 64.0 - (vGelPart + 1.0)) < .2) {
            vec3 front = (viewMatrix * vec4(back.xyz, 1.0)).xyz;
            return clamp(length(front + viewPosition), .035, 4.5);
          }
          vec4 b = gelBounds[int(vGelPart + 0.5)];
          vec3 lower = vec3(b.x, .015, b.y), upper = vec3(b.z, gelHeight + .155 + gelSoftness * .06, b.w);
          vec3 exitPoint = mix(lower, upper, step(vec3(0.0), direction));
          vec3 safeDirection = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), direction)) * max(abs(direction), vec3(.0001));
          vec3 distance = max(vec3(.025), (exitPoint - vGelLocal) / safeDirection);
          return clamp(min(distance.x, min(distance.y, distance.z)), .025, 3.5);
        }\n` + shader.fragmentShader;
      // Evaluate the narrow wire dent per pixel, so reflections follow its
      // continuous curve instead of revealing the surface triangulation.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (gelSoftness > .5 && gelKnife.w > 0.) {
          float v = clamp(vGelHeight / gelHeight, 0., 1.);
          float d = dot(vWorldPosition.xz, gelKnife.xy) - gelKnife.z;
          float indent = exp(-d * d * 30.) * gelKnife.w;
          vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
          worldNormal.y /= max(.5, vGelHeight < gelHeight ? 1. - 3. * indent * v * v / gelHeight : 1.);
          worldNormal.xz -= worldNormal.y * 60. * d * indent * gelKnife.xy * v * v * v;
          normal = normalize(mat3(viewMatrix) * worldNormal);
          nonPerturbedNormal = normal;
        }`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>', THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;', 'material.thickness = gelDepth(refract(-normalize(cameraPosition - vWorldPosition), inverseTransformDirection(normal, viewMatrix), 1.0 / ior), vViewPosition);'));
    };
    this.material.customProgramCacheKey = () => 'batched-jelly-soft-prism-v3';
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.frustumCulled = false;
    this.backMaterial = new THREE.ShaderMaterial({ side: THREE.BackSide, toneMapped: false,
      uniforms: { gelPoses: { value: this.poses }, gelHeight: { value: height }, gelSoftness: { value: Number(mint) }, gelKnife: { value: this.knife } },
      vertexShader: `attribute float gelPart; uniform vec4 gelPoses[48]; uniform float gelHeight; uniform float gelSoftness; uniform vec4 gelKnife; varying vec3 backWorld; varying float backPart; ${deformation}
        void main(){vec3 p=deformGel(position,gelPoses[int(gelPart+.5)]);backPart=gelPart;backWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(backWorld,1.);}`,
      fragmentShader: 'varying vec3 backWorld; varying float backPart; void main(){gl_FragColor=vec4(backWorld,(backPart+1.)/64.);}',
    });
    this.backMesh = new THREE.Mesh(this.geometry, this.backMaterial); this.backMesh.frustumCulled = false; this.backScene.add(this.backMesh);
  }
  rebuild(pieces: readonly Piece[]) {
    let offset = 0; this.origins.length = 0;
    pieces.forEach((piece, index) => {
      const origin = center(piece.polygon); this.origins.push(origin);
      const polygon = piece.polygon.map(p => ({ x: p.x - origin.x, z: p.z - origin.z }));
      const geometry = createGelSurface(polygon, origin, this.height, Number(this.mint));
      this.sizes[index] = Math.sqrt(area(polygon));
      const positions = geometry.attributes.position.array, normals = geometry.attributes.normal.array;
      const count = geometry.attributes.position.count;
      if (offset + count > CAPACITY) { geometry.dispose(); throw new Error('The jelly has too many edges. Reset for a fresh block.'); }
      this.positions.set(positions, offset * 3); this.normals.set(normals, offset * 3); this.indices.fill(index, offset, offset + count);
      this.bounds[index].set(Math.min(...polygon.map(p => p.x)), Math.min(...polygon.map(p => p.z)), Math.max(...polygon.map(p => p.x)), Math.max(...polygon.map(p => p.z)));
      offset += count; geometry.dispose();
    });
    for (const name of ['position', 'normal', 'gelPart']) {
      const attribute = this.geometry.attributes[name] as THREE.BufferAttribute;
      attribute.clearUpdateRanges(); attribute.addUpdateRange(0, offset * attribute.itemSize); attribute.needsUpdate = true;
    }
    this.vertices = offset; this.geometry.setDrawRange(0, offset); this.rebuilds++;
  }
  update(pieces: readonly Piece[], reduced: boolean) {
    pieces.forEach((piece, index) => {
      const moving = !reduced && piece.age < 1.8, size = Math.min(1, this.sizes[index]);
      const frequency = this.mint ? 12 + (piece.id % 5) * .7 + 2 / Math.max(.3, this.sizes[index]) : 15;
      const wobble = moving ? Math.sin(piece.age * frequency) * Math.exp(-piece.age * (this.mint ? 3.8 : 4.4)) * (this.mint ? .075 * size : .047) : 0;
      const sway = moving && this.mint ? Math.sin(piece.age * frequency * .8) * Math.exp(-piece.age * 3.4) * .075 * size * (piece.id % 2 ? 1 : -1) : 0;
      this.poses[index].set(this.origins[index].x + piece.offset.x, this.origins[index].z + piece.offset.z, sway, wobble);
    });
  }
  resize(width: number, height: number) { this.backSize.set(width, height); this.backTarget.setSize(width, height); }
  renderBack(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const target = renderer.getRenderTarget(), color = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.backTarget); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(this.backScene, camera);
    renderer.setRenderTarget(target); renderer.setClearColor(color, alpha);
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); this.backMaterial.dispose(); this.backTarget.dispose(); }
}
