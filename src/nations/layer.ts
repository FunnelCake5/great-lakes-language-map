// Nation markers, trails and labels.
// Canvas for marks (redrawn every frame), SVG for small-caps labels.
// Uncertainty is always visible (rules 3–4):
//   high/med → solid · low → faint, soft-edged · contested → ghost (+ ghosted
//   alternatives joined by a dotted line) · needs_source → dashed outline.
import type { GeoProjection } from 'd3-geo';
import type { Confidence } from '../data/types';
import type { Family, LanguageIndex } from '../data/lang';
import { BASEMAP, FAMILY } from '../theme';
import type { Sample, Tracks } from './track';

export interface Mark {
  id: string;
  name: string;
  family: Family | undefined;
  x: number;
  y: number;
  r: number;
  sample: Sample;
  alt?: { x: number; y: number; sample: Sample };
}

const SVG = 'http://www.w3.org/2000/svg';
const TRAIL_YEARS = 50;

const colour = (f: Family | undefined) => (f ? FAMILY[f] : BASEMAP.sepiaLight);

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const ALPHA: Record<Confidence, number> = { high: 1, med: 0.85, low: 0.5, contested: 0.4 };

function drawGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hex: string, s: Sample, selected: boolean) {
  const a = ALPHA[s.confidence];
  ctx.save();
  if (s.confidence === 'low') {
    // Faint and blurred: a soft radial disc (works where ctx.filter does not, e.g. older Safari).
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.9);
    g.addColorStop(0, rgba(hex, a));
    g.addColorStop(0.55, rgba(hex, a * 0.75));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
  } else if (s.confidence === 'contested') {
    // Ghost: pale fill, thin dashed ring.
    ctx.fillStyle = rgba(hex, 0.18);
    ctx.strokeStyle = rgba(hex, 0.8);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 2.5]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = rgba(hex, a);
    ctx.strokeStyle = BASEMAP.paper;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (s.needsSource) {
    // Rule 4: unsourced → dashed outline.
    ctx.setLineDash([2.5, 2.5]);
    ctx.strokeStyle = BASEMAP.sepia;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
  }
  if (selected) {
    ctx.setLineDash([]);
    ctx.strokeStyle = BASEMAP.sepia;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, pts: [number, number, number][], hex: string, conf: Confidence) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.2;
  const base = conf === 'high' || conf === 'med' ? 0.55 : 0.32;
  if (conf === 'contested') ctx.setLineDash([3, 3]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1, age] = pts[i];
    if (Math.hypot(x1 - x0, y1 - y0) < 0.2) continue;
    ctx.strokeStyle = rgba(hex, base * (1 - age / TRAIL_YEARS));
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
}

export class NationLayer {
  private marks: Mark[] = [];
  private labelBoxes: { id: string; box: [number, number, number, number] }[] = [];
  selected: string | null = null;

  constructor(private tracks: Tracks, private lang: LanguageIndex) {}

  /** Compute screen positions for the year. */
  layout(projection: GeoProjection, year: number): Mark[] {
    const out: Mark[] = [];
    for (const [id, t] of this.tracks.byId) {
      const s = this.tracks.sample(id, year);
      if (!s) continue;
      const p = projection([s.lon, s.lat]);
      if (!p) continue;
      const family = this.lang.family(t.nation.language);
      // Grow in over the first two years; shrink as a merge completes.
      let k = Math.min(1, (year - t.frames[0].year) / 2 + 0.35);
      if (t.endsAt) k = Math.min(k, Math.max(0.35, (t.endsAt.year - year) / 4));
      const r = (family === 'iroquoian' ? 5 : 7) * k;
      const mark: Mark = { id, name: t.nation.name, family, x: p[0], y: p[1], r, sample: s };
      const a = this.tracks.sampleAlt(id, year);
      const ap = a && projection([a.lon, a.lat]);
      if (a && ap) mark.alt = { x: ap[0], y: ap[1], sample: a };
      out.push(mark);
    }
    // Draw weaker first so confident marks sit on top.
    const rank: Record<Confidence, number> = { contested: 0, low: 1, med: 2, high: 3 };
    out.sort((a, b) => rank[a.sample.confidence] - rank[b.sample.confidence]);
    this.marks = out;
    return out;
  }

  draw(ctx: CanvasRenderingContext2D, projection: GeoProjection, year: number) {
    const marks = this.layout(projection, year);
    for (const m of marks) {
      const pts: [number, number, number][] = [];
      for (const p of this.tracks.trail(m.id, year, TRAIL_YEARS)) {
        const q = projection([p.lon, p.lat]);
        if (q) pts.push([q[0], q[1], p.age]);
      }
      drawTrail(ctx, pts, colour(m.family), m.sample.confidence);
    }
    for (const m of marks) {
      const hex = colour(m.family);
      if (m.alt) {
        // Contested: both hypotheses ghosted, joined by a dotted line.
        ctx.save();
        ctx.strokeStyle = rgba(hex, 0.7);
        ctx.lineWidth = 1.3;
        ctx.setLineDash([1.5, 4]);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.alt.x, m.alt.y); ctx.stroke();
        ctx.restore();
        drawGlyph(ctx, m.alt.x, m.alt.y, m.r, hex, m.alt.sample, this.selected === m.id);
      }
      drawGlyph(ctx, m.x, m.y, m.r, hex, m.sample, this.selected === m.id);
    }
  }

  /** Small-caps labels with greedy collision avoidance. */
  drawLabels(g: SVGGElement, width: number, height: number) {
    const placed: [number, number, number, number][] = [];
    const hits = (b: [number, number, number, number]) =>
      b[0] < 2 || b[1] < 2 || b[2] > width - 2 || b[3] > height - 2 ||
      placed.some((p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1]);
    // Glyphs are obstacles too.
    for (const m of this.marks) placed.push([m.x - m.r, m.y - m.r, m.x + m.r, m.y + m.r]);

    const nodes: SVGTextElement[] = [];
    this.labelBoxes = [];
    // Selected first, then the most certain, so weak marks lose label collisions.
    const rank: Record<Confidence, number> = { contested: 0, low: 1, med: 2, high: 3 };
    const order = [...this.marks].sort((a, b) =>
      Number(b.id === this.selected) - Number(a.id === this.selected) || rank[b.sample.confidence] - rank[a.sample.confidence]);
    const label = (id: string, x: number, y: number, r: number, text: string, cls: string, size: number) => {
      const w = text.length * size * 0.66 + 4;
      const h = size + 2;
      const gap = r + 4;
      const candidates: [number, number, 'start' | 'end' | 'middle'][] = [
        [x + gap, y, 'start'], [x - gap, y, 'end'], [x, y - gap - h / 2, 'middle'], [x, y + gap + h / 2, 'middle'],
        [x + gap, y - h * 0.8, 'start'], [x + gap, y + h * 0.8, 'start'], [x - gap, y - h * 0.8, 'end'], [x - gap, y + h * 0.8, 'end'],
      ];
      for (const [cx, cy, anchor] of candidates) {
        const x0 = anchor === 'start' ? cx : anchor === 'end' ? cx - w : cx - w / 2;
        const box: [number, number, number, number] = [x0, cy - h / 2, x0 + w, cy + h / 2];
        if (hits(box)) continue;
        placed.push(box);
        this.labelBoxes.push({ id, box });
        const t = document.createElementNS(SVG, 'text');
        t.setAttribute('x', cx.toFixed(1));
        t.setAttribute('y', cy.toFixed(1));
        t.setAttribute('text-anchor', anchor);
        t.setAttribute('class', cls);
        t.setAttribute('data-id', id);
        t.textContent = text;
        nodes.push(t);
        return;
      }
    };
    for (const m of order) {
      const fam = m.family ?? 'none';
      label(m.id, m.x, m.y, m.r, m.name, `nation-label fam-${fam} conf-${m.sample.confidence}${m.id === this.selected ? ' selected' : ''}`, 12);
      if (m.alt) label(m.id, m.alt.x, m.alt.y, m.r, `${m.name}?`, `nation-label alt fam-${fam} conf-contested`, 11);
    }
    g.replaceChildren(...nodes);
  }

  /** Nearest mark (or alternative) within reach of a tap; 22px = 44px target. */
  hit(x: number, y: number, reach = 22): string | null {
    let best: string | null = null;
    let bestD = reach;
    for (const m of this.marks) {
      for (const [px, py] of [[m.x, m.y], m.alt ? [m.alt.x, m.alt.y] : null].filter(Boolean) as [number, number][]) {
        const d = Math.hypot(px - x, py - y);
        if (d <= bestD) { bestD = d; best = m.id; }
      }
    }
    if (best) return best;
    // Labels are tap targets too (padded to reach 44px tall).
    for (const { id, box } of this.labelBoxes) {
      const pad = Math.max(0, (44 - (box[3] - box[1])) / 2);
      if (x >= box[0] - 4 && x <= box[2] + 4 && y >= box[1] - pad && y <= box[3] + pad) return id;
    }
    return null;
  }
}
