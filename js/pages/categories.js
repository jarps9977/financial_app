import { h } from '../utils/dom.js';
import { money, sum, MONTHS_SHORT } from '../utils/format.js';
import { sheetMonthly, currentMonthIndex } from '../selectors.js';
import { Card } from '../components/card.js';
import { kv } from '../components/misc.js';
import { Sparkline } from '../components/month-chart.js';
import { withData, Empty } from '../components/states.js';

export default {
  title: () => 'หมวดรายจ่าย',
  render: (_, state) => withData(state, view),
};

function view(data) {
  if (!data.monthly.length && !data.sheets.length) return Empty({ title: 'ไม่พบ Sheet' });
  const cur = currentMonthIndex(data.year);
  return [
    h('h2', { class: 'section-title' }, 'รายจ่ายรายเดือน'),
    h('div', { class: 'grid grid-3' }, data.monthly.map((s) => {
      const monthly = sheetMonthly(s);
      return Card({
        title: s.name,
        subtitle: `${s.items.length} รายการ`,
        href: `#/sheet/${encodeURIComponent(s.name)}`,
        children: [
          h('dl', { class: 'kv' }, kv(`เดือน ${MONTHS_SHORT[cur]}`, `${money(monthly[cur])} บาท`), kv('ทั้งปี', `${money(sum(monthly))} บาท`)),
          Sparkline(monthly, cur),
        ],
      });
    })),
    data.sheets.length > 0 && [
      h('h2', { class: 'section-title' }, 'Sheet อื่น ๆ'),
      h('div', { class: 'grid grid-3' }, data.sheets.map((s) => Card({
        title: s.name,
        subtitle: `${s.rows.length} แถว · ดูอย่างเดียว`,
        href: `#/raw/${encodeURIComponent(s.name)}`,
      }))),
    ],
  ];
}
