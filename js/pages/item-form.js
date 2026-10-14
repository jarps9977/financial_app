import { h } from '../utils/dom.js';
import { MONTHS, MONTHS_SHORT, parseYm } from '../utils/format.js';
import { findSheet, currentMonthIndex } from '../selectors.js';
import { mutate } from '../store.js';
import { navigate } from '../router.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Field, SelectField } from '../components/input.js';
import { toast } from '../components/misc.js';
import { withData, Empty } from '../components/states.js';

const MAX_NAME = 100;
const MAX_AMOUNT = 1e9;

export default {
  title: (p) => (p.row ? 'แก้ไขรายการ' : 'เพิ่มรายการ'),
  kind: 'form',
  live: false,
  render: (p, state) => withData(state, (data) => view(data, p)),
};

function view(data, params) {
  const sheet = findSheet(data, params.name);
  if (!sheet) return Empty({ title: 'ไม่พบหมวดนี้', action: Button({ label: 'กลับ', href: '#/sheets', variant: 'secondary' }) });

  const backPath = `/sheet/${encodeURIComponent(sheet.name)}`;
  const isEdit = params.row != null;
  const item = isEdit ? sheet.items.find((i) => i.row === Number(params.row)) : null;
  if (isEdit && !item) {
    return Empty({
      title: 'ไม่พบรายการ',
      text: 'อาจถูกลบหรือย้ายใน Sheet แล้ว',
      action: Button({ label: 'กลับ', href: `#${backPath}`, variant: 'secondary' }),
    });
  }

  const nameField = Field({
    label: 'ชื่อรายการ', name: 'name', value: item ? item.name : '', required: true, maxlength: MAX_NAME, autocomplete: 'off',
  });
  const endField = Field({
    label: 'เดือนสิ้นสุด (รายการผ่อน)', name: 'end', type: 'month', value: item ? item.end : '',
    placeholder: 'YYYY-MM', hint: 'เว้นว่างถ้าไม่มีกำหนดจบ เช่น 2027-04',
  });
  const amountField = Field({
    label: 'ยอดต่อเดือน', name: 'amount', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: '0.00',
  });
  const fromField = SelectField({
    label: 'เริ่มเดือน', name: 'from', value: String(currentMonthIndex(data.year)),
    options: MONTHS.map((m, i) => [String(i), m]),
  });
  const monthFields = MONTHS_SHORT.map((m, i) => {
    const locked = Boolean(item && item.formulas[i]);
    return Field({
      label: m,
      name: `m${i}`,
      type: 'number',
      inputmode: 'decimal',
      step: '0.01',
      value: item && item.values[i] != null ? String(item.values[i]) : '',
      disabled: locked,
      hint: locked ? 'สูตรใน Sheet' : null,
    });
  });

  function fillRange() {
    const amount = amountField.input.value.trim();
    if (amount === '' || !Number.isFinite(Number(amount))) {
      amountField.setError('กรอกยอดต่อเดือน');
      amountField.input.focus();
      return;
    }
    amountField.setError('');
    const from = Number(fromField.input.value);
    const end = parseYm(endField.input.value.trim());
    let to = 11;
    if (end && end.y === data.year) to = end.m - 1;
    else if (end && end.y < data.year) to = -1;

    let filled = 0;
    monthFields.forEach((f, i) => {
      if (f.input.disabled || i < from) return;
      if (i <= to) { f.input.value = amount; filled++; } else f.input.value = '';
    });
    toast(filled ? `เติมยอด ${filled} เดือนแล้ว` : 'ไม่มีเดือนในช่วงที่เลือก');
  }

  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = Button({ label: isEdit ? 'บันทึกการแก้ไข' : 'บันทึก', type: 'submit' });

  async function onSubmit(e) {
    e.preventDefault();
    formError.hidden = true;
    let valid = true;

    const name = nameField.input.value.trim();
    if (!name || name.length > MAX_NAME) {
      nameField.setError(`กรอกชื่อรายการ 1-${MAX_NAME} ตัวอักษร`);
      valid = false;
    } else nameField.setError('');

    const end = endField.input.value.trim();
    if (end && !parseYm(end)) {
      endField.setError('รูปแบบต้องเป็น YYYY-MM');
      valid = false;
    } else endField.setError('');

    const values = monthFields.map((f, i) => {
      if (f.input.disabled) return item.values[i];
      const raw = f.input.value.trim();
      if (raw === '') { f.setError(''); return null; }
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n) > MAX_AMOUNT) {
        f.setError('ไม่ถูกต้อง');
        valid = false;
        return null;
      }
      f.setError('');
      return n;
    });

    if (!valid) {
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    submit.disabled = true;
    try {
      await mutate(isEdit ? 'update' : 'add', {
        sheet: sheet.name,
        row: item ? item.row : undefined,
        expectedName: item ? item.name : undefined,
        name,
        values,
        end,
      });
      toast(isEdit ? 'บันทึกแล้ว' : 'เพิ่มรายการแล้ว');
      navigate(backPath);
    } catch (err) {
      formError.textContent = err.message;
      formError.hidden = false;
      formError.scrollIntoView({ block: 'center' });
    } finally {
      submit.disabled = false;
    }
  }

  const form = h('form', { class: 'form', novalidate: true, onSubmit },
    h('p', { class: 'form-context' }, `หมวด ${sheet.name} · ปี ${data.year}`),
    Card({ title: 'ข้อมูลรายการ', children: h('div', { class: 'stack' }, nameField.el, endField.el) }),
    Card({
      title: 'กรอกเร็ว',
      subtitle: 'ใส่ยอดเท่ากันตั้งแต่เดือนเริ่มถึงเดือนสิ้นสุด',
      children: h('div', { class: 'stack' },
        h('div', { class: 'form-row' }, amountField.el, fromField.el),
        Button({ label: 'เติมยอดตามช่วงเดือน', variant: 'secondary', block: true, onClick: fillRange })),
    }),
    Card({ title: 'ยอดรายเดือน', subtitle: 'เว้นว่างได้', children: h('div', { class: 'month-inputs' }, monthFields.map((f) => f.el)) }),
    formError,
    h('div', { class: 'form-actions' },
      Button({ label: 'ยกเลิก', variant: 'ghost', href: `#${backPath}` }),
      submit));

  return form;
}
