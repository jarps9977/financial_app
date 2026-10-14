import { h } from '../utils/dom.js';

// Infinite scroll: renders pageSize items, then the next page when the sentinel nears the viewport
export function LazyList(items, renderItem, { pageSize = 30, label } = {}) {
  const list = h('ul', { class: 'list', 'aria-label': label });
  const sentinel = h('li', { class: 'list-sentinel', 'aria-hidden': 'true' });
  let shown = 0;
  let io = null;

  function more() {
    items.slice(shown, shown + pageSize).forEach((it) => list.insertBefore(h('li', {}, renderItem(it)), sentinel));
    shown = Math.min(items.length, shown + pageSize);
    if (shown >= items.length) {
      sentinel.remove();
      if (io) io.disconnect();
    }
  }

  list.append(sentinel);
  more();
  if (shown < items.length) {
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) more();
      }, { rootMargin: '400px 0px' });
      io.observe(sentinel);
    } else {
      while (shown < items.length) more();
    }
  }
  return list;
}
