import { h, toNodes } from './utils/dom.js';
import { route, match, navigate, currentPath, groupPath } from './router.js';
import { state, subscribe, refresh } from './store.js';
import { getSettings, saveSettings, applyTheme, isConfigured, isUnlocked, clearPin, lock } from './settings.js';
import { createShell } from './layout/shell.js';
import { openSheet } from './components/bottom-sheet.js';
import { ErrorState } from './components/states.js';
import { attachPullToRefresh } from './components/pull-refresh.js';
import { toast } from './components/misc.js';
import { startProgress } from './components/progress.js';
import { icon } from './components/icon.js';

// Pages are lazy loaded so each route ships only its own code
route('/login', () => import('./pages/login.js'));
route('/pin', () => import('./pages/pin.js'));
route('/', () => import('./pages/home.js'));
route('/groups', () => import('./pages/groups.js'));
route('/group/:name', () => import('./pages/group.js'));
route('/group/:name/new', () => import('./pages/item-form.js'));
route('/group/:name/edit/:row', () => import('./pages/item-form.js'));
route('/report', () => import('./pages/report.js'));
route('/bills', () => import('./pages/bills.js'));
route('/import', () => import('./pages/import.js'));
route('/settings', () => import('./pages/settings.js'));

applyTheme(getSettings().theme);

const shell = createShell(document.getElementById('app'), {
  onAdd: openAddPicker,
  onRefresh: () => refresh({ fresh: true }),
});
attachPullToRefresh(() => refresh({ fresh: true }));

let current = null;
let renderToken = 0;
// No touch/keyboard input (or app in background) for this long asks for the PIN again
const AUTO_LOCK_MS = 5 * 60 * 1000;
const OPEN_PATHS = ['/login', '/pin'];

function lockApp() {
  clearPin();
  shell.setGroups({ groups: [] });
  // Sheets and alerts would otherwise stay on top of the lock screen
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  if (window.Swal) window.Swal.close();
  if (!OPEN_PATHS.includes(currentPath())) lock.returnTo = currentPath();
  navigate('/pin');
}

async function renderRoute() {
  const path = currentPath();
  if (path !== '/login' && !isConfigured()) { navigate('/login'); return; }
  if (!OPEN_PATHS.includes(path) && !isUnlocked()) { lock.returnTo = path; navigate('/pin'); return; }
  const found = match(path);
  if (!found) { navigate('/'); return; }

  const token = ++renderToken;
  const done = startProgress();
  let mod;
  try {
    mod = (await found.load()).default;
  } catch {
    if (token === renderToken) {
      shell.main.replaceChildren(ErrorState({ error: new Error('โหลดหน้าไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต'), onRetry: renderRoute }));
    }
    return;
  } finally {
    done();
  }
  if (token !== renderToken) return;

  current = { mod, params: found.params, painted: false };
  const title = mod.title(found.params);
  shell.setTitle(title);
  shell.setKind(mod.kind || 'page');
  shell.setBack(mod.back ? mod.back(found.params) : null);
  shell.setActive(path);
  document.title = `${title} · Ngern`;
  paint();
  window.scrollTo(0, 0);
  shell.main.focus({ preventScroll: true });
}

function paint() {
  if (!current) return;
  try {
    shell.main.replaceChildren(...toNodes(current.mod.render(current.params, state)));
  } catch (e) {
    console.error(e);
    shell.main.replaceChildren(ErrorState({ error: new Error('แสดงผลหน้านี้ไม่ได้'), onRetry: paint }));
  }
  // Form pages paint once with data so typing is never wiped by a refresh
  if (state.data || current.mod.needsData === false) current.painted = true;
}

subscribe((s) => {
  shell.setLoading(s.loading);
  const code = s.error && s.error.code;
  // Never fill the sidebar while locked or while the PIN is being rejected
  if (s.data && isUnlocked() && !['pin', 'locked', 'unauthorized'].includes(code)) shell.setGroups(s.data);
  if (code === 'unauthorized' && !OPEN_PATHS.includes(currentPath())) {
    saveSettings({ passcode: '' });
    clearPin();
    navigate('/login');
    return;
  }
  if ((code === 'pin' || code === 'locked') && !OPEN_PATHS.includes(currentPath())) {
    lockApp();
    return;
  }
  if (current && (current.mod.live !== false || !current.painted)) paint();
});

function openAddPicker() {
  if (!state.data) {
    toast('กำลังโหลดข้อมูล ลองอีกครั้ง');
    return;
  }
  const link = (href, iconName, label, sub) => h('li', {},
    h('a', { class: 'list-item', href, onClick: () => ref.close() },
      h('span', { class: 'list-item-icon' }, icon(iconName)),
      h('span', { class: 'list-item-main' },
        h('span', { class: 'list-item-title' }, label),
        sub && h('span', { class: 'list-item-sub' }, sub)),
      icon('chevron-right')));
  const groups = state.data.groups;
  const ref = openSheet({
    title: 'เพิ่มรายการ',
    content: [
      h('ul', { class: 'pick-list' },
        link('#/import', 'receipt', 'นำเข้าสลิปโอนเงิน', 'เลือกได้หลายรูป'),
        link('#/groups?new=1', 'folder-plus', 'สร้างหมวดใหม่', 'เช่น KTC, K-Bank, Others')),
      groups.length > 0 && h('p', { class: 'side-heading' }, 'เพิ่มในหมวด'),
      h('ul', { class: 'pick-list' }, groups.map((g) => link(`#${groupPath(g.name)}/new`,
        g.type === 'income' ? 'cash-stack' : 'folder2', g.name, `${g.items.length} รายการ`))),
    ],
  });
}

if (state.data && isUnlocked()) shell.setGroups(state.data);
window.addEventListener('hashchange', renderRoute);
renderRoute();
if (isConfigured() && isUnlocked()) refresh();

// Idle lock: background time counts as idle because no input arrives while hidden.
// Timers are throttled in the background, so the check also runs when the app becomes visible.
let lastActive = Date.now();
const markActive = () => { lastActive = Date.now(); };
const checkIdle = () => {
  if (isUnlocked() && Date.now() - lastActive > AUTO_LOCK_MS) lockApp();
};
['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((type) => {
  window.addEventListener(type, markActive, { passive: true, capture: true });
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkIdle();
});
setInterval(checkIdle, 15000);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is optional */ });
}
