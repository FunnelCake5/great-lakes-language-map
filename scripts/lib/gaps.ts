import type { Dataset } from '../../src/data/types';
import { MANUAL_HEADING, collectGaps } from '../../src/data/gaps';

const HEADER = `# Data gaps

Items that need a source (\`needs_source\`) or are disputed (\`contested\`). Fix them by adding a source to \`sources.json\` and updating the record. The app's "Data gaps" panel shows the same list.
`;

/**
 * Build GAPS.md. The generated sections come from src/data/gaps.ts (shared
 * with the in-app panel); everything from "## Other known gaps" onward is
 * hand-written and preserved verbatim.
 */
export function renderGaps(d: Dataset, existing: string): string {
  const i = existing.indexOf(MANUAL_HEADING);
  const manual = i >= 0 ? existing.slice(i).trimEnd() : `${MANUAL_HEADING}\n`;
  const sections = collectGaps(d).map((s) =>
    `## ${s.title}\n${s.items.length ? s.items.map((it) => `- ${it.text}`).join('\n') : '_None._'}`);
  return `${HEADER}\n${sections.join('\n\n')}\n\n${manual}\n`;
}
