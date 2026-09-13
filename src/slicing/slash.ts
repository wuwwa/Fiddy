const CAPACITY = 48, PARTICLES = 16, LIFETIME = 170, MAX_LENGTH = 260;
type Sample = { x: number; y: number; time: number; width: number };
type Fleck = { x: number; y: number; vx: number; vy: number; born: number; life: number; radius: number };

/** A short-lived blade ribbon and a fixed pool of small cut droplets. */
export class SlashTrail {
  private readonly samples: Sample[] = Array.from({ length: CAPACITY }, () => ({ x: 0, y: 0, time: 0, width: 0 }));
  readonly particles: Fleck[] = Array.from({ length: PARTICLES }, () => ({ x: 0, y: 0, vx: 0, vy: 0, born: -Infinity, life: 230, radius: 0 }));
  readonly edges = new Float32Array(CAPACITY * 4);
  private first = 0;
  private size = 0;
  private nextParticle = 0;
  count = 0;
  opacity = 0;
  active = false;
  private sample(index: number) { return this.samples[(this.first + index) % CAPACITY]; }
  private push(x: number, y: number, time: number, width: number) {
    if (this.size === CAPACITY) { this.first = (this.first + 1) % CAPACITY; this.size--; }
    Object.assign(this.sample(this.size++), { x, y, time, width });
  }
  begin(x: number, y: number, time: number) {
    this.first = this.size = this.count = 0; this.opacity = 0;
    this.push(x, y, time, 2);
  }
  add(x: number, y: number, time: number) {
    if (!Number.isFinite(x + y + time)) return;
    if (!this.size) { this.begin(x, y, time); return; }
    const last = this.sample(this.size - 1), dx = x - last.x, dy = y - last.y, distance = Math.hypot(dx, dy);
    if (distance < .75) return; // Holding still never renews the trail.
    const elapsed = Math.max(4, time - last.time), width = Math.min(7, 2 + distance / elapsed * 1.3);
    const steps = Math.min(CAPACITY - 1, Math.ceil(distance / 8));
    const startX = last.x, startY = last.y, startTime = Math.max(last.time, time - 100), startWidth = last.width;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.push(startX + dx * t, startY + dy * t, startTime + (time - startTime) * t, startWidth + (width - startWidth) * t);
    }
  }
  burst(x: number, y: number, dx: number, dy: number, time: number) {
    const length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
    for (let i = 0; i < 6; i++) {
      const sign = i % 2 ? 1 : -1, speed = 45 + (i % 3) * 24;
      const fleck = this.particles[this.nextParticle++ % PARTICLES];
      Object.assign(fleck, { x, y, vx: nx * sign * speed + dx / length * (i - 2) * 9, vy: ny * sign * speed + dy / length * (i - 2) * 9 - 22, born: time, life: 190 + i * 13, radius: 1.1 + (i % 3) * .45 });
    }
  }
  update(now: number, reduced = false) {
    const lifetime = reduced ? 70 : LIFETIME, maxLength = reduced ? 100 : MAX_LENGTH;
    while (this.size > 1 && now - this.sample(0).time > lifetime) { this.first = (this.first + 1) % CAPACITY; this.size--; }
    let length = 0;
    for (let i = this.size - 1; i > 0; i--) {
      const a = this.sample(i), b = this.sample(i - 1); length += Math.hypot(a.x - b.x, a.y - b.y);
      if (length > maxLength) { this.first = (this.first + i) % CAPACITY; this.size -= i; break; }
    }
    const newest = this.size ? this.sample(this.size - 1) : null;
    this.opacity = newest ? Math.max(0, 1 - (now - newest.time) / lifetime) ** 1.4 : 0;
    this.count = this.opacity > .01 && this.size > 2 ? this.size : 0;
    for (let i = 0; i < this.count; i++) {
      const p = this.sample(i), before = this.sample(Math.max(0, i - 1)), after = this.sample(Math.min(this.count - 1, i + 1));
      const dx = after.x - before.x, dy = after.y - before.y, inverse = 1 / (Math.hypot(dx, dy) || 1), t = i / (this.count - 1);
      const taper = 1.8 * t ** .8 * (1 - t) ** .25;
      const width = (reduced ? Math.min(2, p.width) : p.width) * taper * Math.sqrt(this.opacity);
      const nx = -dy * inverse * width, ny = dx * inverse * width, index = i * 4;
      this.edges[index] = p.x + nx; this.edges[index + 1] = p.y + ny;
      this.edges[index + 2] = p.x - nx; this.edges[index + 3] = p.y - ny;
    }
    this.active = this.count > 0 || (!reduced && this.particles.some(p => now - p.born < p.life));
    return this.active;
  }
  clear() {
    this.first = this.size = this.count = 0; this.opacity = 0; this.active = false;
    for (const particle of this.particles) particle.born = -Infinity;
  }
}

function ribbon(ctx: CanvasRenderingContext2D, trail: SlashTrail, scale: number) {
  const edges = trail.edges, count = trail.count;
  const coordinate = (i: number, side: number, axis: number) => {
    const a = edges[i * 4 + axis], b = edges[i * 4 + 2 + axis];
    return (a + b) * .5 + (side ? b - a : a - b) * .5 * scale;
  };
  ctx.beginPath(); ctx.moveTo(edges[0], edges[1]);
  for (const side of [0, 1]) {
    for (let step = 1; step < count; step++) {
      const i = side ? count - 1 - step : step, next = side ? Math.max(0, i - 1) : Math.min(count - 1, i + 1);
      const x = coordinate(i, side, 0), y = coordinate(i, side, 1);
      ctx.quadraticCurveTo(x, y, (x + coordinate(next, side, 0)) * .5, (y + coordinate(next, side, 1)) * .5);
    }
  }
  ctx.closePath(); ctx.fill();
}

export function drawSlash(ctx: CanvasRenderingContext2D, trail: SlashTrail, tint: string, now: number, reduced: boolean) {
  if (trail.count > 2) {
    ctx.globalAlpha = trail.opacity * .28; ctx.fillStyle = tint;
    ctx.shadowColor = tint; ctx.shadowBlur = reduced ? 0 : 9;
    ribbon(ctx, trail, 1.65);
    ctx.shadowBlur = 0; ctx.globalAlpha = trail.opacity * .96; ctx.fillStyle = '#fffff8';
    ribbon(ctx, trail, 1);
  }
  if (!reduced) for (const p of trail.particles) {
    const age = now - p.born;
    if (age < 0 || age >= p.life) continue;
    const t = age / 1000, fade = (1 - age / p.life) ** 2;
    ctx.globalAlpha = fade * .8; ctx.fillStyle = tint;
    ctx.beginPath(); ctx.ellipse(p.x + p.vx * t, p.y + p.vy * t + 130 * t * t, p.radius * fade, p.radius * fade * 1.4, Math.atan2(p.vy, p.vx), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}
