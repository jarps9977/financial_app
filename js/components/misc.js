import { h } from '../utils/dom.js';
import { money, MONTHS_SHORT } from '../utils/format.js';

export function Stat({ label, value, unit = 'บาท', tone, hint }) {
  return h('div', { class: 'stat' },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: `stat-value num ${tone || ''}` }, money(value), h('span', { class: 'stat-unit' }, unit)),
    hint && h('p', { class: 'stat-hint' }, hint));
}

export const kv = (key, value) => h('div', { class: 'kv-row' }, h('dt', {}, key), h('dd', { class: 'num' }, value));

export function MonthChips(selected, onSelect) {
  const options = [['all', 'ทั้งปี'], ...MONTHS_SHORT.map((m, i) => [i, m])];
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'เลือกเดือน' },
    options.map(([v, text]) => h('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(v === selected),
      onClick: () => onSelect(v),
    }, text)));
}

let region;

export function toast(message, variant = 'info') {
  if (!region) {
    region = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  const t = h('div', { class: `toast toast-${variant}` }, message);
  region.append(t);
  setTimeout(() => t.remove(), 3500);
}
