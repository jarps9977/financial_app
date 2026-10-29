import { h, toNodes } from '../utils/dom.js';
import { money, sum, ymLabel, MONTHS, MONTHS_SHORT } from '../utils/format.js';
import { groupPath } from '../router.js';
import { openGroupMenu } from './group-form.js';
import { mutate, groupYear, setGroupYear } from '../store.js';
import { findGroup, groupMonths, itemMonths, currentMonthIndex, availableYears } from '../selectors.js';
import { Button } from '../components/button.js';
import { Stat, MonthChips, Notice, YearSelect, kv } from '../components/misc.js';
import { LazyList } from '../components/lazy-list.js';
import { openSheet } from '../components/bottom-sheet.js';
import { confirmAction, runTask } from '../components/alert.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icon.js';

// Selected month and checked rows per group survive repaints after refresh
const selectedByGroup = {};
const checkedByGroup = {};
const selectingByGroup = {};

export default {
  title: (p) => p.name,
  back: () => '#/groups',
  render: (p, state) => withData(state, (data) => view(data, p.name)),
};

const displayName = (item) => item.name || '(ไม่มีชื่อ)';
const MAX_AMOUNT = 1e9;

function rangeText(item) {
  if (item.start && item.end) return `${ymLabel(item.start)} – ${ymLabel(item.end)}`;
  if (item.end) return `ถึง ${ymLabel(item.end)}`;
  if (item.start) return `ตั้งแต่ ${ymLabel(item.start)}`;
  return '';
}

function view(data, name) {
  const group = findGroup(data, name);
  if (!group) {
    return Empty({ title: 'ไม่พบหมวดนี้', action: Button({ label: 'กลับหน้าหมวด', href: '#/groups', variant: 'secondary' }) });
  }
  const year = groupYear();
  const key = `${name}:${year}`;
  if (!(key in selectedByGroup)) selectedByGroup[key] = currentMonthIndex(year);

  // Drop rows that no longer exist (deleted here or in the sheet)
  const checked = checkedByGroup[name] || (checkedByGroup[name] = new Set());
  const existing = new Set(group.items.map((i) => i.row));
  [...checked].forEach((row) => { if (!existing.has(row)) checked.delete(row); });

  const wrap = h('div', { class: 'stack' });
  const draw = () => wrap.replaceChildren(...toNodes(content(data, group, year, selectedByGroup[key], checked, (m) => {
    selectedByGroup[key] = m;
    draw();
    const chip = wrap.querySelector('.chip[aria-pressed="true"]');
    if (chip) {
      chip.focus({ preventScroll: true });
      chip.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  })));
  draw();

  const addHref = `#${groupPath(name)}/new`;
  return [
    h('header', { class: 'form-hero' },
      Button({ label: 'กลับหน้าหมวด', icon: 'arrow-left', variant: 'secondary', iconOnly: true, href: '#/groups', className: 'form-hero-back' }),
      h('div', { class: 'form-hero-text' },
        h('h2', { class: 'form-hero-title' }, group.name),
        h('p', { class: 'form-hero-sub' }, `${group.type === 'income' ? 'รายรับ' : 'รายจ่าย'} · รายงานยอดในตาราง ปี ${year}`)),
      h('div', { class: 'form-hero-actions' },
        YearSelect({ year, years: availableYears(data), sheetYear: data.year, onChange: setGroupYear }),
        Button({ label: 'ตัวเลือกหมวด', icon: 'three-dots-vertical', variant: 'ghost', iconOnly: true, className: 'btn-kebab', onClick: () => openGroupMenu(group) }),
        Button({ label: 'เพิ่มรายการ', icon: 'plus-lg', variant: 'accent', href: addHref, className: 'hero-add' }))),
    year !== data.year && Notice({ tone: 'warn', text: `ปี ${year} เป็นยอดประมาณการ แก้ไขยอดจริงได้เฉพาะปี ${data.year}` }),
    wrap,
    Button({ label: 'เพิ่มรายการ', icon: 'plus-lg', variant: 'accent', href: addHref, className: 'fab' }),
  ];
}

function content(data, group, year, sel, checked, onSelect) {
  const monthly = groupMonths(group, year, data.year);
  const rows = group.items.map((item) => ({ item, months: itemMonths(item, year, data.year) }));
  const pick = (arr) => (sel === 'all' ? sum(arr) : arr[sel]);
  const amountOf = (r) => pick(r.months);
  const period = sel === 'all' ? `ทั้งปี ${year}` : `${MONTHS[sel]} ${year}`;
  const isIncome = group.type === 'income';

  return [
    h('section', { class: 'grid grid-stats grid-stats-2', 'aria-label': `สรุปหมวด ${period}` },
      Stat({ label: isIncome ? 'รายรับหมวดนี้' : 'รายจ่ายหมวดนี้', value: pick(monthly), icon: isIncome ? 'arrow-down-left' : 'arrow-up', accent: isIncome ? 'green' : 'red', hint: period }),
      Stat({ label: 'จำนวนรายการ', value: group.items.length, unit: 'รายการ', icon: 'file-earmark-text', accent: 'purple' })),
    MonthChips(sel, onSelect),
    group.items.length === 0
      ? Empty({ title: 'ยังไม่มีรายการ', text: 'กดปุ่ม "เพิ่มรายการ" เพื่อเพิ่มรายการแรก' })
      : itemsCard(data, group, rows, sel, monthly, checked, amountOf),
  ];
}

function itemsCard(data, group, rows, sel, monthly, checked, amountOf) {
  const card = h('section', { class: 'card items-card', 'aria-label': `รายการใน ${group.name}` });

  const selectAllBoxes = [];
  const selectAll = (label) => {
    const box = h('input', {
      type: 'checkbox', class: 'row-check', 'aria-label': label,
      onChange: (e) => {
        if (e.target.checked) group.items.forEach((i) => checked.add(i.row));
        else checked.clear();
        sync();
      },
    });
    selectAllBoxes.push(box);
    return h('label', { class: 'check-wrap' }, box);
  };
  const rowCheck = (item) => h('label', { class: 'check-wrap' },
    h('input', {
      type: 'checkbox', class: 'row-check', dataset: { row: String(item.row) }, checked: checked.has(item.row),
      'aria-label': `เลือก ${displayName(item)}`,
      onChange: (e) => {
        if (e.target.checked) checked.add(item.row);
        else checked.delete(item.row);
        sync();
      },
    }));

  // Checkboxes stay hidden until the user enters selection mode with the "เลือก" button
  const toggleRow = (row) => {
    if (checked.has(row)) checked.delete(row);
    else checked.add(row);
    sync();
  };
  const isSelecting = () => card.classList.contains('is-selecting');
  function setSelecting(on) {
    selectingByGroup[group.name] = on;
    if (!on) checked.clear();
    card.classList.toggle('is-selecting', on);
    sync();
    const focusTarget = on ? card.querySelector('.toolbar-select .row-check') : enterBtn;
    if (focusTarget) focusTarget.focus();
  }

  const countText = h('span', { class: 'sel-count', 'aria-live': 'polite' });
  const deleteBtn = Button({ label: 'ลบรายการที่เลือก', icon: 'trash', variant: 'danger-ghost', className: 'sel-only btn-pill', onClick: () => deleteChecked(group, checked) });
  const enterBtn = Button({ label: 'เลือก', icon: 'list-checks', variant: 'ghost', className: 'idle-only btn-pill btn-select', onClick: () => setSelecting(true) });
  const exitBtn = Button({ label: 'ยกเลิก', icon: 'x-lg', variant: 'ghost', className: 'sel-only btn-pill', onClick: () => setSelecting(false) });
  const toolbar = h('div', { class: 'table-toolbar' },
    h('div', { class: 'toolbar-select sel-only' }, selectAll('เลือกทั้งหมด'), countText),
    h('span', { class: 'toolbar-sep sel-only', 'aria-hidden': 'true' }),
    deleteBtn,
    h('p', { class: 'toolbar-total idle-only muted' }, `${group.items.length} รายการ`),
    h('span', { class: 'toolbar-spacer', 'aria-hidden': 'true' }),
    enterBtn,
    exitBtn);

  // Updates checkboxes in place so focus and scroll position are kept
  function sync() {
    card.querySelectorAll('.row-check[data-row]').forEach((box) => {
      const on = checked.has(Number(box.dataset.row));
      box.checked = on;
      const row = box.closest('tr, .select-row');
      if (row) row.classList.toggle('is-selected', on);
    });
    const total = group.items.length;
    selectAllBoxes.forEach((box) => {
      box.checked = total > 0 && checked.size === total;
      box.indeterminate = checked.size > 0 && checked.size < total;
    });
    countText.textContent = `เลือกแล้ว ${checked.size} รายการ`;
    deleteBtn.disabled = checked.size === 0;
  }

  const selCls = (i, base = 'num') => `${base}${i === sel ? ' is-sel' : ''}`;
  const table = h('div', { class: 'table-wrap', role: 'region', 'aria-label': `ตาราง ${group.name}`, tabindex: '0' },
    h('table', { class: 'data group-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'col-check' }, selectAll('เลือกทั้งหมดในตาราง')),
        h('th', { scope: 'col', class: 'col-name' }, 'รายการ'),
        MONTHS_SHORT.map((m, i) => h('th', { scope: 'col', class: selCls(i) }, m)),
        h('th', { scope: 'col', class: 'num col-total' }, 'รวม'),
        h('th', { scope: 'col', class: 'col-range' }, 'ช่วงเวลา'))),
      h('tbody', {}, rows.map((r) => h('tr', { class: checked.has(r.item.row) ? 'is-selected' : null },
        h('td', { class: 'col-check' }, rowCheck(r.item)),
        h('th', { scope: 'row' }, h('button', {
          type: 'button', class: 'link-btn',
          onClick: () => (isSelecting() ? toggleRow(r.item.row) : openItem(data, group, r.item)),
        }, displayName(r.item))),
        r.months.map((v, i) => h('td', { class: selCls(i) }, v ? money(v) : '–')),
        h('td', { class: 'num col-total' }, money(sum(r.months))),
        h('td', { class: 'nowrap col-range' }, rangeText(r.item) || '–')))),
      h('tfoot', {}, h('tr', {},
        h('td', { class: 'col-check' }),
        h('th', { scope: 'row', class: 'col-name' }, 'รวม'),
        monthly.map((v, i) => h('td', { class: selCls(i) }, money(v))),
        h('td', { class: 'num col-total' }, money(sum(monthly))),
        h('td', { class: 'col-range' })))));

  const list = LazyList(rows, (r) => h('div', { class: `select-row${checked.has(r.item.row) ? ' is-selected' : ''}` },
    rowCheck(r.item),
    itemRow(r.item, amountOf(r), () => (isSelecting() ? toggleRow(r.item.row) : openItem(data, group, r.item)))), { label: `รายการใน ${group.name}` });

  // Mobile counterpart of the table footer: total for the selected month (or the year)
  const listTotal = h('div', { class: 'items-total' },
    h('span', {}, sel === 'all' ? 'รวมทั้งปี' : `รวม ${MONTHS[sel]}`),
    h('span', { class: 'num' }, money(sel === 'all' ? sum(monthly) : monthly[sel])));

  card.append(toolbar, h('div', { class: 'only-compact items-list' }, list, listTotal), h('div', { class: 'only-wide' }, table));
  card.classList.toggle('is-selecting', Boolean(selectingByGroup[group.name]));
  sync();
  return card;
}

function itemRow(item, amount, onOpen) {
  const range = rangeText(item);
  return h('button', { type: 'button', class: `list-item${amount ? '' : ' is-muted'}`, onClick: onOpen },
    h('span', { class: 'list-item-main' },
      h('span', { class: 'list-item-title' }, displayName(item)),
      range && h('span', { class: 'list-item-sub' }, icon('calendar-range'), ` ${range}`)),
    h('span', { class: 'list-item-amount num' }, money(amount)),
    icon('chevron-right'));
}

async function deleteChecked(group, checked) {
  const items = group.items.filter((i) => checked.has(i.row));
  if (!items.length) return;
  const names = items.slice(0, 3).map(displayName).join(', ');
  const more = items.length > 3 ? ` และอีก ${items.length - 3} รายการ` : '';
  const ok = await confirmAction({
    title: `ลบ ${items.length} รายการ?`,
    text: `${names}${more} จะถูกล้างออกจาก Sheet ${group.name}`,
    confirmText: 'ลบ',
    danger: true,
    action: () => mutate('deleteItems', { group: group.name, items: items.map((i) => ({ row: i.row, expectedName: i.name })) }),
    success: 'ลบสำเร็จ',
    successText: `ลบ ${items.length} รายการออกจาก ${group.name} แล้ว`,
  });
  if (ok) checked.clear();
}

function openItem(data, group, item) {
  const editHref = `#${groupPath(group.name)}/edit/${item.row}`;
  const hasFormula = item.formulas.some(Boolean);

  async function remove() {
    // Close the sheet first so the SweetAlert is not nested in a dialog that is about to be removed
    ref.close();
    await confirmAction({
      title: 'ลบรายการนี้?',
      text: `"${displayName(item)}" จะถูกล้างออกจาก Sheet ${group.name}`,
      confirmText: 'ลบ',
      danger: true,
      action: () => mutate('deleteItem', { group: group.name, row: item.row, expectedName: item.name }),
      success: 'ลบสำเร็จ',
      successText: `ลบ "${displayName(item)}" แล้ว`,
    });
  }

  // Month amounts are edited in place; formula months stay read-only. Full form is behind "แก้ไข"
  const inputs = item.values.map((v, i) => (item.formulas[i] ? null : h('input', {
    type: 'number', class: 'input month-amount', inputmode: 'decimal', step: '0.01', placeholder: '–',
    value: v == null ? '' : String(v), 'aria-label': `ยอด ${MONTHS[i]}`,
  })));
  const readValues = () => inputs.map((el, i) => {
    if (!el) return item.values[i];
    const s = el.value.trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && Math.abs(n) <= MAX_AMOUNT ? n : undefined;
  });
  const totalText = h('span', {}, `${money(sum(item.values))} บาท`);
  const saveBtn = Button({ label: 'บันทึก', icon: 'check2', variant: 'accent', onClick: save });
  saveBtn.hidden = true;
  inputs.forEach((el) => el && el.addEventListener('input', () => {
    const values = readValues();
    el.closest('li').classList.toggle('is-invalid', values[inputs.indexOf(el)] === undefined);
    totalText.textContent = `${money(sum(values.map((v) => v || 0)))} บาท`;
    saveBtn.hidden = values.every((v, i) => v === (item.values[i] ?? null));
  }));

  async function save() {
    const values = readValues();
    const bad = values.findIndex((v) => v === undefined);
    if (bad !== -1) {
      inputs[bad].focus();
      return;
    }
    ref.close();
    await runTask({
      title: 'กำลังบันทึกยอดรายเดือน...',
      text: displayName(item),
      success: 'บันทึกสำเร็จ',
      successText: `${displayName(item)} · หมวด ${group.name}`,
      task: () => mutate('updateItem', {
        group: group.name, row: item.row, expectedName: item.name, name: item.name,
        values, start: item.start, end: item.end, amount: item.amount,
      }),
    });
  }

  const ref = openSheet({
    title: displayName(item),
    content: [
      h('dl', { class: 'kv' },
        kv('หมวด', group.name),
        kv(`รวมปี ${data.year}`, totalText),
        kv('ยอด/เดือน', item.amount != null ? `${money(item.amount)} บาท` : 'ไม่ระบุ'),
        kv('ช่วงเวลา', rangeText(item) || 'ไม่ระบุ')),
      h('ul', { class: 'month-grid is-editable', 'aria-label': `ยอดรายเดือนปี ${data.year}` }, item.values.map((v, i) => h('li', {},
        inputs[i]
          ? h('label', {}, h('span', { class: 'muted' }, MONTHS_SHORT[i]), inputs[i])
          : [h('span', { class: 'muted' }, MONTHS_SHORT[i]), h('span', { class: 'num', title: 'สูตรใน Sheet' }, v == null ? '–' : money(v))]))),
      hasFormula && h('p', { class: 'note' }, 'บางเดือนเป็นสูตรใน Sheet แอปจะไม่แก้ทับช่องนั้น'),
    ],
    actions: [
      saveBtn,
      Button({ label: 'แก้ไข', icon: 'pencil', variant: 'secondary', href: editHref, onClick: () => ref.close() }),
      Button({ label: 'ลบ', icon: 'trash', variant: 'danger-ghost', onClick: remove }),
      Button({ label: 'ปิด', icon: 'x-lg', variant: 'ghost', onClick: () => ref.close() }),
    ],
  });
}
