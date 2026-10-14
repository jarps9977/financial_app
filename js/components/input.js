import { h } from '../utils/dom.js';

let uid = 0;

export function Field({
  label, name, type = 'text', value = '', hint, inputmode, required, disabled, min, max, step, placeholder,
  autocomplete, maxlength,
} = {}) {
  const id = `f-${name}-${++uid}`;
  const hintId = hint ? `${id}-hint` : null;
  const errId = `${id}-err`;
  const input = h('input', {
    id, name, type, value, inputmode, required, disabled, min, max, step, placeholder, autocomplete, maxlength,
    'aria-describedby': [hintId, errId].filter(Boolean).join(' '),
  });
  const err = h('p', { class: 'field-error', id: errId, hidden: true });
  const el = h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label),
    input,
    hint && h('p', { class: 'field-hint', id: hintId }, hint),
    err);

  function setError(msg) {
    err.textContent = msg || '';
    err.hidden = !msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  return { el, input, setError };
}

export function SelectField({ label, name, value, options }) {
  const id = `f-${name}-${++uid}`;
  const input = h('select', { id, name },
    options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)));
  const el = h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, label), input);
  return { el, input };
}

export function Segmented({ legend, name, value, options, onChange }) {
  return h('fieldset', { class: 'segmented' },
    h('legend', { class: 'field-label' }, legend),
    h('div', { class: 'segmented-track' }, options.map(([v, text]) => {
      const id = `${name}-${v}-${++uid}`;
      return [
        h('input', { type: 'radio', id, name, value: v, checked: v === value, onChange: () => onChange(v) }),
        h('label', { for: id }, text),
      ];
    })));
}
