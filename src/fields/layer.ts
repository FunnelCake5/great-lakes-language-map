// Language-family "weather" fields (SPEC § Map): a kernel-density field per
// family from nation positions in the current year, blended where families
// overlap, so mixed zones read as mixed colour. No hard borders.
//
// Weights: confidence only for now. Population weighting waits on sourced
// population data (GAPS.md › Other known gaps); every nation counts the same.
// Uncertainty: lower confidence → lower weight and a wider, blurrier kernel.
// Contested positions go into a separate stippled "ghost" field, split evenly
// between the primary position and its alternatives.
import type { GeoProjection } from 'd3-geo';
import { geoDistance } from 'd3-geo';
import type { Confidence } from '../data/types';
import type { Family, LanguageIndex } from '../data/lang';
import type { Basemap } from '../map/basemap';
import { landClip } from '../map/basemap';
import type { Tracks } from '../nations/track';
import type { Palette } from '../data/palette';
import type { Grid, KdePoint } from './kde';
import { accumulate, intensity, makeGrid } from './kde';

/** Iroquoian is context only: present but quieter. */
const FAMILY_SCALE: Record<Family, number> = { algonquian: 1, siouan: 1, iroquoian: 0.55 };

const WEIGHT: Record<Confidence, number> = { high: 1, med: 0.8, low: 0.45, contested: 0.6 };
const SPREAD: Record<Confidence, number> = { high: 1, med: 1.15, low: 1.5, contested: 1.4 };

/** Base kernel bandwidth. A rendering choice, not a historical claim. */
const BANDWIDTH_KM = 110;
const CELL_PX = 6;
const GAIN = 1.4;
const MAX_ALPHA = 0.5;
const GHOST_ALPHA = 0.75;

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One density group: a family, branch or language depending on the zoom level. */
interface Group { rgb: [number, number, number]; scale: number; pts: KdePoint[] }

function pxPerKm(projection: GeoProjection): number {
  const a: [number, number] = [-85, 42];
  const b: [number, number] = [-84, 42];
  const pa = projection(a)!;
  const pb = projection(b)!;
  return Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / (geoDistance(a, b) * 6371);
}

export class FieldLayer {
  enabled = true;
  private low = document.createElement('canvas');
  /** Land-minus-lakes mask at device resolution; rebuilt only on resize. */
  private mask = document.createElement('canvas');
  /** Full-size stipple dots; rebuilt only on resize. */
  private dots = document.createElement('canvas');
  private ghost = document.createElement('canvas');
  private size = { width: 0, height: 0, dpr: 1 };
  private projection: GeoProjection | null = null;

  /** Language-tree focus: when set, only these nations feed the fields. */
  focus: Set<string> | null = null;

  constructor(private tracks: Tracks, private lang: LanguageIndex, private palette: Palette) {}

  /** Call when the map size or projection changes. */
  resize(projection: GeoProjection, map: Basemap, width: number, height: number, dpr: number) {
    this.projection = projection;
    this.size = { width, height, dpr };
    const W = Math.round(width * dpr);
    const H = Math.round(height * dpr);
    for (const c of [this.mask, this.dots, this.ghost]) { c.width = W; c.height = H; }

    const m = this.mask.getContext('2d')!;
    m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.save();
    landClip(m, projection, map);
    m.fillStyle = '#000';
    m.fillRect(0, 0, width, height);
    m.restore();

    const tile = document.createElement('canvas');
    const t = Math.round(5 * dpr);
    tile.width = tile.height = t;
    const tg = tile.getContext('2d')!;
    tg.fillStyle = '#000';
    tg.beginPath(); tg.arc(t * 0.3, t * 0.3, 0.9 * dpr, 0, Math.PI * 2); tg.fill();
    tg.beginPath(); tg.arc(t * 0.8, t * 0.8, 0.9 * dpr, 0, Math.PI * 2); tg.fill();
    const d = this.dots.getContext('2d')!;
    d.fillStyle = d.createPattern(tile, 'repeat')!;
    d.fillRect(0, 0, W, H);
  }

  /** Points per group (family/branch/language), split into solid and ghost (contested). */
  private points(projection: GeoProjection, year: number) {
    const h0 = BANDWIDTH_KM * pxPerKm(projection);
    const solid = new Map<string, Group>();
    const ghost = new Map<string, Group>();
    const groupFor = (bucket: Map<string, Group>, language: string, fam: Family) => {
      const key = this.palette.groupKey(language);
      let g = bucket.get(key);
      if (!g) {
        g = { rgb: hexRgb(this.palette.colourOf(language)), scale: FAMILY_SCALE[fam], pts: [] };
        bucket.set(key, g);
      }
      return g;
    };
    for (const [id, t] of this.tracks.byId) {
      if (this.focus && !this.focus.has(id)) continue;
      const s = this.tracks.sample(id, year);
      const fam = this.lang.family(t.nation.language);
      if (!s || !fam) continue;
      // Same presence easing as the markers: grow in, shrink while merging.
      let presence = Math.min(1, (year - t.frames[0].year) / 2 + 0.35);
      if (t.endsAt) presence = Math.min(presence, Math.max(0, (t.endsAt.year - year) / 4));
      const w = WEIGHT[s.confidence] * presence;
      const h = h0 * SPREAD[s.confidence];
      const p = projection([s.lon, s.lat]);
      if (!p) continue;
      if (s.confidence !== 'contested') {
        groupFor(solid, t.nation.language, fam).pts.push({ x: p[0], y: p[1], w, h });
        continue;
      }
      const alt = this.tracks.sampleAlt(id, year);
      const ap = alt && projection([alt.lon, alt.lat]);
      const options = ap ? [p, ap] : [p];
      const g = groupFor(ghost, t.nation.language, fam);
      for (const o of options) g.pts.push({ x: o[0], y: o[1], w: w / options.length, h });
    }
    return { solid, ghost };
  }

  /** Blend per-group densities into one low-res RGBA image. */
  private blend(groups: Map<string, Group>, alpha: number): ImageData | null {
    const list = [...groups.values()].filter((g) => g.pts.length);
    if (!list.length) return null;
    const { width, height } = this.size;
    const grids: Grid[] = list.map((g) => {
      const grid = makeGrid(width, height, CELL_PX);
      accumulate(grid, g.pts);
      return grid;
    });
    const { cols, rows } = grids[0];
    const img = new ImageData(cols, rows);
    for (let i = 0; i < cols * rows; i++) {
      let keep = 1;
      let sum = 0;
      let r = 0, gr = 0, b = 0;
      for (let k = 0; k < list.length; k++) {
        const a = intensity(grids[k].data[i], GAIN) * list[k].scale;
        if (a < 0.002) continue;
        keep *= 1 - a;
        sum += a;
        r += a * list[k].rgb[0]; gr += a * list[k].rgb[1]; b += a * list[k].rgb[2];
      }
      if (sum === 0) continue;
      const j = i * 4;
      img.data[j] = r / sum;
      img.data[j + 1] = gr / sum;
      img.data[j + 2] = b / sum;
      img.data[j + 3] = (1 - keep) * alpha * 255;
    }
    return img;
  }

  /** Upscale a low-res image smoothly onto a target context (CSS px). */
  private upscale(target: CanvasRenderingContext2D, img: ImageData) {
    this.low.width = img.width;
    this.low.height = img.height;
    this.low.getContext('2d')!.putImageData(img, 0, 0);
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'low';
    target.drawImage(this.low, 0, 0, img.width * CELL_PX, img.height * CELL_PX);
  }

  /** Draw onto a canvas dedicated to fields (it is masked in place). */
  draw(ctx: CanvasRenderingContext2D, year: number) {
    if (!this.enabled || !this.projection) return;
    const { width, height, dpr } = this.size;
    const { solid, ghost } = this.points(this.projection, year);

    const solidImg = this.blend(solid, MAX_ALPHA);
    if (solidImg) this.upscale(ctx, solidImg);

    // Contested: blended the same way, then kept only under the stipple dots.
    const ghostImg = this.blend(ghost, GHOST_ALPHA);
    if (ghostImg) {
      const g = this.ghost.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, this.ghost.width, this.ghost.height);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.upscale(g, ghostImg);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.dots, 0, 0);
      g.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.ghost, 0, 0, width, height);
    }

    // Dry land only: one composite against the cached mask.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.mask, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }
}
