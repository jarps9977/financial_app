import { h } from '../utils/dom.js';
import { money, sum, MONTHS, MONTHS_SHORT } from '../utils/format.js';
import { groupPath } from '../router.js';
import { viewYear } from '../store.js';
import { buildReport, currentMonthIndex, incomeGroups, expenseGroups, itemMonths } from '../selectors.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Stat, Notice, PillLink, PageHero } from '../components/misc.js';
import { IncomeExpenseChart } from '../components/chart.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icon.js';
import { groupLook } from '../utils/group-look.js';

export default {
  title: () => 'ภาพรวม',
  render: (_, state) => withData(state, view),
};


function view(data) {
  const year = viewYear();
  const r = buildReport(data, year);
  const cur = currentMonthIndex(year);
  const income = sum(r.income);
  const spend = sum(r.total);
  const balance = income - spend;
  const incomeGroup = incomeGroups(data)[0];
  const curBalance = r.balance[cur];

  return [
    PageHero({ title: 'ภาพรวม', subtitle: 'สรุปรายรับ - รายจ่าย และยอดคงเหลือในปีที่เลือก', data, year }),
    r.projected && Notice({ tone: 'warn', text: `ปี ${year} คำนวณจาก "ยอด/เดือน" และช่วงเริ่ม-สิ้นสุดของแต่ละรายการ` }),
    income === 0 && Notice({
      text: 'ยังไม่มีรายรับ เพิ่มเงินเดือนในหมวดรายรับเพื่อคำนวณยอดคงเหลือ',
      action: incomeGroup && Button({ label: 'เพิ่มรายรับ', variant: 'secondary', href: `#${groupPath(incomeGroup.name)}/new` }),
    }),
    h('section', { class: 'grid grid-stats', 'aria-label': `สรุปปี ${year}` },
      Stat({ label: `รายรับรวม ปี ${year}`, value: income, hint: `เฉลี่ย ${money(income / 12)}/เดือน`, icon: 'arrow-down', accent: 'green' }),
      Stat({ label: `รายจ่ายรวม ปี ${year}`, value: spend, hint: `เฉลี่ย ${money(spend / 12)}/เดือน`, icon: 'arrow-up', accent: 'red' }),
      Stat({ label: 'คงเหลือสุทธิ', value: balance, tone: balance < 0 ? 'neg' : null, icon: 'wallet2', accent: 'blue', hint: 'รายรับ - รายจ่ายทั้งปี' }),
      Stat({
        label: `คงเหลือ ณ ${MONTHS_SHORT[cur]}`, value: curBalance, tone: curBalance < 0 ? 'neg' : null, icon: 'bar-chart-fill', accent: 'purple',
        hint: `จ่ายเดือนนี้ ${money(r.total[cur])}`,
      })),
    Card({
      title: 'รายรับ - รายจ่าย รายเดือน',
      subtitle: 'เปรียบเทียบรายรับและรายจ่ายในแต่ละเดือน',
      action: PillLink('ดูรายงาน', '#/report'),
      className: 'card-lg',
      children: IncomeExpenseChart({
        income: r.income, expense: r.total, current: year === new Date().getFullYear() ? cur : -1,
        label: `รายรับและรายจ่ายรายเดือน ปี ${year}`,
      }),
    }),
    h('div', { class: 'grid grid-2' }, breakdownCard(data, r, cur, year), monthItemsCard(data, year, cur)),
  ];
}

function breakdownCard(data, r, cur, year) {
  // Same palette position as the group list (index within expense groups)
  const expense = expenseGroups(data);
  const lookOf = (name) => {
    const index = expense.findIndex((g) => g.name === name);
    return groupLook(expense[index], index);
  };
  const rows = r.rows.map((g) => ({ name: g.name, total: sum(g.months), month: g.months[cur], look: lookOf(g.name) }))
    .sort((a, b) => b.total - a.total);
  const grand = sum(rows.map((x) => x.total)) || 1;
  return Card({
    title: 'แยกตามหมวดหมู่',
    subtitle: `ยอดรวม ม.ค. - ธ.ค. ปี ${year} · ${MONTHS_SHORT[cur]} ในวงเล็บ`,
    action: PillLink('ดูทั้งหมด', '#/groups'),
    className: 'card-lg',
    children: rows.length
      ? h('ul', { class: 'cat-list' }, rows.map((x) => {
        const pct = Math.round((x.total / grand) * 100);
        return h('li', {}, h('a', { class: `cat-row tone-${x.look.tone}`, href: `#${groupPath(x.name)}` },
          h('span', { class: 'cat-icon', 'aria-hidden': 'true' }, icon(x.look.icon)),
          h('span', { class: 'cat-name' }, x.name),
          h('span', { class: 'cat-amount num' }, `${money(x.total)} (${money(x.month)})`),
          h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'meter-fill', style: { '--w': `${pct}%` } })),
          h('span', { class: 'cat-pct num' }, `${pct}%`)));
      }))
      : Empty({ title: 'ยังไม่มีหมวดรายจ่าย', compact: true, action: Button({ label: 'สร้างหมวด', variant: 'accent', icon: 'plus-lg', href: '#/groups?new=1' }) }),
  });
}

function monthItemsCard(data, year, cur) {
  const list = expenseGroups(data)
    .flatMap((g) => g.items.map((item) => ({ group: g.name, item, amount: itemMonths(item, year, data.year)[cur] })))
    .filter((x) => x.amount)
    .sort((a, b) => b.amount - a.amount);
  const firstGroup = expenseGroups(data)[0];
  return Card({
    title: 'รายการในเดือนที่เลือก',
    subtitle: `จากเดือน ${MONTHS[cur]} ${year} · ${list.length} รายการ`,
    action: PillLink('ดูทั้งหมด', '#/groups'),
    className: 'card-lg',
    children: list.length
      ? h('ul', { class: 'mini-list' }, list.slice(0, 6).map((x) => h('li', {},
        h('a', { class: 'mini-row', href: `#${groupPath(x.group)}/edit/${x.item.row}` },
          h('span', { class: 'mini-main' }, h('span', { class: 'mini-title' }, x.item.name || '(ไม่มีชื่อ)'), h('span', { class: 'muted' }, x.group)),
          h('span', { class: 'mini-side num' }, money(x.amount))))))
      : Empty({
        icon: 'inbox', title: 'ไม่มีรายการในเดือนนี้', text: 'ไปที่ "หมวด" เพื่อเพิ่มข้อมูลรายรับ - รายจ่าย', compact: true,
        action: firstGroup && Button({ label: 'เพิ่มรายการ', icon: 'plus-lg', variant: 'accent', href: `#${groupPath(firstGroup.name)}/new` }),
      }),
  });
}
