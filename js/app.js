import { h, toNodes } from './utils/dom.js';
import { route, match, navigate, currentPath, groupPath } from './router.js';
import { state, subscribe, refresh } from './store.js';
import { getSettings, applyTheme, isConfigured, isUnlocked, clearPin } from './settings.js';
import { lockApp, signOut, isOpenPath } from './session.js';
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
let sidebarCleared = null;

async function renderRoute() {
  const path = currentPath();
  if (path !== '/login' && !isConfigured()) { navigate('/login'); return; }
  if (!isOpenPath(path) && !isUnlocked()) { lockApp(path); return; }
  // Group names never sit in the DOM behind the login/PIN screens; rebuilt only when crossing that boundary
  const open = isOpenPath(path);
  if (open !== sidebarCleared) {
    sidebarCleared = open;
    shell.setGroups(!open && state.data ? state.data : { groups: [] });
  }
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
  // Login/PIN pages handle their own auth errors
  if (isOpenPath(currentPath())) return;
  const code = s.error && s.error.code;
  if (code === 'unauthorized') { signOut(); return; }
  if (code === 'pin' || code === 'locked') { lockApp(); return; }
  if (s.data) shell.setGroups(s.data);
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

// Idle lock: background time counts as idle because no input arrives while hidden.
// Timers are throttled in the background, so the check also runs when the app becomes visible.
// The last-activity time is kept in sessionStorage next to the PIN, so a reload or an iOS tab
// discard does not restart the idle clock.
const ACTIVE_KEY = 'ngern.active';
let lastActive = (() => {
  try {
    return Number(sessionStorage.getItem(ACTIVE_KEY)) || Date.now();
  } catch {
    return Date.now();
  }
})();
const markActive = () => {
  const now = Date.now();
  if (now - lastActive < 5000) return; // throttle storage writes
  lastActive = now;
  try {
    sessionStorage.setItem(ACTIVE_KEY, String(now));
  } catch { /* memory only */ }
};
// A session left idle past the limit starts locked, before anything renders or loads
if (isUnlocked() && Date.now() - lastActive > AUTO_LOCK_MS) clearPin();
lastActive = 0;
markActive();

// Number fields select their content on focus so typing replaces the value; deferred so mouseup does not clear it
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.type === 'number') setTimeout(() => { if (document.activeElement === el) el.select(); }, 0);
});

window.addEventListener('hashchange', renderRoute);
renderRoute();
if (isConfigured() && isUnlocked()) refresh();

const checkIdle = () => {
  if (isUnlocked() && Date.now() - lastActive > AUTO_LOCK_MS) lockApp();
};
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((type) => {
  window.addEventListener(type, markActive, { passive: true, capture: true });
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkIdle();
});
setInterval(checkIdle, 15000);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is optional */ });
}
