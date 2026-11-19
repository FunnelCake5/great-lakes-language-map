// Tap card for a nation: who they are, what they speak (via the language
// tree, rule 6), where they are in the current year and on what evidence.
import type { Dataset, Source } from '../data/types';
import { NEEDS_SOURCE } from '../data/types';
import type { LanguageIndex } from '../data/lang';
import { FAMILY } from '../theme';
import type { Keyframe, Sample, Tracks } from '../nations/track';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null | false)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== false) el.append(c);
  return el;
}

const CONF_LABEL = { high: 'High', med: 'Medium', low: 'Low', contested: 'Contested' } as const;

function badge(conf: keyof typeof CONF_LABEL) {
  return h('span', { class: `badge conf-${conf}` }, CONF_LABEL[conf]);
}

function sourceEl(key: string, sources: Record<string, Source>) {
  if (key === NEEDS_SOURCE) return h('span', { class: 'src needs' }, 'Source needed');
  const s = sources[key];
  if (!s) return h('span', { class: 'src' }, key);
  const weak = s.tier === 'secondary-weak';
  const text = s.cite;
  return h('span', { class: `src${weak ? ' weak' : ''}` },
    s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, text) : text,
    weak ? h('span', { class: 'src-tier' }, ' · weak secondary source') : null);
}

function describe(s: Sample, names: (id: string) => string, mergeInto?: string): string {
  switch (s.phase) {
    case 'keyframe': return 'Recorded position';
    case 'holding': return `No record after ${s.from.year}; shown where last recorded`;
    case 'merging': return `Moving to join the ${mergeInto ? names(mergeInto) : 'target'} (${s.to.year})`;
    default: return `Interpolated between ${s.from.year} and ${s.to.year}`;
  }
}

export class NationCard {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private shownId: string | null = null;
  private shownYear = NaN;

  constructor(
    host: HTMLElement,
    private data: Dataset,
    private tracks: Tracks,
    private lang: LanguageIndex,
    private onClose: () => void,
    private onSeek: (year: number) => void,
  ) {
    const close = h('button', { type: 'button', class: 'card-close', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => this.onClose());
    this.body = h('div', { class: 'card-body' });
    this.el = h('aside', { class: 'card', hidden: '', 'aria-live': 'polite' }, close, this.body);
    host.append(this.el);
  }

  hide() {
    this.el.hidden = true;
    this.shownId = null;
  }

  show(id: string, year: number) {
    const y = Math.round(year);
    if (this.shownId === id && this.shownYear === y && !this.el.hidden) return;
    const track = this.tracks.byId.get(id);
    if (!track) return this.hide();
    this.shownId = id;
    this.shownYear = y;
    const n = track.nation;
    const names = (nid: string) => this.tracks.byId.get(nid)?.nation.name ?? nid;
    const path = this.lang.path(n.language);
    const family = this.lang.family(n.language);
    const s = this.tracks.sample(id, y);
    const alt = this.tracks.sampleAlt(id, y);

    const head = h('header', { class: 'card-head' },
      h('span', { class: 'card-swatch', style: `background:${family ? FAMILY[family] : '#8C7358'}` }),
      h('h2', {}, n.name));

    const speaks = h('p', { class: 'card-lang' },
      h('span', { class: 'card-k' }, 'Language '),
      ...path.flatMap((l, i) => [i ? ' › ' : '', h('span', { class: i === path.length - 1 ? 'lang-leaf' : '' }, l.name)]),
      family === 'iroquoian' ? h('span', { class: 'card-note' }, ' (context only)') : null);

    // Other nations that speak the same language (rule 6: several nations, one language).
    const kin = this.data.nations.filter((o) => o.id !== n.id && o.language === n.language).map((o) => o.name);

    let now: HTMLElement;
    if (!s) {
      const first = track.frames[0];
      now = h('section', { class: 'card-now' },
        h('p', {}, track.endsAt && y > track.endsAt.year
          ? `Joined the ${names(track.endsAt.into)} in ${track.endsAt.year}.`
          : `Not on the map in ${y}: first recorded position is ${first?.year ?? 'unknown'}.`));
    } else {
      const frames: Keyframe[] = s.from === s.to ? [s.from] : [s.from, s.to];
      now = h('section', { class: 'card-now' },
        h('p', { class: 'card-phase' }, `${y}: ${describe(s, names, track.endsAt?.into)} `, badge(s.confidence)),
        ...frames.map((f) => h('div', { class: 'frame' },
          h('div', { class: 'frame-head' }, h('strong', {}, String(f.year)), ' ', f.note ? h('span', {}, f.note) : null, ' ', badge(f.confidence)),
          sourceEl(f.source, this.data.sources))),
        alt ? h('div', { class: 'frame alt' },
          h('div', { class: 'frame-head' }, h('strong', {}, 'Alternative'), ' ', h('span', {}, alt.from.note ?? ''), ' ', badge('contested')),
          sourceEl(alt.from.source, this.data.sources)) : null,
        s.needsSource ? h('p', { class: 'card-warn' }, 'Part of this position has no source yet. It is shown dashed and listed in the data gaps.') : null);
    }

    // Full track: tapping a row jumps the clock there.
    const rows = track.frames.map((f) => {
      const current = s && (f === s.from || f === s.to);
      const row = h('button', { type: 'button', class: `track-row${current ? ' current' : ''}${f.source === NEEDS_SOURCE ? ' needs' : ''}` },
        h('span', { class: 'track-year' }, String(f.year)),
        h('span', { class: 'track-note' }, f.note || '—'),
        badge(f.confidence));
      row.addEventListener('click', () => this.onSeek(f.year));
      return row;
    });

    const links: HTMLElement[] = [
      ...(n.splits ?? []).map((sp) => h('li', {}, `${sp.year}: part of the nation becomes the ${names(sp.into)}`, sp.note ? `: ${sp.note}` : '')),
      ...(n.merges ?? []).map((m) => h('li', {}, `${m.year}: joins the ${names(m.into)}`, m.note ? `: ${m.note}` : '')),
      ...this.data.nations.flatMap((o) => (o.splits ?? []).filter((sp) => sp.into === n.id).map((sp) => h('li', {}, `${sp.year}: emerges from the ${o.name}`))),
      ...this.data.nations.flatMap((o) => (o.merges ?? []).filter((m) => m.into === n.id).map((m) => h('li', {}, `${m.year}: the ${o.name} join`))),
    ];

    const parts: (HTMLElement | null)[] = [
      head,
      speaks,
      kin.length ? h('p', { class: 'card-kin' }, h('span', { class: 'card-k' }, 'Same language '), kin.join(', ')) : null,
      now,
      links.length ? h('ul', { class: 'card-links' }, ...links) : null,
      h('h3', {}, 'Recorded positions'),
      h('div', { class: 'track' }, ...rows),
    ];
    this.body.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
    this.el.hidden = false;
  }

  get id() { return this.shownId; }
}
