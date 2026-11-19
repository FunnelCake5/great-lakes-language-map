// Side panel with two tabs, "Key & layers" and "Languages". Tapping the open
// tab collapses the panel. Open by default only where there is room beside
// the plate; collapses itself when that room goes away.
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

export interface Tab { id: string; label: string; content: HTMLElement }

export function mountPanel(host: HTMLElement, tabs: Tab[]) {
  let open: string | null = null;
  const buttons = tabs.map((t) => {
    const b = h('button', { type: 'button', class: 'key-head', role: 'tab', 'aria-selected': 'false', 'aria-controls': `panel-${t.id}`, id: `tab-${t.id}` }, t.label);
    b.addEventListener('click', () => set(open === t.id ? null : t.id));
    return b;
  });
  const bodies = tabs.map((t) => h('div', { class: 'key-body', id: `panel-${t.id}`, role: 'tabpanel', 'aria-labelledby': `tab-${t.id}` }, t.content));

  const set = (id: string | null) => {
    open = id;
    tabs.forEach((t, i) => {
      buttons[i].setAttribute('aria-selected', String(t.id === id));
      bodies[i].hidden = t.id !== id;
    });
    host.classList.toggle('collapsed', id === null);
  };

  host.replaceChildren(h('div', { class: 'key-tabs', role: 'tablist' }, ...buttons), ...bodies);
  const roomy = window.matchMedia('(min-width: 1100px) and (min-aspect-ratio: 1/1)');
  set(roomy.matches ? tabs[0].id : null);
  roomy.addEventListener('change', () => set(roomy.matches ? tabs[0].id : null));
  return { open: (id: string) => set(id), close: () => set(null) };
}
