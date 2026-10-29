import { h } from '../utils/dom.js';
import { money, sum, MONTHS, MONTHS_SHORT, todayYm, payCycleYm, ymKey } from '../utils/format.js';
import { groupPath } from '../router.js';
import { buildReport, availableYears, incomeGroups, expenseGroups, itemMonths, groupMonths, billsFor, billEntries } from '../selectors.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Notice, PillLink, PageHero, MonthSwitch, kv } from '../components/misc.js';
import { ProgressBar } from '../components/progress.js';
import { BalanceChart } from '../components/chart.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icon.js';
import { groupLook } from '../utils/group-look.js';

// Month-first overview: one focused month plus a rolling 12-month timeline of what is left after all spending
let focus = null;
const WINDOW = 12;

export default {
  title: () => 'ภาพรวม',
  render: (_, state) => withData(state, view),
};

const shift = ({ y, m }, delta) => {
  const k = ymKey(y, m) + delta;
  return { y: Math.floor(k / 12), m: (k % 12) + 1 };
};
const same = (a, b) => a.y === b.y && a.m === b.m;
const signed = (v) => `${v > 0 ? '+' : ''}${money(v)}`;

// Figures for any month; buildReport runs once per year per paint
function monthFigures(data) {
  const reports = new Map();
  return ({ y, m }) => {
    if (!reports.has(y)) reports.set(y, buildReport(data, y));
    const r = reports.get(y);
    return { income: r.income[m - 1], expense: r.total[m - 1], balance: r.balance[m - 1], projected: r.projected };
  };
}

function lookFinder(data) {
  // Same palette position as the group list (index within expense groups)
  const expense = expenseGroups(data);
  return (name) => {
    const index = expense.findIndex((g) => g.name === name);
    return groupLook(expense[index], index);
  };
}

function view(data) {
  const today = todayYm();
  if (!focus) focus = { ...today };
  const page = h('div', { class: 'stack' });
  const go = (ym) => {
    focus = ym;
    draw();
  };
  const draw = () => page.replaceChildren(...[content(data, today, go)].flat(Infinity).filter(Boolean));
  draw();
  return page;
}

function content(data, today, go) {
  const fig = monthFigures(data);
  const years = availableYears(data);
  const f = fig(focus);

  // Timeline starts at the real current month; it jumps to the focused month when that falls outside
  const inWindow = ymKey(focus.y, focus.m) >= ymKey(today.y, today.m) && ymKey(focus.y, focus.m) < ymKey(today.y, today.m) + WINDOW;
  const start = inWindow ? today : focus;
  const series = Array.from({ length: WINDOW }, (_, i) => shift(start, i))
    .filter((ym) => years.includes(ym.y))
    .map((ym) => ({ ym, ...fig(ym) }));

  const hasIncome = incomeGroups(data).some((g) => g.items.length);
  const incomeGroup = incomeGroups(data)[0];

  return [
    PageHero({
      title: 'ภาพรวม',
      subtitle: 'แต่ละเดือนหลังหักทุกรายการแล้ว เหลือบวกหรือติดลบเท่าไหร่',
      actions: MonthSwitch({ current: focus, years, onChange: go }),
    }),
    f.projected && Notice({ tone: 'warn', text: `ปี ${focus.y} คำนวณจาก "ยอด/เดือน" และช่วงเริ่ม-สิ้นสุดของแต่ละรายการ` }),
    !hasIncome && Notice({
      text: 'ยังไม่มีรายรับ เพิ่มเงินเดือนในหมวดรายรับเพื่อคำนวณยอดคงเหลือ',
      action: incomeGroup && Button({ label: 'เพิ่มรายรับ', variant: 'secondary', href: `#${groupPath(incomeGroup.name)}/new` }),
    }),
    balanceHero(focus, f, fig, go, today),
    timelineCard(series, focus, today, go),
    h('div', { class: 'grid grid-2' }, outstandingCard(data), breakdownCard(data, focus)),
    monthItemsCard(data, focus),
  ];
}

function balanceHero(ym, f, fig, go, today) {
  const neg = f.balance < 0;
  const usedPct = f.income ? Math.round((f.expense / f.income) * 100) : null;
  const usage = ProgressBar({ label: 'สัดส่วนรายจ่ายต่อรายรับ' });
  usage.set(f.income ? Math.min(1, f.expense / f.income) : (f.expense ? 1 : 0),
    usedPct == null ? 'ยังไม่มีรายรับในเดือนนี้' : `ใช้ไป ${usedPct}% ของรายรับ`);

  const part = (label, value, iconName, cls) => h('div', { class: `eq-part ${cls}` },
    h('span', { class: 'eq-label' }, icon(iconName), ` ${label}`),
    h('span', { class: 'eq-value num' }, money(value)));

  const compare = (label, target) => {
    const t = fig(target);
    return h('button', { type: 'button', class: `compare-chip ${t.balance < 0 ? 'is-neg' : 'is-pos'}`, onClick: () => go(target) },
      h('span', { class: 'muted' }, `${label} (${MONTHS_SHORT[target.m - 1]})`),
      h('span', { class: 'num' }, signed(t.balance)));
  };

  return h('section', { class: `balance-hero ${neg ? 'is-neg' : 'is-pos'}`, 'aria-label': `คงเหลือเดือน ${MONTHS[ym.m - 1]} ${ym.y}` },
    h('div', { class: 'balance-main' },
      h('p', { class: 'balance-label' },
        icon(neg ? 'trend-down' : 'trend-up'),
        ` คงเหลือ ${MONTHS[ym.m - 1]} ${ym.y}`,
        same(ym, today) && h('span', { class: 'badge' }, 'เดือนนี้')),
      h('p', { class: 'balance-amount num' }, signed(f.balance)),
      h('p', { class: 'balance-status' }, neg
        ? `ติดลบ ${money(-f.balance)} บาท · รายจ่ายมากกว่ารายรับ`
        : `เหลือใช้ ${money(f.balance)} บาท หลังจ่ายทุกรายการ`)),
    h('div', { class: 'balance-side' },
      h('div', { class: 'balance-equation' },
        part('รายรับ', f.income, 'arrow-down', 'is-in'),
        h('span', { class: 'eq-op', 'aria-hidden': 'true' }, '−'),
        part('รายจ่าย', f.expense, 'arrow-up', 'is-out'),
        h('span', { class: 'eq-op', 'aria-hidden': 'true' }, '='),
        part('คงเหลือ', f.balance, 'wallet2', neg ? 'is-neg' : 'is-pos')),
      h('div', { class: 'balance-usage' }, usage.el),
      h('div', { class: 'balance-compare' }, compare('เดือนก่อน', shift(ym, -1)), compare('เดือนหน้า', shift(ym, 1)))));
}

function timelineCard(series, current, today, go) {
  const neg = series.filter((s) => s.balance < 0);
  const worst = neg.length ? neg.reduce((a, b) => (b.balance < a.balance ? b : a)) : null;
  // Show the year on January and on the first tile so a window crossing years stays clear
  const label = (ym, i) => (i === 0 || ym.m === 1 ? `${MONTHS_SHORT[ym.m - 1]} ${String(ym.y).slice(-2)}` : MONTHS_SHORT[ym.m - 1]);

  return Card({
    title: `คงเหลือ ${series.length} เดือนข้างหน้า`,
    subtitle: neg.length
      ? `ติดลบ ${neg.length} เดือน · หนักสุด ${MONTHS[worst.ym.m - 1]} ${worst.ym.y} (${money(worst.balance)})`
      : 'ไม่มีเดือนที่ติดลบ',
    icon: 'calendar-check',
    tone: neg.length ? 'purple' : 'teal',
    action: PillLink('ดูรายงาน', '#/report'),
    className: 'card-lg',
    children: [
      h('div', { class: 'timeline', role: 'group', 'aria-label': 'เลือกเดือน' }, series.map((s, i) => {
        const ratio = s.income ? Math.min(1, s.expense / s.income) : (s.expense ? 1 : 0);
        return h('button', {
          type: 'button',
          class: `tl-tile ${s.balance < 0 ? 'is-neg' : 'is-pos'}${same(s.ym, today) ? ' is-today' : ''}`,
          'aria-pressed': String(same(s.ym, current)),
          'aria-label': `${MONTHS[s.ym.m - 1]} ${s.ym.y} คงเหลือ ${money(s.balance)}`,
          onClick: () => go(s.ym),
        },
        h('span', { class: 'tl-month' }, label(s.ym, i)),
        h('span', { class: 'tl-amount num' }, signed(s.balance)),
        h('span', { class: 'tl-meter', 'aria-hidden': 'true' }, h('span', { style: { '--w': `${Math.round(ratio * 100)}%` } })));
      })),
      BalanceChart({
        values: series.map((s) => s.balance),
        current: series.findIndex((s) => same(s.ym, current)),
        categories: series.map((s, i) => label(s.ym, i)),
        label: 'คงเหลือรายเดือนช่วง 12 เดือน',
      }),
    ],
  });
}

// Outstanding bills follow the pay cycle (rolls to next month on PAY_DAY), not the focused month
function outstandingCard(data) {
  const now = payCycleYm();
  const next = shift(now, 1);
  // Entries: credit-card groups count as one bill; amounts still sum per item
  const bills = billEntries(data, now.y, now.m);
  const unpaid = bills.filter((b) => !b.paid).sort((a, b) => b.amount - a.amount);
  const items = bills.flatMap((e) => e.items);
  const total = sum(items.map((b) => b.amount));
  const remaining = sum(items.filter((b) => !b.paid).map((b) => b.amount));
  const paid = total - remaining;
  const nextTotal = sum(billsFor(data, next.y, next.m).map((b) => b.amount));
  const monthName = MONTHS[now.m - 1];
  const lookOf = lookFinder(data);

  const progress = ProgressBar({ label: `ความคืบหน้าการจ่ายเดือน ${monthName}` });
  progress.set(total ? paid / total : 0, `จ่ายแล้ว ${bills.length - unpaid.length}/${bills.length} รายการ`);
  const done = bills.length > 0 && unpaid.length === 0;

  return Card({
    title: 'ยอดค้างจ่าย',
    subtitle: `เดือน ${monthName} ${now.y}`,
    icon: 'clipboard-text',
    tone: done ? 'teal' : 'purple',
    action: PillLink('ไปหน้าต้องจ่าย', '#/bills'),
    className: 'card-lg outstanding-card',
    children: bills.length
      ? h('div', { class: 'outstanding' },
        h('div', { class: 'outstanding-summary' },
          h('div', { class: 'outstanding-figures' },
            h('div', {},
              h('p', { class: 'muted' }, 'ค้างจ่าย'),
              h('p', { class: `outstanding-amount num${remaining ? ' is-due' : ' is-done'}` }, money(remaining))),
            h('dl', { class: 'kv' },
              kv('ต้องจ่ายทั้งหมด', money(total)),
              kv('จ่ายแล้ว', money(paid)),
              kv(`เดือนหน้า (${MONTHS_SHORT[next.m - 1]})`, money(nextTotal)))),
          progress.el),
        done
          ? h('p', { class: 'outstanding-done' }, icon('check-circle'), ' จ่ายครบทุกรายการแล้ว')
          : h('ul', { class: 'mini-list outstanding-list' }, unpaid.slice(0, 4).map((b) => {
            const look = lookOf(b.group);
            return h('li', {}, h('a', { class: `mini-row tone-${look.tone}`, href: '#/bills' },
              h('span', { class: 'bill-icon', 'aria-hidden': 'true' }, icon(look.icon)),
              h('span', { class: 'mini-main' },
                h('span', { class: 'mini-title' }, b.name),
                h('span', { class: 'muted' }, b.kind === 'group'
                  ? `บิลบัตร · ${b.items.length} รายการ${b.partial ? ` · จ่ายแล้ว ${b.paidCount}` : ''}`
                  : b.group)),
              // A partly paid card bill shows what is still owed
              h('span', { class: 'mini-side num' }, money(sum(b.items.filter((x) => !x.paid).map((x) => x.amount))))));
          }),
          unpaid.length > 4 && h('li', { class: 'muted outstanding-more' }, `และอีก ${unpaid.length - 4} รายการ`)))
      : Empty({ icon: 'inbox', title: 'เดือนนี้ไม่มีรายการที่ต้องจ่าย', compact: true }),
  });
}

function breakdownCard(data, ym) {
  const lookOf = lookFinder(data);
  const rows = expenseGroups(data)
    .map((g) => ({ name: g.name, amount: groupMonths(g, ym.y, data.year)[ym.m - 1], look: lookOf(g.name) }))
    .sort((a, b) => b.amount - a.amount);
  const grand = sum(rows.map((x) => x.amount)) || 1;
  return Card({
    title: 'รายจ่ายแยกตามหมวด',
    subtitle: `เดือน ${MONTHS[ym.m - 1]} ${ym.y}`,
    action: PillLink('ดูทั้งหมด', '#/groups'),
    className: 'card-lg',
    children: rows.length
      ? h('ul', { class: 'cat-list' }, rows.map((x) => {
        const pct = Math.round((x.amount / grand) * 100);
        return h('li', {}, h('a', { class: `cat-row tone-${x.look.tone}`, href: `#${groupPath(x.name)}` },
          h('span', { class: 'cat-icon', 'aria-hidden': 'true' }, icon(x.look.icon)),
          h('span', { class: 'cat-name' }, x.name),
          h('span', { class: 'cat-amount num' }, money(x.amount)),
          h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'meter-fill', style: { '--w': `${pct}%` } })),
          h('span', { class: 'cat-pct num' }, `${pct}%`)));
      }))
      : Empty({ title: 'ยังไม่มีหมวดรายจ่าย', compact: true, action: Button({ label: 'สร้างหมวด', variant: 'accent', icon: 'plus-lg', href: '#/groups?new=1' }) }),
  });
}

function monthItemsCard(data, ym) {
  const list = expenseGroups(data)
    .flatMap((g) => g.items.map((item) => ({ group: g.name, item, amount: itemMonths(item, ym.y, data.year)[ym.m - 1] })))
    .filter((x) => x.amount)
    .sort((a, b) => b.amount - a.amount);
  const firstGroup = expenseGroups(data)[0];
  return Card({
    title: 'รายการจ่ายในเดือนนี้',
    subtitle: `เดือน ${MONTHS[ym.m - 1]} ${ym.y} · ${list.length} รายการ`,
    action: PillLink('ดูทั้งหมด', '#/groups'),
    className: 'card-lg',
    children: list.length
      ? h('ul', { class: 'mini-list' }, list.slice(0, 8).map((x) => h('li', {},
        h('a', { class: 'mini-row', href: `#${groupPath(x.group)}/edit/${x.item.row}` },
          h('span', { class: 'mini-main' }, h('span', { class: 'mini-title' }, x.item.name || '(ไม่มีชื่อ)'), h('span', { class: 'muted' }, x.group)),
          h('span', { class: 'mini-side num' }, money(x.amount))))))
      : Empty({
        icon: 'inbox', title: 'ไม่มีรายการในเดือนนี้', text: 'ไปที่ "หมวด" เพื่อเพิ่มข้อมูลรายรับ - รายจ่าย', compact: true,
        action: firstGroup && Button({ label: 'เพิ่มรายการ', icon: 'plus-lg', variant: 'accent', href: `#${groupPath(firstGroup.name)}/new` }),
      }),
  });
}
