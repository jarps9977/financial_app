import { h } from '../utils/dom.js';
import { money, sum, MONTHS_SHORT } from '../utils/format.js';
import { groupPath, currentQuery, clearQuery } from '../router.js';
import { groupMonths, currentMonthIndex, expenseGroups, incomeGroups } from '../selectors.js';
import { groupLook } from '../utils/group-look.js';
import { Button } from '../components/button.js';
import { kv, Notice, PageHero, SectionHead } from '../components/misc.js';
import { Sparkline } from '../components/chart.js';
import { withData, Empty } from '../components/states.js';
import { icon } from '../components/icon.js';
import { openGroupForm, openGroupMenu } from './group-form.js';

export default {
  title: () => 'หมวด',
  render: (_, state) => {
    // ?new=1 comes from the add picker; open once then drop it so repaints do not reopen
    if (currentQuery().get('new') === '1' && state.data) {
      clearQuery();
      queueMicrotask(() => openGroupForm());
    }
    return withData(state, view);
  },
};

// Whole card is clickable via the stretched name link; the menu button sits above it
function groupCard(group, index, year, cur) {
  const look = groupLook(group, index);
  const months = groupMonths(group, year, year);
  return h('article', { class: `group-card tone-${look.tone}` },
    h('div', { class: 'group-card-head' },
      h('span', { class: 'group-card-icon', 'aria-hidden': 'true' }, icon(look.icon)),
      h('div', { class: 'group-card-title' },
        h('a', { class: 'group-card-link', href: `#${groupPath(group.name)}` }, group.name),
        h('span', { class: 'muted' }, `${group.items.length} รายการ`)),
      Button({
        label: `ตัวเลือกหมวด ${group.name}`, icon: 'three-dots-vertical', variant: 'secondary', iconOnly: true,
        className: 'group-card-menu', onClick: () => openGroupMenu(group),
      })),
    h('dl', { class: 'kv group-card-kv' },
      kv(`เดือน ${MONTHS_SHORT[cur]}`, `${money(months[cur])} บาท`),
      kv(`ทั้งปี ${year}`, `${money(sum(months))} บาท`)),
    Sparkline(months, cur, { cls: 'chart-spark group-spark', height: '3.5rem' }));
}

function view(data) {
  const year = data.year;
  const cur = currentMonthIndex(year);
  const expense = expenseGroups(data);
  const income = incomeGroups(data);
  // Palette position counts within the section so the first expense group is always red
  const indexOf = (g) => (g.type === 'income' ? income.indexOf(g) : expense.indexOf(g));
  const createBtn = (cls) => Button({ label: 'สร้างหมวด', icon: 'plus-lg', variant: 'accent', className: cls, onClick: () => openGroupForm() });

  return [
    PageHero({ title: 'หมวด', subtitle: `${data.groups.length} หมวด · ปี ${year}`, icon: 'layers-fill', actions: createBtn('hero-create') }),
    data.missing && data.missing.length > 0 && Notice({ tone: 'warn', text: `ไม่พบ Sheet: ${data.missing.join(', ')} (ถูกลบหรือเปลี่ยนชื่อใน Google Sheets)` }),
    !data.groups.length && Empty({
      icon: 'folder2-open', title: 'ยังไม่มีหมวด', text: 'สร้างหมวด เช่น KTC, K-Bank, Others เพื่อเริ่มบันทึก',
      action: createBtn(),
    }),
    expense.length > 0 && h('section', { class: 'stack' },
      SectionHead('หมวดรายจ่าย', 'cart3', 'red'),
      h('div', { class: 'grid grid-2' }, expense.map((g) => groupCard(g, indexOf(g), year, cur)))),
    income.length > 0 && h('section', { class: 'stack' },
      SectionHead('รายรับ', 'bar-chart-fill', 'teal'),
      h('div', { class: 'grid grid-2' }, income.map((g) => groupCard(g, indexOf(g), year, cur)))),
  ];
}
