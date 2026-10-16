import { h } from '../utils/dom.js';
import { getSettings, saveSettings, isValidApiUrl, setPin, clearPin, isValidPin, PIN_LENGTH } from '../settings.js';
import { state, refresh } from '../store.js';
import { navigate } from '../router.js';
import { Button } from '../components/button.js';
import { Field } from '../components/input.js';
import { runTask } from '../components/alert.js';
import { AuthHeader } from '../components/misc.js';

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
  const pinField = Field({
    label: `PIN (${PIN_LENGTH} หลัก)`, name: 'pin', type: 'password', inputmode: 'numeric', autocomplete: 'off',
    maxlength: PIN_LENGTH, required: true, hint: 'ต้องใส่ทุกครั้งที่เปิดแอป',
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
    const pin = pinField.input.value.trim();
    if (!isValidPin(pin)) {
      pinField.setError(`PIN ต้องเป็นตัวเลข ${PIN_LENGTH} หลัก`);
      valid = false;
    } else pinField.setError('');
    if (!valid) return;

    saveSettings({ apiUrl, passcode });
    setPin(pin);
    const res = await runTask({
      title: 'กำลังเชื่อมต่อ...',
      text: 'โหลดข้อมูลจาก Google Sheets',
      success: 'เข้าสู่ระบบสำเร็จ',
      task: async () => {
        await refresh({ force: true });
        if (state.error) throw state.error;
      },
    });
    if (!res.ok) {
      clearPin();
      if (res.error.code === 'pin') {
        pinField.input.value = '';
        pinField.input.focus();
        return;
      }
      // 'locked' can come from PIN typos too, so only a rejected passcode clears it
      if (res.error.code === 'unauthorized') saveSettings({ passcode: '' });
      passField.input.focus();
      return;
    }
    navigate('/');
  }

  return h('div', { class: 'login' },
    h('div', { class: 'login-card card' },
      AuthHeader('Ngern', 'ติดตามรายรับรายจ่ายรายปี · บันทึกลง Google Sheets'),
      h('form', { class: 'stack', novalidate: true, onSubmit }, urlField.el, passField.el, pinField.el, submit)));
}
