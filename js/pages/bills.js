import { h } from '../utils/dom.js';
import { money, sum, MONTHS, MONTHS_SHORT, todayYm, ymKey } from '../utils/format.js';
import { groupPath } from '../router.js';
import { setPaid } from '../store.js';
import { billEntries, availableYears, expenseGroups } from '../selectors.js';
import { groupLook } from '../utils/group-look.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Stat, Notice, PageHero, MonthSwitch } from '../components/misc.js';
import { runTask, toast } from '../components/alert.js';
import { ProgressBar } from '../components/progress.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icon.js';

// Month shown and expanded card bills survive repaints; starts at the current month
let viewYm = null;
const expanded = new Set();

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
  const bills = billEntries(data, current.y, current.m)
    // Unpaid first, then by amount so the big ones are on top
    .sort((a, b) => (a.paid - b.paid) || (b.amount - a.amount));
  const allItems = bills.flatMap((e) => e.items);
  const total = sum(allItems.map((b) => b.amount));
  // Amounts count per item so a half-paid card bill shows its real progress
  const paidAmount = sum(allItems.filter((b) => b.paid).map((b) => b.amount));
  const paidCount = bills.filter((e) => e.paid).length;
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
      subtitle: paidCount === bills.length && bills.length
        ? 'จ่ายครบทุกรายการแล้ว'
        : 'ติ๊กเมื่อจ่ายแล้ว · บัตรเครดิตรวมเป็นบิลเดียว กดเพื่อดูรายละเอียด',
      icon: 'list-checks',
      tone: 'teal',
      className: 'card-lg bills-card',
      children: bills.length
        ? [progress.el, h('ul', { class: 'bill-list' }, bills.map((e) => h('li', {},
          e.kind === 'group' ? groupBill(e, ym, lookOf(e.group)) : billRow(e.items[0], ym, lookOf(e.group)))))]
        : Empty({
          icon: 'inbox', title: 'ไม่มีรายการที่ต้องจ่ายในเดือนนี้', compact: true,
          text: 'รายการจะขึ้นเมื่อมียอดในเดือนนั้น หรือกำหนด "ยอด/เดือน" กับช่วงเวลาไว้',
          action: expense[0] && Button({ label: 'เพิ่มรายการ', icon: 'plus-lg', variant: 'accent', href: `#${groupPath(expense[0].name)}/new` }),
        }),
    }),
  ];
}

const paidDateText = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? ` · จ่ายแล้ว ${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}` : '';
};

// Shared save flow: optimistic state, blocking loading modal, rollback on failure
async function savePaid({ box, row, paid, title, ym, group, items, onRollback }) {
  row.classList.toggle('is-paid', paid);
  row.classList.add('is-pending');
  box.disabled = true;
  const res = await runTask({
    title: paid ? 'กำลังบันทึกว่าจ่ายแล้ว...' : 'กำลังยกเลิกการจ่าย...',
    text: title,
    // Single items also send row/name so a Code.gs without batch support still accepts them
    task: () => setPaid({
      ym, group, paid,
      items: items.map((b) => ({ row: b.item.row, name: b.item.name })),
      ...(items.length === 1 ? { row: items[0].item.row, name: items[0].item.name } : {}),
    }),
  });
  if (res.ok) {
    toast(paid ? `จ่ายแล้ว · ${title}` : `ยกเลิกการจ่าย · ${title}`);
  } else {
    // Error modal was already shown by runTask
    row.classList.toggle('is-paid', !paid);
    if (onRollback) onRollback();
  }
  row.classList.remove('is-pending');
  box.disabled = false;
}

function billRow(b, ym, look, { nested = false } = {}) {
  const name = b.item.name || '(ไม่มีชื่อ)';
  const box = h('input', { type: 'checkbox', class: 'bill-check', checked: b.paid, 'aria-label': `จ่าย ${name} แล้ว` });
  const row = h('label', { class: `bill-row tone-${look.tone}${b.paid ? ' is-paid' : ''}${nested ? ' is-nested' : ''}` },
    box,
    !nested && h('span', { class: 'bill-icon', 'aria-hidden': 'true' }, icon(look.icon)),
    h('span', { class: 'bill-main' },
      h('span', { class: 'bill-name' }, name),
      h('span', { class: 'bill-sub' }, `${nested ? '' : b.group}${b.paid ? paidDateText(b.paidAt) : ''}`.replace(/^ · /, ''))),
    h('span', { class: 'bill-amount num' }, money(b.amount)));

  box.addEventListener('change', () => savePaid({
    box, row, paid: box.checked, title: `${name} · ${money(b.amount)} บาท`, ym, group: b.group, items: [b],
    onRollback: () => { box.checked = !box.checked; },
  }));
  return row;
}

// One credit-card bill: the checkbox ticks every item, the row expands to show the items
function groupBill(entry, ym, look) {
  const open = expanded.has(`${ym}:${entry.group}`);
  const box = h('input', { type: 'checkbox', class: 'bill-check', checked: entry.paid, 'aria-label': `จ่ายบิล ${entry.group} ทั้งหมดแล้ว` });
  box.indeterminate = entry.partial;
  const detailsId = `bill-${entry.group.replace(/[^\w]/g, '_')}-${ym}`;
  const sub = entry.paid
    ? `${entry.items.length} รายการ${paidDateText(entry.paidAt)}`
    : `${entry.items.length} รายการ${entry.partial ? ` · จ่ายแล้ว ${entry.paidCount}/${entry.items.length}` : ''}`;

  const toggle = h('button', {
    type: 'button', class: 'bill-toggle', 'aria-expanded': String(open), 'aria-controls': detailsId,
    onClick: () => {
      const key = `${ym}:${entry.group}`;
      const next = !expanded.has(key);
      if (next) expanded.add(key);
      else expanded.delete(key);
      toggle.setAttribute('aria-expanded', String(next));
      list.hidden = !next;
      wrap.classList.toggle('is-open', next);
    },
  },
  h('span', { class: 'bill-main' },
    h('span', { class: 'bill-name' }, h('span', { class: 'bill-name-text' }, entry.group), h('span', { class: 'badge' }, 'บิลบัตร')),
    h('span', { class: 'bill-sub' }, sub)),
  h('span', { class: 'bill-amount num' }, money(entry.amount)),
  h('span', { class: 'bill-chevron', 'aria-hidden': 'true' }, icon('chevron-down')));

  const row = h('div', { class: `bill-row is-group tone-${look.tone}${entry.paid ? ' is-paid' : ''}` },
    h('label', { class: 'bill-check-wrap' }, box),
    h('span', { class: 'bill-icon', 'aria-hidden': 'true' }, icon(look.icon)),
    toggle);

  const list = h('ul', { class: 'bill-sublist', id: detailsId, hidden: !open },
    entry.items.map((b) => h('li', {}, billRow(b, ym, look, { nested: true }))));
  const wrap = h('div', { class: `bill-group${open ? ' is-open' : ''}` }, row, list);

  box.addEventListener('change', () => {
    // A partly paid bill always completes on tick; unticking clears every item
    const paid = entry.partial ? true : box.checked;
    box.checked = paid;
    savePaid({
      box, row, paid, title: `บิล ${entry.group} · ${money(entry.amount)} บาท`, ym, group: entry.group, items: entry.items,
      onRollback: () => { box.checked = entry.paid; box.indeterminate = entry.partial; },
    });
  });
  return wrap;
}
