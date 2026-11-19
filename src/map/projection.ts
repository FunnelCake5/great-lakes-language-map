import { geoArea, geoConicEqualArea, geoGraticule } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import type { Polygon } from 'geojson';
import { BOUNDS } from '../data/types';

/** The map plate: the CLAUDE.md clip box, following parallels and meridians. */
export const PLATE: Polygon = (() => {
  const p = geoGraticule()
    .extent([[BOUNDS.lonMin, BOUNDS.latMin], [BOUNDS.lonMax, BOUNDS.latMax]])
    .extentMinor([[BOUNDS.lonMin, BOUNDS.latMin], [BOUNDS.lonMax, BOUNDS.latMax]])
    .precision(0.5)
    .outline();
  // d3 reads polygons spherically: wound the wrong way, the ring means
  // "everything except the box". Make sure it is the small side.
  if (geoArea(p) > 2 * Math.PI) p.coordinates = p.coordinates.map((r) => [...r].reverse());
  return p;
})();

/**
 * Albers-style equal-area conic centred on the Great Lakes. Equal area keeps
 * the later density fields honest; the curved plate edges give the atlas look.
 */
export function makeProjection(width: number, height: number, pad: { top: number; right: number; bottom: number; left: number }): GeoProjection {
  return geoConicEqualArea()
    .parallels([37, 47])
    .rotate([85, 0])
    .center([0, 41.5])
    .fitExtent([[pad.left, pad.top], [width - pad.right, height - pad.bottom]], PLATE);
}
