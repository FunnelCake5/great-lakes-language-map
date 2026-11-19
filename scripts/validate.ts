// npm run validate — schema, referential integrity, bounds and project rules
// (CLAUDE.md "Non-negotiable rules"). Exits non-zero on any error; CI runs it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOUNDS, CONFIDENCE, DRIVERS, LANGUAGE_LEVELS, LANGUAGE_STATUS, NEEDS_SOURCE, YEARS,
} from '../src/data/types';
import type { Dataset } from '../src/data/types';
import { DATA, ROOT, loadRaw } from './lib/load';
import { renderGaps } from './lib/gaps';

const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const warn = (where: string, msg: string) => warnings.push(`${where}: ${msg}`);

// ---------- primitive checks ----------
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function req(where: string, o: Record<string, any>, field: string, type: 'string' | 'number' | 'array' | 'nullable-string') {
  const v = o[field];
  const ok =
    type === 'string' ? isStr(v) && v.length > 0 :
    type === 'number' ? isNum(v) :
    type === 'array' ? Array.isArray(v) :
    v === null || (isStr(v) && v.length > 0);
  if (!ok) err(where, `field "${field}" must be ${type}, got ${JSON.stringify(v)}`);
  return ok;
}
function optStr(where: string, o: Record<string, any>, field: string) {
  if (o[field] !== undefined && !isStr(o[field])) err(where, `field "${field}" must be a string if present`);
}
function oneOf<T extends readonly string[]>(where: string, field: string, v: unknown, allowed: T) {
  if (!allowed.includes(v as string)) err(where, `${field} "${v}" is not one of ${allowed.join(' | ')}`);
}
function unknownKeys(where: string, o: Record<string, any>, allowed: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) err(where, `unknown field "${k}"`);
}
function coords(where: string, o: Record<string, any>) {
  if (!req(where, o, 'lat', 'number') || !req(where, o, 'lon', 'number')) return;
  if (o.lat < BOUNDS.latMin || o.lat > BOUNDS.latMax) err(where, `lat ${o.lat} outside ${BOUNDS.latMin}…${BOUNDS.latMax}`);
  if (o.lon < BOUNDS.lonMin || o.lon > BOUNDS.lonMax) err(where, `lon ${o.lon} outside ${BOUNDS.lonMin}…${BOUNDS.lonMax}`);
}
function year(where: string, field: string, v: unknown) {
  if (!isNum(v) || !Number.isInteger(v)) return err(where, `${field} must be an integer year`);
  if (v < YEARS.min || v > YEARS.today) err(where, `${field} ${v} outside ${YEARS.min}…${YEARS.today}`);
}

// ---------- load ----------
let raw: ReturnType<typeof loadRaw>;
try {
  raw = loadRaw();
} catch (e) {
  console.error(`✗ Could not parse data/: ${(e as Error).message}`);
  process.exit(1);
}

const files: [string, any, string][] = [
  ['sources.json', raw.sources, 'sources'],
  ['languages.json', raw.languages, 'languages'],
  ['nations.json', raw.nations, 'nations'],
  ['events.json', raw.events, 'events'],
  ['placenames.json', raw.placenames, 'placenames'],
  ['chapters.json', raw.chapters, 'chapters'],
  ['today.json', raw.today, 'nations'],
];
for (const [file, json, key] of files) {
  const shapeOk = key === 'sources' ? isObj(json?.[key]) : Array.isArray(json?.[key]);
  if (!shapeOk) {
    console.error(`✗ ${file}: top-level "${key}" ${key === 'sources' ? 'object' : 'array'} missing`);
    process.exit(1);
  }
}

const d: Dataset = {
  sources: raw.sources.sources,
  languages: raw.languages.languages,
  nations: raw.nations.nations,
  events: raw.events.events,
  placenames: raw.placenames.placenames,
  chapters: raw.chapters.chapters,
  drivers: raw.drivers,
  today: raw.today.nations,
};

// ---------- sources ----------
const sourceKeys = new Set(Object.keys(d.sources));
const weakSources = new Set<string>();
for (const [key, s] of Object.entries(d.sources)) {
  const w = `sources.${key}`;
  if (!isObj(s)) { err(w, 'must be an object'); continue; }
  unknownKeys(w, s, ['cite', 'url', 'tier']);
  req(w, s, 'cite', 'string');
  req(w, s, 'tier', 'string');
  if (!isStr(s.url)) err(w, 'url must be a string (may be empty)');
  else if (s.url && !/^https?:\/\//.test(s.url)) err(w, `url "${s.url}" is not http(s)`);
  else if (!s.url && key !== NEEDS_SOURCE && s.tier !== 'secondary-weak') warn(w, 'no url');
  if (s.tier === 'secondary-weak') weakSources.add(key);
}
if (!sourceKeys.has(NEEDS_SOURCE)) err('sources', `reserved key "${NEEDS_SOURCE}" missing`);

const usedSources = new Set<string>();
function sourceRef(where: string, key: unknown) {
  if (!isStr(key)) return err(where, 'source must be a string key');
  usedSources.add(key);
  if (!sourceKeys.has(key)) err(where, `source "${key}" not in sources.json`);
}

/** Rule 5: a weak source alone never supports confidence above `low`. */
function weakRule(where: string, source: unknown, confidence: unknown) {
  if (isStr(source) && weakSources.has(source) && (confidence === 'high' || confidence === 'med')) {
    err(where, `confidence "${confidence}" rests only on weak source "${source}"; must be low or contested until corroborated`);
  }
}

// ---------- languages ----------
const langById = new Map<string, any>();
d.languages.forEach((l: any, i) => {
  const w = `languages[${i}]${isStr(l?.id) ? ` (${l.id})` : ''}`;
  if (!isObj(l)) return err(w, 'must be an object');
  unknownKeys(w, l, ['id', 'name', 'parent', 'level', 'status', 'note']);
  req(w, l, 'id', 'string');
  req(w, l, 'name', 'string');
  req(w, l, 'parent', 'nullable-string');
  oneOf(w, 'level', l.level, LANGUAGE_LEVELS);
  oneOf(w, 'status', l.status, LANGUAGE_STATUS);
  optStr(w, l, 'note');
  if (langById.has(l.id)) err(w, `duplicate language id "${l.id}"`);
  langById.set(l.id, l);
});
for (const l of langById.values()) {
  const w = `languages (${l.id})`;
  if (l.parent === null) {
    if (l.level !== 'family') err(w, `level "${l.level}" has no parent; only families may be roots`);
    continue;
  }
  const p = langById.get(l.parent);
  if (!p) { err(w, `parent "${l.parent}" not found`); continue; }
  if (LANGUAGE_LEVELS.indexOf(p.level) >= LANGUAGE_LEVELS.indexOf(l.level)) {
    err(w, `parent "${p.id}" (${p.level}) must be a higher level than ${l.level}`);
  }
  // cycle check
  const seen = new Set<string>([l.id]);
  for (let cur = p; cur; cur = langById.get(cur.parent)) {
    if (seen.has(cur.id)) { err(w, 'parent chain has a cycle'); break; }
    seen.add(cur.id);
  }
}

// ---------- nations ----------
const nationIds = new Set<string>();
d.nations.forEach((n: any) => isStr(n?.id) && nationIds.has(n.id) ? err(`nations (${n.id})`, 'duplicate id') : nationIds.add(n?.id));

function position(where: string, p: any) {
  if (!isObj(p)) return err(where, 'must be an object');
  unknownKeys(where, p, ['year', 'lat', 'lon', 'confidence', 'source', 'note']);
  year(where, 'year', p.year);
  coords(where, p);
  oneOf(where, 'confidence', p.confidence, CONFIDENCE);
  sourceRef(where, p.source);
  optStr(where, p, 'note');
  weakRule(where, p.source, p.confidence);
}
function link(where: string, s: any, self: string) {
  if (!isObj(s)) return err(where, 'must be an object');
  unknownKeys(where, s, ['year', 'into', 'source', 'note']);
  year(where, 'year', s.year);
  req(where, s, 'into', 'string');
  if (isStr(s.into) && !nationIds.has(s.into)) err(where, `into "${s.into}" is not a nation id`);
  if (s.into === self) err(where, 'cannot split/merge into itself');
  sourceRef(where, s.source);
  optStr(where, s, 'note');
}

d.nations.forEach((n: any, i) => {
  const w = `nations[${i}]${isStr(n?.id) ? ` (${n.id})` : ''}`;
  if (!isObj(n)) return err(w, 'must be an object');
  unknownKeys(w, n, ['id', 'name', 'language', 'positions', 'alt_positions', 'splits', 'merges']);
  req(w, n, 'id', 'string');
  req(w, n, 'name', 'string');
  if (req(w, n, 'language', 'string') && !langById.has(n.language)) err(w, `language "${n.language}" not in languages.json`);
  if (req(w, n, 'positions', 'array')) {
    if (n.positions.length === 0) err(w, 'needs at least one position');
    n.positions.forEach((p: any, j: number) => position(`${w}.positions[${j}]`, p));
    for (let j = 1; j < n.positions.length; j++) {
      if (n.positions[j].year < n.positions[j - 1].year) err(`${w}.positions[${j}]`, 'years must be in ascending order');
    }
  }
  for (const key of ['alt_positions', 'splits', 'merges'] as const) {
    if (n[key] === undefined) continue;
    if (!Array.isArray(n[key])) { err(w, `${key} must be an array`); continue; }
    n[key].forEach((x: any, j: number) => key === 'alt_positions'
      ? position(`${w}.${key}[${j}]`, x)
      : link(`${w}.${key}[${j}]`, x, n.id));
  }
  // Rule 3: an alternative position only makes sense for a contested record.
  (n.alt_positions ?? []).forEach((p: any, j: number) => {
    if (p?.confidence !== 'contested') warn(`${w}.alt_positions[${j}]`, 'alternative position is not marked contested');
  });
});

// ---------- events ----------
const eventIds = new Set<string>();
d.events.forEach((e: any, i) => {
  const w = `events[${i}]${isStr(e?.id) ? ` (${e.id})` : ''}`;
  if (!isObj(e)) return err(w, 'must be an object');
  unknownKeys(w, e, ['id', 'year_start', 'year_end', 'title', 'driver', 'lat', 'lon', 'confidence', 'source', 'actors', 'note']);
  if (req(w, e, 'id', 'string')) {
    if (eventIds.has(e.id)) err(w, 'duplicate id');
    eventIds.add(e.id);
  }
  req(w, e, 'title', 'string');
  year(w, 'year_start', e.year_start);
  year(w, 'year_end', e.year_end);
  if (isNum(e.year_start) && isNum(e.year_end) && e.year_end < e.year_start) err(w, 'year_end is before year_start');
  oneOf(w, 'driver', e.driver, DRIVERS);
  coords(w, e);
  oneOf(w, 'confidence', e.confidence, CONFIDENCE);
  sourceRef(w, e.source);
  weakRule(w, e.source, e.confidence);
  optStr(w, e, 'note');
  if (req(w, e, 'actors', 'array')) {
    e.actors.forEach((a: unknown) => {
      if (!isStr(a) || !nationIds.has(a)) err(w, `actor "${a}" is not a nation id`);
    });
  }
});

// ---------- place names ----------
const placeNames = new Set<string>();
d.placenames.forEach((p: any, i) => {
  const w = `placenames[${i}]${isStr(p?.name) ? ` (${p.name})` : ''}`;
  if (!isObj(p)) return err(w, 'must be an object');
  unknownKeys(w, p, ['name', 'lat', 'lon', 'language', 'meaning', 'confidence', 'source', 'note']);
  if (req(w, p, 'name', 'string')) {
    if (placeNames.has(p.name)) err(w, 'duplicate name');
    placeNames.add(p.name);
  }
  coords(w, p);
  if (req(w, p, 'language', 'string') && !langById.has(p.language)) err(w, `language "${p.language}" not in languages.json`);
  if (!isStr(p.meaning)) err(w, 'meaning must be a string (may be empty)');
  oneOf(w, 'confidence', p.confidence, CONFIDENCE);
  sourceRef(w, p.source);
  weakRule(w, p.source, p.confidence);
  optStr(w, p, 'note');
});

// ---------- chapters ----------
const chapterIds = new Set<string>();
const plates = new Set<number>();
d.chapters.forEach((c: any, i) => {
  const w = `chapters[${i}]${isStr(c?.id) ? ` (${c.id})` : ''}`;
  if (!isObj(c)) return err(w, 'must be an object');
  unknownKeys(w, c, ['id', 'plate', 'title', 'year_start', 'year_end', 'status', 'note', 'narration']);
  if (c.narration !== undefined) {
    const n = c.narration;
    if (!isObj(n)) err(w, 'narration must be an object');
    else {
      unknownKeys(`${w}.narration`, n, ['file', 'credit', 'transcript']);
      if (req(`${w}.narration`, n, 'file', 'string')) {
        if (!/^[\w.-]+\.(mp3|m4a|aac|ogg|wav)$/i.test(n.file)) err(`${w}.narration`, `file "${n.file}" must be a plain audio file name`);
        else if (!existsSync(join(ROOT, 'public', 'audio', n.file))) err(`${w}.narration`, `public/audio/${n.file} not found`);
      }
      req(`${w}.narration`, n, 'credit', 'string');
      optStr(`${w}.narration`, n, 'transcript');
      if (c.status !== 'defined') err(w, 'a placeholder chapter cannot have narration');
    }
  }
  if (req(w, c, 'id', 'string')) {
    if (chapterIds.has(c.id)) err(w, 'duplicate id');
    chapterIds.add(c.id);
  }
  if (!isNum(c.plate) || !Number.isInteger(c.plate) || c.plate < 0) err(w, 'plate must be a non-negative integer');
  else if (plates.has(c.plate)) err(w, `duplicate plate ${c.plate}`);
  else plates.add(c.plate);
  oneOf(w, 'status', c.status, ['defined', 'placeholder'] as const);
  optStr(w, c, 'note');
  if (c.status === 'defined') {
    req(w, c, 'title', 'string');
    year(w, 'year_start', c.year_start);
    year(w, 'year_end', c.year_end);
    if (isNum(c.year_start) && isNum(c.year_end) && c.year_end < c.year_start) err(w, 'year_end is before year_start');
  } else if (c.status === 'placeholder') {
    // Rule 1: a placeholder must not carry made-up history.
    for (const k of ['title', 'year_start', 'year_end']) {
      if (c[k] !== null) err(w, `placeholder chapter must have ${k}: null until sourced`);
    }
  }
});
for (let i = 1; i < d.chapters.length; i++) {
  if ((d.chapters[i] as any).plate < (d.chapters[i - 1] as any).plate) err(`chapters[${i}]`, 'plates must be in ascending order');
}

// ---------- drivers ----------
{
  const dr: any = d.drivers;
  const w = 'drivers.json';
  const evRef = (where: string, id: unknown) => {
    if (!isStr(id) || !eventIds.has(id)) err(where, `event "${id}" not in events.json`);
  };
  if (!isObj(dr?.cahokia) || !isObj(dr?.climate) || !isObj(dr?.disease)) err(w, 'needs cahokia, climate and disease sections');
  else {
    const site = dr.cahokia.site;
    if (!isObj(site)) err(`${w} cahokia.site`, 'missing');
    else {
      req(`${w} cahokia.site`, site, 'name', 'string');
      coords(`${w} cahokia.site`, site);
      oneOf(`${w} cahokia.site`, 'confidence', site.confidence, CONFIDENCE);
      sourceRef(`${w} cahokia.site`, site.source);
    }
    (dr.cahokia.phases ?? []).forEach((p: any, i: number) => {
      const pw = `${w} cahokia.phases[${i}]`;
      oneOf(pw, 'kind', p?.kind, ['pull', 'release'] as const);
      evRef(pw, p?.from_event);
      evRef(pw, p?.to_event);
    });
    evRef(`${w} cahokia.abandoned_event`, dr.cahokia.abandoned_event);
    (dr.cahokia.regions ?? []).forEach((r: any, i: number) => {
      evRef(`${w} cahokia.regions[${i}]`, r?.event);
      req(`${w} cahokia.regions[${i}]`, r ?? {}, 'label', 'string');
    });
    (dr.climate.drought_events ?? []).forEach((id: unknown, i: number) => evRef(`${w} climate.drought_events[${i}]`, id));
    const ml = dr.climate.maize_line;
    if (!isObj(ml)) err(`${w} climate.maize_line`, 'missing');
    else {
      oneOf(`${w} climate.maize_line`, 'status', ml.status, ['schematic', 'sourced'] as const);
      (ml.keyframes ?? []).forEach((k: any, i: number) => {
        const kw = `${w} climate.maize_line.keyframes[${i}]`;
        year(kw, 'year', k?.year);
        if (!isNum(k?.lat) || k.lat < BOUNDS.latMin || k.lat > BOUNDS.latMax) err(kw, `lat ${k?.lat} outside bounds`);
        oneOf(kw, 'confidence', k?.confidence, CONFIDENCE);
        sourceRef(kw, k?.source);
        // Rule 1: a schematic line may not pretend to be sourced, and a sourced one may not lean on needs_source.
        if (ml.status === 'schematic' && k?.source !== NEEDS_SOURCE) err(kw, 'schematic keyframes must use source "needs_source"');
        if (ml.status === 'schematic' && k?.confidence !== 'low') err(kw, 'schematic keyframes must be confidence "low"');
        if (ml.status === 'sourced' && k?.source === NEEDS_SOURCE) err(kw, 'a sourced maize line cannot use needs_source');
      });
    }
    oneOf(`${w} disease.status`, 'status', dr.disease.status, ['no_data', 'available'] as const);
  }
}

// Rule 7 wording check, shared by the sections below.
const banned = /\b(vanish(ed|ing)?|extinct|extinction|died out)\b/i;
const scan = (where: string, text: unknown) => isStr(text) && banned.test(text) && err(where, `wording "${text.match(banned)![0]}" is not allowed for peoples (rule 7)`);

// ---------- today (present-day nations) ----------
const todayIds = new Set<string>();
d.today.forEach((t: any, i) => {
  const w = `today.json nations[${i}]${isStr(t?.id) ? ` (${t.id})` : ''}`;
  if (!isObj(t)) return err(w, 'must be an object');
  unknownKeys(w, t, ['id', 'name', 'language', 'historic', 'kind', 'lat', 'lon', 'confidence', 'source', 'name_source', 'note']);
  if (req(w, t, 'id', 'string')) {
    if (todayIds.has(t.id)) err(w, 'duplicate id');
    todayIds.add(t.id);
  }
  req(w, t, 'name', 'string');
  if (req(w, t, 'language', 'string') && !langById.has(t.language)) err(w, `language "${t.language}" not in languages.json`);
  if (t.historic !== undefined) {
    if (!Array.isArray(t.historic)) err(w, 'historic must be an array of nation ids');
    else t.historic.forEach((h: unknown) => { if (!isStr(h) || !nationIds.has(h)) err(w, `historic "${h}" is not a nation id`); });
  }
  oneOf(w, 'kind', t.kind, ['headquarters', 'reservation', 'community', 'statistical_area', 'trust_land'] as const);
  if (t.name_source !== undefined) {
    sourceRef(`${w}.name_source`, t.name_source);
    if (t.name_source === NEEDS_SOURCE) err(w, 'name_source must be a real source');
  }
  coords(w, t);
  oneOf(w, 'confidence', t.confidence, CONFIDENCE);
  sourceRef(w, t.source);
  // Rule 1 + phase 7: present-day records must carry a real source.
  if (t.source === NEEDS_SOURCE) err(w, 'present-day nations must have a real source, not needs_source');
  weakRule(w, t.source, t.confidence);
  optStr(w, t, 'note');
  scan(`${w}.name`, t.name);
  scan(`${w}.note`, t.note);
});

// ---------- rule 7: respectful framing ----------
// "extinct" is reserved for languages with no speakers; never for peoples.
d.nations.forEach((n: any) => {
  scan(`nations (${n.id}).name`, n.name);
  [...(n.positions ?? []), ...(n.alt_positions ?? []), ...(n.splits ?? []), ...(n.merges ?? [])]
    .forEach((p: any) => scan(`nations (${n.id}) @ ${p?.year}`, p?.note));
});
d.events.forEach((e: any) => { scan(`events (${e.id}).title`, e.title); scan(`events (${e.id}).note`, e.note); });

// ---------- housekeeping ----------
for (const k of sourceKeys) if (!usedSources.has(k) && k !== NEEDS_SOURCE) warn(`sources.${k}`, 'not referenced by any record');

const gapsFile = join(DATA, 'GAPS.md');
if (errors.length === 0) {
  const current = readFileSync(gapsFile, 'utf8');
  if (renderGaps(d, current) !== current) err('data/GAPS.md', 'out of date — run `npm run gaps`');
}

// ---------- report ----------
const counts = `${d.nations.length} nations · ${d.events.length} events · ${d.languages.length} languages · ${d.placenames.length} place names · ${d.chapters.length} chapters · ${sourceKeys.size} sources`;
for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\n✗ validate: ${errors.length} error(s), ${warnings.length} warning(s)  [${counts}]`);
  process.exit(1);
}
console.log(`✓ validate: data OK, ${warnings.length} warning(s)  [${counts}]`);
