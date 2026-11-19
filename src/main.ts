import './style.css';
import { dataset } from './data';
import { NEEDS_SOURCE } from './data/types';
import { drawBasemap, loadBasemap } from './map/basemap';
import type { Basemap } from './map/basemap';
import { drawLabels } from './map/labels';
import { makeProjection } from './map/projection';

const container = document.getElementById('map') as HTMLDivElement;
const canvas = document.getElementById('basemap') as HTMLCanvasElement;
const svg = document.getElementById('labels') as unknown as SVGSVGElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const counts = document.getElementById('counts') as HTMLSpanElement;

function summarise() {
  const { nations, events, placenames, sources } = dataset;
  const records = [
    ...events,
    ...placenames,
    ...nations.flatMap((n) => [...n.positions, ...(n.alt_positions ?? [])]),
  ];
  const gaps = records.filter((r) => r.source === NEEDS_SOURCE || r.confidence === 'contested').length;
  counts.textContent =
    `${nations.length} nations · ${events.length} events · ${Object.keys(sources).length - 1} sources · ${gaps} data gaps`;
}

function render(map: Basemap) {
  const { width, height } = container.getBoundingClientRect();
  if (width < 10 || height < 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const narrow = width < 600;
  const projection = makeProjection(width, height, {
    top: narrow ? 10 : 16,
    right: narrow ? 12 : 20,
    bottom: narrow ? 52 : 56,
    left: narrow ? 40 : 52,
  });
  drawBasemap(ctx, projection, map, width, height);
  drawLabels(svg, projection, map, width, height);
}

async function start() {
  summarise();
  try {
    const map = await loadBasemap();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => render(map));
    };
    new ResizeObserver(schedule).observe(container);
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', schedule);
    render(map);
    status.hidden = true;
    document.body.dataset.ready = 'true';
  } catch (e) {
    status.textContent = `Could not load the basemap: ${(e as Error).message}`;
    status.classList.add('error');
    console.error(e);
  }
}

start();
