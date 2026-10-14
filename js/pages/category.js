import { h, toNodes } from '../utils/dom.js';
import { money, sum, ymLabel, MONTHS_SHORT } from '../utils/format.js';
import { findSheet, sheetMonthly, itemTotal, currentMonthIndex } from '../selectors.js';
import { mutate } from '../store.js';
import { Button } from '../components/button.js';
import { Stat, MonthChips, kv, toast } from '../components/misc.js';
import { LazyList } from '../components/lazy-list.js';
import { openSheet, confirmSheet } from '../components/bottom-sheet.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icons.js';

// Selected month per sheet survives repaints after refresh
const selectedBySheet = {};

export default {
  title: (p) => p.name,
  render: (p, state) => withData(state, (data) => view(data, p.name)),
};

const displayName = (item) => item.name || '(ไม่มีชื่อ)';

function view(data, name) {
  const sheet = findSheet(data, name);
  if (!sheet) {
    return Empty({ title: 'ไม่พบหมวดนี้', action: Button({ label: 'กลับหน้าหมวด', href: '#/sheets', variant: 'secondary' }) });
  }
  if (!(name in selectedBySheet)) selectedBySheet[name] = currentMonthIndex(data.year);

  const wrap = h('div', { class: 'stack' });
  const draw = () => wrap.replaceChildren(...toNodes(content(sheet, selectedBySheet[name], (m) => {
    selectedBySheet[name] = m;
    draw();
    const chip = wrap.querySelector('.chip[aria-pressed="true"]');
    if (chip) {
      chip.focus({ preventScroll: true });
      chip.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  })));
  draw();

  return [
    wrap,
    Button({ label: 'เพิ่ม', icon: 'plus', href: `#/sheet/${encodeURIComponent(name)}/new`, className: 'fab' }),
  ];
}

function content(sheet, sel, onSelect) {
  const monthly = sheetMonthly(sheet);
  const yearTotal = sum(monthly);
  const amountOf = (item) => (sel === 'all' ? itemTotal(item) : Number(item.values[sel]) || 0);

  return [
    h('section', { class: 'grid grid-3', 'aria-label': 'สรุปหมวด' },
      Stat({ label: 'ทั้งปี', value: yearTotal }),
      sel === 'all'
        ? Stat({ label: 'เฉลี่ยต่อเดือน', value: yearTotal / 12 })
        : Stat({ label: `เดือน ${MONTHS_SHORT[sel]}`, value: monthly[sel] }),
      Stat({ label: 'จำนวนรายการ', value: sheet.items.length, unit: 'รายการ' })),
    MonthChips(sel, onSelect),
    sheet.items.length === 0
      ? Empty({ title: 'ยังไม่มีรายการ', text: 'กดปุ่ม "เพิ่ม" เพื่อเพิ่มรายการแรก' })
      : [
        h('div', { class: 'only-compact' }, LazyList(sheet.items, (item) => itemRow(item, amountOf(item), () => openItem(sheet, item)))),
        h('div', { class: 'only-wide' }, itemTable(sheet, sel, monthly)),
      ],
  ];
}

function itemRow(item, amount, onOpen) {
  return h('button', { type: 'button', class: `list-item${amount ? '' : ' is-muted'}`, onClick: onOpen },
    h('span', { class: 'list-item-main' },
      h('span', { class: 'list-item-title' }, displayName(item)),
      item.end && h('span', { class: 'badge' }, `จบ ${ymLabel(item.end)}`)),
    h('span', { class: 'list-item-amount num' }, money(amount)),
    icon('chevron'));
}

function itemTable(sheet, sel, monthly) {
  const selCls = (i) => `num${i === sel ? ' is-sel' : ''}`;
  return h('div', { class: 'table-wrap', role: 'region', 'aria-label': `ตาราง ${sheet.name}`, tabindex: '0' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'รายการ'),
        MONTHS_SHORT.map((m, i) => h('th', { scope: 'col', class: selCls(i) }, m)),
        h('th', { scope: 'col', class: 'num' }, 'รวม'),
        h('th', { scope: 'col' }, 'สิ้นสุด'))),
      h('tbody', {}, sheet.items.map((item) => h('tr', {},
        h('th', { scope: 'row' }, h('button', { type: 'button', class: 'link-btn', onClick: () => openItem(sheet, item) }, displayName(item))),
        item.values.map((v, i) => h('td', { class: selCls(i) }, v == null ? '–' : money(v))),
        h('td', { class: 'num' }, money(itemTotal(item))),
        h('td', {}, item.end ? ymLabel(item.end) : '–')))),
      h('tfoot', {}, h('tr', {},
        h('th', { scope: 'row' }, 'รวม'),
        monthly.map((v, i) => h('td', { class: selCls(i) }, money(v))),
        h('td', { class: 'num' }, money(sum(monthly))),
        h('td', {})))));
}

function openItem(sheet, item) {
  const editHref = `#/sheet/${encodeURIComponent(sheet.name)}/edit/${item.row}`;
  const hasFormula = item.formulas.some(Boolean);

  async function remove() {
    const ok = await confirmSheet({
      title: 'ลบรายการนี้?',
      message: `"${displayName(item)}" จะถูกล้างออกจาก Sheet ${sheet.name}`,
      confirmLabel: 'ลบ',
      danger: true,
    });
    if (!ok) return;
    try {
      await mutate('remove', { sheet: sheet.name, row: item.row, expectedName: item.name });
      ref.close();
      toast('ลบรายการแล้ว');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const ref = openSheet({
    title: displayName(item),
    content: [
      h('dl', { class: 'kv' },
        kv('หมวด', sheet.name),
        kv('รวมทั้งปี', `${money(itemTotal(item))} บาท`),
        kv('เดือนสิ้นสุด', item.end ? ymLabel(item.end) : 'ไม่ระบุ')),
      h('ul', { class: 'month-grid', 'aria-label': 'ยอดรายเดือน' }, item.values.map((v, i) => h('li', {},
        h('span', { class: 'muted' }, MONTHS_SHORT[i]),
        h('span', { class: 'num' }, v == null ? '–' : money(v))))),
      hasFormula && h('p', { class: 'note' }, 'บางเดือนเป็นสูตรใน Sheet แอปจะไม่แก้ทับช่องนั้น'),
    ],
    actions: [
      Button({ label: 'ลบ', icon: 'trash', variant: 'danger-ghost', onClick: remove }),
      Button({ label: 'แก้ไข', icon: 'edit', href: editHref, onClick: () => ref.close() }),
    ],
  });
}
