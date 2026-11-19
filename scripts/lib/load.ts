import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Dataset } from '../../src/data/types';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = join(ROOT, 'data');

export function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(DATA, file), 'utf8'));
}

/** Load raw JSON without trusting its shape; validate.ts checks it. */
export function loadRaw() {
  return {
    sources: readJson('sources.json') as any,
    languages: readJson('languages.json') as any,
    nations: readJson('nations.json') as any,
    events: readJson('events.json') as any,
    placenames: readJson('placenames.json') as any,
    chapters: readJson('chapters.json') as any,
  };
}

export function loadDataset(): Dataset {
  const r = loadRaw();
  return {
    sources: r.sources.sources,
    languages: r.languages.languages,
    nations: r.nations.nations,
    events: r.events.events,
    placenames: r.placenames.placenames,
    chapters: r.chapters.chapters,
  };
}
