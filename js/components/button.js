import { h } from '../utils/dom.js';
import { icon } from './icon.js';

// iconOnly keeps the label for screen readers via aria-label
export function Button({
  label, icon: iconName, variant = 'primary', href, onClick, type = 'button',
  block, iconOnly, className, disabled, form,
}) {
  const cls = ['btn', `btn-${variant}`, block && 'btn-block', iconOnly && 'btn-icon', className].filter(Boolean).join(' ');
  const children = [iconName && icon(iconName), !iconOnly && h('span', {}, label)];
  const aria = iconOnly ? label : null;
  if (href) return h('a', { class: cls, href, onClick, 'aria-label': aria }, children);
  return h('button', { class: cls, type, onClick, disabled, form, 'aria-label': aria, title: aria }, children);
}
