import type { Dataset, Position } from '../../src/data/types';
import { NEEDS_SOURCE } from '../../src/data/types';

const MANUAL_HEADING = '## Other known gaps';

const HEADER = `# Data gaps

Items that need a source (\`needs_source\`) or are disputed (\`contested\`). Fix them by adding a source to \`sources.json\` and updating the record.
`;

const posLine = (id: string, p: Position) =>
  `- nation \`${id}\` @ ${p.year}${p.note ? `: ${p.note}` : ''}`;

/**
 * Build GAPS.md. The generated sections come from the data; everything from
 * "## Other known gaps" onward is hand-written and preserved verbatim.
 */
export function renderGaps(d: Dataset, existing: string): string {
  const weakKeys = new Set(
    Object.entries(d.sources).filter(([, s]) => s.tier === 'secondary-weak').map(([k]) => k),
  );
  const allPositions = (n: Dataset['nations'][number]) => [...n.positions, ...(n.alt_positions ?? [])];

  const needs: string[] = [
    ...d.events.filter((e) => e.source === NEEDS_SOURCE).map((e) => `- event \`${e.id}\`: ${e.title}`),
    ...d.nations.flatMap((n) => allPositions(n).filter((p) => p.source === NEEDS_SOURCE).map((p) => posLine(n.id, p))),
    ...d.placenames.filter((p) => p.source === NEEDS_SOURCE).map((p) => `- placename \`${p.name}\``),
  ];

  const contested: string[] = [
    ...d.events.filter((e) => e.confidence === 'contested').map((e) => `- event \`${e.id}\`: ${e.title}`),
    ...d.nations.flatMap((n) => allPositions(n).filter((p) => p.confidence === 'contested').map((p) => posLine(n.id, p))),
    ...d.placenames.filter((p) => p.confidence === 'contested').map((p) => `- placename \`${p.name}\``),
  ];

  const weak: string[] = [
    ...d.nations.flatMap((n) => {
      const c = allPositions(n).filter((p) => weakKeys.has(p.source)).length;
      return c ? [`- nation \`${n.id}\`: ${c} position${c === 1 ? '' : 's'}`] : [];
    }),
    ...d.events.filter((e) => weakKeys.has(e.source)).map((e) => `- event \`${e.id}\`: ${e.title}`),
  ];

  const i = existing.indexOf(MANUAL_HEADING);
  const manual = i >= 0 ? existing.slice(i).trimEnd() : `${MANUAL_HEADING}\n`;
  const list = (xs: string[]) => (xs.length ? xs.join('\n') : '_None._');

  return `${HEADER}
## Needs source
${list(needs)}

## Contested
${list(contested)}

## Weak-source placeholders (Sultzman)
${list(weak)}

${manual}
`;
}
