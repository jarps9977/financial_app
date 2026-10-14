import { h } from '../utils/dom.js';
import { findRaw } from '../selectors.js';
import { Button } from '../components/button.js';
import { kv } from '../components/misc.js';
import { LazyList } from '../components/lazy-list.js';
import { withData, Empty } from '../components/states.js';

export default {
  title: (p) => p.name,
  render: (p, state) => withData(state, (data) => view(data, p.name)),
};

function view(data, name) {
  const sheet = findRaw(data, name);
  if (!sheet) return Empty({ title: 'ไม่พบ Sheet นี้', action: Button({ label: 'กลับหน้าหมวด', href: '#/sheets', variant: 'secondary' }) });
  if (!sheet.rows.length) return Empty({ title: 'Sheet นี้ยังว่าง' });

  return [
    h('p', { class: 'note' }, 'อ่านอย่างเดียว แก้ไขได้ใน Google Sheets'),
    h('div', { class: 'only-compact' }, LazyList(sheet.rows, (row) => rowCard(row, sheet.cols))),
    h('div', { class: 'only-wide' }, table(sheet)),
  ];
}

// First non-empty cell becomes the card title, the rest are column/value pairs
function rowCard(row, cols) {
  const cells = row.map((v, i) => ({ v, col: cols[i] })).filter((c) => c.v !== '');
  const [first, ...rest] = cells;
  return h('div', { class: 'raw-card' },
    h('p', { class: 'raw-title' }, first ? first.v : ''),
    rest.length > 0 && h('dl', { class: 'kv' }, rest.map((c) => kv(c.col, c.v))));
}

function table(sheet) {
  return h('div', { class: 'table-wrap', role: 'region', 'aria-label': `ตาราง ${sheet.name}`, tabindex: '0' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, sheet.cols.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, sheet.rows.map((row) => h('tr', {}, row.map((v, i) => (i === 0 ? h('th', { scope: 'row' }, v) : h('td', {}, v))))))));
}
