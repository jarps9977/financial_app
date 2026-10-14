import { h } from '../utils/dom.js';
import { icon } from './icon.js';
import { ProgressBar, startProgress } from './progress.js';

// SweetAlert2 is loaded from CDN in index.html; every helper degrades when it is unavailable (offline first load)
const lib = () => window.Swal || null;

// A modal <dialog> sits in the top layer, so Swal must render inside it to stay visible
const target = () => document.querySelector('dialog[open]') || 'body';

const DANGER_COLOR = '#d33';

// Standard SweetAlert2 look (animated icons, styled buttons); popup class only adapts colors to the app theme
function fire(opts) {
  return lib().fire({
    reverseButtons: true,
    heightAuto: false,
    target: target(),
    confirmButtonText: 'ตกลง',
    cancelButtonText: 'ยกเลิก',
    ...opts,
    customClass: { popup: 'ngern-swal', ...(opts.customClass || {}) },
  });
}

function swalToast(message, type) {
  const Swal = lib();
  return Swal.fire({
    toast: true,
    position: 'top',
    target: target(),
    icon: type === 'error' ? 'error' : 'success',
    title: message,
    showConfirmButton: false,
    timer: type === 'error' ? 6000 : 3000,
    timerProgressBar: true,
    customClass: { popup: 'ngern-swal' },
    didOpen: (el) => {
      el.addEventListener('mouseenter', Swal.stopTimer);
      el.addEventListener('mouseleave', Swal.resumeTimer);
    },
  });
}

let fallbackRegion = null;

function fallbackToast(message, type) {
  if (!fallbackRegion) {
    fallbackRegion = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(fallbackRegion);
  }
  const el = h('div', { class: `toast is-${type}` }, icon(type === 'error' ? 'exclamation-circle' : 'check2-circle'), h('span', {}, message));
  fallbackRegion.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3000);
}

// Small hint for minor feedback; Swal is a singleton so it never replaces an open modal
export function toast(message, type = 'info') {
  const Swal = lib();
  const popup = Swal && Swal.isVisible() ? Swal.getPopup() : null;
  if (!Swal || (popup && !popup.classList.contains('swal2-toast'))) {
    fallbackToast(message, type);
    return;
  }
  swalToast(message, type);
}

// Result modal (success / error / warning) like the SweetAlert2 demo; success auto closes
export function notify({ title, text, type = 'success' }) {
  if (!lib()) {
    fallbackToast(text ? `${title} · ${text}` : title, type === 'success' ? 'info' : 'error');
    return Promise.resolve();
  }
  return fire({
    icon: type,
    title,
    text,
    ...(type === 'success' ? { timer: 2200, timerProgressBar: true } : {}),
  });
}

// Blocking loading modal around an async task; ends with a success or error modal
export async function runTask({ title, text, task, success, successText }) {
  const Swal = lib();
  const done = Swal ? null : startProgress();
  if (Swal) {
    fire({
      title, text, allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });
  }
  try {
    const result = await task();
    if (success) notify({ title: success, text: successText });
    else if (Swal) Swal.close();
    return { ok: true, result };
  } catch (e) {
    await notify({ title: 'ไม่สำเร็จ', text: (e && e.message) || 'เกิดข้อผิดพลาด', type: 'error' });
    return { ok: false, error: e };
  } finally {
    if (done) done();
  }
}

// Confirm dialog; with action it shows a loader on the confirm button and keeps the dialog open on error
export async function confirmAction({ title, text, confirmText = 'ยืนยัน', danger = false, action, success, successText }) {
  const Swal = lib();
  if (!Swal) {
    if (!window.confirm(`${title}\n\n${text || ''}`)) return false;
    if (!action) return true;
    const res = await runTask({ title, task: action, success, successText });
    return res.ok;
  }
  const res = await fire({
    icon: danger ? 'warning' : 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    focusCancel: danger,
    ...(danger ? { confirmButtonColor: DANGER_COLOR } : {}),
    showLoaderOnConfirm: Boolean(action),
    allowOutsideClick: () => !Swal.isLoading(),
    allowEscapeKey: () => !Swal.isLoading(),
    preConfirm: action
      ? async () => {
        try {
          await action();
          return true;
        } catch (e) {
          Swal.showValidationMessage((e && e.message) || 'เกิดข้อผิดพลาด');
          return false;
        }
      }
      : undefined,
  });
  if (res.isConfirmed && success) notify({ title: success, text: successText });
  return res.isConfirmed;
}

// Blocking modal with a determinate progress bar; finish() swaps it for a result modal
export function progressDialog({ title, cancelText, onCancel }) {
  const Swal = lib();
  const bar = ProgressBar({ label: title });
  if (!Swal) {
    const done = startProgress();
    return { update: () => {}, finish: ({ title: t, text } = {}) => { done(); if (t) fallbackToast(text ? `${t} · ${text}` : t, 'info'); } };
  }
  fire({
    title,
    html: bar.el,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    showCancelButton: Boolean(onCancel),
    cancelButtonText: cancelText,
  }).then((r) => {
    if (onCancel && r.dismiss === Swal.DismissReason.cancel) onCancel();
  });
  return {
    update: (ratio, text) => bar.set(ratio, text),
    finish: ({ title: t, text, type = 'success' } = {}) => {
      if (t) notify({ title: t, text, type });
      else Swal.close();
    },
  };
}
