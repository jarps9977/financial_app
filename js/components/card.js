import { h } from '../utils/dom.js';

export function Card({ title, subtitle, action, href, children, className = '' } = {}) {
  const head = (title || action) && h('div', { class: 'card-head' },
    h('div', {}, title && h('h2', { class: 'card-title' }, title), subtitle && h('p', { class: 'card-sub' }, subtitle)),
    action);
  if (href) return h('a', { class: `card card-link ${className}`, href }, head, children);
  return h('section', { class: `card ${className}` }, head, children);
}
