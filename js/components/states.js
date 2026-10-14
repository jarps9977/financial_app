import { h } from '../utils/dom.js';
import { refresh } from '../store.js';
import { icon } from './icons.js';
import { Button } from './button.js';

export function Loading({ rows = 3 } = {}) {
  return h('div', { class: 'state-loading', 'aria-busy': 'true' },
    h('p', { class: 'sr-only', role: 'status' }, 'กำลังโหลด…'),
    Array.from({ length: rows }, () => h('div', { class: 'skeleton' })));
}

export function Empty({ title, text, action, compact = false }) {
  return h('div', { class: `state${compact ? ' state-compact' : ''}` },
    icon('inbox', 'state-icon'),
    h('p', { class: 'state-title' }, title),
    text && h('p', { class: 'state-text' }, text),
    action);
}

export function ErrorState({ error, onRetry }) {
  return h('div', { class: 'state state-error', role: 'alert' },
    icon('alert', 'state-icon'),
    h('p', { class: 'state-title' }, 'โหลดข้อมูลไม่สำเร็จ'),
    h('p', { class: 'state-text' }, (error && error.message) || ''),
    onRetry && Button({ label: 'ลองใหม่', icon: 'refresh', variant: 'secondary', onClick: onRetry }));
}

// Shared loading / error / cached-data handling for pages that need sheet data
export function withData(state, render) {
  if (state.data) {
    const view = render(state.data);
    if (!state.error) return view;
    return [
      h('div', { class: 'banner', role: 'status' }, icon('alert'), `แสดงข้อมูลล่าสุดที่บันทึกไว้ · ${state.error.message}`),
      view,
    ];
  }
  if (state.error) return ErrorState({ error: state.error, onRetry: refresh });
  return Loading();
}
