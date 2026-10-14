import { h } from '../utils/dom.js';
import { icon } from './icon.js';

let uid = 0;

// Returns { el, input, setError }; options turns it into a <select>
// prefix/suffix are decorative adornments (icon node or short text) shown inside the input box
export function Field({ label, hint, hintIcon, options, required, prefix, suffix, ...attrs }) {
  const id = `fld${++uid}`;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const control = options
    ? h('select', { id, class: 'input', required, ...attrs }, options.map(([v, t]) => h('option', { value: v }, t)))
    : h('input', { id, class: 'input', required, ...attrs });
  control.setAttribute('aria-describedby', hint ? `${hintId} ${errId}` : errId);

  const box = prefix || suffix
    ? h('div', { class: `input-group${prefix ? ' has-prefix' : ''}${suffix ? ' has-suffix' : ''}` },
      prefix && h('span', { class: 'input-affix is-prefix', 'aria-hidden': 'true' }, prefix),
      control,
      suffix && h('span', { class: 'input-affix is-suffix', 'aria-hidden': 'true' }, suffix))
    : control;

  const err = h('p', { class: 'field-error', id: errId, hidden: true });
  const el = h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label, required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')),
    box,
    hint && h('p', { class: 'field-hint', id: hintId }, hintIcon && icon(hintIcon), hint),
    err);

  return {
    el,
    input: control,
    setError(msg) {
      err.textContent = msg || '';
      err.hidden = !msg;
      if (msg) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    },
  };
}
