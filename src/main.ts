import './style.css';
import type { GeoProjection } from 'd3-geo';
import { dataset } from './data';
import { languageIndex } from './data/lang';
import { NEEDS_SOURCE } from './data/types';
import { drawBasemap, loadBasemap } from './map/basemap';
import type { Basemap } from './map/basemap';
import { drawLabels } from './map/labels';
import { FieldLayer } from './fields/layer';
import { mountLegend } from './ui/legend';
import { makeProjection } from './map/projection';
import { NationLayer } from './nations/layer';
import { Tracks } from './nations/track';
import { Clock } from './time/clock';
import { readHash, syncHash } from './time/url';
import { NationCard } from './ui/card';
import { mountTimebar } from './ui/timebar';

const container = document.getElementById('map') as HTMLDivElement;
const baseCanvas = document.getElementById('basemap') as HTMLCanvasElement;
const baseLabels = document.getElementById('labels') as unknown as SVGSVGElement;
const fieldCanvas = document.getElementById('fields') as HTMLCanvasElement;
const nationCanvas = document.getElementById('nations') as HTMLCanvasElement;
const nationSvg = document.getElementById('nation-labels') as unknown as SVGSVGElement;
const nationLabels = nationSvg.querySelector('g') as SVGGElement;
const todayNote = document.getElementById('today-note') as HTMLDivElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const counts = document.getElementById('counts') as HTMLSpanElement;

const lang = languageIndex(dataset.languages);
const tracks = new Tracks(dataset.nations);
const nations = new NationLayer(tracks, lang);
const fields = new FieldLayer(tracks, lang);
const clock = new Clock(readHash());

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
  projection = makeProjection(width, height, {
    top: narrow ? 10 : 16,
    right: narrow ? 12 : 20,
    bottom: narrow ? 52 : 56,
    left: narrow ? 40 : 52,
  });
  drawBasemap(sizeCanvas(baseCanvas), projection, map, width, height);
  drawLabels(baseLabels, projection, map, width, height);
  for (const svg of [nationSvg]) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
  }
  sizeCanvas(nationCanvas);
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
  const today = s.mode === 'today';
  todayNote.hidden = !today;
  if (today) {
    nationLabels.replaceChildren();
    card.hide();
    nations.selected = null;
    return;
  }
  fields.draw(fctx, s.year);
  nations.draw(ctx, projection, s.year);
  nations.drawLabels(nationLabels, size.width, size.height);
  if (nations.selected) card.show(nations.selected, s.year);
}

const card = new NationCard(
  container,
  dataset,
  tracks,
  lang,
  () => { nations.selected = null; card.hide(); renderTime(); },
  (year) => { clock.pause(); clock.seek(year); },
);

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
  if (moved > 10 || clock.state.mode === 'today') return;
  const r = container.getBoundingClientRect();
  const id = nations.hit(ev.clientX - r.left, ev.clientY - r.top);
  nations.selected = id;
  if (id) card.show(id, clock.state.year);
  else card.hide();
  renderTime();
});
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && nations.selected) { nations.selected = null; card.hide(); renderTime(); }
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
  mountLegend(document.getElementById('key')!, {
    fields: fields.enabled,
    onFields: (on) => { fields.enabled = on; renderTime(); },
  });
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
