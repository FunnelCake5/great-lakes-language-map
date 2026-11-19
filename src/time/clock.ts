// The app's single source of time. Later phases subscribe and render from it.
import { YEARS } from '../data/types';
import { clampYear, tToYear, yearToT } from './scale';

export type Mode = 'history' | 'today';
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export interface TimeState {
  /** Fractional year; markers interpolate on this. */
  year: number;
  mode: Mode;
  playing: boolean;
  speed: Speed;
}

/** At ×1 a full 900→1900 run takes this long. Playback moves at constant
 * speed along the slider, so years pass slowly where the axis is stretched. */
const FULL_RUN_SECONDS = 120;

type Listener = (s: Readonly<TimeState>, prev: Readonly<TimeState>) => void;

export class Clock {
  private s: TimeState;
  private listeners = new Set<Listener>();
  private raf = 0;
  private last = 0;

  constructor(initial: Partial<TimeState> = {}) {
    this.s = { year: 1000, mode: 'history', playing: false, speed: 1, ...initial };
    this.s.year = clampYear(this.s.year);
  }

  get state(): Readonly<TimeState> { return this.s; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<TimeState>) {
    const prev = this.s;
    const next = { ...prev, ...patch };
    if (next.year === prev.year && next.mode === prev.mode && next.playing === prev.playing && next.speed === prev.speed) return;
    this.s = next;
    for (const fn of this.listeners) fn(next, prev);
  }

  /** Jump to a year; leaves the Today state. */
  seek(year: number) {
    this.set({ year: clampYear(year), mode: 'history' });
  }

  setToday(on: boolean) {
    if (on) this.pause();
    this.set({ mode: on ? 'today' : 'history' });
  }

  setSpeed(speed: Speed) { this.set({ speed }); }

  cycleSpeed() {
    const i = SPEEDS.indexOf(this.s.speed);
    this.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  }

  play() {
    if (this.s.playing) return;
    // Restart from the beginning if parked at the end.
    const from = this.s.mode === 'today' || this.s.year >= YEARS.max ? YEARS.min : this.s.year;
    this.set({ playing: true, mode: 'history', year: from });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    cancelAnimationFrame(this.raf);
    this.set({ playing: false });
  }

  toggle() { this.s.playing ? this.pause() : this.play(); }

  private tick = (now: number) => {
    // Cap dt so a backgrounded tab doesn't leap decades on return.
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const t = yearToT(this.s.year) + (dt * this.s.speed) / FULL_RUN_SECONDS;
    if (t >= 1) {
      this.set({ year: YEARS.max });
      this.pause();
      return;
    }
    this.set({ year: tToYear(t) });
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Step to the next/previous stop (event starts) relative to the current year. */
  step(stops: readonly number[], dir: 1 | -1) {
    const y = this.s.mode === 'today' ? YEARS.max + 1 : this.s.year;
    const eps = 0.5;
    const target = dir > 0
      ? stops.find((s) => s > y + eps)
      : [...stops].reverse().find((s) => s < y - eps);
    if (target !== undefined) {
      this.pause();
      this.seek(target);
    }
  }
}
