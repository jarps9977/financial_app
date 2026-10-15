import { h } from '../utils/dom.js';
import { saveSettings, setPin, clearPin, lock, PIN_LENGTH } from '../settings.js';
import { state, refresh, clearData } from '../store.js';
import { navigate } from '../router.js';
import { icon } from '../components/icon.js';

export default {
  title: () => 'ใส่ PIN',
  kind: 'bare',
  live: false,
  needsData: false,
  render: () => view(),
};

let keyHandler = null;

function view() {
  let pin = '';
  let busy = false;

  const dots = Array.from({ length: PIN_LENGTH }, () => h('span', { class: 'pin-dot' }));
  const dotRow = h('div', { class: 'pin-dots', 'aria-hidden': 'true' }, dots);
  const status = h('p', { class: 'visually-hidden', 'aria-live': 'polite' }, '');
  const error = h('p', { class: 'pin-error', role: 'alert' }, '');

  const paint = () => {
    dots.forEach((d, i) => d.classList.toggle('is-filled', i < pin.length));
    status.textContent = `กรอกแล้ว ${pin.length} จาก ${PIN_LENGTH} หลัก`;
  };

  async function submit() {
    busy = true;
    dotRow.classList.add('is-busy');
    error.textContent = '';
    setPin(pin);
    await refresh({ fresh: true });
    busy = false;
    dotRow.classList.remove('is-busy');
    const err = state.error;
    if (!err) {
      const target = lock.returnTo || '/';
      lock.returnTo = '/';
      navigate(target);
      return;
    }
    clearPin();
    pin = '';
    paint();
    if (err.code === 'unauthorized') {
      // Device passcode is no longer valid: sign in again from scratch
      saveSettings({ passcode: '' });
      clearData();
      navigate('/login');
      return;
    }
    error.textContent = err.message;
    dotRow.classList.remove('is-shake');
    void dotRow.offsetWidth; // restart the shake animation
    dotRow.classList.add('is-shake');
  }

  const press = (digit) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    pin += digit;
    error.textContent = '';
    paint();
    if (pin.length === PIN_LENGTH) submit();
  };
  const back = () => {
    if (busy || !pin) return;
    pin = pin.slice(0, -1);
    paint();
  };

  const key = (label, onClick, extra = {}) => h('button', { type: 'button', class: 'pin-key', onClick, ...extra }, label);
  const keypad = h('div', { class: 'pin-pad' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d))),
    h('span', { 'aria-hidden': 'true' }),
    key('0', () => press('0')),
    key(icon('backspace'), back, { class: 'pin-key is-icon', 'aria-label': 'ลบตัวเลข' }));

  // Physical keyboard support; replaced on every render so only one listener is active
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (!document.body.contains(keypad)) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
      return;
    }
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') back();
  };
  document.addEventListener('keydown', keyHandler);

  paint();
  return h('div', { class: 'pin-screen' },
    h('div', { class: 'login-card card pin-card' },
      h('img', { src: 'icons/app_icon.png', alt: '', class: 'login-logo', width: '72', height: '72', decoding: 'async' }),
      h('h2', { class: 'login-title' }, 'ใส่ PIN'),
      h('p', { class: 'muted login-sub' }, `PIN ${PIN_LENGTH} หลัก เพื่อเข้าใช้งาน`),
      dotRow, status, error, keypad));
}
