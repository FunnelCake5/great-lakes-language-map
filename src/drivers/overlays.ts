// Cahokia and Climate overlays, driven by data/drivers.json + events.json.
//   Cahokia: the site (from its first sourced event to abandonment, then a
//   ghost), rings pulling inward during the "pull" phase and pushing outward
//   during the "release" phase, and approximate regions (Vacant Quarter).
//   Climate: drought washes around active drought events, and the maize line.
//   The maize line is SCHEMATIC until sourced: dashed and labelled as such.
import type { GeoProjection } from 'd3-geo';
import { geoDistance, geoPath } from 'd3-geo';
import type { Confidence, DriversFile, HistEvent } from '../data/types';
import { BOUNDS } from '../data/types';
import { BASEMAP, DRIVER } from '../theme';
import type { LayerState } from './groups';

const SVG = 'http://www.w3.org/2000/svg';
/** Rendering choices, not historical claims. */
const REGION_KM = 170;
const DROUGHT_KM = 230;

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const ALPHA: Record<Confidence, number> = { high: 1, med: 0.8, low: 0.5, contested: 0.5 };

function pxPerKm(projection: GeoProjection, lon: number, lat: number) {
  const a = projection([lon, lat])!;
  const b = projection([lon + 1, lat])!;
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / (geoDistance([lon, lat], [lon + 1, lat]) * 6371);
}

interface Label { x: number; y: number; text: string; cls: string; anchor?: string }

export class DriverOverlays {
  private byId: Map<string, HistEvent>;
  private labels: Label[] = [];
  /** Narrow screens: shorter labels. */
  compact = false;

  constructor(private cfg: DriversFile, events: readonly HistEvent[], private layers: LayerState) {
    this.byId = new Map(events.map((e) => [e.id, e]));
  }

  private span(fromId: string, toId: string) {
    const a = this.byId.get(fromId);
    const b = this.byId.get(toId);
    return a && b ? { start: a.year_start, end: b.year_end + 1, conf: a.confidence } : null;
  }

  /** Is anything animating at this year (so the caller keeps redrawing)? */
  animating(year: number) {
    if (!this.layers.isOn('cahokia')) return false;
    return this.cfg.cahokia.phases.some((p) => {
      const s = this.span(p.from_event, p.to_event);
      return s && year >= s.start && year < s.end;
    });
  }

  draw(ctx: CanvasRenderingContext2D, projection: GeoProjection, year: number, now: number) {
    this.labels = [];
    if (this.layers.isOn('climate')) this.drawClimate(ctx, projection, year);
    if (this.layers.isOn('cahokia')) this.drawCahokia(ctx, projection, year, now);
  }

  private drawCahokia(ctx: CanvasRenderingContext2D, projection: GeoProjection, year: number, now: number) {
    const c = this.cfg.cahokia;
    const amber = DRIVER.cahokia;

    // Approximate regions (e.g. Vacant Quarter) while their event is active.
    for (const r of c.regions) {
      const e = this.byId.get(r.event);
      if (!e || year < e.year_start || year >= e.year_end + 1) continue;
      const p = projection([e.lon, e.lat]);
      if (!p) continue;
      const rad = REGION_KM * pxPerKm(projection, e.lon, e.lat);
      ctx.save();
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
      g.addColorStop(0, rgba(amber, 0.22 * ALPHA[e.confidence]));
      g.addColorStop(1, rgba(amber, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.fill();
      // Hatch, clipped to the circle, so "emptied" reads differently from a field.
      ctx.clip();
      ctx.strokeStyle = rgba(amber, 0.35 * ALPHA[e.confidence]);
      ctx.lineWidth = 1;
      for (let d = -rad * 2; d < rad * 2; d += 7) {
        ctx.beginPath(); ctx.moveTo(p[0] + d - rad, p[1] - rad); ctx.lineTo(p[0] + d + rad, p[1] + rad); ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = rgba(amber, 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      this.labels.push({ x: p[0], y: p[1] + rad + 14, text: `${r.label} (approx. extent)`, cls: 'driver-label cahokia' });
    }

    // The site.
    const first = Math.min(...c.phases.map((ph) => this.byId.get(ph.from_event)?.year_start ?? Infinity));
    const abandoned = this.byId.get(c.abandoned_event);
    if (year < first) return;
    const p = projection([c.site.lon, c.site.lat]);
    if (!p) return;
    const gone = abandoned ? year >= abandoned.year_end + 1 : false;

    // Pull (inward) and release (outward) rings.
    for (const ph of c.phases) {
      const s = this.span(ph.from_event, ph.to_event);
      if (!s || year < s.start || year >= s.end) continue;
      ctx.save();
      for (let k = 0; k < 4; k++) {
        let t = (now / 3200 + k / 4) % 1;
        if (ph.kind === 'pull') t = 1 - t; // rings shrink toward the centre
        const r = 12 + t * 95;
        const a = ph.kind === 'pull' ? t * 0.55 : (1 - t) * 0.55;
        ctx.strokeStyle = rgba(amber, a * ALPHA[s.conf]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      this.labels.push({
        x: p[0], y: p[1] - 116,
        text: ph.kind === 'pull' ? 'Cahokia draws people in' : 'Cahokia declines; people disperse',
        cls: 'driver-label cahokia',
      });
    }

    // Mound glyph: a flat-topped trapezoid. Ghosted once abandoned.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p[0] - 10, p[1] + 6); ctx.lineTo(p[0] - 5, p[1] - 6); ctx.lineTo(p[0] + 5, p[1] - 6); ctx.lineTo(p[0] + 10, p[1] + 6); ctx.closePath();
    if (gone) {
      ctx.setLineDash([3, 2]);
      ctx.fillStyle = rgba(amber, 0.15);
      ctx.strokeStyle = rgba(amber, 0.7);
    } else {
      ctx.fillStyle = rgba(amber, ALPHA[c.site.confidence]);
      ctx.strokeStyle = BASEMAP.paper;
    }
    ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();
    ctx.restore();
    this.labels.push({ x: p[0] + 14, y: p[1] + 1, text: gone ? `${c.site.name} (abandoned)` : c.site.name, cls: `driver-label cahokia site${gone ? ' gone' : ''}`, anchor: 'start' });
  }

  private drawClimate(ctx: CanvasRenderingContext2D, projection: GeoProjection, year: number) {
    const blue = DRIVER.climate;

    // Drought washes around active drought events.
    for (const id of this.cfg.climate.drought_events) {
      const e = this.byId.get(id);
      if (!e || year < e.year_start || year >= e.year_end + 1) continue;
      const p = projection([e.lon, e.lat]);
      if (!p) continue;
      const rad = DROUGHT_KM * pxPerKm(projection, e.lon, e.lat);
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
      g.addColorStop(0, rgba(blue, 0.2 * ALPHA[e.confidence]));
      g.addColorStop(0.7, rgba(blue, 0.08 * ALPHA[e.confidence]));
      g.addColorStop(1, rgba(blue, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.fill();
    }

    // Maize line: interpolate latitude between keyframes, visible within their span.
    const ml = this.cfg.climate.maize_line;
    const ks = [...ml.keyframes].sort((a, b) => a.year - b.year);
    if (ks.length < 2 || year < ks[0].year || year > ks[ks.length - 1].year) return;
    let i = 1;
    while (i < ks.length - 1 && ks[i].year < year) i++;
    const a = ks[i - 1];
    const b = ks[i];
    const lat = a.lat + ((year - a.year) / (b.year - a.year)) * (b.lat - a.lat);
    const line = {
      type: 'LineString' as const,
      coordinates: Array.from({ length: 53 }, (_, k) => [BOUNDS.lonMin + (k * (BOUNDS.lonMax - BOUNDS.lonMin)) / 52, lat]),
    };
    const schematic = ml.status === 'schematic';
    ctx.save();
    ctx.strokeStyle = rgba(blue, schematic ? 0.75 : 0.9);
    ctx.lineWidth = 2.2;
    ctx.setLineDash(schematic ? [9, 7] : []);
    ctx.beginPath(); geoPath(projection, ctx)(line); ctx.stroke();
    ctx.restore();
    const lp = projection([-95.5, lat]);
    if (lp) {
      this.labels.push({
        x: lp[0], y: lp[1] - 10,
        text: this.compact
          ? `Maize limit ↓${schematic ? ' (schematic)' : ''}`
          : `${ml.label} ↓${schematic ? ' · SCHEMATIC, position not sourced' : ''}`,
        cls: `driver-label climate${schematic ? ' schematic' : ''}`, anchor: 'start',
      });
    }
  }

  drawLabels(g: SVGGElement) {
    g.replaceChildren(...this.labels.map((l) => {
      const t = document.createElementNS(SVG, 'text');
      t.setAttribute('x', l.x.toFixed(1));
      t.setAttribute('y', l.y.toFixed(1));
      t.setAttribute('text-anchor', l.anchor ?? 'middle');
      t.setAttribute('class', l.cls);
      t.textContent = l.text;
      return t;
    }));
  }
}
