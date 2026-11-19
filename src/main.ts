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
import { collectGaps, manualGaps } from './data/gaps';
import type { GapItem } from './data/gaps';
import { gapCount, gapsContent } from './ui/gaps';
import { LAYERS } from './drivers/groups';
import gapsMd from '../data/GAPS.md?raw';
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
import { mountNarration } from './ui/narration';

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

const gapSections = collectGaps(dataset);

function summarise() {
  const { nations: ns, events, sources } = dataset;
  counts.textContent =
    `${ns.length} nations · ${events.length} events · ${Object.keys(sources).filter((k) => k !== NEEDS_SOURCE).length} sources · ${gapCount(gapSections)} data gaps`;
}

/** Jump from a data-gaps entry to the item on the map. */
function goToGap(item: GapItem) {
  clock.pause();
  if (item.kind === 'event') {
    const e = dataset.events.find((x) => x.id === item.ref);
    if (!e) return;
    const layer = LAYERS.find((l) => l.drivers.includes(e.driver));
    if (layer && !layers.isOn(layer.id) && !layer.placeholder) layers.set(layer.id, true);
    clock.seek(e.year_start);
    selectEvent(e.id);
  } else if (item.kind === 'nation') {
    if (item.year !== undefined) clock.seek(item.year);
    selectNation(item.ref);
  } else if (item.kind === 'placename') {
    const p = dataset.placenames.find((x) => x.name === item.ref);
    if (!p) return;
    if (!layers.isOn('placenames')) layers.set('placenames', true);
    nations.selected = null;
    events.selected = null;
    if (card.languageId) focusLanguage(null);
    clock.setToday(true);
    today.selected = p.name;
    card.showPlace(p, palette.colourOf(p.language));
    renderTime();
  } else if (item.kind === 'maize') {
    if (!layers.isOn('climate')) layers.set('climate', true);
    if (item.year !== undefined) clock.seek(item.year);
    clearSelection();
  }
  // On narrow screens the panel covers the map: get it out of the way.
  if (!window.matchMedia('(min-width: 1100px) and (min-aspect-ratio: 1/1)').matches) panel?.close();
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
  // 2x is the iPad's own density; higher only costs memory and fill rate.
  size = { width, height, dpr: Math.min(window.devicePixelRatio || 1, 2) };
  fieldStamp = { year: NaN, at: 0 };
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
  sizeCanvas(fieldCanvas, FIELD_SCALE);
  fields.resize(projection, map, width, height, FIELD_SCALE);
  renderTime();
}

/** Time-dependent layers: on every clock change. */
/** Field canvas resolution relative to CSS px: the fields are soft, so half
 * resolution is visually equivalent and a quarter of the pixels to composite. */
const FIELD_SCALE = 0.5;

/** Reduce Motion: draw pulses as still rings and skip the animation loop. */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Fields are soft by design, so during playback they are recomputed at most
 * every 100 ms or one year (they dominate frame cost); paused, seeking or
 * changed settings redraw at once.
 */
let fieldStamp = { year: NaN, at: 0 };
let fieldsDirty = true;
function fieldsDue(year: number, playing: boolean) {
  if (fieldsDirty || !playing) return true;
  const now = performance.now();
  return now - fieldStamp.at > 100 || Math.abs(year - fieldStamp.year) > 1;
}

function renderTime() {
  performance.mark('render-start');
  if (!projection || !basemap) return;
  const ctx = nationCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, size.width, size.height);
  const fctx = fieldCanvas.getContext('2d')!;
  const redrawFields = fieldsDue(clock.state.year, clock.state.playing) || clock.state.mode === 'today';
  if (redrawFields) fctx.clearRect(0, 0, size.width, size.height);
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
  if (redrawFields) {
    fields.draw(fctx, s.year);
    fieldStamp = { year: s.year, at: performance.now() };
    fieldsDirty = false;
  }
  nations.draw(ctx, projection, s.year);
  nations.drawLabels(nationLabels, size.width, size.height);
  if (nations.selected) card.show(nations.selected, s.year);
  startDrivers();
  // Visible in Safari's Web Inspector timeline when tuning on an iPad.
  performance.measure('render', 'render-start');
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
  if (reduceMotion.matches) now = 0; // still rings, no motion
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
    const moving = !reduceMotion.matches && projection && clock.state.mode !== 'today' && (events.hasActive(projection, y) || overlays.animating(y));
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
  fieldsDirty = true;
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
  // From Today, a link to a historical nation leaves Today at its last recorded position.
  if (clock.state.mode === 'today') {
    const frames = tracks.byId.get(id)?.frames.filter((f) => !f.synthetic) ?? [];
    if (frames.length) clock.seek(frames[frames.length - 1].year);
    today.selected = null;
  }
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
  mountNarration(document.getElementById('narration')!, clock, dataset.chapters);
  tree = mountTree({
    languages: dataset.languages,
    nations: dataset.nations,
    lang,
    palette,
    onFocus: (id) => focusLanguage(id),
    onLevel: (level) => { palette.level = level; fieldsDirty = true; renderTime(); },
  });
  panel = mountPanel(document.getElementById('key')!, [
    {
      id: 'key',
      label: 'Key',
      content: legendContent({
        fields: fields.enabled,
        onFields: (on) => { fields.enabled = on; fieldsDirty = true; renderTime(); },
        layers,
      }),
    },
    { id: 'languages', label: 'Languages', content: tree.element },
    { id: 'gaps', label: `Gaps ${gapCount(gapSections)}`, content: gapsContent(gapSections, manualGaps(gapsMd), goToGap) },
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
