import { h } from '../utils/dom.js';
import { Button } from './button.js';

let uid = 0;

// Native <dialog> gives focus trap, Esc and top layer; CSS turns it into a bottom sheet on mobile
export function openSheet({ title, content, actions, onClose }) {
  const titleId = `sheet-title-${++uid}`;
  const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': titleId },
    h('div', { class: 'sheet-inner' },
      h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
      h('header', { class: 'sheet-head' },
        h('h2', { id: titleId, class: 'sheet-title' }, title),
        Button({ label: 'ปิด', icon: 'x-lg', variant: 'ghost', iconOnly: true, onClick: () => close() })),
      h('div', { class: 'sheet-body' }, content),
      actions && h('footer', { class: 'sheet-actions' }, actions)));

  // Clicks on the dialog element itself land on the backdrop area; ignore while a SweetAlert runs inside
  dlg.addEventListener('click', (e) => { if (e.target === dlg && !dlg.querySelector('.swal2-container')) close(); });
  dlg.addEventListener('cancel', (e) => { if (dlg.querySelector('.swal2-container')) e.preventDefault(); });
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onClose) onClose();
  });
  document.body.append(dlg);
  dlg.showModal();

  function close() {
    if (dlg.open) dlg.close();
  }
  return { el: dlg, close };
}
