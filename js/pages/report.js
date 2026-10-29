import { h } from '../utils/dom.js';
import { money, sum, MONTHS, MONTHS_SHORT } from '../utils/format.js';
import { groupPath } from '../router.js';
import { viewYear } from '../store.js';
import { buildReport, currentMonthIndex } from '../selectors.js';
import { Card } from '../components/card.js';
import { Stat, Notice, PageHero, PillLink, kv, toneOf } from '../components/misc.js';
import { BalanceChart, IncomeExpenseChart } from '../components/chart.js';
import { withData } from '../components/states.js';

export default {
  title: () => 'รายงานรายปี',
  render: (_, state) => withData(state, view),
};

function view(data) {
  const year = viewYear();
  const r = buildReport(data, year);
  const cur = year === new Date().getFullYear() ? currentMonthIndex(year) : -1;
  const negMonths = r.balance.filter((v) => v < 0).length;
  const yearBalance = sum(r.balance);

  return [
    PageHero({ title: 'รายงานรายปี', subtitle: 'รายรับ (Max) รายจ่าย และยอดคงเหลือของแต่ละเดือน', data, year }),
    r.projected && Notice({ tone: 'warn', text: `ปี ${year} เป็นยอดประมาณการจากรายการที่ตั้ง "ยอด/เดือน" หรือเดือนสิ้นสุดไว้` }),
    h('section', { class: 'grid grid-stats', 'aria-label': `สรุปรายงานปี ${year}` },
      Stat({ label: 'Max (รายรับสูงสุด/เดือน)', value: Math.max(...r.income), hint: `ทั้งปี ${money(sum(r.income))}`, icon: 'arrow-down', accent: 'green' }),
      Stat({ label: `รายจ่ายรวม ปี ${year}`, value: sum(r.total), hint: `สูงสุด ${money(Math.max(...r.total))}/เดือน`, icon: 'arrow-up', accent: 'red' }),
      Stat({ label: 'คงเหลือทั้งปี', value: yearBalance, tone: yearBalance < 0 ? 'neg' : null, icon: 'wallet2', accent: 'blue' }),
      Stat({
        label: 'เดือนที่ติดลบ', value: negMonths, unit: 'เดือน', tone: negMonths ? 'neg' : null, icon: 'graph-down-arrow', accent: 'purple',
        hint: negMonths ? `ต่ำสุด ${money(Math.min(...r.balance))}` : 'ไม่มีเดือนติดลบ',
      })),
    Card({
      title: 'รายรับ - รายจ่าย รายเดือน',
      subtitle: 'รายรับสีเทา · รายจ่ายสีเขียว หากเกิน Max เป็นแท่งแดง',
      className: 'card-lg',
      children: IncomeExpenseChart({ income: r.income, expense: r.total, current: cur, label: `รายรับและรายจ่ายรายเดือน ปี ${year}` }),
    }),
    Card({
      title: 'คงเหลือรายเดือน',
      subtitle: 'รายรับ (Max) ลบ รายจ่ายรวม · แท่งแดง = ติดลบ',
      action: PillLink('ดูภาพรวม', '#/'),
      className: 'card-lg',
      children: BalanceChart({ values: r.balance, current: cur, label: `คงเหลือรายเดือน ปี ${year}` }),
    }),
    h('div', { class: 'only-compact' }, h('div', { class: 'grid grid-2 month-cards' }, MONTHS.map((_, i) => monthCard(r, i, cur)))),
    h('div', { class: 'only-wide' }, Card({
      title: `ตารางสรุปปี ${year}`,
      subtitle: 'รวม · Max (รายรับ) · คงเหลือ แยกตามเดือน',
      icon: 'table',
      tone: 'teal',
      className: 'card-lg',
      children: reportTable(r, cur),
    })),
  ];
}

function monthCard(r, i, cur) {
  const bal = r.balance[i];
  return h('article', { class: `month-card is-${toneOf(bal)}${i === cur ? ' is-cur' : ''}`, 'aria-label': `${MONTHS[i]} คงเหลือ ${money(bal)}` },
    h('header', { class: 'month-card-head' },
      h('h3', {}, MONTHS[i], i === cur && h('span', { class: 'badge' }, 'เดือนนี้')),
      h('span', { class: `amount is-${toneOf(bal)} num` }, money(bal))),
    h('dl', { class: 'kv' },
      kv('รายรับ (Max)', money(r.income[i])),
      kv('รายจ่ายรวม', money(r.total[i]))),
    r.rows.length > 0 && h('details', { class: 'disclosure' },
      h('summary', {}, 'แยกตามหมวด'),
      h('dl', { class: 'kv' }, r.rows.map((g) => kv(g.name, money(g.months[i]))))));
}

function reportTable(r, cur) {
  const colCls = (i, extra = '') => `num${i === cur ? ' is-sel' : ''}${extra}`;
  const valueRow = (cls, label, values, total, cellCls = () => '') => h('tr', { class: cls },
    h('th', { scope: 'row', colspan: '2', class: 'row-label' }, label),
    values.map((v, i) => h('td', { class: colCls(i, cellCls(v)) }, money(v))),
    h('td', { class: `num${cellCls(total)}` }, money(total)));
  const toneCls = (v) => ` cell-${toneOf(v)}`;
  const section = (label) => h('tr', { class: 'row-section' }, h('th', { scope: 'colgroup', colspan: '15' }, label));

  return h('div', { class: 'table-wrap', role: 'region', 'aria-label': 'ตารางรายงานรายปี', tabindex: '0' },
    h('table', { class: 'data report-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'col-idx' }, 'ลำดับ'),
        h('th', { scope: 'col', class: 'col-name' }, 'ชื่อรายการ'),
        MONTHS_SHORT.map((m, i) => h('th', { scope: 'col', class: colCls(i) }, m)),
        h('th', { scope: 'col', class: 'num' }, 'ทั้งปี'))),
      h('tbody', {},
        valueRow('row-total', 'รวม', r.total, sum(r.total)),
        valueRow('row-max', 'Max (รายรับ)', r.income, sum(r.income)),
        valueRow('row-balance', 'คงเหลือ', r.balance, sum(r.balance), toneCls),
        r.rows.length > 0 && section('รายจ่ายแยกหมวด'),
        r.rows.map((g, idx) => h('tr', {},
          h('td', { class: 'col-idx' }, String(idx + 1)),
          h('th', { scope: 'row' }, h('a', { class: 'link', href: `#${groupPath(g.name)}` }, g.name)),
          g.months.map((v, i) => h('td', { class: colCls(i) }, v ? money(v) : '–')),
          h('td', { class: 'num' }, money(sum(g.months))))),
        r.incomeRows.length > 0 && section('รายรับ'),
        r.incomeRows.map((x, idx) => h('tr', {},
          h('td', { class: 'col-idx' }, String(idx + 1)),
          h('th', { scope: 'row' }, x.name || '(ไม่มีชื่อ)', h('span', { class: 'muted' }, ` · ${x.group}`)),
          x.months.map((v, i) => h('td', { class: colCls(i) }, v ? money(v) : '–')),
          h('td', { class: 'num' }, money(sum(x.months))))))));
}
