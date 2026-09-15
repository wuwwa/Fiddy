import * as THREE from 'three/webgpu';

export interface BonusCharacterState {
  active: boolean;
  amount: number;
  phase: string;
  age: number;
  delight: number;
  grabbed: boolean;
  pressure: number;
  speed: number;
  impact: number;
  target: THREE.Vector3;
  reducedMotion: boolean;
}

const clamp = THREE.MathUtils.clamp;
const ease = (a: number, b: number, value: number) => THREE.MathUtils.smoothstep(value, a, b);

/** An expressive, surface-projected face. Nothing is attached to a rigid world-space head. */
export function createBonusCharacter(scene: THREE.Scene, camera: THREE.Camera, jelly: THREE.Mesh) {
  const group = new THREE.Group(); group.name = 'Jelly companion'; group.visible = false; scene.add(group);
  const point = new THREE.Vector3(), front = new THREE.Vector3(), targetPoint = new THREE.Vector3();
  const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
  const xs: number[] = [], ys: number[] = [], depths = new Float64Array(9);
  let centerX = 0, centerY = 0, width = 1, height = 1;
  let time = 0, impactAge = 10, wasActive = false;
  let gazeX = 0, gazeY = 0, eyeOpening = 0, happiness = 0, surprise = 0;
  let expression = 'sleeping', attached = false, disposed = false;

  const makeLayer = (color: string, opacity = 1, order = 12) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(3072), 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions); geometry.setDrawRange(0, 0);
    // Projected ink should remain legible through the translucent gel, including a tumble.
    const material = new THREE.MeshBasicNodeMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = order; group.add(mesh);
    let count = 0;
    const vertex = (x: number, y: number) => {
      const column = x < 0 ? 0 : 1, row = y < 0 ? 0 : 1;
      const u = clamp(x < 0 ? (x + 0.56) / 0.56 : x / 0.56, 0, 1);
      const v = clamp(y < 0 ? (y + 0.44) / 0.44 : y / 0.4, 0, 1);
      const a = depths[row * 3 + column], b = depths[row * 3 + column + 1];
      const c = depths[(row + 1) * 3 + column], d = depths[(row + 1) * 3 + column + 1];
      const z = THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
      point.set(centerX + x * width, centerY + y * height, z).unproject(camera).addScaledVector(front, 0.012);
      positions.setXYZ(count++, point.x, point.y, point.z);
    };
    return {
      material,
      reset() { count = 0; },
      ellipse(x: number, y: number, rx: number, ry: number, rotation = 0) {
        const cos = Math.cos(rotation), sin = Math.sin(rotation), segments = 24;
        for (let i = 0; i < segments; i++) {
          const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2;
          vertex(x, y);
          vertex(x + Math.cos(a) * rx * cos - Math.sin(a) * ry * sin, y + Math.cos(a) * rx * sin + Math.sin(a) * ry * cos);
          vertex(x + Math.cos(b) * rx * cos - Math.sin(b) * ry * sin, y + Math.cos(b) * rx * sin + Math.sin(b) * ry * cos);
        }
      },
      curve(x: number, y: number, radius: number, bend: number, weight: number, tilt = 0) {
        const segments = 20;
        for (let i = 0; i < segments; i++) {
          const t0 = i / segments, t1 = (i + 1) / segments;
          const ax = x + (t0 * 2 - 1) * radius, bx = x + (t1 * 2 - 1) * radius;
          const ay = y + Math.sin(t0 * Math.PI) * bend + (t0 - 0.5) * tilt;
          const by = y + Math.sin(t1 * Math.PI) * bend + (t1 - 0.5) * tilt;
          const dx = 2 * radius, ady = Math.cos(t0 * Math.PI) * Math.PI * bend + tilt, bdy = Math.cos(t1 * Math.PI) * Math.PI * bend + tilt;
          const al = Math.max(0.0001, Math.hypot(dx, ady)), bl = Math.max(0.0001, Math.hypot(dx, bdy));
          const anx = -ady / al * weight, any = dx / al * weight, bnx = -bdy / bl * weight, bny = dx / bl * weight;
          vertex(ax + anx, ay + any); vertex(ax - anx, ay - any); vertex(bx + bnx, by + bny);
          vertex(ax - anx, ay - any); vertex(bx - bnx, by - bny); vertex(bx + bnx, by + bny);
        }
        this.ellipse(x - radius, y - tilt / 2, weight, weight);
        this.ellipse(x + radius, y + tilt / 2, weight, weight);
      },
      finish() { geometry.setDrawRange(0, count); positions.needsUpdate = true; },
      dispose() { geometry.dispose(); material.dispose(); },
    };
  };
  const ink = makeLayer('#16455e');
  const layers = [ink];

  const attach = () => {
    // Trim the silhouette so one stretched fingertip cannot pull the whole face off the belly.
    const position = jelly.geometry.getAttribute('position');
    xs.length = ys.length = 0;
    jelly.updateWorldMatrix(true, false); camera.updateMatrixWorld();
    const stride = Math.max(1, Math.floor(position.count / 192));
    for (let i = 0; i < position.count; i += stride) {
      point.fromBufferAttribute(position, i).applyMatrix4(jelly.matrixWorld).project(camera);
      xs.push(point.x); ys.push(point.y);
    }
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const percentile = (values: number[], p: number) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
    centerX = (percentile(xs, 0.2) + percentile(xs, 0.8)) / 2;
    centerY = (percentile(ys, 0.2) + percentile(ys, 0.8)) / 2;
    width = Math.max(0.001, (percentile(xs, 0.9) - percentile(xs, 0.1)) * 0.91);
    height = Math.max(0.001, (percentile(ys, 0.9) - percentile(ys, 0.1)) * 0.86);
    centerY -= height * 0.03;
    camera.getWorldDirection(front).negate();
    pointer.set(centerX, centerY); raycaster.setFromCamera(pointer, camera);
    const middle = raycaster.intersectObject(jelly, false)[0];
    if (!middle) return false;
    point.copy(middle.point).project(camera); const middleDepth = point.z;
    for (let attempt = 0; attempt < 3; attempt++) {
      let hits = 0;
      for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
        pointer.set(centerX + (column - 1) * 0.56 * width, centerY + [-0.44, 0, 0.4][row] * height);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(jelly, false)[0];
        if (hit) { point.copy(hit.point).project(camera); depths[row * 3 + column] = point.z; hits++; }
        else depths[row * 3 + column] = middleDepth;
      }
      if (hits >= 5) return true;
      // A diagonal ribbon still has a face; reduce its footprint to fit the belly.
      width *= 0.78; height *= 0.78;
    }
    return false;
  };

  return {
    update(elapsed: number, state: BonusCharacterState) {
      if (disposed) return;
      const dt = Number.isFinite(elapsed) ? clamp(elapsed, 0, 0.05) : 0;
      if (state.active && !wasActive) { time = 0; impactAge = 10; eyeOpening = happiness = surprise = gazeX = gazeY = 0; }
      wasActive = state.active;
      group.visible = state.active && state.amount > 0.12;
      if (!group.visible) { attached = false; expression = 'sleeping'; return; }
      time += dt; impactAge += dt;
      if (state.impact > 2.2) impactAge = 0;
      attached = attach(); group.visible = attached;
      if (!attached) return;

      const emerging = ease(0.12, 0.45, state.amount), awake = ease(0.25, 0.85, state.amount);
      const sleepy = state.phase === 'farewell' || state.phase === 'returning';
      const delighted = !sleepy && state.delight > 0.45;
      const flying = !state.grabbed && state.speed > 2.1;
      const squeezed = state.grabbed && state.pressure > 0.15;
      expression = squeezed ? 'squished' : state.grabbed ? 'curious' : flying ? 'surprised' : sleepy ? 'sleepy' : delighted ? 'happy' : awake < 0.9 ? 'waking' : 'content';
      const blinkPhase = time % 4.6;
      const blink = !state.reducedMotion && !delighted && blinkPhase > 3.55 && blinkPhase < 3.76
        ? Math.sin((blinkPhase - 3.55) / 0.21 * Math.PI) : 0;
      const landing = !state.reducedMotion && impactAge < 0.16 ? 1 - impactAge / 0.16 : 0;
      const joyTarget = sleepy ? 0 : state.delight;
      const curious = !state.reducedMotion ? Math.max(0, Math.sin(time * 0.84 + 0.4)) ** 8 * 0.18 : 0;
      const openingTarget = awake * (squeezed ? 0.35 : flying ? 1.12 : state.grabbed ? 0.94 : sleepy ? 0.08 : delighted ? 0.04 : 0.58 + curious) * (1 - Math.max(blink, landing) * 0.97);
      const surpriseTarget = flying ? 1 : state.grabbed && !squeezed ? 0.35 : 0;
      const blend = state.reducedMotion ? 1 : 1 - Math.exp(-dt * 19);
      eyeOpening += (openingTarget - eyeOpening) * blend;
      happiness += (joyTarget - happiness) * blend;
      surprise += (surpriseTarget - surprise) * blend;
      targetPoint.copy(state.target).project(camera);
      const gazeBlend = state.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
      gazeX += (clamp((targetPoint.x - centerX) / width, -1, 1) * 0.006 - gazeX) * gazeBlend;
      gazeY += (clamp((targetPoint.y - centerY) / height, -1, 1) * 0.005 - gazeY) * gazeBlend;
      if (sleepy || delighted) { gazeX *= 1 - blend; gazeY *= 1 - blend; }
      ink.material.opacity = emerging;
      layers.forEach(layer => layer.reset());

      for (const side of [-1, 1]) {
        // Two small ink marks carry the expression. No eyeshine, cheeks or mouth.
        const eyeX = side * 0.20 + gazeX, eyeY = 0.04 + gazeY;
        const radius = 0.061 * (0.8 + 0.2 * eyeOpening) * (1 - surprise * 0.30);
        const bend = 0.036 * happiness - 0.006 * (1 - happiness);
        const tilt = side * (-0.021 * (1 - happiness) + (squeezed ? 0.035 : 0));
        ink.curve(eyeX, eyeY, radius, bend, 0.009 + surprise * 0.007, tilt);
      }
      layers.forEach(layer => layer.finish());
    },
    diagnostics() { return { visible: group.visible, attached, expression, eyeOpening, happiness, gaze: { x: gazeX, y: gazeY } }; },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent(); layers.forEach(layer => layer.dispose());
    },
  };
}
