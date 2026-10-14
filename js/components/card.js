import { h } from '../utils/dom.js';
import { icon as biIcon } from './icon.js';

export const CardIcon = (name, tone = 'teal') => h('span', { class: `card-icon is-${tone}`, 'aria-hidden': 'true' }, biIcon(name));

// Pass either href (whole card is a link) or action (button/link in the header), not both
export function Card({ title, subtitle, action, href, children, className = '', icon, tone }) {
  const head = (title || action) && h('div', { class: 'card-head' },
    icon && CardIcon(icon, tone),
    h('div', { class: 'card-head-text' },
      title && h('h2', { class: 'card-title' }, title),
      subtitle && h('p', { class: 'card-sub' }, subtitle)),
    action);
  const cls = `card ${href ? 'card-link ' : ''}${className}`.trim();
  return href
    ? h('a', { class: cls, href }, head, children)
    : h('section', { class: cls }, head, children);
}
