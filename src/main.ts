import './style.css';
import type { GeoProjection } from 'd3-geo';
import { dataset } from './data';
import { languageIndex } from './data/lang';
import { NEEDS_SOURCE } from './data/types';
import { drawBasemap, loadBasemap } from './map/basemap';
import type { Basemap } from './map/basemap';
import { drawLabels } from './map/labels';
import { FieldLayer } from './fields/layer';
import { legendContent } from './ui/legend';
import { mountPanel } from './ui/panel';
import { mountTree, nationsUnder } from './ui/tree';
import { Palette } from './data/palette';
import { TodayLayer } from './today/layer';
import { makeProjection } from './map/projection';
import { NationLayer } from './nations/layer';
import { Tracks } from './nations/track';
import { Clock } from './time/clock';
import { readHash, syncHash } from './time/url';
import { NationCard } from './ui/card';
import { LayerState } from './drivers/groups';
import { EventLayer } from './drivers/events';
import { DriverOverlays } from './drivers/overlays';
import { mountTimebar } from './ui/timebar';

const container = document.getElementById('map') as HTMLDivElement;
const baseCanvas = document.getElementById('basemap') as HTMLCanvasElement;
const baseLabels = document.getElementById('labels') as unknown as SVGSVGElement;
const fieldCanvas = document.getElementById('fields') as HTMLCanvasElement;
const nationCanvas = document.getElementById('nations') as HTMLCanvasElement;
const nationSvg = document.getElementById('nation-labels') as unknown as SVGSVGElement;
const nationLabels = nationSvg.querySelector('g') as SVGGElement;
const overlayCanvas = document.getElementById('overlays') as HTMLCanvasElement;
const eventCanvas = document.getElementById('events') as HTMLCanvasElement;
const driverSvg = document.getElementById('driver-labels') as unknown as SVGSVGElement;
const overlayLabels = driverSvg.querySelector('.overlay-labels') as SVGGElement;
const eventLabels = driverSvg.querySelector('.event-labels') as SVGGElement;
const todayNote = document.getElementById('today-note') as HTMLDivElement;
const todaySvg = document.getElementById('today-labels') as unknown as SVGSVGElement;
const todayGroup = todaySvg.querySelector('g') as SVGGElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const counts = document.getElementById('counts') as HTMLSpanElement;

const lang = languageIndex(dataset.languages);
const tracks = new Tracks(dataset.nations);
const palette = new Palette(lang, dataset.languages, dataset.nations.map((n) => n.language));
const nations = new NationLayer(tracks, lang, palette);
const fields = new FieldLayer(tracks, lang, palette);
const today = new TodayLayer(dataset.placenames, dataset.today, palette, (id) => lang.byId.get(id)?.name ?? id);
const clock = new Clock(readHash());
const layers = new LayerState();
const events = new EventLayer(dataset.events, layers);
const overlays = new DriverOverlays(dataset.drivers, dataset.events, layers);

let projection: GeoProjection | null = null;
let basemap: Basemap | null = null;
let size = { width: 0, height: 0, dpr: 1 };

function summarise() {
  const { nations: ns, events, placenames, sources } = dataset;
  const records = [
    ...events,
    ...placenames,
    ...ns.flatMap((n) => [...n.positions, ...(n.alt_positions ?? [])]),
  ];
  const gaps = records.filter((r) => r.source === NEEDS_SOURCE || r.confidence === 'contested').length;
  counts.textContent =
    `${ns.length} nations · ${events.length} events · ${Object.keys(sources).length - 1} sources · ${gaps} data gaps`;
}

function sizeCanvas(c: HTMLCanvasElement, dpr = size.dpr) {
  c.width = Math.round(size.width * dpr);
  c.height = Math.round(size.height * dpr);
  c.style.width = `${size.width}px`;
  c.style.height = `${size.height}px`;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Static layers: only on resize. */
function renderBase(map: Basemap) {
  basemap = map;
  const { width, height } = container.getBoundingClientRect();
  if (width < 10 || height < 10) return;
  size = { width, height, dpr: Math.min(window.devicePixelRatio || 1, 3) };
  const narrow = width < 600;
  events.compact = narrow;
  overlays.compact = narrow;
  projection = makeProjection(width, height, {
    top: narrow ? 10 : 16,
    right: narrow ? 12 : 20,
    bottom: narrow ? 52 : 56,
    left: narrow ? 40 : 52,
  });
  drawBasemap(sizeCanvas(baseCanvas), projection, map, width, height);
  drawLabels(baseLabels, projection, map, width, height);
  for (const svg of [nationSvg, driverSvg, todaySvg]) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
  }
  sizeCanvas(nationCanvas);
  sizeCanvas(overlayCanvas);
  sizeCanvas(eventCanvas);
  // Fields are soft by design; 1x resolution is enough and far cheaper on iPad.
  sizeCanvas(fieldCanvas, 1);
  fields.resize(projection, map, width, height, 1);
  renderTime();
}

/** Time-dependent layers: on every clock change. */
function renderTime() {
  if (!projection || !basemap) return;
  const ctx = nationCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, size.width, size.height);
  const fctx = fieldCanvas.getContext('2d')!;
  fctx.clearRect(0, 0, size.width, size.height);
  const s = clock.state;
  const isToday = s.mode === 'today';
  // The placeholder only shows while no present-day nation is sourced.
  todayNote.hidden = !isToday || dataset.today.length > 0;
  if (isToday) {
    nationLabels.replaceChildren();
    if (card.languageId) {
      // Leave no stale language highlight behind for when history resumes.
      nations.focus = null;
      fields.focus = null;
      tree?.setFocus(null);
    }
    if (nations.selected || events.selected || card.languageId) card.hide();
    nations.selected = null;
    events.selected = null;
    clearDrivers();
    today.showPlaces = layers.isOn('placenames');
    // Labels avoid whatever panels are open over the map.
    const c = container.getBoundingClientRect();
    const obstacles = ['.key', '.card:not([hidden])', '#today-note:not([hidden])']
      .map((sel) => container.querySelector(sel) as HTMLElement | null)
      .filter((e): e is HTMLElement => !!e && e.offsetParent !== null)
      .map((e) => { const r = e.getBoundingClientRect(); return [r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top] as [number, number, number, number]; });
    today.draw(todayGroup, projection, size.width, size.height, obstacles);
    return;
  }
  todayGroup.replaceChildren();
  today.selected = null;
  fields.draw(fctx, s.year);
  nations.draw(ctx, projection, s.year);
  nations.drawLabels(nationLabels, size.width, size.height);
  if (nations.selected) card.show(nations.selected, s.year);
  startDrivers();
}

// ---------- drivers: overlays below the nations, event pulses above ----------
function clearDrivers() {
  overlayCanvas.getContext('2d')!.clearRect(0, 0, size.width, size.height);
  eventCanvas.getContext('2d')!.clearRect(0, 0, size.width, size.height);
  overlayLabels.replaceChildren();
  eventLabels.replaceChildren();
}

function renderDrivers(now: number) {
  if (!projection || clock.state.mode === 'today') return;
  clearDrivers();
  const y = clock.state.year;
  overlays.draw(overlayCanvas.getContext('2d')!, projection, y, now);
  overlays.drawLabels(overlayLabels);
  events.draw(eventCanvas.getContext('2d')!, projection, y, now);
  events.drawLabels(eventLabels, size.width, size.height);
}

/** Animate only while something pulses; otherwise draw once and stop. */
let driverLoop = 0;
function startDrivers() {
  if (driverLoop) return;
  const tick = (now: number) => {
    renderDrivers(now);
    const y = clock.state.year;
    const moving = projection && clock.state.mode !== 'today' && (events.hasActive(projection, y) || overlays.animating(y));
    driverLoop = moving ? requestAnimationFrame(tick) : 0;
  };
  driverLoop = requestAnimationFrame(tick);
}

const card = new NationCard(
  container,
  dataset,
  tracks,
  lang,
  () => clearSelection(),
  (year) => { clock.pause(); clock.seek(year); },
  (id) => selectNation(id),
  (id) => focusLanguage(id),
);

let tree: ReturnType<typeof mountTree> | null = null;
let panel: ReturnType<typeof mountPanel> | null = null;

/** Language-tree focus: highlight every nation under a node, dim the rest. */
function focusLanguage(id: string | null) {
  const node = id ? dataset.languages.find((l) => l.id === id) : undefined;
  const under = node ? nationsUnder(node.id, dataset.nations, lang) : [];
  const set = node ? new Set(under.map((n) => n.id)) : null;
  nations.focus = set;
  fields.focus = set;
  tree?.setFocus(node ? node.id : null);
  if (node) {
    nations.selected = null;
    events.selected = null;
    card.showLanguage(node, under, palette.colourOf(node.id));
    panel?.open('languages');
  } else if (card.languageId) {
    card.hide();
  }
  renderTime();
}

function clearSelection() {
  if (card.languageId) return focusLanguage(null);
  today.selected = null;
  nations.selected = null;
  events.selected = null;
  card.hide();
  renderTime();
}
function selectNation(id: string) {
  events.selected = null;
  nations.selected = id;
  card.show(id, clock.state.year);
  renderTime();
}
function selectEvent(id: string) {
  const e = dataset.events.find((x) => x.id === id);
  if (!e) return;
  nations.selected = null;
  events.selected = id;
  card.showEvent(e);
  renderTime();
}

// Taps: select the nearest nation, or clear the selection. No hover anywhere.
let down: { x: number; y: number; id: number } | null = null;
container.addEventListener('pointerdown', (ev) => {
  if ((ev.target as HTMLElement).closest('.card, .key')) return;
  down = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
});
container.addEventListener('pointerup', (ev) => {
  if (!down || down.id !== ev.pointerId) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
  down = null;
  if (moved > 10) return;
  const r = container.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;
  if (clock.state.mode === 'today') {
    const t = today.hit(x, y);
    today.selected = t?.key ?? null;
    if (t?.kind === 'place') {
      const p = dataset.placenames.find((q) => q.name === t.key)!;
      card.showPlace(p, palette.colourOf(p.language));
    } else if (t?.kind === 'nation') {
      const n = dataset.today.find((q) => q.id === t.key)!;
      card.showToday(n, palette.colourOf(n.language));
    } else card.hide();
    renderTime();
    return;
  }
  // Event diamonds sit on top, so they win a tap; their card links to the nations involved.
  const e = events.hit(x, y);
  if (e) return selectEvent(e.id);
  const id = nations.hit(x, y);
  if (id) selectNation(id);
  else clearSelection();
});
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && (nations.selected || events.selected || card.languageId || today.selected)) clearSelection();
});

async function start() {
  summarise();
  mountTimebar(
    document.getElementById('timebar')!,
    document.getElementById('readout')!,
    clock,
    dataset.events,
    dataset.chapters,
  );
  syncHash(clock);
  tree = mountTree({
    languages: dataset.languages,
    nations: dataset.nations,
    lang,
    palette,
    onFocus: (id) => focusLanguage(id),
    onLevel: (level) => { palette.level = level; renderTime(); },
  });
  panel = mountPanel(document.getElementById('key')!, [
    {
      id: 'key',
      label: 'Key & layers',
      content: legendContent({
        fields: fields.enabled,
        onFields: (on) => { fields.enabled = on; renderTime(); },
        layers,
      }),
    },
    { id: 'languages', label: 'Languages', content: tree.element },
  ]);
  layers.subscribe(() => renderTime());
  let timeFrame = 0;
  clock.subscribe(() => {
    cancelAnimationFrame(timeFrame);
    timeFrame = requestAnimationFrame(renderTime);
  });
  try {
    const map = await loadBasemap();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => renderBase(map));
    };
    new ResizeObserver(schedule).observe(container);
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', schedule);
    renderBase(map);
    status.hidden = true;
    document.body.dataset.ready = 'true';
  } catch (e) {
    status.textContent = `Could not load the basemap: ${(e as Error).message}`;
    status.classList.add('error');
    console.error(e);
  }
}

start();
