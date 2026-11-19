// Language tree panel (SPEC § Language tree panel): family → branch →
// language → dialect, collapsible. Tapping a node highlights every nation
// speaking anything under it (across all time) and dims the rest. A level
// switch recolours the map by family, branch or language (semantic zoom).
// Nations and languages stay separate (rule 6): the tree lists languages,
// and each node shows how many nations fall under it.
import type { LanguageIndex } from '../data/lang';
import type { Palette, ZoomLevel } from '../data/palette';
import type { Language, Nation } from '../data/types';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c !== null) el.append(c);
  return el;
}

const STATUS_LABEL: Record<Language['status'], string> = {
  living: '',
  revitalizing: 'revitalizing',
  unrecorded: 'unrecorded',
  extinct: 'no living speakers',
};

export interface TreeApi {
  element: HTMLElement;
  setFocus(id: string | null, fromTree?: boolean): void;
  refresh(): void;
}

export function nationsUnder(nodeId: string, nations: readonly Nation[], lang: LanguageIndex): Nation[] {
  return nations.filter((n) => lang.path(n.language).some((l) => l.id === nodeId));
}

export function mountTree(opts: {
  languages: readonly Language[];
  nations: readonly Nation[];
  lang: LanguageIndex;
  palette: Palette;
  onFocus: (id: string | null) => void;
  onLevel: (level: ZoomLevel) => void;
}): TreeApi {
  const { languages, nations, lang, palette } = opts;
  const children = (id: string | null) => languages.filter((l) => l.parent === id);
  // Families and branches open; languages with dialects start closed.
  const expanded = new Set(languages.filter((l) => l.level === 'family' || l.level === 'branch').map((l) => l.id));
  let focus: string | null = null;

  // ---------- level switch ----------
  const levels: [ZoomLevel, string][] = [['family', 'Family'], ['branch', 'Branch'], ['language', 'Language']];
  const levelButtons = levels.map(([lv, label]) => {
    const b = h('button', { type: 'button', class: 'seg', 'aria-pressed': String(palette.level === lv) }, label);
    b.addEventListener('click', () => {
      opts.onLevel(lv);
      levelButtons.forEach((x, i) => x.setAttribute('aria-pressed', String(levels[i][0] === lv)));
      render();
    });
    return b;
  });
  const levelSwitch = h('div', { class: 'tree-level' },
    h('span', { class: 'tree-level-label' }, 'Colour map by'),
    h('div', { class: 'seg-group', role: 'group', 'aria-label': 'Colour map by' }, ...levelButtons));

  const list = h('ul', { class: 'tree', role: 'tree' });
  const hint = h('p', { class: 'key-note' }, 'Tap a language to highlight every nation that speaks it, across all time. Tap again to clear.');

  const row = (l: Language, depth: number): HTMLElement => {
    const kids = children(l.id);
    const open = expanded.has(l.id);
    const count = nationsUnder(l.id, nations, lang).length;
    const swatch = palette.colourOfNode(l);
    const caret = kids.length
      ? h('button', { type: 'button', class: 'tree-caret', 'aria-label': `${open ? 'Collapse' : 'Expand'} ${l.name}`, 'aria-expanded': String(open) }, open ? '▾' : '▸')
      : h('span', { class: 'tree-caret spacer' });
    caret.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (expanded.has(l.id)) expanded.delete(l.id); else expanded.add(l.id);
      render();
    });
    const status = STATUS_LABEL[l.status];
    const label = h('button', {
      type: 'button',
      class: `tree-node level-${l.level}${focus === l.id ? ' focused' : ''}${count === 0 ? ' empty' : ''}`,
      'aria-pressed': String(focus === l.id),
    },
      h('span', { class: 'tree-swatch', style: swatch ? `background:${swatch}` : 'visibility:hidden' }),
      h('span', { class: 'tree-name' }, l.name, status ? h('span', { class: `tree-status st-${l.status}` }, status) : null),
      h('span', { class: 'tree-count', 'aria-label': `${count} nations` }, count ? String(count) : ''),
    );
    label.addEventListener('click', () => api.setFocus(focus === l.id ? null : l.id, true));
    const li = h('li', { role: 'treeitem', 'aria-expanded': kids.length ? String(open) : 'false', style: `--depth:${depth}` },
      h('div', { class: 'tree-row' }, caret, label));
    if (kids.length && open) li.append(h('ul', { role: 'group' }, ...kids.map((k) => row(k, depth + 1))));
    return li;
  };

  const render = () => list.replaceChildren(...children(null).map((r) => row(r, 0)));

  const element = h('div', { class: 'tree-panel' }, levelSwitch, hint, list);
  const api = {
    element,
    setFocus(id: string | null, fromTree = false) {
      focus = id;
      // Make sure the focused node is visible.
      if (id) for (const a of lang.path(id).slice(0, -1)) expanded.add(a.id);
      render();
      if (fromTree) opts.onFocus(id);
    },
    refresh: render,
  };
  render();
  return api;
}
