import { h } from '../utils/dom.js';
import { money, sum, MONTHS, MONTHS_SHORT, todayYm, ymKey } from '../utils/format.js';
import { groupPath } from '../router.js';
import { setPaid } from '../store.js';
import { billsFor, availableYears, expenseGroups } from '../selectors.js';
import { groupLook } from '../utils/group-look.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Stat, Notice, PageHero, MonthSwitch } from '../components/misc.js';
import { runTask, toast } from '../components/alert.js';
import { ProgressBar } from '../components/progress.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icon.js';

// Month shown survives repaints; starts at the current month
let viewYm = null;

export default {
  title: () => 'ต้องจ่าย',
  render: (_, state) => withData(state, view),
};

const shift = ({ y, m }, delta) => {
  const k = ymKey(y, m) + delta;
  return { y: Math.floor(k / 12), m: (k % 12) + 1 };
};
const ymText = ({ y, m }) => `${y}-${String(m).padStart(2, '0')}`;

function view(data) {
  const today = todayYm();
  if (!viewYm) viewYm = { y: today.y, m: today.m };
  const go = (ym) => { viewYm = ym; rerender(); };
  const page = h('div', { class: 'stack' });
  const rerender = () => page.replaceChildren(...[content(data, viewYm, today, go)].flat().filter(Boolean));
  rerender();
  return page;
}

function content(data, current, today, go) {
  const ym = ymText(current);
  const bills = billsFor(data, current.y, current.m)
    // Unpaid first, then by amount so the big ones are on top
    .sort((a, b) => (a.paid - b.paid) || (b.amount - a.amount));
  const total = sum(bills.map((b) => b.amount));
  const paidAmount = sum(bills.filter((b) => b.paid).map((b) => b.amount));
  const paidCount = bills.filter((b) => b.paid).length;
  const thisMonth = today;
  const nextMonth = shift(today, 1);
  const isSame = (a, b) => a.y === b.y && a.m === b.m;

  const progress = ProgressBar({ label: `ความคืบหน้าการจ่ายเดือน ${MONTHS[current.m - 1]}` });
  progress.set(total ? paidAmount / total : 0, `จ่ายแล้ว ${paidCount}/${bills.length} รายการ`);

  const expense = expenseGroups(data);
  const lookOf = (name) => {
    const index = expense.findIndex((g) => g.name === name);
    return groupLook(expense[index], index);
  };

  return [
    PageHero({
      title: 'รายการที่ต้องจ่าย',
      subtitle: 'ติ๊กเมื่อจ่ายแล้ว ระบบบันทึกลง Google Sheets',
      icon: 'clipboard-text',
      actions: MonthSwitch({ current, years: availableYears(data), onChange: go }),
    }),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'เลือกเดือนด่วน' },
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(isSame(current, thisMonth)), onClick: () => go(thisMonth) }, `เดือนนี้ (${MONTHS_SHORT[thisMonth.m - 1]})`),
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(isSame(current, nextMonth)), onClick: () => go(nextMonth) }, `เดือนหน้า (${MONTHS_SHORT[nextMonth.m - 1]})`)),
    current.y !== data.year && Notice({ tone: 'warn', text: `ปี ${current.y} เป็นยอดประมาณการจาก "ยอด/เดือน" และช่วงเวลาของแต่ละรายการ` }),
    h('section', { class: 'grid grid-stats', 'aria-label': `สรุปการจ่ายเดือน ${MONTHS[current.m - 1]}` },
      Stat({ label: 'ต้องจ่ายทั้งหมด', value: total, hint: `${bills.length} รายการ`, icon: 'receipt', accent: 'purple' }),
      Stat({ label: 'จ่ายแล้ว', value: paidAmount, hint: `${paidCount} รายการ`, icon: 'check-circle', accent: 'green' }),
      Stat({ label: 'ยังไม่จ่าย', value: total - paidAmount, hint: `${bills.length - paidCount} รายการ`, icon: 'hourglass-split', accent: 'red' }),
      Stat({ label: 'ความคืบหน้า', value: total ? Math.round((paidAmount / total) * 100) : 0, unit: '%', icon: 'chart-pie-slice', accent: 'blue' })),
    Card({
      title: `รายการเดือน ${MONTHS[current.m - 1]} ${current.y}`,
      subtitle: paidCount === bills.length && bills.length ? 'จ่ายครบทุกรายการแล้ว' : 'แตะที่รายการเพื่อติ๊กว่าจ่ายแล้ว',
      icon: 'list-checks',
      tone: 'teal',
      className: 'card-lg bills-card',
      children: bills.length
        ? [progress.el, h('ul', { class: 'bill-list' }, bills.map((b) => h('li', {}, billRow(b, ym, lookOf(b.group)))))]
        : Empty({
          icon: 'inbox', title: 'ไม่มีรายการที่ต้องจ่ายในเดือนนี้', compact: true,
          text: 'รายการจะขึ้นเมื่อมียอดในเดือนนั้น หรือกำหนด "ยอด/เดือน" กับช่วงเวลาไว้',
          action: expense[0] && Button({ label: 'เพิ่มรายการ', icon: 'plus-lg', variant: 'accent', href: `#${groupPath(expense[0].name)}/new` }),
        }),
    }),
  ];
}

function billRow(b, ym, look) {
  const name = b.item.name || '(ไม่มีชื่อ)';
  const paidDate = b.paidAt ? new Date(b.paidAt) : null;
  const paidText = paidDate && !Number.isNaN(paidDate.getTime())
    ? ` · จ่ายแล้ว ${paidDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`
    : '';
  const box = h('input', { type: 'checkbox', class: 'bill-check', checked: b.paid, 'aria-label': `จ่าย ${name} แล้ว` });
  const row = h('label', { class: `bill-row tone-${look.tone}${b.paid ? ' is-paid' : ''}` },
    box,
    h('span', { class: 'bill-icon', 'aria-hidden': 'true' }, icon(look.icon)),
    h('span', { class: 'bill-main' },
      h('span', { class: 'bill-name' }, name),
      h('span', { class: 'bill-sub' }, `${b.group}${b.paid ? paidText : ''}`)),
    h('span', { class: 'bill-amount num' }, money(b.amount)));

  box.addEventListener('change', async () => {
    const paid = box.checked;
    // Show the new state right away; the blocking loading modal also stops overlapping saves
    row.classList.toggle('is-paid', paid);
    row.classList.add('is-pending');
    box.disabled = true;
    const res = await runTask({
      title: paid ? 'กำลังบันทึกว่าจ่ายแล้ว...' : 'กำลังยกเลิกการจ่าย...',
      text: `${name} · ${money(b.amount)} บาท`,
      task: () => setPaid({ ym, group: b.group, row: b.item.row, name: b.item.name, paid }),
    });
    if (res.ok) {
      toast(paid ? `จ่าย ${name} แล้ว` : `ยกเลิกการจ่าย ${name}`);
    } else {
      // Error modal was already shown by runTask; restore the previous state
      box.checked = !paid;
      row.classList.toggle('is-paid', !paid);
    }
    row.classList.remove('is-pending');
    box.disabled = false;
  });
  return row;
}
