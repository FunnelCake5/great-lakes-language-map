// Nonlinear time axis (SPEC § Time): 900–1600 → 25 % of the slider,
// 1600–1840 → 60 %, 1840–1900 → 15 %. Piecewise linear, so it is monotonic
// and exactly invertible.
import { YEARS } from '../data/types';

const STOPS: readonly [year: number, t: number][] = [
  [YEARS.min, 0],
  [1600, 0.25],
  [1840, 0.85],
  [YEARS.max, 1],
];

export const clampYear = (y: number) => Math.min(YEARS.max, Math.max(YEARS.min, y));
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Year → slider position in 0…1. */
export function yearToT(year: number): number {
  const y = clampYear(year);
  for (let i = 1; i < STOPS.length; i++) {
    const [y0, t0] = STOPS[i - 1];
    const [y1, t1] = STOPS[i];
    if (y <= y1) return t0 + ((y - y0) / (y1 - y0)) * (t1 - t0);
  }
  return 1;
}

/** Slider position in 0…1 → year. */
export function tToYear(t: number): number {
  const u = clamp01(t);
  for (let i = 1; i < STOPS.length; i++) {
    const [y0, t0] = STOPS[i - 1];
    const [y1, t1] = STOPS[i];
    if (u <= t1) return y0 + ((u - t0) / (t1 - t0)) * (y1 - y0);
  }
  return YEARS.max;
}

/** Tick years for the axis: sparse where the axis is compressed, dense where it is stretched. */
export function axisTicks(): { year: number; major: boolean }[] {
  const ticks: { year: number; major: boolean }[] = [];
  for (let y = 900; y < 1600; y += 100) ticks.push({ year: y, major: y % 200 === 0 || y === 900 });
  for (let y = 1600; y < 1840; y += 20) ticks.push({ year: y, major: y % 40 === 0 });
  for (let y = 1840; y <= 1900; y += 20) ticks.push({ year: y, major: y === 1840 || y === 1900 });
  return ticks;
}

export const BREAKS = STOPS.slice(1, -1).map(([y]) => y);
