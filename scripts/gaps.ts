// npm run gaps — regenerate data/GAPS.md from the data.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, loadDataset } from './lib/load';
import { renderGaps } from './lib/gaps';

const file = join(DATA, 'GAPS.md');
const next = renderGaps(loadDataset(), readFileSync(file, 'utf8'));
writeFileSync(file, next);
console.log(`Wrote ${file}`);
