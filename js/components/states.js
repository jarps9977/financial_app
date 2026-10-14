import { h } from '../utils/dom.js';
import { refresh } from '../store.js';
import { icon } from './icon.js';
import { Button } from './button.js';
import { Notice } from './misc.js';

export function Loading() {
  return h('div', { class: 'loading', 'aria-busy': 'true' },
    h('span', { class: 'visually-hidden' }, 'กำลังโหลดข้อมูล'),
    h('div', { class: 'grid grid-stats', 'aria-hidden': 'true' }, [1, 2, 3, 4].map(() => h('div', { class: 'skeleton skeleton-stat' }))),
    h('div', { class: 'skeleton skeleton-card', 'aria-hidden': 'true' }),
    h('div', { class: 'skeleton skeleton-card', 'aria-hidden': 'true' }));
}

export function Empty({ icon: iconName = 'inbox', title, text, action, compact }) {
  return h('div', { class: `empty${compact ? ' is-compact' : ''}` },
    h('span', { class: 'empty-icon' }, icon(iconName)),
    h('p', { class: 'empty-title' }, title),
    text && h('p', { class: 'empty-text' }, text),
    action);
}

export function ErrorState({ error, onRetry }) {
  return h('div', { class: 'empty is-error', role: 'alert' },
    h('span', { class: 'empty-icon' }, icon('wifi-off')),
    h('p', { class: 'empty-title' }, 'โหลดข้อมูลไม่สำเร็จ'),
    h('p', { class: 'empty-text' }, (error && error.message) || 'เกิดข้อผิดพลาด'),
    onRetry && Button({ label: 'ลองใหม่', icon: 'arrow-clockwise', variant: 'secondary', onClick: onRetry }));
}

// Shows cached data with a warning when the latest refresh failed
export function withData(state, view) {
  if (state.data) {
    return [
      state.error && Notice({ tone: 'warn', text: `แสดงข้อมูลที่บันทึกไว้ล่าสุด · ${state.error.message}` }),
      view(state.data),
    ];
  }
  if (state.error) return ErrorState({ error: state.error, onRetry: () => refresh() });
  return Loading();
}
