import { h } from '../utils/dom.js';
import { icon } from '../components/icons.js';

const PRIMARY = [
  { path: '/', label: 'ภาพรวม', icon: 'home' },
  { path: '/sheets', label: 'หมวด', icon: 'list' },
  { path: '/installments', label: 'ผ่อน', icon: 'calendar' },
  { path: '/settings', label: 'ตั้งค่า', icon: 'settings' },
];

const sheetPath = (name) => `/sheet/${encodeURIComponent(name)}`;
const rawPath = (name) => `/raw/${encodeURIComponent(name)}`;

function navLink(cls, item, withIcon = true) {
  return h('li', {},
    h('a', { class: cls, href: `#${item.path}`, dataset: { path: item.path } },
      withIcon && icon(item.icon),
      h('span', { class: cls === 'bn-link' ? 'bn-label' : null }, item.label)));
}

export function createShell(root, { onAdd, onRefresh }) {
  const title = h('h1', { class: 'app-title' }, 'Ngern');
  const menuBtn = h('button', {
    class: 'btn btn-ghost btn-icon menu-btn', type: 'button',
    'aria-label': 'เปิดเมนู', 'aria-controls': 'sidebar', 'aria-expanded': 'false',
  }, icon('menu'));
  const refreshBtn = h('button', {
    class: 'btn btn-ghost btn-icon refresh-btn', type: 'button', 'aria-label': 'รีเฟรชข้อมูล', onClick: onRefresh,
  }, icon('refresh'));
  const header = h('header', { class: 'app-header' }, menuBtn, title, refreshBtn);

  const sheetNav = h('div', {});
  const sidebar = h('nav', { id: 'sidebar', class: 'sidebar', 'aria-label': 'เมนูหลัก' },
    h('div', { class: 'side-brand' }, icon('wallet'), h('span', {}, 'Ngern')),
    h('ul', { class: 'side-list' }, PRIMARY.map((item) => navLink('side-link', item))),
    h('button', { class: 'btn btn-primary btn-block side-add', type: 'button', onClick: onAdd },
      icon('plus'), h('span', {}, 'เพิ่มรายการ')),
    sheetNav);

  const scrim = h('div', { class: 'scrim', hidden: true, onClick: () => setDrawer(false) });

  const bottomNav = h('nav', { class: 'bottom-nav', 'aria-label': 'เมนูด่วน' },
    h('ul', {},
      navLink('bn-link', PRIMARY[0]),
      navLink('bn-link', PRIMARY[1]),
      h('li', {}, h('button', { class: 'bn-link bn-add', type: 'button', onClick: onAdd },
        icon('plus'), h('span', { class: 'bn-label' }, 'เพิ่ม'))),
      navLink('bn-link', PRIMARY[2]),
      navLink('bn-link', PRIMARY[3])));

  const main = h('main', { id: 'main', class: 'app-main', tabindex: '-1' });
  const skip = h('button', { class: 'skip-link', type: 'button', onClick: () => main.focus() }, 'ข้ามไปเนื้อหา');

  root.append(skip, header, sidebar, scrim, main, bottomNav);

  // Drawer behaviour applies below the tablet breakpoint only
  const wide = matchMedia('(min-width: 640px)');

  function setDrawer(open) {
    sidebar.toggleAttribute('data-open', open);
    scrim.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    syncInert();
    if (open) {
      const first = sidebar.querySelector('a, button');
      if (first) first.focus();
    }
  }

  function syncInert() {
    sidebar.inert = !wide.matches && !sidebar.hasAttribute('data-open');
  }

  menuBtn.addEventListener('click', () => setDrawer(true));
  sidebar.addEventListener('click', (e) => {
    if (!wide.matches && e.target.closest('a, button')) setDrawer(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.hasAttribute('data-open')) {
      setDrawer(false);
      menuBtn.focus();
    }
  });
  wide.addEventListener('change', () => setDrawer(false));
  syncInert();

  let activePath = '/';

  function setActive(path) {
    activePath = path;
    const section = path.startsWith('/sheet') || path.startsWith('/raw') ? '/sheets' : path;
    root.querySelectorAll('a[data-path]').forEach((a) => {
      const p = a.dataset.path;
      const isSheetLink = p.startsWith('/sheet/') || p.startsWith('/raw/');
      const active = isSheetLink ? path === p || path.startsWith(`${p}/`) : section === p;
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function setSheets(data) {
    const group = (heading, items) => items.length > 0 && [
      h('p', { class: 'side-heading' }, heading),
      h('ul', { class: 'side-list' }, items.map((item) => navLink('side-link', item, false))),
    ];
    sheetNav.replaceChildren(...[
      group('หมวดรายจ่าย', data.monthly.map((s) => ({ path: sheetPath(s.name), label: s.name }))),
      group('Sheet อื่น', data.sheets.map((s) => ({ path: rawPath(s.name), label: s.name }))),
    ].flat().filter(Boolean));
    setActive(activePath);
  }

  return {
    main,
    setActive,
    setSheets,
    setTitle: (text) => { title.textContent = text; },
    setKind: (kind) => { root.dataset.kind = kind; },
    setLoading: (loading) => {
      refreshBtn.classList.toggle('is-spinning', loading);
      refreshBtn.setAttribute('aria-busy', String(loading));
    },
  };
}
