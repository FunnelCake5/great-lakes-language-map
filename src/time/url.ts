// Shareable time state in the URL hash: #y=1673 or #today.
import type { Clock, TimeState } from './clock';

export function readHash(): Partial<TimeState> {
  const h = location.hash.replace(/^#/, '');
  if (h === 'today') return { mode: 'today' };
  const m = /(?:^|&)y=(\d{3,4})(?:&|$)/.exec(h);
  return m ? { year: Number(m[1]) } : {};
}

/** Keep the hash in step with the clock, without spamming history while playing. */
export function syncHash(clock: Clock) {
  let timer = 0;
  clock.subscribe((s) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const next = s.mode === 'today' ? '#today' : `#y=${Math.round(s.year)}`;
      if (location.hash !== next) history.replaceState(null, '', next);
    }, s.playing ? 1000 : 150);
  });
  window.addEventListener('hashchange', () => {
    const r = readHash();
    if (r.mode === 'today') clock.setToday(true);
    else if (r.year !== undefined) clock.seek(r.year);
  });
}
