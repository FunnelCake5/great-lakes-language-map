// Data gaps (CLAUDE.md rule 4, SPEC § Data gaps panel): every needs_source and
// contested item, plus weak-source placeholders and chapter placeholders.
// One source of truth for both the in-app panel and data/GAPS.md.
import type { Dataset, Position } from './types';
import { NEEDS_SOURCE } from './types';

export type GapKind = 'event' | 'nation' | 'placename' | 'chapter' | 'maize';

export interface GapItem {
  kind: GapKind;
  /** Record id (event/nation/chapter id, place name, or maize keyframe year). */
  ref: string;
  /** Year to jump to, when the item has one. */
  year?: number;
  /** Line text as written in GAPS.md, without the leading "- ". */
  text: string;
}

export interface GapSection { id: 'needs' | 'contested' | 'weak' | 'chapters'; title: string; items: GapItem[] }

const posItem = (id: string, p: Position): GapItem => ({
  kind: 'nation', ref: id, year: p.year, text: `nation \`${id}\` @ ${p.year}${p.note ? `: ${p.note}` : ''}`,
});

export function collectGaps(d: Dataset): GapSection[] {
  const weakKeys = new Set(Object.entries(d.sources).filter(([, s]) => s.tier === 'secondary-weak').map(([k]) => k));
  const allPositions = (n: Dataset['nations'][number]) => [...n.positions, ...(n.alt_positions ?? [])];
  const ev = (e: Dataset['events'][number]): GapItem => ({ kind: 'event', ref: e.id, year: e.year_start, text: `event \`${e.id}\`: ${e.title}` });
  const place = (p: Dataset['placenames'][number]): GapItem => ({ kind: 'placename', ref: p.name, text: `placename \`${p.name}\`` });

  const needs: GapItem[] = [
    ...d.events.filter((e) => e.source === NEEDS_SOURCE).map(ev),
    ...d.nations.flatMap((n) => allPositions(n).filter((p) => p.source === NEEDS_SOURCE).map((p) => posItem(n.id, p))),
    ...d.placenames.filter((p) => p.source === NEEDS_SOURCE).map(place),
    ...d.drivers.climate.maize_line.keyframes.filter((k) => k.source === NEEDS_SOURCE).map((k): GapItem => ({
      kind: 'maize', ref: String(k.year), year: k.year,
      text: `maize line keyframe @ ${k.year}${d.drivers.climate.maize_line.status === 'schematic' ? ' (schematic)' : ''}`,
    })),
  ];
  const contested: GapItem[] = [
    ...d.events.filter((e) => e.confidence === 'contested').map(ev),
    ...d.nations.flatMap((n) => allPositions(n).filter((p) => p.confidence === 'contested').map((p) => posItem(n.id, p))),
    ...d.placenames.filter((p) => p.confidence === 'contested').map(place),
  ];
  const weak: GapItem[] = [
    ...d.nations.flatMap((n) => {
      const ps = allPositions(n).filter((p) => weakKeys.has(p.source));
      return ps.length ? [{ kind: 'nation' as const, ref: n.id, year: ps[0].year, text: `nation \`${n.id}\`: ${ps.length} position${ps.length === 1 ? '' : 's'}` }] : [];
    }),
    ...d.events.filter((e) => weakKeys.has(e.source)).map(ev),
  ];
  const chapters: GapItem[] = d.chapters
    .filter((c) => c.status === 'placeholder')
    .map((c) => ({ kind: 'chapter', ref: c.id, text: `chapter \`${c.id}\` (Plate ${c.plate}): title and years not yet supplied` }));

  return [
    { id: 'needs', title: 'Needs source', items: needs },
    { id: 'contested', title: 'Contested', items: contested },
    { id: 'weak', title: 'Weak-source placeholders (Sultzman)', items: weak },
    { id: 'chapters', title: 'Chapter placeholders', items: chapters },
  ];
}

export const MANUAL_HEADING = '## Other known gaps';

/** The hand-written bullets from GAPS.md's "Other known gaps" section. */
export function manualGaps(gapsMd: string): string[] {
  const i = gapsMd.indexOf(MANUAL_HEADING);
  if (i < 0) return [];
  return gapsMd.slice(i + MANUAL_HEADING.length).split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
}
