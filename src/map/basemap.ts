// Natural Earth basemap drawn on Canvas in the atlas style.
import { geoArea, geoCentroid, geoContains, geoGraticule, geoPath } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { BASEMAP } from '../theme';
import { PLATE } from './projection';

export interface Basemap {
  land: FeatureCollection;
  coastline: FeatureCollection;
  lakes: FeatureCollection;
  /** Named bays and channels that Natural Earth also includes inside a parent lake. Labels only. */
  bays: FeatureCollection;
  rivers: FeatureCollection;
  riversDetail: FeatureCollection;
}

const LAYERS = {
  land: 'land', coastline: 'coastline', lakes: 'lakes', rivers: 'rivers', riversDetail: 'rivers_na',
} as const;

export async function loadBasemap(): Promise<Basemap> {
  const base = import.meta.env.BASE_URL;
  const entries = await Promise.all(
    Object.entries(LAYERS).map(async ([key, file]) => {
      const res = await fetch(`${base}geo/${file}.geojson`);
      if (!res.ok) throw new Error(`basemap layer ${file}: HTTP ${res.status}`);
      return [key, (await res.json()) as FeatureCollection] as const;
    }),
  );
  const map = Object.fromEntries(entries) as unknown as Basemap;
  // Clipped land edges run along the box; densify them so they follow the
  // parallels on a conic projection instead of bowing as great circles.
  map.land = rewind(densify(map.land, 0.25));
  const lakes = rewind(map.lakes).features;
  const isBay = (f: Feature) => lakes.some((o) => o !== f && geoContains(o, geoCentroid(f)));
  map.bays = { type: 'FeatureCollection', features: lakes.filter(isBay) };
  map.lakes = { type: 'FeatureCollection', features: lakes.filter((f) => !isBay(f)) };
  return map;
}

/**
 * d3-geo reads rings spherically and expects clockwise exteriors; RFC 7946
 * files (as mapshaper writes them) are counter-clockwise, which d3 takes to
 * mean "the whole globe except this shape". Flip any part bigger than a
 * hemisphere.
 */
function rewind(fc: FeatureCollection): FeatureCollection {
  const fix = (rings: Position[][]): Position[][] =>
    geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings;
  const geom = (g: Geometry): Geometry => {
    if (g.type === 'Polygon') return { ...g, coordinates: fix(g.coordinates) };
    if (g.type === 'MultiPolygon') return { ...g, coordinates: g.coordinates.map(fix) };
    return g;
  };
  return { ...fc, features: fc.features.map((f) => ({ ...f, geometry: geom(f.geometry) }) as Feature) };
}

function densifyRing(ring: Position[], step: number): Position[] {
  const out: Position[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}

function densify(fc: FeatureCollection, step: number): FeatureCollection {
  const geom = (g: Geometry): Geometry => {
    if (g.type === 'Polygon') return { ...g, coordinates: g.coordinates.map((r) => densifyRing(r, step)) };
    if (g.type === 'MultiPolygon') return { ...g, coordinates: g.coordinates.map((p) => p.map((r) => densifyRing(r, step))) };
    return g;
  };
  return { ...fc, features: fc.features.map((f) => ({ ...f, geometry: geom(f.geometry) }) as Feature) };
}

let grain: CanvasPattern | null = null;
function paperGrain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  // Deterministic LCG so the paper never "boils" between redraws.
  let s = 1234567;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = 120 + ((s >> 16) % 100);
    img.data[i] = v; img.data[i + 1] = v * 0.93; img.data[i + 2] = v * 0.82;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grain = ctx.createPattern(c, 'repeat');
  return grain;
}

/** Thin concentric "water lines" inside water bodies, as in engraved atlases. */
function waterLining(ctx: CanvasRenderingContext2D, shore: () => void, fill: string) {
  const lines = [
    { d: 13, a: 0.10 },
    { d: 8, a: 0.16 },
    { d: 4.5, a: 0.24 },
    { d: 2, a: 0.34 },
  ];
  ctx.lineJoin = 'round';
  for (const { d, a } of lines) {
    ctx.beginPath(); shore();
    ctx.globalAlpha = a;
    ctx.strokeStyle = BASEMAP.lake;
    ctx.lineWidth = 2 * d + 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = fill;
    ctx.lineWidth = 2 * d - 0.9;
    ctx.stroke();
  }
}

/** Opaque colour of the water wash (lake colour over paper) so lining can overpaint it. */
function waterColour(): string {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [p, l] = [hex(BASEMAP.paper), hex(BASEMAP.lake)];
  const a = BASEMAP.lakeFillAlpha;
  return `rgb(${p.map((v, i) => Math.round(v * (1 - a) + l[i] * a)).join(',')})`;
}

export function drawBasemap(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  map: Basemap,
  width: number,
  height: number,
) {
  const path = geoPath(projection, ctx);
  const water = waterColour();

  // Margin outside the plate.
  ctx.fillStyle = BASEMAP.margin;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath(); path(PLATE); ctx.clip();

  // Paper.
  ctx.fillStyle = BASEMAP.paper;
  ctx.fillRect(0, 0, width, height);

  // Water = (plate − land) ∪ lakes, via even-odd (land has no lake holes).
  const waterPath = () => {
    path(PLATE);
    for (const f of map.land.features) path(f);
    for (const f of map.lakes.features) path(f);
  };
  ctx.save();
  ctx.beginPath(); waterPath();
  ctx.fillStyle = water;
  ctx.fill('evenodd');
  ctx.clip('evenodd');
  waterLining(ctx, () => {
    for (const f of map.land.features) path(f);
    for (const f of map.lakes.features) path(f);
  }, water);
  ctx.restore();

  // Rivers: regional detail first (thin), then the main network.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = BASEMAP.lake;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  for (const f of map.riversDetail.features) path(f);
  ctx.stroke();
  ctx.globalAlpha = 0.85;
  for (const f of map.rivers.features) {
    const rank = Number(f.properties?.scalerank ?? 9);
    ctx.lineWidth = rank <= 2 ? 1.7 : rank <= 5 ? 1.2 : 0.9;
    ctx.beginPath(); path(f); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Shorelines.
  ctx.strokeStyle = BASEMAP.sepia;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const f of map.lakes.features) path(f);
  for (const f of map.coastline.features) path(f);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Graticule every 2°.
  ctx.strokeStyle = BASEMAP.sepia;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 0.6;
  ctx.setLineDash([]);
  ctx.beginPath();
  path(geoGraticule().step([2, 2]).precision(0.5)());
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Paper grain over everything inside the plate.
  const pattern = paperGrain(ctx);
  if (pattern) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Neatline: fine inner rule on the plate edge plus a heavier outer rule.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  path(PLATE);
  ctx.clip('evenodd');
  ctx.beginPath(); path(PLATE);
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = BASEMAP.sepia;
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = BASEMAP.margin;
  ctx.lineWidth = 8.6;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath(); path(PLATE);
  ctx.strokeStyle = BASEMAP.sepia;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

/**
 * Adds land-minus-lakes, inside the plate, as subpaths for an even-odd clip.
 * Land has no lake holes, so land + lakes (+ islands as lake holes) under
 * even-odd gives dry land only.
 */
export function landClip(ctx: CanvasRenderingContext2D, projection: GeoProjection, map: Basemap) {
  const path = geoPath(projection, ctx);
  ctx.beginPath();
  path(PLATE);
  ctx.clip();
  ctx.beginPath();
  for (const f of map.land.features) path(f);
  for (const f of map.lakes.features) path(f);
  ctx.clip('evenodd');
}
