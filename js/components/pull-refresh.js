import { h } from '../utils/dom.js';
import { icon } from './icons.js';

export function attachPullToRefresh(host, onRefresh, { threshold = 70 } = {}) {
  const indicator = h('div', { class: 'ptr', 'aria-hidden': 'true' }, icon('refresh'));
  host.append(indicator);
  let startY = null;
  let distance = 0;
  let busy = false;

  const reset = () => {
    indicator.classList.remove('ready');
    indicator.style.setProperty('--pull', '0px');
  };

  window.addEventListener('touchstart', (e) => {
    if (busy || window.scrollY > 0 || document.querySelector('dialog[open], .sidebar[data-open]')) return;
    startY = e.touches[0].clientY;
    distance = 0;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    distance = Math.max(0, e.touches[0].clientY - startY);
    indicator.style.setProperty('--pull', `${Math.min(distance, threshold * 1.5)}px`);
    indicator.classList.toggle('ready', distance > threshold);
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (startY == null) return;
    const triggered = distance > threshold;
    startY = null;
    if (!triggered) { reset(); return; }
    busy = true;
    indicator.classList.add('spinning');
    try {
      await onRefresh();
    } finally {
      busy = false;
      indicator.classList.remove('spinning');
      reset();
    }
  });
}
