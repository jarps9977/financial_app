import { h } from '../utils/dom.js';
import { icon } from './icons.js';

// Renders <a> when href is given, otherwise <button>
export function Button({
  label, icon: iconName, variant = 'primary', type = 'button', href, block, ariaLabel, disabled, className, onClick,
} = {}) {
  const cls = ['btn', `btn-${variant}`, block && 'btn-block', !label && 'btn-icon', className].filter(Boolean).join(' ');
  return h(href ? 'a' : 'button', {
    class: cls,
    type: href ? null : type,
    href,
    disabled: href ? null : disabled,
    'aria-label': ariaLabel,
    onClick,
  }, iconName && icon(iconName), label && h('span', {}, label));
}
