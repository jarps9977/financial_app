import { h } from '../utils/dom.js';
import { icon } from './icon.js';

const THRESHOLD = 72;

export function attachPullToRefresh(onRefresh) {
  const indicator = h('div', { class: 'ptr', 'aria-hidden': 'true' }, icon('arrow-clockwise'));
  document.body.append(indicator);
  let startY = null;
  let dist = 0;
  let busy = false;

  const blocked = () => busy || window.scrollY > 0
    || document.querySelector('dialog[open]')
    || document.documentElement.dataset.kind !== 'page';

  window.addEventListener('touchstart', (e) => {
    startY = !blocked() && e.touches.length === 1 ? e.touches[0].clientY : null;
    dist = 0;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    dist = Math.max(0, e.touches[0].clientY - startY);
    indicator.style.setProperty('--pull', `${Math.min(dist, THRESHOLD * 1.4)}px`);
    indicator.classList.toggle('is-visible', dist > 12);
    indicator.classList.toggle('is-ready', dist >= THRESHOLD);
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (startY === null) return;
    startY = null;
    const ready = dist >= THRESHOLD;
    indicator.classList.remove('is-ready');
    indicator.style.removeProperty('--pull');
    if (!ready) {
      indicator.classList.remove('is-visible');
      return;
    }
    busy = true;
    indicator.classList.add('is-loading');
    try {
      await onRefresh();
    } finally {
      busy = false;
      indicator.classList.remove('is-loading', 'is-visible');
    }
  });
}
