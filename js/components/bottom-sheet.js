import { h } from '../utils/dom.js';
import { Button } from './button.js';

let uid = 0;

// Native <dialog> gives focus trap, Esc and top-layer stacking; CSS turns it into a bottom sheet on mobile
export function openSheet({ title, content, actions = [], onClose }) {
  const titleId = `sheet-title-${++uid}`;
  const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': titleId },
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h('header', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', id: titleId }, title),
      Button({ icon: 'close', variant: 'ghost', ariaLabel: 'ปิด', onClick: () => close() })),
    h('div', { class: 'sheet-body' }, content),
    actions.length > 0 && h('footer', { class: 'sheet-actions' }, actions));

  function close() {
    if (dlg.open) dlg.close();
  }

  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onClose) onClose();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(); // backdrop
  });

  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg };
}

export function confirmSheet({ title, message, confirmLabel = 'ยืนยัน', danger = false }) {
  return new Promise((resolve) => {
    let confirmed = false;
    const ref = openSheet({
      title,
      content: h('p', {}, message),
      onClose: () => resolve(confirmed),
      actions: [
        Button({ label: 'ยกเลิก', variant: 'secondary', onClick: () => ref.close() }),
        Button({
          label: confirmLabel,
          variant: danger ? 'danger' : 'primary',
          onClick: () => { confirmed = true; ref.close(); },
        }),
      ],
    });
  });
}
