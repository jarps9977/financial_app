import { h } from '../utils/dom.js';
import { mutate } from '../store.js';
import { navigate, groupPath } from '../router.js';
import { openSheet } from '../components/bottom-sheet.js';
import { Button } from '../components/button.js';
import { Field } from '../components/input.js';
import { runTask, notify, confirmAction } from '../components/alert.js';
import { icon } from '../components/icon.js';

const MAX_NAME = 40;
// Mirrors Apps Script GROUP_NAME_PATTERN (Sheets tab name rules)
const NAME_PATTERN = /^[^_[\]*?/\\:'][^[\]*?/\\:']*$/;
let uid = 0;

export function openGroupForm({ type = 'expense' } = {}) {
  const formId = `group-form-${++uid}`;
  const name = Field({
    label: 'ชื่อหมวด', name: 'name', required: true, maxlength: MAX_NAME, autocomplete: 'off',
    placeholder: 'เช่น KTC, K-Bank, Others',
    hint: 'ถ้ามี Sheet ชื่อนี้อยู่แล้ว แอปจะเชื่อมกับ Sheet เดิม (ต้องเป็นรูปแบบเดียวกัน)',
  });
  const kind = Field({
    label: 'ประเภท', name: 'type', value: type,
    options: [['expense', 'รายจ่าย (บัตร/บัญชี/ค่าใช้จ่าย)'], ['income', 'รายรับ (เงินเดือน/OT)']],
  });
  const submit = Button({ label: 'สร้างหมวด', type: 'submit', form: formId });

  async function onSubmit(e) {
    e.preventDefault();
    const value = name.input.value.trim();
    if (!value || value.length > MAX_NAME || !NAME_PATTERN.test(value)) {
      name.setError(`1-${MAX_NAME} ตัวอักษร ห้ามใช้ [ ] * ? / \\ : ' และห้ามขึ้นต้นด้วย _`);
      name.input.focus();
      return;
    }
    name.setError('');
    const res = await runTask({
      title: 'กำลังสร้างหมวด...',
      text: value,
      task: () => mutate('createGroup', { name: value, type: kind.input.value }),
    });
    if (!res.ok) return;
    ref.close();
    navigate(groupPath(value));
    notify({ title: 'สร้างหมวดสำเร็จ', text: `หมวด ${value} พร้อมใช้งานแล้ว` });
  }

  const ref = openSheet({
    title: 'สร้างหมวดใหม่',
    content: h('form', { id: formId, class: 'stack', novalidate: true, onSubmit }, name.el, kind.el),
    actions: [Button({ label: 'ยกเลิก', variant: 'ghost', onClick: () => ref.close() }), submit],
  });
  name.input.focus();
  return ref;
}

// Per-group actions sheet, used by the group list and the group detail page
export function openGroupMenu(group) {
  async function unlink() {
    ref.close();
    const ok = await confirmAction({
      title: `เอาหมวด ${group.name} ออกจากแอป?`,
      text: 'Sheet และข้อมูลใน Google Sheets ยังอยู่ครบ สร้างหมวดชื่อเดิมอีกครั้งเพื่อเชื่อมกลับได้',
      confirmText: 'เอาออก',
      danger: true,
      action: () => mutate('removeGroup', { name: group.name }),
      success: 'เอาหมวดออกแล้ว',
      successText: `หมวด ${group.name} ไม่แสดงในแอปแล้ว`,
    });
    if (ok) navigate('/groups');
  }
  const ref = openSheet({
    title: group.name,
    content: h('ul', { class: 'pick-list' },
      h('li', {}, h('a', { class: 'list-item', href: `#${groupPath(group.name)}`, onClick: () => ref.close() },
        h('span', { class: 'list-item-icon' }, icon('list-ul')),
        h('span', { class: 'list-item-main' }, h('span', { class: 'list-item-title' }, 'ดูรายการ')))),
      h('li', {}, h('a', { class: 'list-item', href: `#${groupPath(group.name)}/new`, onClick: () => ref.close() },
        h('span', { class: 'list-item-icon' }, icon('plus-lg')),
        h('span', { class: 'list-item-main' }, h('span', { class: 'list-item-title' }, 'เพิ่มรายการ')))),
      h('li', {}, h('button', { type: 'button', class: 'list-item is-danger', onClick: unlink },
        h('span', { class: 'list-item-icon' }, icon('folder-minus')),
        h('span', { class: 'list-item-main' },
          h('span', { class: 'list-item-title' }, 'เอาหมวดออกจากแอป'),
          h('span', { class: 'list-item-sub' }, 'ไม่ลบ Sheet ใน Google Sheets'))))),
  });
}
