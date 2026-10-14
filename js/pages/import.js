import { h, toNodes } from '../utils/dom.js';
import { money, sum, isoDate } from '../utils/format.js';
import { mutate } from '../store.js';
import { navigate } from '../router.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Field } from '../components/input.js';
import { Notice } from '../components/misc.js';
import { runTask, progressDialog, toast } from '../components/alert.js';
import { openSheet } from '../components/bottom-sheet.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icon.js';
import { readSlip, releaseOcr } from '../services/ocr.js';

const MAX_FILES = 30;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_AMOUNT = 1e9;
const DEFAULT_NAME = 'โอนเงิน (สลิป)';
const QUEUED = { status: 'queued', label: 'รอคิวอ่านสลิป' };

// Drafts survive navigation until saved; images stay on the device as blob URLs
const drafts = [];
let lastGroup = '';
let seq = 0;
let queueRunning = false;
let stopRequested = false;
// Summary hook of the currently mounted view; the OCR queue outlives page repaints
let onQueueChange = null;

export default {
  title: () => 'นำเข้าสลิป',
  back: () => '#/',
  kind: 'form',
  live: false,
  render: (_, state) => withData(state, view),
};

// ---------- OCR queue (one slip at a time, the worker is single threaded) ----------

async function readDraft(d, onProgress) {
  d.ocr = { status: 'running', label: 'กำลังอ่าน...' };
  try {
    const result = await readSlip(d.file, onProgress);
    const found = result.amount != null;
    if (found && !d.touched.amount) d.amount = String(result.amount);
    if (result.date && !d.touched.date) d.date = result.date;
    d.ocr = { status: 'done', label: found ? 'อ่านยอดแล้ว ตรวจสอบก่อนบันทึก' : 'ไม่พบยอดเงิน กรุณากรอกเอง', found };
    if (d.apply) d.apply();
  } catch (e) {
    d.ocr = { status: 'error', label: e.message || 'อ่านสลิปไม่สำเร็จ' };
  }
  if (d.paint) d.paint();
}

async function runQueue() {
  if (queueRunning || !drafts.some((d) => d.ocr.status === 'queued')) return;
  queueRunning = true;
  stopRequested = false;
  if (onQueueChange) onQueueChange();

  let doneCount = 0;
  let found = 0;
  const dialog = progressDialog({
    title: 'กำลังอ่านสลิป',
    cancelText: 'หยุดอ่าน',
    onCancel: () => { stopRequested = true; },
  });
  try {
    let next;
    while (!stopRequested && (next = drafts.find((d) => d.ocr.status === 'queued'))) {
      const pending = drafts.filter((d) => d.ocr.status === 'queued').length;
      const total = doneCount + pending;
      const index = doneCount + 1;
      await readDraft(next, (label, progress) => {
        // The current slip contributes its own fraction to the overall bar
        dialog.update((doneCount + progress) / total, `สลิป ${index}/${total} · ${label}`);
      });
      doneCount++;
      if (next.ocr.found) found++;
    }
  } finally {
    // Slips left in the queue after a stop are marked for manual entry
    drafts.filter((d) => d.ocr.status === 'queued').forEach((d) => {
      d.ocr = { status: 'skipped', label: 'ข้ามการอ่าน กรอกเองหรือกดอ่านอีกครั้ง' };
      if (d.paint) d.paint();
    });
    queueRunning = false;
    dialog.finish({
      title: found === doneCount ? 'อ่านสลิปเสร็จแล้ว' : 'อ่านสลิปเสร็จ (บางรายการไม่พบยอด)',
      text: `อ่านแล้ว ${doneCount} สลิป · พบยอด ${found} สลิป ตรวจสอบตัวเลขก่อนบันทึก`,
      type: found === doneCount ? 'success' : 'warning',
    });
    if (onQueueChange) onQueueChange();
    releaseOcr();
  }
}

// ---------- View ----------

function view(data) {
  const groups = data.groups;
  if (!groups.length) {
    return Empty({ title: 'ยังไม่มีหมวด', text: 'สร้างหมวดก่อนนำเข้าสลิป', action: Button({ label: 'สร้างหมวด', href: '#/groups?new=1', variant: 'secondary' }) });
  }
  if (!groups.some((g) => g.name === lastGroup)) lastGroup = groups[0].name;
  const year = data.year;

  const list = h('div', { class: 'slip-list' });
  const summary = h('p', { class: 'muted', 'aria-live': 'polite' });
  const submit = Button({ label: 'บันทึกสลิป', type: 'submit', icon: 'check2' });
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', multiple: true, id: 'slip-files', class: 'visually-hidden',
    onChange: (e) => { addFiles(e.target.files); e.target.value = ''; },
  });

  function addFiles(files) {
    let skipped = 0;
    for (const file of files) {
      if (drafts.length >= MAX_FILES) { skipped++; continue; }
      if (!file.type.startsWith('image/') || file.size > MAX_BYTES) { skipped++; continue; }
      drafts.push({
        id: ++seq,
        file,
        url: URL.createObjectURL(file),
        date: isoDate(new Date(file.lastModified || Date.now())),
        amount: '',
        name: DEFAULT_NAME,
        group: lastGroup,
        touched: { date: false, amount: false },
        ocr: { ...QUEUED },
      });
    }
    draw();
    // Queue opens its modal synchronously, so the toast below falls back to the non-Swal toast
    runQueue();
    if (skipped) toast(`ข้าม ${skipped} ไฟล์ (รับเฉพาะรูป ไม่เกิน 15MB สูงสุด ${MAX_FILES} รูป)`, 'error');
  }

  function removeDraft(d) {
    URL.revokeObjectURL(d.url);
    d.paint = null;
    d.apply = null;
    drafts.splice(drafts.indexOf(d), 1);
    draw();
  }

  function preview(d) {
    openSheet({
      title: d.file.name,
      content: h('img', { src: d.url, alt: `สลิป ${d.file.name}`, class: 'slip-full', decoding: 'async' }),
    });
  }

  function slipCard(d, index) {
    const date = Field({
      label: 'วันที่โอน', type: 'date', value: d.date, required: true,
      onInput: (e) => { d.date = e.target.value; d.touched.date = true; },
    });
    const amount = Field({
      label: 'จำนวนเงิน (บาท)', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: '0.00',
      value: d.amount, required: true,
      onInput: (e) => { d.amount = e.target.value; d.touched.amount = true; updateSummary(); },
    });
    const name = Field({ label: 'ชื่อรายการ', value: d.name, maxlength: 100, required: true, onInput: (e) => { d.name = e.target.value; } });
    const group = Field({
      label: 'หมวด', value: d.group, options: groups.map((g) => [g.name, g.name]),
      onChange: (e) => { d.group = e.target.value; lastGroup = d.group; },
    });

    const statusText = h('p', { class: 'ocr-status-text' });
    const retry = Button({
      label: 'อ่านอีกครั้ง', icon: 'arrow-repeat', variant: 'ghost',
      onClick: () => { d.ocr = { ...QUEUED }; d.paint(); runQueue(); },
    });
    const status = h('div', { class: 'ocr-status', 'aria-live': 'polite' }, statusText, retry);

    d.fields = { date, amount, name };
    d.apply = () => {
      date.input.value = d.date;
      amount.input.value = d.amount;
      updateSummary();
    };
    d.paint = () => {
      const st = d.ocr.status;
      const iconName = { done: d.ocr.found ? 'check2-circle' : 'exclamation-circle', queued: 'hourglass-split', running: 'hourglass-split' }[st] || 'exclamation-circle';
      status.dataset.state = st === 'done' && !d.ocr.found ? 'error' : st;
      statusText.replaceChildren(icon(iconName), ` ${d.ocr.label}`);
      retry.hidden = st === 'queued' || st === 'running' || (st === 'done' && d.ocr.found);
    };
    d.paint();

    return h('article', { class: 'card slip-card', 'aria-label': `สลิปที่ ${index + 1}` },
      h('button', { type: 'button', class: 'slip-thumb-btn', onClick: () => preview(d), 'aria-label': `ดูรูปสลิปที่ ${index + 1}` },
        h('img', { src: d.url, alt: '', class: 'slip-thumb', loading: 'lazy', decoding: 'async' })),
      h('div', { class: 'slip-fields' },
        status,
        h('div', { class: 'form-row' }, date.el, amount.el),
        h('div', { class: 'form-row' }, name.el, group.el)),
      Button({ label: `ลบสลิปที่ ${index + 1}`, icon: 'trash', variant: 'danger-ghost', iconOnly: true, className: 'slip-remove', onClick: () => removeDraft(d) }));
  }

  function updateSummary() {
    const total = sum(drafts.map((d) => Number(d.amount) || 0));
    summary.textContent = drafts.length ? `${drafts.length} สลิป · รวม ${money(total)} บาท` : '';
    submit.disabled = drafts.length === 0 || queueRunning;
  }

  function draw() {
    list.replaceChildren(...toNodes(drafts.length
      ? drafts.map(slipCard)
      : Empty({ icon: 'images', title: 'ยังไม่ได้เลือกสลิป', text: 'เลือกรูปสลิปโอนเงินได้ทีละหลายรูป', compact: true })));
    updateSummary();
  }

  function validate() {
    let valid = true;
    drafts.forEach((d) => {
      const { date, amount, name } = d.fields;
      const dt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.date || '');
      if (!dt) { date.setError('เลือกวันที่'); valid = false; } else if (Number(dt[1]) !== year) {
        date.setError(`ต้องเป็นปี ${year} (ปีของ Sheet)`);
        valid = false;
      } else date.setError('');
      const n = Number(d.amount);
      if (d.amount === '' || !Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) { amount.setError('กรอกจำนวนเงิน'); valid = false; } else amount.setError('');
      const nm = (d.name || '').trim();
      if (!nm || nm.length > 100) { name.setError('กรอกชื่อรายการ'); valid = false; } else name.setError('');
    });
    return valid;
  }

  // Slips with the same group + name merge into one row, amounts added per month
  function toItems() {
    const rows = new Map();
    drafts.forEach((d) => {
      const name = d.name.trim();
      const key = `${d.group}\u0000${name}`;
      if (!rows.has(key)) rows.set(key, { group: d.group, name, values: Array(12).fill(null), start: '', end: '', amount: null });
      const month = Number(d.date.slice(5, 7)) - 1;
      const values = rows.get(key).values;
      values[month] = Math.round(((values[month] || 0) + Number(d.amount)) * 100) / 100;
    });
    return [...rows.values()];
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!drafts.length || queueRunning) return;
    if (!validate()) {
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      return;
    }
    const count = drafts.length;
    const items = toItems();
    const res = await runTask({
      title: `กำลังบันทึก ${count} สลิป...`,
      text: `${items.length} รายการ รวม ${money(sum(drafts.map((d) => Number(d.amount))))} บาท`,
      success: 'บันทึกสำเร็จ',
      successText: `บันทึก ${count} สลิป (${items.length} รายการ) ลง Google Sheets แล้ว`,
      task: () => mutate('addBatch', { items }),
    });
    if (!res.ok) return;
    drafts.splice(0).forEach((d) => URL.revokeObjectURL(d.url));
    navigate('/report');
  }

  onQueueChange = updateSummary;
  draw();

  const form = h('form', { class: 'form', novalidate: true, onSubmit },
    Card({
      title: 'เลือกรูปสลิป',
      subtitle: `สูงสุด ${MAX_FILES} รูปต่อครั้ง · อ่านยอดในเครื่อง รูปไม่ถูกอัปโหลด`,
      children: h('div', { class: 'stack' },
        h('div', { class: 'file-pick' }, fileInput,
          h('label', { for: 'slip-files', class: 'btn btn-secondary btn-block' }, icon('images'), h('span', {}, 'เลือกรูปสลิป (หลายรูป)'))),
        Notice({ text: 'ระบบอ่านยอดเงินและวันที่จากสลิปอัตโนมัติ (ครั้งแรกต้องดาวน์โหลดข้อมูลภาษา) ตรวจสอบตัวเลขก่อนบันทึก สลิปที่หมวดและชื่อเหมือนกันจะรวมเป็นแถวเดียว' })),
    }),
    list,
    h('div', { class: 'form-actions' }, summary, submit));

  // Resume a queue left from a previous visit
  if (!queueRunning) queueMicrotask(runQueue);
  return form;
}
