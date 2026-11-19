// Kernel density on a coarse screen grid. Pure: no DOM.
// Each point contributes w · exp(−d² / 2h²), cut off at 3h.

export interface KdePoint {
  x: number;
  y: number;
  /** Weight (confidence × presence; population once sourced). */
  w: number;
  /** Bandwidth in px. */
  h: number;
}

export interface Grid {
  cols: number;
  rows: number;
  cell: number;
  data: Float32Array;
}

export function makeGrid(width: number, height: number, cell: number): Grid {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  return { cols, rows, cell, data: new Float32Array(cols * rows) };
}

/** Accumulate points into the grid (sampled at cell centres). */
export function accumulate(g: Grid, points: readonly KdePoint[]) {
  const { cols, rows, cell, data } = g;
  for (const p of points) {
    if (p.w <= 0) continue;
    const reach = p.h * 3;
    const c0 = Math.max(0, Math.floor((p.x - reach) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((p.x + reach) / cell));
    const r0 = Math.max(0, Math.floor((p.y - reach) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((p.y + reach) / cell));
    const k = -1 / (2 * p.h * p.h);
    for (let r = r0; r <= r1; r++) {
      const dy = (r + 0.5) * cell - p.y;
      const dy2 = dy * dy;
      const row = r * cols;
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5) * cell - p.x;
        const d2 = dx * dx + dy2;
        if (d2 > reach * reach) continue;
        data[row + c] += p.w * Math.exp(d2 * k);
      }
    }
  }
}

/** Density → intensity in 0…1, saturating smoothly (no hard edge). */
export const intensity = (d: number, gain: number) => 1 - Math.exp(-d * gain);
