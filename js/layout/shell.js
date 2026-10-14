import { h } from '../utils/dom.js';
import { groupPath } from '../router.js';
import { icon } from '../components/icon.js';

const NAV = {
  home: { path: '/', label: 'ภาพรวม', icon: 'house' },
  groups: { path: '/groups', label: 'หมวด', icon: 'folder2' },
  report: { path: '/report', label: 'รายงาน', icon: 'bar-chart-line' },
  import: { path: '/import', label: 'นำเข้าสลิป', icon: 'receipt' },
  settings: { path: '/settings', label: 'ตั้งค่า', icon: 'gear' },
};

const SIDE_ITEMS = [NAV.home, NAV.groups, NAV.report, NAV.import, NAV.settings];
// Bottom bar holds 4 links plus the add button (5 slots max)
const BOTTOM_ITEMS = [NAV.home, NAV.groups, NAV.report, NAV.settings];

function navLink(cls, item, withIcon = true) {
  return h('li', {},
    h('a', { class: cls, href: `#${item.path}`, dataset: { path: item.path } },
      withIcon && icon(item.icon),
      h('span', { class: `${cls}-label` }, item.label)));
}

export function createShell(root, { onAdd, onRefresh }) {
  const title = h('h1', { class: 'app-title' }, 'Ngern');
  const menuBtn = h('button', {
    class: 'btn btn-ghost btn-icon menu-btn', type: 'button',
    'aria-label': 'เปิดเมนู', 'aria-controls': 'sidebar', 'aria-expanded': 'false',
  }, icon('list'));
  const backLink = h('a', { class: 'btn btn-ghost btn-icon back-btn', href: '#/', 'aria-label': 'ย้อนกลับ', hidden: true }, icon('arrow-left'));
  const refreshBtn = h('button', {
    class: 'btn btn-ghost btn-icon refresh-btn', type: 'button', 'aria-label': 'รีเฟรชข้อมูล', title: 'รีเฟรชข้อมูล', onClick: onRefresh,
  }, icon('arrow-clockwise'));
  const header = h('header', { class: 'app-header' }, menuBtn, backLink, title, refreshBtn);

  const groupNav = h('div', { class: 'side-groups' });
  const sidebar = h('nav', { id: 'sidebar', class: 'sidebar', 'aria-label': 'เมนูหลัก' },
    h('div', { class: 'side-brand' },
      h('img', { src: 'icons/app_icon.png', alt: '', width: '32', height: '32', decoding: 'async' }),
      h('span', {}, 'Ngern')),
    h('button', { class: 'btn btn-primary btn-block side-add', type: 'button', onClick: onAdd }, icon('plus-lg'), h('span', {}, 'เพิ่มรายการ')),
    h('ul', { class: 'side-list' }, SIDE_ITEMS.map((item) => navLink('side-link', item))),
    groupNav);

  const scrim = h('div', { class: 'scrim', hidden: true, onClick: () => setDrawer(false) });

  const bottomNav = h('nav', { class: 'bottom-nav', 'aria-label': 'เมนูด่วน' },
    h('ul', {},
      navLink('bn-link', BOTTOM_ITEMS[0]),
      navLink('bn-link', BOTTOM_ITEMS[1]),
      h('li', {}, h('button', { class: 'bn-link bn-add', type: 'button', onClick: onAdd, 'aria-label': 'เพิ่มรายการ' },
        h('span', { class: 'bn-add-circle' }, icon('plus-lg')), h('span', { class: 'bn-link-label' }, 'เพิ่ม'))),
      navLink('bn-link', BOTTOM_ITEMS[2]),
      navLink('bn-link', BOTTOM_ITEMS[3])));

  const main = h('main', { id: 'main', class: 'app-main', tabindex: '-1' });
  const skip = h('a', { class: 'skip-link', href: '#main', onClick: (e) => { e.preventDefault(); main.focus(); } }, 'ข้ามไปเนื้อหา');

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
    let section = path;
    if (path.startsWith('/group')) section = '/groups';
    root.querySelectorAll('a[data-path]').forEach((a) => {
      const p = a.dataset.path;
      const active = p.startsWith('/group/') ? path === p || path.startsWith(`${p}/`) : section === p;
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function setGroups(data) {
    const section = (heading, groups) => groups.length > 0 && [
      h('p', { class: 'side-heading' }, heading),
      h('ul', { class: 'side-list' }, groups.map((g) => navLink('side-link', { path: groupPath(g.name), label: g.name }, false))),
    ];
    groupNav.replaceChildren(...[
      section('หมวดรายจ่าย', data.groups.filter((g) => g.type === 'expense')),
      section('รายรับ', data.groups.filter((g) => g.type === 'income')),
    ].flat().filter(Boolean));
    setActive(activePath);
  }

  return {
    main,
    setActive,
    setGroups,
    setTitle: (text) => { title.textContent = text; },
    setKind: (kind) => { document.documentElement.dataset.kind = kind; },
    setBack: (href) => {
      backLink.hidden = !href;
      menuBtn.hidden = Boolean(href);
      if (href) backLink.setAttribute('href', href);
    },
    setLoading: (loading) => {
      refreshBtn.classList.toggle('is-spinning', loading);
      refreshBtn.setAttribute('aria-busy', String(loading));
    },
  };
}
