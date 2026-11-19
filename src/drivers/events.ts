// Event pulses (SPEC § Map › Event pulses): an event pulses at its location
// while the time cursor is inside its year range, then leaves a short fading
// echo. Colour by driver; uncertainty styled as everywhere else.
import type { GeoProjection } from 'd3-geo';
import type { Confidence, HistEvent } from '../data/types';
import { NEEDS_SOURCE } from '../data/types';
import { BASEMAP } from '../theme';
import type { LayerState } from './groups';
import { driverColour } from './groups';

const ECHO_YEARS = 6;
const SVG = 'http://www.w3.org/2000/svg';

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const ALPHA: Record<Confidence, number> = { high: 1, med: 0.85, low: 0.5, contested: 0.55 };

interface Shown { e: HistEvent; x: number; y: number; active: boolean; fade: number }

export class EventLayer {
  private shown: Shown[] = [];
  selected: string | null = null;
  /** Narrow screens: no title labels (tap a pulse for its card). */
  compact = false;

  constructor(private events: readonly HistEvent[], private layers: LayerState) {}

  /** Events to draw at a year: active ones, plus fading echoes just after. */
  private visible(projection: GeoProjection, year: number): Shown[] {
    const out: Shown[] = [];
    for (const e of this.events) {
      if (!this.layers.showsDriver(e.driver)) continue;
      const end = e.year_end + 1; // inclusive of the whole final year
      const active = year >= e.year_start && year < end;
      const fade = active ? 1 : year >= end && year < end + ECHO_YEARS ? 1 - (year - end) / ECHO_YEARS : 0;
      if (fade <= 0) continue;
      const p = projection([e.lon, e.lat]);
      if (p) out.push({ e, x: p[0], y: p[1], active, fade });
    }
    return out;
  }

  /** True when something is pulsing, so the caller keeps animating. */
  hasActive(projection: GeoProjection, year: number) {
    return this.visible(projection, year).some((s) => s.active);
  }

  draw(ctx: CanvasRenderingContext2D, projection: GeoProjection, year: number, now: number) {
    this.shown = this.visible(projection, year);
    for (const s of this.shown) {
      const hex = driverColour(s.e.driver);
      const a = ALPHA[s.e.confidence] * s.fade;
      ctx.save();
      if (s.active) {
        // Three staggered rings expanding over ~2.4 s.
        for (let k = 0; k < 3; k++) {
          const t = ((now / 2400 + k / 3) % 1);
          const r = 7 + t * 26;
          ctx.strokeStyle = rgba(hex, a * (1 - t) * 0.9);
          ctx.lineWidth = 2;
          if (s.e.confidence === 'contested') ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // Core glyph: a diamond, so events read differently from nation discs.
      const r = s.active ? 6 : 4.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y); ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - r, s.y); ctx.closePath();
      if (s.e.confidence === 'contested') {
        ctx.fillStyle = rgba(hex, 0.2 * s.fade);
        ctx.strokeStyle = rgba(hex, 0.85 * s.fade);
        ctx.setLineDash([2.5, 2]);
        ctx.lineWidth = 1.3;
        ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = rgba(hex, a);
        ctx.strokeStyle = rgba(BASEMAP.paper, s.fade);
        ctx.lineWidth = 1.4;
        ctx.fill(); ctx.stroke();
      }
      if (s.e.driver === 'war') {
        // War: vermilion hatch across the glyph.
        ctx.save(); ctx.clip();
        ctx.strokeStyle = rgba(BASEMAP.paper, 0.8 * s.fade); ctx.lineWidth = 1; ctx.setLineDash([]);
        for (let d = -r * 2; d < r * 2; d += 3) { ctx.beginPath(); ctx.moveTo(s.x + d, s.y - r); ctx.lineTo(s.x + d + r * 2, s.y + r); ctx.stroke(); }
        ctx.restore();
      }
      if (s.e.source === NEEDS_SOURCE) {
        ctx.setLineDash([2.5, 2.5]);
        ctx.strokeStyle = rgba(BASEMAP.sepia, s.fade);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2); ctx.stroke();
      }
      if (this.selected === s.e.id) {
        ctx.setLineDash([]);
        ctx.strokeStyle = BASEMAP.sepia; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 9, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Short italic labels for active events, avoiding each other and the edges. */
  drawLabels(g: SVGGElement, width: number, height: number) {
    const placed: [number, number, number, number][] = [];
    const nodes: SVGTextElement[] = [];
    if (this.compact) return g.replaceChildren();
    for (const s of this.shown.filter((x) => x.active)) {
      const text = s.e.title.length > 34 ? `${s.e.title.slice(0, 32).trimEnd()}…` : s.e.title;
      const w = text.length * 5.6 + 4;
      const h = 13;
      for (const [cx, cy, anchor] of [[s.x, s.y + 22, 'middle'], [s.x, s.y - 22, 'middle'], [s.x + 14, s.y + 14, 'start'], [s.x - 14, s.y + 14, 'end']] as const) {
        const x0 = anchor === 'start' ? cx : anchor === 'end' ? cx - w : cx - w / 2;
        const box: [number, number, number, number] = [x0, cy - h / 2, x0 + w, cy + h / 2];
        if (box[0] < 2 || box[2] > width - 2 || box[1] < 2 || box[3] > height - 2) continue;
        if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
        placed.push(box);
        const t = document.createElementNS(SVG, 'text');
        t.setAttribute('x', cx.toFixed(1));
        t.setAttribute('y', cy.toFixed(1));
        t.setAttribute('text-anchor', anchor);
        t.setAttribute('class', `event-label conf-${s.e.confidence}`);
        t.setAttribute('fill', driverColour(s.e.driver));
        t.textContent = text;
        nodes.push(t);
        break;
      }
    }
    g.replaceChildren(...nodes);
  }

  hit(x: number, y: number, reach = 22): { id: string; d: number } | null {
    let best: { id: string; d: number } | null = null;
    for (const s of this.shown) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= reach && (!best || d < best.d)) best = { id: s.e.id, d };
    }
    return best;
  }
}
