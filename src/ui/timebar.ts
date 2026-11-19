// Time controls: nonlinear slider, play/pause, speed, event stepping,
// chapter stops and the Today state. Touch-first: every target ≥ 44px and
// nothing depends on hover.
import type { Chapter, HistEvent } from '../data/types';
import { YEARS } from '../data/types';
import { DRIVER } from '../theme';
import type { Clock, TimeState } from '../time/clock';
import { BREAKS, axisTicks, tToYear, yearToT } from '../time/scale';

const pct = (t: number) => `${(t * 100).toFixed(3)}%`;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2.4v14H6zM19 5.5v13L9.5 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 5H18v14h-2.4zM5 5.5v13L14.5 12z"/></svg>',
};

const driverColour = (d: string): string => (DRIVER as Record<string, string>)[d] ?? '#8C7358';

export function formatYear(year: number): string {
  return `${Math.round(year)}`;
}

export function chapterAt(chapters: readonly Chapter[], year: number): Chapter | undefined {
  const y = Math.round(year);
  // Last defined chapter whose range contains the year.
  return [...chapters].reverse().find(
    (c) => c.status === 'defined' && c.year_start !== null && c.year_end !== null && y >= c.year_start && y <= c.year_end,
  );
}

export function mountTimebar(root: HTMLElement, readout: HTMLElement, clock: Clock, events: readonly HistEvent[], chapters: readonly Chapter[]) {
  const stops = [...new Set(events.map((e) => e.year_start))].filter((y) => y >= YEARS.min && y <= YEARS.max).sort((a, b) => a - b);

  // ---------- readout (overlaid on the map) ----------
  const yearEl = h('span', { class: 'readout-year' });
  const eraEl = h('span', { class: 'readout-era' }, 'CE');
  const chapterEl = h('span', { class: 'readout-chapter' });
  readout.replaceChildren(h('span', { class: 'readout-line' }, yearEl, eraEl), chapterEl);

  // ---------- buttons ----------
  const btn = (cls: string, label: string, html: string) => {
    const b = h('button', { type: 'button', class: `tb-btn ${cls}`, 'aria-label': label });
    b.innerHTML = html;
    return b;
  };
  const prevBtn = btn('tb-prev', 'Previous event', ICON.prev);
  const playBtn = btn('tb-play', 'Play', ICON.play);
  const nextBtn = btn('tb-next', 'Next event', ICON.next);
  const speedBtn = h('button', { type: 'button', class: 'tb-btn tb-speed', 'aria-label': 'Playback speed' }, '×1');
  const todayBtn = h('button', { type: 'button', class: 'tb-btn tb-today', 'aria-pressed': 'false' }, 'Today');

  prevBtn.addEventListener('click', () => clock.step(stops, -1));
  nextBtn.addEventListener('click', () => clock.step(stops, 1));
  playBtn.addEventListener('click', () => clock.toggle());
  speedBtn.addEventListener('click', () => clock.cycleSpeed());
  todayBtn.addEventListener('click', () => clock.setToday(clock.state.mode !== 'today'));

  // ---------- slider ----------
  const track = h('div', { class: 'tb-track' });
  // Zones of the nonlinear axis, so the change of scale is visible.
  let t0 = 0;
  for (const b of [...BREAKS, YEARS.max]) {
    const t1 = yearToT(b);
    track.append(h('span', { class: 'tb-zone', style: `left:${pct(t0)};width:${pct(t1 - t0)}` }));
    t0 = t1;
  }
  const fill = h('span', { class: 'tb-fill' });
  track.append(fill);

  const marks = h('div', { class: 'tb-marks', 'aria-hidden': 'true' });
  for (const e of events) {
    if (e.year_start < YEARS.min || e.year_start > YEARS.max) continue;
    const m = h('span', {
      class: `tb-event conf-${e.confidence}`,
      style: `left:${pct(yearToT(e.year_start))};--c:${driverColour(e.driver)}`,
    });
    marks.append(m);
  }

  const chapterBands = h('div', { class: 'tb-bands', 'aria-hidden': 'true' });
  for (const c of chapters) {
    if (c.status !== 'defined' || c.year_start === null || c.year_end === null) continue;
    const a = yearToT(c.year_start);
    const b = yearToT(c.year_end);
    chapterBands.append(h('span', { class: 'tb-band', style: `left:${pct(a)};width:${pct(b - a)}` }, `Plate ${c.plate}`));
  }

  const axis = h('div', { class: 'tb-axis', 'aria-hidden': 'true' });
  for (const { year, major } of axisTicks()) {
    const tick = h('span', { class: `tb-tick${major ? ' major' : ''}`, style: `left:${pct(yearToT(year))}` });
    if (major) tick.append(h('span', { class: 'tb-tick-label' }, String(year)));
    axis.append(tick);
  }

  const thumb = h('span', { class: 'tb-thumb' });
  const slider = h('div', {
    class: 'tb-slider',
    role: 'slider',
    tabindex: '0',
    'aria-label': 'Year',
    'aria-valuemin': String(YEARS.min),
    'aria-valuemax': String(YEARS.max),
  }, chapterBands, track, marks, thumb, axis);

  const yearFromPointer = (ev: PointerEvent) => {
    const r = track.getBoundingClientRect();
    return tToYear((ev.clientX - r.left) / r.width);
  };
  let dragging = false;
  let resumeAfterDrag = false;
  slider.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    dragging = true;
    resumeAfterDrag = clock.state.playing;
    clock.pause();
    slider.setPointerCapture(ev.pointerId);
    slider.classList.add('dragging');
    clock.seek(yearFromPointer(ev));
    ev.preventDefault();
  });
  slider.addEventListener('pointermove', (ev) => {
    if (dragging) clock.seek(yearFromPointer(ev));
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    slider.classList.remove('dragging');
    // Settle on a whole year once the finger lifts.
    clock.seek(Math.round(clock.state.year));
    if (resumeAfterDrag) clock.play();
  };
  slider.addEventListener('pointerup', endDrag);
  slider.addEventListener('pointercancel', endDrag);
  slider.addEventListener('keydown', (ev) => {
    const y = Math.round(clock.state.year);
    const big = ev.shiftKey ? 10 : 1;
    const map: Record<string, number | undefined> = {
      ArrowRight: y + big, ArrowUp: y + big, ArrowLeft: y - big, ArrowDown: y - big,
      PageUp: y + 25, PageDown: y - 25, Home: YEARS.min, End: YEARS.max,
    };
    const target = map[ev.key];
    if (target === undefined) return;
    ev.preventDefault();
    clock.pause();
    clock.seek(target);
  });

  // ---------- chapters ----------
  const chips = chapters.map((c) => {
    const defined = c.status === 'defined' && c.year_start !== null;
    const label = defined
      ? [h('span', { class: 'chip-plate' }, `Plate ${c.plate}`), h('span', { class: 'chip-title' }, c.title ?? ''), h('span', { class: 'chip-years' }, `${c.year_start}–${c.year_end}`)]
      : [h('span', { class: 'chip-plate' }, `Plate ${c.plate}`), h('span', { class: 'chip-title' }, 'awaiting data')];
    const chip = h('button', {
      type: 'button',
      class: `chip${defined ? '' : ' placeholder'}`,
      'data-id': c.id,
      ...(defined ? {} : { 'aria-disabled': 'true', title: c.note ?? 'Chapter not yet defined' }),
    }, ...label);
    if (defined) chip.addEventListener('click', () => { clock.pause(); clock.seek(c.year_start!); });
    return chip;
  });
  const chipRow = h('nav', { class: 'tb-chapters', 'aria-label': 'Chapters' }, ...chips);

  root.replaceChildren(
    chipRow,
    h('div', { class: 'tb-row' },
      h('div', { class: 'tb-group' }, prevBtn, playBtn, nextBtn, speedBtn),
      slider,
      todayBtn,
    ),
  );

  // Hide tick labels that would collide at the current width (phones, split view).
  const thinLabels = () => {
    const labels = [...axis.querySelectorAll<HTMLElement>('.tb-tick-label')];
    labels.forEach((l) => (l.style.visibility = ''));
    let lastRight = -Infinity;
    const keep = (l: HTMLElement) => {
      const r = l.getBoundingClientRect();
      if (r.left < lastRight + 6) return false;
      lastRight = r.right;
      return true;
    };
    // Always keep the two ends; thin the inside.
    const last = labels[labels.length - 1];
    const lastLeft = last?.getBoundingClientRect().left ?? Infinity;
    labels.forEach((l, i) => {
      const isEnd = i === 0 || l === last;
      const ok = isEnd ? keep(l) : l.getBoundingClientRect().right + 6 < lastLeft && keep(l);
      if (!ok) l.style.visibility = 'hidden';
    });
  };
  new ResizeObserver(thinLabels).observe(axis);

  // ---------- render from state ----------
  let lastRounded = NaN;
  let lastMode = '';
  const render = (s: Readonly<TimeState>) => {
    const today = s.mode === 'today';
    const t = yearToT(s.year);
    thumb.style.left = pct(t);
    fill.style.width = pct(t);
    slider.classList.toggle('is-today', today);
    playBtn.innerHTML = s.playing ? ICON.pause : ICON.play;
    playBtn.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
    speedBtn.textContent = `×${s.speed}`;
    todayBtn.setAttribute('aria-pressed', String(today));
    todayBtn.classList.toggle('active', today);

    const rounded = Math.round(s.year);
    if (rounded === lastRounded && s.mode === lastMode) return;
    lastRounded = rounded;
    lastMode = s.mode;

    slider.setAttribute('aria-valuenow', String(rounded));
    slider.setAttribute('aria-valuetext', today ? 'Today' : `${rounded} CE`);
    yearEl.textContent = today ? 'Today' : formatYear(s.year);
    eraEl.hidden = today;
    const ch = today ? undefined : chapterAt(chapters, s.year);
    chapterEl.textContent = today ? 'Present-day nations and place names' : ch ? `Plate ${ch.plate} · ${ch.title}` : '';
    for (const chip of chips) chip.classList.toggle('active', !!ch && chip.dataset.id === ch.id);
    prevBtn.disabled = !today && !stops.some((y) => y < s.year - 0.5);
    nextBtn.disabled = today || !stops.some((y) => y > s.year + 0.5);
  };
  clock.subscribe(render);
  render(clock.state);

  // Space toggles playback unless a control has focus.
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== ' ' || (ev.target as HTMLElement).closest('button, input, [role=slider]')) return;
    ev.preventDefault();
    clock.toggle();
  });
}
