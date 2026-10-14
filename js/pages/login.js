import { h } from '../utils/dom.js';
import { getSettings, saveSettings, isValidApiUrl } from '../settings.js';
import { state, refresh } from '../store.js';
import { navigate } from '../router.js';
import { Button } from '../components/button.js';
import { Field } from '../components/input.js';
import { runTask } from '../components/alert.js';

export default {
  title: () => 'เข้าสู่ระบบ',
  kind: 'bare',
  live: false,
  needsData: false,
  render: () => view(),
};

function view() {
  const settings = getSettings();
  const urlField = Field({
    label: 'Apps Script URL', name: 'apiUrl', type: 'url', inputmode: 'url', autocomplete: 'off',
    value: settings.apiUrl, required: true, hint: 'URL ที่ลงท้ายด้วย /exec จาก Deploy > Web app',
  });
  const passField = Field({
    label: 'รหัสผ่าน (PASSCODE)', name: 'passcode', type: 'password', autocomplete: 'current-password', required: true,
  });
  const submit = Button({ label: 'เข้าสู่ระบบ', type: 'submit', block: true, icon: 'box-arrow-in-right' });

  async function onSubmit(e) {
    e.preventDefault();
    const apiUrl = urlField.input.value.trim();
    const passcode = passField.input.value;
    let valid = true;
    if (!isValidApiUrl(apiUrl)) {
      urlField.setError('ต้องเป็น https://script.google.com/macros/s/.../exec');
      valid = false;
    } else urlField.setError('');
    if (!passcode) {
      passField.setError('กรอกรหัสผ่าน');
      valid = false;
    } else passField.setError('');
    if (!valid) return;

    saveSettings({ apiUrl, passcode });
    const res = await runTask({
      title: 'กำลังเชื่อมต่อ...',
      text: 'โหลดข้อมูลจาก Google Sheets',
      success: 'เข้าสู่ระบบสำเร็จ',
      task: async () => {
        await refresh();
        if (state.error) throw state.error;
      },
    });
    if (!res.ok) {
      if (res.error.code === 'unauthorized' || res.error.code === 'locked') saveSettings({ passcode: '' });
      passField.input.focus();
      return;
    }
    navigate('/');
  }

  return h('div', { class: 'login' },
    h('div', { class: 'login-card card' },
      h('img', { src: 'icons/app_icon.png', alt: '', class: 'login-logo', width: '72', height: '72', decoding: 'async' }),
      h('h2', { class: 'login-title' }, 'Ngern'),
      h('p', { class: 'muted login-sub' }, 'ติดตามรายรับรายจ่ายรายปี · บันทึกลง Google Sheets'),
      h('form', { class: 'stack', novalidate: true, onSubmit }, urlField.el, passField.el, submit)));
}
