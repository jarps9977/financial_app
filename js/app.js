import { h, toNodes } from './utils/dom.js';
import { route, match, navigate, currentPath } from './router.js';
import { state, subscribe, refresh } from './store.js';
import { getSettings, saveSettings, applyTheme, isConfigured } from './settings.js';
import { createShell } from './layout/shell.js';
import { openSheet } from './components/bottom-sheet.js';
import { ErrorState } from './components/states.js';
import { attachPullToRefresh } from './components/pull-refresh.js';
import { toast } from './components/misc.js';
import { icon } from './components/icons.js';

// Pages are lazy loaded so each route ships only its own code
route('/login', () => import('./pages/login.js'));
route('/', () => import('./pages/dashboard.js'));
route('/sheets', () => import('./pages/categories.js'));
route('/sheet/:name', () => import('./pages/category.js'));
route('/sheet/:name/new', () => import('./pages/item-form.js'));
route('/sheet/:name/edit/:row', () => import('./pages/item-form.js'));
route('/installments', () => import('./pages/installments.js'));
route('/raw/:name', () => import('./pages/raw-sheet.js'));
route('/settings', () => import('./pages/settings.js'));

applyTheme(getSettings().theme);

const shell = createShell(document.getElementById('app'), {
  onAdd: openAddPicker,
  onRefresh: () => refresh(),
});
attachPullToRefresh(document.body, () => refresh());

let current = null;
let renderToken = 0;

async function renderRoute() {
  const path = currentPath();
  if (path !== '/login' && !isConfigured()) { navigate('/login'); return; }
  const found = match(path);
  if (!found) { navigate('/'); return; }

  const token = ++renderToken;
  let mod;
  try {
    mod = (await found.load()).default;
  } catch {
    if (token === renderToken) {
      shell.main.replaceChildren(ErrorState({ error: new Error('โหลดหน้าไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต'), onRetry: renderRoute }));
    }
    return;
  }
  if (token !== renderToken) return;

  current = { mod, params: found.params, painted: false };
  const title = mod.title(found.params);
  shell.setTitle(title);
  shell.setKind(mod.kind || 'page');
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
  // Static pages (forms) paint once with data so typing is never wiped by a refresh
  if (state.data || current.mod.needsData === false) current.painted = true;
}

subscribe((s) => {
  shell.setLoading(s.loading);
  if (s.data) shell.setSheets(s.data);
  if (s.error && s.error.code === 'unauthorized' && currentPath() !== '/login') {
    saveSettings({ passcode: '' });
    navigate('/login');
    return;
  }
  if (current && (current.mod.live !== false || !current.painted)) paint();
});

function openAddPicker() {
  if (!state.data) {
    toast('กำลังโหลดข้อมูล ลองอีกครั้ง');
    return;
  }
  const ref = openSheet({
    title: 'เพิ่มรายการในหมวด',
    content: h('ul', { class: 'pick-list' }, state.data.monthly.map((s) => h('li', {},
      h('a', {
        class: 'list-item',
        href: `#/sheet/${encodeURIComponent(s.name)}/new`,
        onClick: () => ref.close(),
      }, h('span', { class: 'list-item-main' }, h('span', { class: 'list-item-title' }, s.name)), icon('chevron'))))),
  });
}

if (state.data) shell.setSheets(state.data);
window.addEventListener('hashchange', renderRoute);
renderRoute();
if (isConfigured()) refresh();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is optional */ });
}
