import { h } from '../utils/dom.js';
import { MONTHS, MONTHS_SHORT, money, sum, parseYm, ymKey, ymString } from '../utils/format.js';
import { findGroup, currentMonthIndex } from '../selectors.js';
import { mutate } from '../store.js';
import { navigate, groupPath } from '../router.js';
import { Card, CardIcon } from '../components/card.js';
import { Button } from '../components/button.js';
import { Field } from '../components/input.js';
import { runTask, toast } from '../components/alert.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icon.js';

const MAX_NAME = 100;
const MAX_AMOUNT = 1e9;

export default {
  title: (p) => (p.row ? 'แก้ไขรายการ' : 'เพิ่มรายการ'),
  back: (p) => `#${groupPath(p.name)}`,
  kind: 'form',
  live: false,
  render: (p, state) => withData(state, (data) => view(data, p)),
};

// undefined = invalid, null = empty
function readAmount(raw) {
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= MAX_AMOUNT ? n : undefined;
}

// One month tile: checkbox decides whether the month is active, input holds its amount
function MonthTile(index, item) {
  const locked = Boolean(item && item.formulas[index]);
  const has = Boolean(item && item.values[index] != null);
  const check = h('input', { type: 'checkbox', class: 'month-check-input', checked: has, disabled: locked, 'aria-label': `ใช้เดือน ${MONTHS[index]}` });
  const input = h('input', {
    type: 'number', class: 'input month-amount', inputmode: 'decimal', step: '0.01', placeholder: '0.00',
    value: has ? String(item.values[index]) : '', disabled: locked || !has, 'aria-label': `ยอด ${MONTHS[index]}`,
  });
  const tile = h('div', {
    class: `month-tile${has ? ' is-on' : ''}${locked ? ' is-locked' : ''}`,
    title: locked ? 'เดือนนี้เป็นสูตรใน Sheet แก้ในแอปไม่ได้' : null,
  }, h('label', { class: 'month-check' }, check, h('span', {}, MONTHS_SHORT[index])), input);

  function set(on, value) {
    if (locked) return;
    check.checked = on;
    input.disabled = !on;
    tile.classList.toggle('is-on', on);
    if (!on) input.value = '';
    else if (value !== undefined) input.value = value;
  }
  return { tile, check, input, locked, set };
}

function view(data, params) {
  const group = findGroup(data, params.name);
  if (!group) return Empty({ title: 'ไม่พบหมวดนี้', action: Button({ label: 'กลับ', href: '#/groups', variant: 'secondary' }) });

  const backPath = groupPath(group.name);
  const isEdit = params.row != null;
  const item = isEdit ? group.items.find((i) => i.row === Number(params.row)) : null;
  if (isEdit && !item) {
    return Empty({
      title: 'ไม่พบรายการ',
      text: 'อาจถูกลบหรือย้ายใน Sheet แล้ว',
      action: Button({ label: 'กลับ', href: `#${backPath}`, variant: 'secondary' }),
    });
  }
  const year = data.year;
  // The native picker indicator is stretched over the input; the chevron is decorative
  const ymAttrs = { type: 'month', placeholder: 'YYYY-MM', pattern: '\\d{4}-\\d{2}', prefix: icon('calendar3'), suffix: icon('chevron-down') };

  const nameField = Field({
    label: 'ชื่อรายการ', name: 'name', value: item ? item.name : '', required: true, maxlength: MAX_NAME,
    autocomplete: 'off', enterkeyhint: 'next', placeholder: 'เช่น Netflix, ผ่อนโทรศัพท์', prefix: icon('tag'),
  });
  const amountField = Field({
    label: 'ยอดต่อเดือน (บาท)', name: 'amount', type: 'number', inputmode: 'decimal', step: '0.01', placeholder: '0.00',
    value: item && item.amount != null ? String(item.amount) : '', prefix: '฿',
    hint: 'ใส่เฉพาะตัวเลข เช่น 250 หรือ 1290', hintIcon: 'info-circle',
  });
  const startField = Field({
    label: 'เริ่มเดือน', name: 'start', ...ymAttrs,
    value: item ? item.start : ymString(year, currentMonthIndex(year) + 1),
  });
  const endField = Field({
    label: 'สิ้นสุดเดือน', name: 'end', ...ymAttrs, value: item ? item.end : '',
    hint: 'เว้นว่าง = ไม่มีวันสิ้นสุด (จะใช้งานไปเรื่อย ๆ)', hintIcon: 'infinity',
  });

  const months = MONTHS.map((_, i) => MonthTile(i, item));
  const monthSummary = h('span', { class: 'collapse-summary' });
  const monthError = h('p', { class: 'field-error', role: 'alert', hidden: true });

  function updateMonthSummary() {
    const active = months.filter((m) => m.check.checked || m.locked);
    const total = sum(months.map((m) => (m.check.checked ? Number(m.input.value) || 0 : 0)));
    monthSummary.textContent = active.length
      ? `${active.length} เดือน · รวม ${money(total)} บาท`
      : 'ยังไม่ได้เลือก · จะเติมตามช่วงเวลาให้อัตโนมัติ';
  }

  months.forEach((m) => {
    m.check.addEventListener('change', () => {
      // A newly ticked month starts with the monthly amount
      const amount = readAmount(amountField.input.value);
      m.set(m.check.checked, m.check.checked && m.input.value === '' && amount != null ? String(amount) : undefined);
      if (m.check.checked) m.input.focus();
      updateMonthSummary();
    });
    m.input.addEventListener('input', updateMonthSummary);
  });
  updateMonthSummary();

  function readRange() {
    const startRaw = startField.input.value.trim();
    const endRaw = endField.input.value.trim();
    const start = parseYm(startRaw);
    const end = parseYm(endRaw);
    let ok = true;
    startField.setError(startRaw && !start ? 'รูปแบบต้องเป็น YYYY-MM' : '');
    endField.setError(endRaw && !end ? 'รูปแบบต้องเป็น YYYY-MM' : '');
    if ((startRaw && !start) || (endRaw && !end)) ok = false;
    if (ok && start && end && ymKey(start.y, start.m) > ymKey(end.y, end.m)) {
      endField.setError('ต้องไม่ก่อนเดือนเริ่ม');
      ok = false;
    }
    return { ok, start, end, startRaw: start ? startRaw : '', endRaw: end ? endRaw : '' };
  }

  // Ticks and fills months of the sheet year that fall inside start..end
  function fillRange({ silent = false } = {}) {
    const amount = readAmount(amountField.input.value);
    if (amount == null) {
      amountField.setError('กรอกยอดต่อเดือน');
      if (!silent) amountField.input.focus();
      return false;
    }
    amountField.setError('');
    const range = readRange();
    if (!range.ok) return false;
    const from = range.start ? ymKey(range.start.y, range.start.m) : -Infinity;
    const to = range.end ? ymKey(range.end.y, range.end.m) : Infinity;
    let filled = 0;
    months.forEach((m, i) => {
      const k = ymKey(year, i + 1);
      const inRange = k >= from && k <= to;
      m.set(inRange, inRange ? String(amount) : undefined);
      if (inRange && !m.locked) filled++;
    });
    updateMonthSummary();
    if (!silent) {
      monthsPanel.open = true;
      toast(filled ? `เติมยอด ${filled} เดือนในปี ${year}` : `ช่วงที่เลือกไม่อยู่ในปี ${year} (จะคำนวณในปีอื่นแทน)`);
    }
    return true;
  }

  const submit = Button({ label: 'บันทึก', type: 'submit', icon: 'check2', variant: 'accent' });

  async function onSubmit(e) {
    e.preventDefault();
    let valid = true;

    const name = nameField.input.value.trim();
    if (!name || name.length > MAX_NAME) {
      nameField.setError(`กรอกชื่อรายการ 1-${MAX_NAME} ตัวอักษร`);
      valid = false;
    } else nameField.setError('');

    const amount = readAmount(amountField.input.value);
    if (amount === undefined) {
      amountField.setError('จำนวนเงินไม่ถูกต้อง');
      valid = false;
    } else amountField.setError('');

    const range = readRange();
    if (!range.ok) valid = false;

    // Nothing ticked: derive the months from amount + range so the minimum input is name + amount
    const noneTicked = months.every((m) => m.locked || !m.check.checked);
    if (valid && !isEdit && noneTicked && amount != null) fillRange({ silent: true });

    let monthInvalid = false;
    const values = months.map((m, i) => {
      if (m.locked) return item.values[i];
      m.tile.classList.remove('is-invalid');
      if (!m.check.checked) return null;
      const n = readAmount(m.input.value);
      if (n === undefined || (n === null && amount == null)) {
        m.tile.classList.add('is-invalid');
        monthInvalid = true;
        return null;
      }
      return n ?? amount;
    });
    monthError.textContent = monthInvalid ? 'กรอกยอดของเดือนที่เลือกให้ถูกต้อง' : '';
    monthError.hidden = !monthInvalid;
    if (monthInvalid) {
      valid = false;
      monthsPanel.open = true;
    }

    if (!valid) {
      const firstInvalid = form.querySelector('[aria-invalid="true"], .month-tile.is-invalid input');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const res = await runTask({
      title: isEdit ? 'กำลังบันทึกการแก้ไข...' : 'กำลังเพิ่มรายการ...',
      text: name,
      success: isEdit ? 'บันทึกสำเร็จ' : 'เพิ่มรายการสำเร็จ',
      successText: `${name} · หมวด ${group.name}`,
      task: () => mutate(isEdit ? 'updateItem' : 'addItem', {
        group: group.name,
        row: item ? item.row : undefined,
        expectedName: item ? item.name : undefined,
        name,
        values,
        start: range.startRaw,
        end: range.endRaw,
        amount,
      }),
    });
    if (res.ok) navigate(backPath);
  }

  // Collapsed by default so a new item needs only name + amount
  const monthsPanel = h('details', { class: 'card card-collapse' },
    h('summary', { class: 'card-head' },
      CardIcon('calendar2-check', 'teal'),
      h('div', { class: 'card-head-text' },
        h('h2', { class: 'card-title' }, `ยอดรายเดือน ปี ${year}`),
        h('p', { class: 'card-sub' }, 'เลือกเดือนที่ต้องการให้รายการนี้มีผล และปรับยอดแต่ละเดือนได้'),
        monthSummary),
      h('span', { class: 'collapse-chevron', 'aria-hidden': 'true' }, icon('chevron-down'))),
    h('div', { class: 'month-tiles' }, months.map((m) => m.tile)),
    monthError,
    months.some((m) => m.locked) && h('p', { class: 'note' }, 'เดือนที่ล็อกเป็นสูตรใน Sheet แอปจะไม่แก้ทับ'));

  const form = h('form', { class: 'form item-form', novalidate: true, onSubmit },
    h('header', { class: 'form-hero' },
      Button({ label: 'ย้อนกลับ', icon: 'arrow-left', variant: 'secondary', iconOnly: true, href: `#${backPath}`, className: 'form-hero-back' }),
      h('div', { class: 'form-hero-text' },
        h('h2', { class: 'form-hero-title' }, isEdit ? 'แก้ไขรายการ' : 'เพิ่มรายการ'),
        h('p', { class: 'form-hero-sub' }, `หมวด ${group.name} · ยอดในตารางเป็นของปี ${year}`)),
      h('span', { class: 'form-hero-art', 'aria-hidden': 'true' },
        icon('stars'), h('span', { class: 'art-sheet' }, icon('receipt-cutoff')), h('span', { class: 'art-coin' }, '฿'))),
    h('div', { class: 'form-grid' },
      Card({
        title: 'ข้อมูลรายการ', subtitle: 'กรอกข้อมูลของรายการที่ต้องการเพิ่ม', icon: 'file-earmark-text', tone: 'teal',
        children: h('div', { class: 'stack' }, nameField.el, amountField.el),
      }),
      Card({
        title: 'ช่วงเวลา', subtitle: 'กำหนดช่วงเวลาที่รายการนี้มีผล (ข้ามปีได้)', icon: 'calendar-week', tone: 'purple',
        children: h('div', { class: 'stack' },
          h('div', { class: 'form-row' }, startField.el, endField.el),
          Button({ label: 'เติมยอดตามช่วงเดือน', icon: 'magic', variant: 'magic', block: true, onClick: () => fillRange() })),
      })),
    monthsPanel,
    h('div', { class: 'form-actions' },
      Button({ label: 'ยกเลิก', icon: 'x-lg', variant: 'secondary', href: `#${backPath}` }),
      submit));

  return form;
}
