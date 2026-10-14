import { h } from '../utils/dom.js';
import { money, sum, ymLabel } from '../utils/format.js';
import { installments, nextYearMonthly } from '../selectors.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Stat, kv } from '../components/misc.js';
import { MonthChart } from '../components/month-chart.js';
import { withData, Empty } from '../components/states.js';

export default {
  title: () => 'รายการผ่อน',
  render: (_, state) => withData(state, view),
};

function view(data) {
  const list = installments(data);
  if (!list.length) {
    return Empty({
      title: 'ยังไม่มีรายการผ่อน',
      text: 'แก้ไขรายการแล้วกรอก "เดือนสิ้นสุด" เพื่อติดตามงวดที่เหลือ',
      action: Button({ label: 'ไปที่หมวด', href: '#/sheets', variant: 'secondary' }),
    });
  }
  const nextYear = data.year + 1;
  const carry = list.filter((x) => x.afterYear > 0);
  const thisYear = list.filter((x) => x.afterYear === 0);
  const next = nextYearMonthly(list, data.year);

  return [
    h('section', { class: 'grid grid-3', 'aria-label': 'สรุปรายการผ่อน' },
      Stat({ label: `ภาระผ่อน ม.ค. ${nextYear}`, value: next[0], hint: 'ต่อเดือน' }),
      Stat({ label: 'ผ่อนข้ามปี', value: carry.length, unit: 'รายการ' }),
      Stat({ label: `ยอดคงค้างหลัง ธ.ค. ${data.year}`, value: sum(carry.map((x) => x.remainingAfterYear)), hint: 'ประมาณจากงวดล่าสุด' })),
    carry.length > 0 && Card({
      title: `ภาระผ่อนรายเดือน ปี ${nextYear}`,
      children: MonthChart({ values: next, income: data.income, label: `ภาระผ่อนรายเดือนปี ${nextYear}` }),
    }),
    group(`ผ่อนข้ามปี (${carry.length})`, carry, data.year),
    group(`จบภายในปี ${data.year} (${thisYear.length})`, thisYear, data.year),
  ];
}

function group(title, list, year) {
  if (!list.length) return null;
  return h('section', { class: 'stack' },
    h('h2', { class: 'section-title' }, title),
    h('div', { class: 'grid grid-3' }, list.map((x) => Card({
      title: x.item.name || '(ไม่มีชื่อ)',
      subtitle: x.sheet,
      href: `#/sheet/${encodeURIComponent(x.sheet)}/edit/${x.item.row}`,
      children: h('dl', { class: 'kv' },
        kv('งวดละ', `${money(x.monthly)} บาท`),
        kv('สิ้นสุด', ymLabel(x.item.end)),
        kv('เหลือ', x.left ? `${x.left} งวด` : 'ครบแล้ว'),
        x.afterYear > 0 && kv(`งวดหลังปี ${year}`, `${x.afterYear} งวด`)),
    }))));
}
