// Map key. Explains the encodings, including how uncertainty is drawn, and
// switches the family fields on/off. Collapsible; no hover needed.
import { FAMILY } from '../theme';
import type { LayerState } from '../drivers/groups';
import { LAYERS } from '../drivers/groups';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

const svg = (inner: string) => {
  const s = h('span', { class: 'key-sym', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 28 18" width="28" height="18">${inner}</svg>`;
  return s;
};

const A = FAMILY.algonquian;
const S = FAMILY.siouan;
const I = FAMILY.iroquoian;

/** Key and layer toggles, as the content of the side panel's first tab. */
export function legendContent(opts: { fields: boolean; onFields: (on: boolean) => void; layers: LayerState }): HTMLElement {
  const row = (sym: HTMLElement, label: string) => h('li', {}, sym, h('span', {}, label));

  const list = h('ul', { class: 'key-list' },
    row(svg(`<circle cx="14" cy="9" r="6" fill="${A}" stroke="#F2EBDD" stroke-width="1.5"/>`), 'Algonquian'),
    row(svg(`<circle cx="14" cy="9" r="6" fill="${S}" stroke="#F2EBDD" stroke-width="1.5"/>`), 'Siouan'),
    row(svg(`<circle cx="14" cy="9" r="4.5" fill="${I}"/>`), 'Iroquoian (context)'),
    row(svg(`<defs><linearGradient id="kmix"><stop offset="0" stop-color="${A}" stop-opacity=".55"/><stop offset="1" stop-color="${S}" stop-opacity=".55"/></linearGradient></defs><rect x="1" y="3" width="26" height="12" rx="6" fill="url(#kmix)"/>`), 'Family field: overlap = mixed'),
    row(svg(`<defs><radialGradient id="klow"><stop offset="0" stop-color="${A}" stop-opacity=".5"/><stop offset="1" stop-color="${A}" stop-opacity="0"/></radialGradient></defs><circle cx="14" cy="9" r="9" fill="url(#klow)"/>`), 'Low confidence: faint, blurred'),
    row(svg(`<circle cx="7" cy="9" r="5" fill="${A}" fill-opacity=".18" stroke="${A}" stroke-dasharray="2.5 2"/><line x1="12" y1="9" x2="17" y2="9" stroke="${A}" stroke-dasharray="1 3" stroke-linecap="round"/><circle cx="22" cy="9" r="5" fill="${A}" fill-opacity=".18" stroke="${A}" stroke-dasharray="2.5 2"/>`), 'Contested: every option ghosted'),
    row(svg(`<pattern id="kdots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.9" fill="${A}"/><circle cx="4" cy="4" r="0.9" fill="${A}"/></pattern><rect x="1" y="3" width="26" height="12" rx="6" fill="url(#kdots)"/>`), 'Contested field: stippled'),
    row(svg(`<circle cx="14" cy="9" r="5" fill="${A}"/><circle cx="14" cy="9" r="8" fill="none" stroke="#5C4631" stroke-dasharray="2 2"/>`), 'Source needed: dashed ring'),
    row(svg(`<path d="M14 3 L20 9 L14 15 L8 9 Z" fill="#2F4C7A" stroke="#F2EBDD"/><circle cx="14" cy="9" r="8.5" fill="none" stroke="#2F4C7A" stroke-opacity=".4"/>`), 'Event: diamond, pulses while active'),
  );

  // Driver layers (SPEC § Layer toggles). Placeholders are visible but disabled.
  const layerButtons = LAYERS.map((l) => {
    const b = h('button', {
      type: 'button',
      class: `layer-toggle${l.placeholder ? ' placeholder' : ''}`,
      'aria-pressed': String(!l.placeholder && opts.layers.isOn(l.id)),
      style: `--c:${l.colour}`,
      ...(l.placeholder ? { 'aria-disabled': 'true' } : {}),
    }, h('span', { class: 'layer-dot' }), h('span', { class: 'layer-name' }, l.label), ...(l.placeholder ? [h('span', { class: 'layer-ph' }, l.placeholder)] : []));
    if (!l.placeholder) {
      b.addEventListener('click', () => {
        const on = !opts.layers.isOn(l.id);
        opts.layers.set(l.id, on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    return b;
  });
  const layersEl = h('div', { class: 'key-layers' }, h('h3', { class: 'key-sub' }, 'Layers'), h('div', { class: 'layer-grid' }, ...layerButtons));

  const toggle = h('button', { type: 'button', class: 'key-toggle', 'aria-pressed': String(opts.fields) });
  const setToggle = (on: boolean) => {
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? 'Family fields: on' : 'Family fields: off';
  };
  setToggle(opts.fields);
  toggle.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-pressed') !== 'true';
    setToggle(on);
    opts.onFields(on);
  });

  const note = h('p', { class: 'key-note' }, 'Fields are weighted by confidence. Population weighting waits on sourced figures.');

  return h('div', { class: 'key-content' }, list, toggle, note, layersEl);
}
