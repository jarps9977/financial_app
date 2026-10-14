import { h } from '../utils/dom.js';

// Renders items in pages as the sentinel scrolls into view
export function LazyList(items, renderItem, { pageSize = 20 } = {}) {
  const ul = h('ul', { class: 'list' });
  const sentinel = h('li', { class: 'list-sentinel', 'aria-hidden': 'true' });
  let index = 0;

  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) more();
  }, { rootMargin: '200px' });

  function more() {
    const frag = document.createDocumentFragment();
    items.slice(index, index + pageSize).forEach((item) => frag.append(h('li', {}, renderItem(item))));
    index += pageSize;
    ul.insertBefore(frag, sentinel);
    if (index >= items.length) {
      io.disconnect();
      sentinel.remove();
    }
  }

  ul.append(sentinel);
  more();
  if (index < items.length) io.observe(sentinel);
  return ul;
}
