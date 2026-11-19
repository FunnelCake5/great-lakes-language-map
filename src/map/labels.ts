// SVG overlay: water labels, plate tick labels and a scale bar.
import { geoArea, geoDistance, geoPath } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import type { Feature, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { BOUNDS } from '../data/types';
import type { Basemap } from './basemap';

const SVG = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, text?: string) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Rivers worth naming for this story (portages, highways and frontiers). */
const RIVER_LABELS = new Set([
  'Mississippi', 'Missouri', 'Ohio', 'Wabash', 'Illinois', 'Wisconsin', 'Fox',
  'St. Lawrence', 'Rock', 'Minnesota', 'St. Joseph', 'Des Plaines', 'Tennessee',
]);

function largestPolygon(f: Feature): Polygon | null {
  const g = f.geometry;
  if (g.type === 'Polygon') return g;
  if (g.type !== 'MultiPolygon') return null;
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const coordinates of (g as MultiPolygon).coordinates) {
    const p: Polygon = { type: 'Polygon', coordinates };
    const a = geoArea(p);
    if (a > bestArea) { bestArea = a; best = p; }
  }
  return best;
}

function lakeLabels(layer: SVGGElement, projection: GeoProjection, map: Basemap) {
  const path = geoPath(projection);
  for (const f of [...map.lakes.features, ...map.bays.features]) {
    const name = f.properties?.name as string | null;
    const rank = Number(f.properties?.scalerank ?? 9);
    if (!name || rank > 3) continue;
    const poly = largestPolygon(f);
    if (!poly) continue;
    const [[x0, y0], [x1, y1]] = path.bounds(poly);
    const w = x1 - x0;
    const h = y1 - y0;
    if (path.area(poly) < 600) continue; // too small to carry a name at this scale
    const [cx, cy] = path.centroid(poly);
    if (!Number.isFinite(cx)) continue;
    const great = rank === 0 && name.startsWith('Lake ') && name !== 'Lake Saint Clair';
    const size = great ? Math.max(10, Math.min(15, Math.sqrt(path.area(poly)) / 9)) : 9;
    const vertical = h > w * 1.8;
    const label = great ? name.replace('Lake ', 'Lake ') : name;
    const t = el('text', {
      x: cx, y: cy,
      class: `water-label${great ? ' great' : ''}`,
      'font-size': size,
      transform: vertical ? `rotate(-90 ${cx} ${cy})` : '',
    }, label);
    layer.append(t);
  }
}

function riverLabels(layer: SVGGElement, projection: GeoProjection, map: Basemap) {
  // Longest projected piece per name, across both river layers.
  const best = new Map<string, { pts: [number, number][]; len: number }>();
  for (const f of [...map.rivers.features, ...map.riversDetail.features]) {
    const name = f.properties?.name as string | null;
    if (!name || !RIVER_LABELS.has(name)) continue;
    const g = f.geometry as LineString | MultiLineString;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of lines) {
      const pts = line.map((c) => projection(c as [number, number])).filter((p): p is [number, number] => !!p);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (len > (best.get(name)?.len ?? 0)) best.set(name, { pts, len });
    }
  }
  for (const [name, { pts, len }] of best) {
    if (len < 70) continue;
    // Walk to the midpoint and read the local direction over ~30px.
    let acc = 0;
    let i = 1;
    for (; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + seg >= len / 2) break;
      acc += seg;
    }
    const a = pts[Math.max(0, i - 3)];
    const b = pts[Math.min(pts.length - 1, i + 2)];
    const m = pts[Math.min(pts.length - 1, i)];
    let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    layer.append(el('text', {
      x: m[0], y: m[1] - 3,
      class: 'river-label',
      transform: `rotate(${angle.toFixed(1)} ${m[0]} ${m[1]})`,
    }, name));
  }
}

function tickLabels(layer: SVGGElement, projection: GeoProjection) {
  const out = (a: [number, number], b: [number, number], dist: number) => {
    const p = projection(a)!;
    const q = projection(b)!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [p[0] + ((q[0] - p[0]) / len) * dist, p[1] + ((q[1] - p[1]) / len) * dist];
  };
  for (let lon = BOUNDS.lonMin + 2; lon < BOUNDS.lonMax; lon += 4) {
    const [x, y] = out([lon, BOUNDS.latMin], [lon, BOUNDS.latMin - 1], 20);
    layer.append(el('text', { x, y, class: 'tick', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, `${-lon}°W`));
  }
  for (let lat = BOUNDS.latMin + 1; lat < BOUNDS.latMax; lat += 2) {
    const [x, y] = out([BOUNDS.lonMin, lat], [BOUNDS.lonMin - 1, lat], 14);
    layer.append(el('text', { x, y, class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, `${lat}°N`));
  }
}

function scaleBar(layer: SVGGElement, projection: GeoProjection, x: number, y: number) {
  // Pixels per km near the centre of the plate.
  const c: [number, number] = [-85, 41.5];
  const d: [number, number] = [-84, 41.5];
  const km = geoDistance(c, d) * 6371;
  const [px0] = projection(c)!;
  const [px1] = projection(d)!;
  const pxPerKm = Math.abs(px1 - px0) / km;
  const nice = [50, 100, 200, 250, 300, 500];
  const lenKm = nice.reduce((best, n) => (Math.abs(n * pxPerKm - 120) < Math.abs(best * pxPerKm - 120) ? n : best));
  const w = lenKm * pxPerKm;
  const g = el('g', { class: 'scale', transform: `translate(${x - w} ${y})` });
  const half = w / 2;
  g.append(
    el('rect', { x: 0, y: 0, width: half, height: 4, class: 'scale-fill' }),
    el('rect', { x: half, y: 0, width: half, height: 4, class: 'scale-empty' }),
    el('text', { x: 0, y: -4, 'text-anchor': 'middle', class: 'tick' }, '0'),
    el('text', { x: half, y: -4, 'text-anchor': 'middle', class: 'tick' }, String(lenKm / 2)),
    el('text', { x: w, y: -4, 'text-anchor': 'middle', class: 'tick' }, `${lenKm} km`),
  );
  layer.append(g);
}

export function drawLabels(svg: SVGSVGElement, projection: GeoProjection, map: Basemap, width: number, height: number) {
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.replaceChildren();
  const water = el('g', { class: 'labels-water' });
  const ticks = el('g', { class: 'labels-ticks' });
  svg.append(water, ticks);
  riverLabels(water, projection, map);
  lakeLabels(water, projection, map);
  tickLabels(ticks, projection);
  const [sx, sy] = projection([BOUNDS.lonMax, BOUNDS.latMin])!;
  // Inside the plate's south-east corner, over the Atlantic.
  scaleBar(ticks, projection, sx - 34, sy - 26);
}
