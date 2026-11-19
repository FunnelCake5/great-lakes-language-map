// Today view (SPEC § Roadmap 7): place names that still carry these
// languages, and present-day nations (only sourced records; none yet).
// Uncertainty as everywhere: med fainter, needs_source dashed (rule 4).
import type { GeoProjection } from 'd3-geo';
import type { Palette } from '../data/palette';
import { ink } from '../data/palette';
import type { Confidence, PlaceName, TodayNation } from '../data/types';
import { NEEDS_SOURCE } from '../data/types';

const SVG = 'http://www.w3.org/2000/svg';
const OPACITY: Record<Confidence, number> = { high: 1, med: 0.85, low: 0.6, contested: 0.6 };

type Box = [number, number, number, number];
type Hit = { kind: 'place' | 'nation'; key: string; box: Box; point?: [number, number] };

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, text?: string) {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Show the dataset's wording as-is, with typographic quotes (glosses and descriptions are mixed). */
export function formatMeaning(m: string): string {
  return m.replace(/'([^']+)'/g, '‘$1’').replace(/'/g, '’');
}

/** Map label for an official name: up to the first ", ", " of " or " in the State"; the card shows it in full. */
export function shortName(name: string): string {
  const cut = name.search(/,| of | in the State| \(/);
  return cut > 0 ? name.slice(0, cut) : name;
}

export class TodayLayer {
  private hits: Hit[] = [];
  selected: string | null = null;
  showPlaces = true;

  constructor(private places: readonly PlaceName[], private nations: readonly TodayNation[], private palette: Palette, private langName: (id: string) => string) {}

  /** `obstacles`: screen boxes labels must avoid (open panels, cards). */
  draw(g: SVGGElement, projection: GeoProjection, width: number, height: number, obstacles: Box[] = []) {
    this.hits = [];
    const placed: Box[] = [...obstacles];
    // Reserve every point first, so no label covers another place's dot.
    const pts = [...(this.showPlaces ? this.places : []), ...this.nations].map((q) => projection([q.lon, q.lat])).filter((p): p is [number, number] => !!p);
    for (const [px, py] of pts) placed.push([px - 7, py - 7, px + 7, py + 7]);
    const nodes: SVGElement[] = [];
    const free = (b: Box) => b[0] > 2 && b[1] > 2 && b[2] < width - 2 && b[3] < height - 2 && !placed.some((p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1]);

    const item = (kind: Hit['kind'], key: string, lon: number, lat: number, title: string, sub: string, colour: string, conf: Confidence, needs: boolean) => {
      const p = projection([lon, lat]);
      if (!p) return;
      const [x, y] = p;
      const titleW = title.length * 9.2 + 6;
      const subW = sub.length * 5.6 + 6;
      // Try with the subtitle first, then title only, at widening offsets, so every name gets a label.
      let chosen: [number, number, 'middle' | 'start' | 'end'] | null = null;
      let box: Box = [0, 0, 0, 0];
      let withSub = !!sub;
      for (const tryWithSub of sub ? [true, false] : [false]) {
        const w = tryWithSub ? Math.max(titleW, subW) : titleW;
        const h = tryWithSub ? 34 : 20;
        for (const d of [10, 24, 40]) {
          const options: [number, number, 'middle' | 'start' | 'end'][] = [
            [x, y - d - h, 'middle'], [x, y + d, 'middle'], [x + d, y - h / 2, 'start'], [x - d, y - h / 2, 'end'],
            [x + d, y - d - h / 2, 'start'], [x + d, y + d - h / 2, 'start'], [x - d, y - d - h / 2, 'end'], [x - d, y + d - h / 2, 'end'],
          ];
          for (const o of options) {
            const x0 = o[2] === 'middle' ? o[0] - w / 2 : o[2] === 'start' ? o[0] : o[0] - w;
            const b: Box = [x0, o[1], x0 + w, o[1] + h];
            if (free(b)) { chosen = o; box = b; break; }
          }
          if (chosen) break;
        }
        if (chosen) { withSub = tryWithSub; break; }
      }
      const grp = el('g', { class: `today-item ${kind}${needs ? ' needs' : ''}${this.selected === key ? ' selected' : ''}`, opacity: OPACITY[conf], 'data-key': key });
      grp.append(el('circle', { cx: x, cy: y, r: kind === 'nation' ? 6 : 4.5, fill: colour, stroke: '#F2EBDD', 'stroke-width': 1.5 }));
      if (needs) grp.append(el('circle', { cx: x, cy: y, r: 9, fill: 'none', stroke: '#5C4631', 'stroke-dasharray': '2 2', 'stroke-width': 1.2 }));
      if (chosen) {
        placed.push(box);
        if (needs) grp.append(el('rect', { x: box[0] - 3, y: box[1] - 2, width: box[2] - box[0] + 6, height: box[3] - box[1] + 4, rx: 4, class: 'today-needs' }));
        const [lx, ly, anchor] = chosen;
        grp.append(el('text', { x: lx, y: ly + 15, 'text-anchor': anchor, class: 'today-title', fill: ink(colour) }, title));
        if (withSub) grp.append(el('text', { x: lx, y: ly + 29, 'text-anchor': anchor, class: 'today-sub' }, sub));
        // Leader line when the label sits away from its point.
        const cx = Math.max(box[0], Math.min(x, box[2]));
        const cy = Math.max(box[1], Math.min(y, box[3]));
        if (Math.hypot(cx - x, cy - y) > 16) grp.prepend(el('line', { x1: x, y1: y, x2: cx, y2: cy, class: 'today-leader' }));
      }
      nodes.push(grp);
      // Tap target: the point (44px) plus the label box.
      this.hits.push({ kind, key, box: [x - 22, y - 22, x + 22, y + 22], point: [x, y] });
      if (chosen) this.hits.push({ kind, key, box });
    };

    if (this.showPlaces) {
      for (const p of this.places) {
        const meaning = p.meaning ? formatMeaning(p.meaning) : '';
        const sub = [this.langName(p.language), meaning].filter(Boolean).join(' · ');
        item('place', p.name, p.lon, p.lat, p.name, sub.length > 46 ? `${sub.slice(0, 44)}…` : sub, this.palette.colourOf(p.language), p.confidence, p.source === NEEDS_SOURCE);
      }
    }
    for (const n of this.nations) {
      item('nation', n.id, n.lon, n.lat, shortName(n.name), this.langName(n.language), this.palette.colourOf(n.language), n.confidence, false);
    }
    g.replaceChildren(...nodes);
  }

  /** Nearest point within 22px (a 44px target) wins; otherwise a label box. */
  hit(x: number, y: number): { kind: Hit['kind']; key: string } | null {
    let best: Hit | null = null;
    let bestD = 22;
    for (const h of this.hits) {
      if (!h.point) continue;
      const d = Math.hypot(h.point[0] - x, h.point[1] - y);
      if (d <= bestD) { bestD = d; best = h; }
    }
    if (best) return { kind: best.kind, key: best.key };
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const { box, kind, key, point } = this.hits[i];
      if (!point && x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) return { kind, key };
    }
    return null;
  }
}
