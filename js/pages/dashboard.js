import { h } from '../utils/dom.js';
import { money, sum, ymLabel, MONTHS_SHORT } from '../utils/format.js';
import { totalMonthly, sheetMonthly, currentMonthIndex, installments, nextYearMonthly } from '../selectors.js';
import { Card } from '../components/card.js';
import { Stat } from '../components/misc.js';
import { MonthChart } from '../components/month-chart.js';
import { withData, Empty } from '../components/states.js';

export default {
  title: () => 'ภาพรวม',
  render: (_, state) => withData(state, view),
};

const tone = (v) => (v < 0 ? 'neg' : 'pos');

function view(data) {
  const totals = totalMonthly(data);
  const cur = currentMonthIndex(data.year);
  const income = data.income;
  const yearSpend = sum(totals);
  const yearBalance = income * 12 - yearSpend;
  const curBalance = income - totals[cur];
  const negMonths = totals.filter((v) => v > income).length;

  return [
    h('section', { class: 'grid grid-4', 'aria-label': `สรุปปี ${data.year}` },
      Stat({ label: `รายได้ทั้งปี ${data.year}`, value: income * 12, hint: `เดือนละ ${money(income)}` }),
      Stat({ label: 'รายจ่ายทั้งปี', value: yearSpend, hint: `เฉลี่ย ${money(yearSpend / 12)}/เดือน` }),
      Stat({ label: 'คงเหลือทั้งปี', value: yearBalance, tone: tone(yearBalance) }),
      Stat({ label: `คงเหลือ ${MONTHS_SHORT[cur]}`, value: curBalance, tone: tone(curBalance), hint: `จ่าย ${money(totals[cur])}` })),
    Card({
      title: 'รายจ่ายรายเดือน',
      subtitle: negMonths ? `ติดลบ ${negMonths} เดือน (แท่งสีแดง)` : 'ไม่มีเดือนที่ติดลบ',
      children: MonthChart({ values: totals, income, current: cur, label: `รายจ่ายรายเดือนปี ${data.year}` }),
    }),
    h('div', { class: 'grid grid-2' }, breakdownCard(data), carryCard(data)),
  ];
}

function breakdownCard(data) {
  const rows = data.monthly
    .map((s) => ({ name: s.name, total: sum(sheetMonthly(s)) }))
    .sort((a, b) => b.total - a.total);
  const grand = sum(rows.map((r) => r.total)) || 1;
  return Card({
    title: 'แยกตามหมวด',
    subtitle: 'ยอดรวมทั้งปี',
    action: h('a', { class: 'link', href: '#/sheets' }, 'ดูทั้งหมด'),
    children: h('ul', { class: 'bars' }, rows.map((r) => {
      const pct = Math.round((r.total / grand) * 100);
      return h('li', {}, h('a', { class: 'bar-row', href: `#/sheet/${encodeURIComponent(r.name)}` },
        h('span', { class: 'bar-row-head' }, h('span', {}, r.name), h('span', { class: 'num' }, `${money(r.total)} · ${pct}%`)),
        h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'meter-fill', style: { '--w': `${pct}%` } }))));
    })),
  });
}

function carryCard(data) {
  const nextYear = data.year + 1;
  const list = installments(data).filter((x) => x.afterYear > 0);
  const action = h('a', { class: 'link', href: '#/installments' }, 'ดูทั้งหมด');
  if (!list.length) {
    return Card({
      title: `ภาระผ่อนปี ${nextYear}`,
      action,
      children: Empty({ title: 'ไม่มีรายการผ่อนข้ามปี', text: 'กรอก "เดือนสิ้นสุด" ในรายการผ่อนเพื่อดูภาระล่วงหน้า', compact: true }),
    });
  }
  const next = nextYearMonthly(list, data.year);
  return Card({
    title: `ภาระผ่อนปี ${nextYear}`,
    subtitle: `${list.length} รายการ · ม.ค. ${money(next[0])} บาท`,
    action,
    children: [
      MonthChart({ values: next, income: data.income, label: `ภาระผ่อนรายเดือนปี ${nextYear}`, compact: true }),
      h('ul', { class: 'mini-list' }, list.slice(-3).reverse().map((x) => h('li', {},
        h('span', {}, x.item.name), h('span', { class: 'muted' }, `จบ ${ymLabel(x.item.end)}`)))),
    ],
  });
}
