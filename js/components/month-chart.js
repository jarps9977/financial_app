import { h } from '../utils/dom.js';
import { money, MONTHS, MONTHS_SHORT } from '../utils/format.js';

// CSS-only bar chart; each column carries its own aria-label for screen readers
export function MonthChart({ values, income = 0, current = -1, label, compact = false }) {
  const max = Math.max(income, ...values, 1);
  const cols = values.map((v, m) => {
    const over = income > 0 && v > income;
    const diff = income > 0 ? (over ? ` เกินรายได้ ${money(v - income)} บาท` : ` คงเหลือ ${money(income - v)} บาท`) : '';
    return h('div', {
      class: `chart-col${m === current ? ' is-current' : ''}`,
      role: 'listitem',
      'aria-label': `${MONTHS[m]} ${money(v)} บาท${diff}`,
    },
    h('div', { class: 'chart-track' },
      h('div', { class: `chart-bar${over ? ' is-over' : ''}`, style: { '--h': `${(Math.max(0, v) / max) * 100}%` } })),
    h('span', { class: 'chart-label', 'aria-hidden': 'true' }, MONTHS_SHORT[m]));
  });
  const line = income > 0 && h('div', { class: 'chart-income', style: { '--y': (income / max).toFixed(4) }, 'aria-hidden': 'true' },
    h('span', {}, `รายได้ ${money(income, 0)}`));
  return h('div', { class: `chart${compact ? ' chart-compact' : ''}` },
    h('div', { class: 'chart-plot', role: 'list', 'aria-label': label }, line, cols));
}

export function Sparkline(values, current = -1) {
  const max = Math.max(...values, 1);
  return h('div', { class: 'spark', 'aria-hidden': 'true' },
    values.map((v, m) => h('span', {
      class: m === current ? 'is-current' : null,
      style: { '--h': `${(Math.max(0, v) / max) * 100}%` },
    })));
}
