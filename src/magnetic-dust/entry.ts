import type { ToyContext } from '../toys/types';
import { mountField } from '../fields/surface';
import { MagneticField, type Polarity } from './model';
import '../fields/surface.css';
import './style.css';

export async function mount(host: HTMLElement, context: ToyContext) {
  if (context.signal.aborted) return null;
  let polarity: Polarity = 'attract';
  const controls = document.createElement('div');
  controls.className = 'magnet-polarity'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Magnet polarity');
  const buttons = (['attract', 'repel'] as const).map(mode => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.mode = mode;
    button.textContent = mode === 'attract' ? 'Attract' : 'Repel';
    controls.append(button); return button;
  });
  let paused = context.preferences.paused, disposed = false;
  function update() {
    buttons.forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.mode === polarity)); button.disabled = paused; });
    controls.dataset.polarity = polarity;
  }
  const choose = (event: Event) => {
    if (paused || disposed) return;
    const button = (event.target as HTMLElement).closest('button');
    if (button?.dataset.mode) { polarity = button.dataset.mode as Polarity; update(); }
  };
  controls.addEventListener('click', choose); update();
  const fieldController = mountField(host, context, 'Magnetic Dust. Hold to reveal magnetic field lines. Drag to bend the chains; release to let them relax.', canvas => {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Magnetic Dust needs a browser with Canvas support.');
    const field = new MagneticField(1, 1);
    const paper = document.createElement('canvas');
    const paperContext = paper.getContext('2d')!;
    const lengths = new Float32Array(field.count * 2);
    const tones = new Uint8Array(field.count);
    // Directional light on graphite; the material stays the same in either mode.
    const colors = ['#30322f', '#444641', '#595b53', '#75776c', '#999b8e', '#bfc0b2'];
    let width = 1, height = 1, ratio = 1;
    return {
      resize(w, h, dpr) {
        if (w === width && h === height && ratio === dpr) return;
        width = w; height = h; ratio = dpr;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        field.resize(w, h);
        paper.width = canvas.width; paper.height = canvas.height;
        paperContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        const light = paperContext.createLinearGradient(0, 0, w * .8, h);
        light.addColorStop(0, '#f1eee6'); light.addColorStop(.55, '#e9e6dc'); light.addColorStop(1, '#dedbd0');
        paperContext.fillStyle = light; paperContext.fillRect(0, 0, w, h);
        // Cache a fine, deterministic paper texture; never animate the substrate.
        let seed = 91;
        paperContext.fillStyle = '#514b3b'; paperContext.globalAlpha = .035;
        for (let i = 0; i < w * h / 15; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const x = seed / 4294967296 * w;
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const y = seed / 4294967296 * h;
          paperContext.fillRect(x, y, .65, .65);
        }
        paperContext.globalAlpha = 1;
      },
      reset() { field.reset(); },
      draw(dt, _time, pointer, reduced) {
        field.polarity = polarity; field.step(dt, pointer, reduced);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.drawImage(paper, 0, 0, width, height);
        const scale = Math.min(1.15, Math.max(.65, field.radius / 230));
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < field.count; i++) {
          const index = i * 2, angle = field.directions[i], grain = field.grain[(i + 53) % field.count];
          const half = (.28 + grain * grain * 1.35) * scale;
          lengths[index] = Math.cos(angle) * half; lengths[index + 1] = Math.sin(angle) * half;
          // Most surfaces absorb light. A few facets catch it as the filings turn.
          const facet = Math.pow(Math.max(0, Math.cos(angle * 2 + 1.1)), 8);
          tones[i] = Math.min(5, Math.floor(grain * 2 + facet * 3.8));
          const x = field.position[index] + .5 * scale, y = field.position[index + 1] + .8 * scale;
          ctx.moveTo(x - lengths[index], y - lengths[index + 1]); ctx.lineTo(x + lengths[index], y + lengths[index + 1]);
        }
        ctx.lineWidth = 1.7 * scale; ctx.strokeStyle = '#4a45372b'; ctx.stroke();
        for (let tone = 0; tone < colors.length; tone++) {
          ctx.strokeStyle = colors[tone]; ctx.lineWidth = (tone < 2 ? 1.05 : .8) * scale;
          ctx.beginPath();
          for (let i = 0; i < field.count; i++) {
            if (tones[i] !== tone) continue;
            const index = i * 2, x = field.position[index], y = field.position[index + 1];
            const dx = lengths[index], dy = lengths[index + 1];
            ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy);
          }
          ctx.stroke();
        }
        if (import.meta.env.DEV) canvas.dataset.dust = JSON.stringify({ grains: field.count, energy: field.velocity.reduce((sum, value) => sum + Math.abs(value), 0) });
        if (pointer.inside && !pointer.keyboard) {
          const x = pointer.x * width, y = pointer.y * height, radius = pointer.down ? 12 : 4;
          ctx.strokeStyle = '#333b3290'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
        }
      },
      dispose() { canvas.width = canvas.height = paper.width = paper.height = 0; },
    };
  });
  if (!fieldController) { controls.removeEventListener('click', choose); return null; }
  host.append(controls);
  function dispose() {
    if (disposed) return; disposed = true;
    controls.removeEventListener('click', choose); controls.remove();
    context.signal.removeEventListener('abort', dispose); fieldController!.dispose();
  }
  context.signal.addEventListener('abort', dispose, { once: true });
  return {
    reset() { if (disposed) return; polarity = 'attract'; update(); fieldController.reset(); },
    setPaused(value: boolean) { if (disposed) return; paused = value; update(); fieldController.setPaused?.(value); },
    setReducedMotion(value: boolean) { fieldController.setReducedMotion?.(value); },
    dispose,
  };
}
