// Nation movement over time (SPEC § Data model › Interpolation):
// linear between keyframes; hidden before the first; holds after the last,
// unless the nation merges, in which case it travels into the target and fuses.
// A split child starts at its parent's position in the split year.
import type { Confidence, Nation, Position } from '../data/types';
import { NEEDS_SOURCE } from '../data/types';

export interface Keyframe extends Position {
  /** Synthetic frames are derived from splits/merges, not from data rows. */
  synthetic?: 'split' | 'merge';
}

export interface Track {
  nation: Nation;
  frames: Keyframe[];
  alt: Keyframe[];
  /** Year after which the nation is drawn as fused into another (merge). */
  endsAt?: { year: number; into: string };
}

export interface Sample {
  lat: number;
  lon: number;
  confidence: Confidence;
  needsSource: boolean;
  /** Frames bracketing the year: equal when exactly on a keyframe or holding. */
  from: Keyframe;
  to: Keyframe;
  phase: 'keyframe' | 'moving' | 'holding' | 'merging';
}

/** Lower is weaker. Contested sits below low: it renders as a ghost. */
const RANK: Record<Confidence, number> = { high: 3, med: 2, low: 1, contested: 0 };
export const weaker = (a: Confidence, b: Confidence): Confidence => (RANK[a] <= RANK[b] ? a : b);

function interpolate(frames: readonly Keyframe[], year: number): Omit<Sample, 'phase'> & { phase: Sample['phase'] } | null {
  if (!frames.length || year < frames[0].year) return null;
  const last = frames[frames.length - 1];
  if (year >= last.year) {
    return { lat: last.lat, lon: last.lon, confidence: last.confidence, needsSource: last.source === NEEDS_SOURCE, from: last, to: last, phase: year === last.year ? 'keyframe' : 'holding' };
  }
  let i = 1;
  while (frames[i].year <= year) i++;
  const a = frames[i - 1];
  const b = frames[i];
  if (year === a.year) {
    return { lat: a.lat, lon: a.lon, confidence: a.confidence, needsSource: a.source === NEEDS_SOURCE, from: a, to: a, phase: 'keyframe' };
  }
  const u = (year - a.year) / (b.year - a.year);
  return {
    lat: a.lat + (b.lat - a.lat) * u,
    lon: a.lon + (b.lon - a.lon) * u,
    confidence: weaker(a.confidence, b.confidence),
    needsSource: a.source === NEEDS_SOURCE || b.source === NEEDS_SOURCE,
    from: a,
    to: b,
    phase: b.synthetic === 'merge' ? 'merging' : 'moving',
  };
}

export class Tracks {
  readonly byId = new Map<string, Track>();

  constructor(nations: readonly Nation[]) {
    for (const n of nations) {
      this.byId.set(n.id, { nation: n, frames: [...n.positions], alt: [...(n.alt_positions ?? [])] });
    }
    // Splits: the child emerges from the parent's position in the split year.
    for (const n of nations) {
      for (const s of n.splits ?? []) {
        const child = this.byId.get(s.into);
        const at = interpolate(n.positions, s.year);
        if (!child || !at || (child.frames[0] && child.frames[0].year <= s.year)) continue;
        child.frames.unshift({
          year: s.year, lat: at.lat, lon: at.lon,
          confidence: weaker(at.confidence, child.frames[0]?.confidence ?? at.confidence),
          source: s.source, note: s.note ?? `Splits from ${n.name}`, synthetic: 'split',
        });
      }
    }
    // Merges: travel to where the target is in the merge year, then fuse.
    for (const n of nations) {
      const m = (n.merges ?? [])[0];
      const track = this.byId.get(n.id)!;
      if (!m || !this.byId.has(m.into)) continue;
      track.endsAt = { year: m.year, into: m.into };
      const last = track.frames[track.frames.length - 1];
      const target = this.sample(m.into, m.year);
      if (last && target && m.year > last.year) {
        track.frames.push({
          year: m.year, lat: target.lat, lon: target.lon,
          confidence: weaker(last.confidence, target.confidence),
          source: m.source, note: m.note ?? `Joins ${this.byId.get(m.into)!.nation.name}`, synthetic: 'merge',
        });
      }
    }
  }

  /** Where a nation is in a (fractional) year, or null when not on the map. */
  sample(id: string, year: number, depth = 0): Sample | null {
    const t = this.byId.get(id);
    if (!t || depth > 4) return null;
    if (t.endsAt && year > t.endsAt.year) return null;
    return interpolate(t.frames, year);
  }

  /** The alternative (contested) position, only within the alternative's own span. */
  sampleAlt(id: string, year: number): Sample | null {
    const t = this.byId.get(id);
    if (!t?.alt.length) return null;
    const lastAlt = t.alt[t.alt.length - 1];
    if (year > lastAlt.year) return null;
    return interpolate(t.alt, year);
  }

  /** Points along the last `span` years, oldest first, for the fading trail. */
  trail(id: string, year: number, span = 50, step = 1): { lat: number; lon: number; age: number }[] {
    const out: { lat: number; lon: number; age: number }[] = [];
    for (let y = Math.max(year - span, 0); y <= year; y += step) {
      const s = this.sample(id, y);
      if (s) out.push({ lat: s.lat, lon: s.lon, age: year - y });
    }
    const now = this.sample(id, year);
    if (now) out.push({ lat: now.lat, lon: now.lon, age: 0 });
    return out;
  }
}
