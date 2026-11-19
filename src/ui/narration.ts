// Narration hooks (SPEC § Roadmap 8): one optional audio track per chapter.
// A "Listen" control appears only inside a chapter that has narration. Audio
// starts only from a tap (iPad Safari will not autoplay), stops when the
// chapter changes, and the transcript is available as text.
import type { Chapter } from '../data/types';
import type { Clock } from '../time/clock';
import { chapterAt } from './timebar';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

export function mountNarration(host: HTMLElement, clock: Clock, chapters: readonly Chapter[]) {
  const base = import.meta.env.BASE_URL;
  const audio = new Audio();
  audio.preload = 'none';
  const button = h('button', { type: 'button', class: 'narration-btn', 'aria-pressed': 'false' });
  const transcriptBtn = h('button', { type: 'button', class: 'narration-text', 'aria-expanded': 'false' }, 'Transcript');
  const transcript = h('div', { class: 'narration-transcript', hidden: '' });
  const credit = h('span', { class: 'narration-credit' });
  host.replaceChildren(button, transcriptBtn, credit, transcript);
  host.hidden = true;

  let current: Chapter | undefined;
  const label = () => {
    const playing = !audio.paused;
    button.textContent = playing ? '❚❚ Pause narration' : '▶ Listen';
    button.setAttribute('aria-pressed', String(playing));
  };

  button.addEventListener('click', () => {
    if (!current?.narration) return;
    if (audio.paused) {
      audio.play().catch(() => { /* blocked or missing: leave the control idle */ });
    } else audio.pause();
  });
  audio.addEventListener('play', label);
  audio.addEventListener('pause', label);
  audio.addEventListener('ended', label);
  transcriptBtn.addEventListener('click', () => {
    const open = transcript.hidden;
    transcript.hidden = !open;
    transcriptBtn.setAttribute('aria-expanded', String(open));
  });

  const update = () => {
    const ch = clock.state.mode === 'today' ? undefined : chapterAt(chapters, clock.state.year);
    const next = ch?.narration ? ch : undefined;
    if (next?.id === current?.id) return;
    audio.pause();
    current = next;
    host.hidden = !current;
    if (!current?.narration) return;
    audio.src = `${base}audio/${current.narration.file}`;
    credit.textContent = current.narration.credit;
    transcript.textContent = current.narration.transcript ?? '';
    transcriptBtn.hidden = !current.narration.transcript;
    transcript.hidden = true;
    transcriptBtn.setAttribute('aria-expanded', 'false');
    label();
  };
  clock.subscribe(update);
  update();
}

/** Chapters with narration get a small mark on their chip. */
export function hasNarration(c: Chapter) {
  return !!c.narration;
}
