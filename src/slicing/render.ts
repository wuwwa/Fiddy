import * as THREE from 'three';
import { BatchedGel } from './gel';
import { GelInclusions } from './inclusions';
import { CuttingWire } from './wire';
import { MAX_PIECES, type SliceModel, type SliceKind } from './model';
import type { CutLine, KnifePress } from './knife';
import type { ToyTheme } from '../toys/types';

export class SliceRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
  readonly gel: BatchedGel;
  readonly height: number;
  private readonly inclusions: GelInclusions;
  private readonly wire = new CuttingWire();
  private readonly shadows: THREE.InstancedMesh;
  private readonly shadowMatrix = new THREE.Object3D();
  private readonly resources: { dispose(): void }[] = [];
  private environment: THREE.WebGLRenderTarget | null = null;
  private disposed = false;
  private pixelRatio = 1;
  private width = 1;
  private h = 1;
  private slowFrames = 0;
  renderMs = 0;
  constructor(readonly canvas: HTMLCanvasElement, kind: SliceKind, theme: ToyTheme) {
    this.height = kind === 'slab' ? 1.02 : 1.22;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.info.autoReset = false;
    this.scene.background = new THREE.Color(theme.background);
    this.gel = new BatchedGel(this.height, kind === 'prism'); this.scene.add(this.gel.mesh);
    this.inclusions = new GelInclusions(this.gel, kind === 'prism'); this.scene.add(this.inclusions.mesh);
    const floorGeometry = new THREE.PlaneGeometry(100, 100), floorMaterial = new THREE.MeshBasicMaterial({ color: theme.background, toneMapped: false });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -.045; this.scene.add(floor);
    this.resources.push(floorGeometry, floorMaterial);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d')!, gradient = ctx.createRadialGradient(64, 64, 15, 64, 64, 63);
    gradient.addColorStop(0, '#ffffffbb'); gradient.addColorStop(.55, '#ffffff55'); gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas), shadowGeometry = new THREE.PlaneGeometry(1, 1);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, color: theme.foreground, transparent: true, opacity: .24, depthWrite: false, toneMapped: false });
    this.shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, MAX_PIECES); this.shadows.frustumCulled = false;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.shadows); this.resources.push(shadowTexture, shadowGeometry, shadowMaterial);
    this.scene.add(this.wire.mesh);
    const key = new THREE.DirectionalLight('#fff9ec', 2); key.position.set(-4, 6, 4);
    const fill = new THREE.DirectionalLight('#f2f9ff', .85); fill.position.set(4, 3, -3);
    this.scene.add(key, fill, new THREE.HemisphereLight('#fff8ed', '#b6a7a1', .5));
    try { this.createEnvironment(); } catch (error) { this.dispose(); throw error; }
  }
  private createEnvironment() {
    const studio = new THREE.Scene(), generator = new THREE.PMREMGenerator(this.renderer);
    const room = new THREE.Mesh(new THREE.SphereGeometry(18, 20, 12), new THREE.MeshBasicMaterial({ color: '#34303b', side: THREE.BackSide })); studio.add(room);
    const textureCanvas = document.createElement('canvas'); textureCanvas.width = textureCanvas.height = 128;
    const ctx = textureCanvas.getContext('2d')!; ctx.filter = 'blur(3px)'; ctx.fillStyle = '#ffffff'; ctx.fillRect(12, 10, 104, 108);
    const texture = new THREE.CanvasTexture(textureCanvas);
    const panel = (x: number, y: number, z: number, w: number, h: number, intensity: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color('white').multiplyScalar(intensity), map: texture, transparent: true, side: THREE.DoubleSide }));
      mesh.position.set(x, y, z); mesh.lookAt(0, .4, 0); studio.add(mesh);
    };
    panel(-5, 7, -3.5, 2.3, 4.2, 5); panel(-4, 4, 5, 2.2, 5, 6); panel(5, 2.5, 4, 1.6, 4, 4); panel(1, 7, 0, 4, 1, 2); panel(4, -4, 6, 5, 5, 3);
    try { this.environment = generator.fromScene(studio, .02); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .9; }
    finally { studio.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); texture.dispose(); generator.dispose(); }
  }
  resize(width: number, h: number) {
    this.width = width; this.h = h; this.pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio); this.renderer.setSize(width, h, false);
    this.gel.resize(this.canvas.width, this.canvas.height);
    const aspect = width / h; this.camera.aspect = aspect;
    this.camera.position.set(4.5, 5.6, 6.5).normalize().multiplyScalar(Math.max(10.7, 9.0 / aspect));
    this.camera.position.y += .45; this.camera.lookAt(0, .45, 0); this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }
  rebuild(model: SliceModel) { this.gel.rebuild(model.pieces); this.inclusions.rebuild(model); this.shadows.count = model.pieces.length; }
  update(model: SliceModel, press: KnifePress, aim: CutLine | null, reduced: boolean) {
    this.gel.update(model.pieces, reduced);
    model.pieces.forEach((piece, index) => {
      const origin = this.gel.origins[index], bounds = this.gel.bounds[index];
      this.shadowMatrix.position.set(origin.x + piece.offset.x, -.03 + index * .00001, origin.z + piece.offset.z);
      this.shadowMatrix.rotation.set(-Math.PI / 2, 0, 0); this.shadowMatrix.scale.set((bounds.z - bounds.x) * 1.45 + .16, (bounds.w - bounds.y) * 1.45 + .16, 1);
      this.shadowMatrix.updateMatrix(); this.shadows.setMatrixAt(index, this.shadowMatrix.matrix);
    });
    this.shadows.instanceMatrix.needsUpdate = true;
    const line = press.line ?? aim;
    this.wire.update(line, press, this.height, this.camera.position.length());
    this.gel.knife.w = 0;
    if (line) {
      const { angle, center } = line, nx = -Math.sin(angle), nz = Math.cos(angle);
      const depth = press.depth;
      this.gel.knife.set(nx, nz, nx * center.x + nz * center.z, press.phase === 'cutting' ? Math.sin(depth * Math.PI) * .075 : 0);
    }
    this.inclusions.update();
  }
  render(frameMs = 0) {
    const before = performance.now(); this.renderer.info.reset(); this.gel.renderBack(this.renderer, this.camera); this.renderer.render(this.scene, this.camera);
    this.renderMs = this.renderMs * .9 + (performance.now() - before) * .1;
    if (frameMs > 24 && frameMs < 200) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 50 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - .2); this.renderer.setPixelRatio(this.pixelRatio); this.renderer.setSize(this.width, this.h, false); this.slowFrames = 0;
      this.gel.resize(this.canvas.width, this.canvas.height);
    }
  }
  get diagnostics() { return { ...this.renderer.info.memory, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, renderMs: +this.renderMs.toFixed(2), pixelRatio: this.pixelRatio, rebuilds: this.gel.rebuilds, vertices: this.gel.vertices, programs: this.renderer.info.programs?.length }; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.gel.dispose(); this.wire.dispose(); this.inclusions.dispose(); this.shadows.dispose(); this.resources.forEach(resource => resource.dispose()); this.environment?.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.width = this.canvas.height = 0;
  }
}
