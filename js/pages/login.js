import { h } from '../utils/dom.js';
import { getSettings, saveSettings, isValidApiUrl } from '../settings.js';
import { state, refresh } from '../store.js';
import { navigate } from '../router.js';
import { Field } from '../components/input.js';
import { Button } from '../components/button.js';
import { icon } from '../components/icons.js';

export default {
  title: () => 'เข้าสู่ระบบ',
  kind: 'auth',
  live: false,
  needsData: false,
  render,
};

function render() {
  const s = getSettings();
  const urlField = Field({
    label: 'Apps Script Web App URL', name: 'apiUrl', type: 'url', inputmode: 'url', value: s.apiUrl,
    autocomplete: 'off', placeholder: 'https://script.google.com/macros/s/…/exec', required: true,
  });
  const passField = Field({
    label: 'Passcode', name: 'passcode', type: 'password', autocomplete: 'current-password', required: true,
  });
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = Button({ label: 'เข้าสู่ระบบ', type: 'submit', block: true });

  async function onSubmit(e) {
    e.preventDefault();
    formError.hidden = true;
    const apiUrl = urlField.input.value.trim();
    const passcode = passField.input.value;
    let valid = true;
    if (!isValidApiUrl(apiUrl)) {
      urlField.setError('ต้องเป็น URL ของ Apps Script ที่ลงท้ายด้วย /exec');
      valid = false;
    } else urlField.setError('');
    if (!passcode) {
      passField.setError('กรอก Passcode');
      valid = false;
    } else passField.setError('');
    if (!valid) return;

    submit.disabled = true;
    saveSettings({ apiUrl, passcode });
    await refresh();
    submit.disabled = false;
    if (state.error) {
      if (['unauthorized', 'locked'].includes(state.error.code)) saveSettings({ passcode: '' });
      formError.textContent = state.error.message;
      formError.hidden = false;
      return;
    }
    navigate('/');
  }

  return h('form', { class: 'form auth-form', novalidate: true, onSubmit },
    h('div', { class: 'auth-brand' },
      icon('wallet'),
      h('p', { class: 'auth-title' }, 'Ngern'),
      h('p', { class: 'muted' }, 'ติดตามรายรับรายจ่ายรายปี')),
    urlField.el,
    passField.el,
    formError,
    submit);
}
