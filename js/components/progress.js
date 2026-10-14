import { h } from '../utils/dom.js';

let topBar = null;
let active = 0;

// Global indeterminate bar under the header; returns a done() callback, safe to call twice
export function startProgress() {
  if (!topBar) {
    topBar = h('div', { class: 'top-progress', role: 'progressbar', 'aria-label': 'กำลังทำงาน', hidden: true });
    document.body.append(topBar);
  }
  active++;
  topBar.hidden = false;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active = Math.max(0, active - 1);
    if (!active) topBar.hidden = true;
  };
}

// Determinate bar; set(ratio 0..1, text)
export function ProgressBar({ label }) {
  const fill = h('span', { class: 'progress-fill' });
  const text = h('span', { class: 'progress-text' });
  const el = h('div', { class: 'progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('span', { class: 'progress-track' }, fill),
    text);
  return {
    el,
    set(ratio, message) {
      const pct = Math.round(Math.max(0, Math.min(1, Number(ratio) || 0)) * 100);
      fill.style.setProperty('--p', `${pct}%`);
      el.setAttribute('aria-valuenow', String(pct));
      el.setAttribute('aria-valuetext', message ? `${message} ${pct}%` : `${pct}%`);
      text.textContent = message ? `${message} · ${pct}%` : `${pct}%`;
    },
  };
}
