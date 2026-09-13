import type { ToyContext } from '../toys/types';
import { mountField, type FieldEngine } from '../fields/surface';
import { TideField } from './model';
import '../fields/surface.css';

export async function mount(host: HTMLElement, context: ToyContext) {
  return mountField(host, context, 'ASCII Tide. Move to disturb the tide; hold to gather a vortex.', canvas => {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('ASCII Tide needs a browser with Canvas support.');
    const glyphs = '0123456789:.*+=/';
    const atlas = document.createElement('canvas');
    const cell = 36;
    atlas.width = cell * glyphs.length; atlas.height = cell * 6;
    const ink = atlas.getContext('2d')!;
    ink.font = '24px Consolas, monospace'; ink.textAlign = 'center'; ink.textBaseline = 'middle';
    ['#153f3f', '#22685b', '#35987b', '#58cfa3', '#96efd1', '#dbfff0'].forEach((color, row) => {
      ink.fillStyle = color; ink.shadowColor = color; ink.shadowBlur = row === 5 ? 7 : 1;
      [...glyphs].forEach((glyph, col) => ink.fillText(glyph, col * cell + cell / 2, row * cell + cell / 2));
    });
    let field = new TideField(1, 1), width = 1, height = 1, ratio = 1;
    let glow: CanvasGradient;
    const engine: FieldEngine = {
      resize(w, h, dpr) {
        if (width === w && height === h && ratio === dpr) return;
        field = field.resized(w, h);
        width = w; height = h; ratio = dpr;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        glow = ctx.createRadialGradient(w * .48, h * .5, 0, w * .48, h * .5, Math.max(w, h) * .7);
        glow.addColorStop(0, '#08221f'); glow.addColorStop(1, '#030d0d');
      },
      reset() { field.reset(); },
      draw(dt, _time, pointer, reduced) {
        field.step(dt, pointer, reduced);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.globalAlpha = 1; ctx.fillStyle = '#030d0d'; ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
        const phase = field.phase;
        for (let row = 0; row < field.rows; row++) {
          const v = row / (field.rows - 1);
          for (let col = 0; col < field.columns; col++) {
            const u = col / (field.columns - 1), node = row * field.columns + col, i = node * 2;
            const x = field.positions[i] + field.offsets[i], y = field.positions[i + 1] + field.offsets[i + 1] - field.elevation[node];
            const wave = Math.sin(u * 8.5 + v * 4.8 - phase);
            const crest = Math.pow(.5 + .5 * Math.cos(v * 17 + wave * 2.5 - phase), 5);
            const disturbance = Math.min(1, Math.hypot(field.offsets[i], field.offsets[i + 1]) / 40);
            const edge = Math.min(1, v * 5, (1 - v) * 5);
            const above = field.elevation[Math.max(0, row - 1) * field.columns + col];
            const below = field.elevation[Math.min(field.rows - 1, row + 1) * field.columns + col];
            const slope = (below - above) / (2 * height / field.rows);
            const ripple = Math.min(.55, Math.abs(slope) * 1.2 + Math.abs(field.elevation[node]) * .015);
            const light = Math.min(1, crest * .75 + disturbance * .55 + ripple);
            const tone = Math.min(5, Math.floor(light * 5.99));
            // A stable character identity keeps movement legible instead of flickering noise.
            const hash = ((Math.imul(col + 17, 374761393) ^ Math.imul(row + 31, 668265263)) >>> 0) / 4294967296;
            const glyph = Math.floor(hash * glyphs.length + crest * 2) % glyphs.length;
            const margin = Math.min(1, Math.max(.15, y / 115), Math.max(.15, (height - y) / 150));
            ctx.globalAlpha = (.24 + light * .76) * (.35 + edge * .65) * margin;
            const size = 13 + v * 5 + Math.min(1.5, ripple * 2);
            ctx.drawImage(atlas, glyph * cell, tone * cell, cell, cell, x - size / 2, y - size / 2, size, size);
          }
        }
        ctx.globalAlpha = 1;
      },
      dispose() { atlas.width = atlas.height = 0; canvas.width = canvas.height = 0; },
    };
    return engine;
  });
}
