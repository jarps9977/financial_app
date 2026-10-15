import { h, s } from '../utils/dom.js';
import { money, MONTHS, MONTHS_SHORT } from '../utils/format.js';
import { icon } from './icon.js';
import { Button } from './button.js';
import { setYear, refresh } from '../store.js';
import { availableYears } from '../selectors.js';

export const toneOf = (v) => (v < 0 ? 'neg' : 'pos');

// Decorative wave drawn in the card accent color (currentColor), replaces the old PNG artwork
// Curves start flat on the bottom edge so the wave never shows a hard left cut
const WAVE_TOP = 'M0 60 C30 60 55 57 85 46 C108 38 118 26 138 24 C156 22 162 32 178 26 C188 22 194 14 200 12';
const StatWave = () => s('svg', { class: 'stat-wave', viewBox: '0 0 200 60', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
  s('path', { d: 'M0 60 C45 60 75 58 100 50 C130 42 150 30 170 32 C185 33 192 26 200 22 L200 60 Z', class: 'wave-back' }),
  s('path', { d: `${WAVE_TOP} L200 60 L0 60 Z`, class: 'wave-fill' }),
  s('path', { d: WAVE_TOP, class: 'wave-line' }));

// accent (green/red/blue/purple) gives the glowing tinted card with a wave; icon adds the round badge
export function Stat({ label, value, tone, hint, unit, icon: iconName, accent }) {
  const cls = ['stat', tone && `is-${tone}`, iconName && 'has-icon', accent && `accent-${accent}`].filter(Boolean).join(' ');
  const body = [
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value num' }, unit ? `${value} ${unit}` : money(value)),
    hint && h('p', { class: 'stat-hint' }, hint),
  ];
  return h('div', { class: cls },
    accent && StatWave(),
    iconName && h('span', { class: 'stat-icon', 'aria-hidden': 'true' }, icon(iconName)),
    iconName ? h('div', { class: 'stat-body' }, body) : body);
}

// Rounded outline link used in card headers ("ดูรายงาน >")
export const PillLink = (label, href) => h('a', { class: 'pill-link', href }, h('span', {}, label), icon('chevron-right'));

export const kv = (k, v, cls) => h('div', { class: `kv-row${cls ? ` ${cls}` : ''}` }, h('dt', {}, k), h('dd', { class: 'num' }, v));

export function Notice({ text, tone = 'info', action }) {
  const iconName = tone === 'warn' ? 'exclamation-triangle' : 'info-circle';
  return h('div', { class: `notice is-${tone}`, role: 'note' }, icon(iconName), h('p', {}, text), action);
}

export function MonthChips(selected, onSelect) {
  const chip = (value, label) => h('button', {
    type: 'button',
    class: 'chip',
    'aria-pressed': String(selected === value),
    onClick: () => onSelect(value),
  }, label);
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'เลือกเดือน' },
    chip('all', 'ทั้งหมด'),
    MONTHS_SHORT.map((m, i) => chip(i, m)));
}

export function YearSwitch({ year, years, sheetYear, onChange }) {
  const idx = years.indexOf(year);
  return h('div', { class: 'year-switch', role: 'group', 'aria-label': 'เลือกปี' },
    Button({ label: 'ปีก่อนหน้า', icon: 'chevron-left', variant: 'ghost', iconOnly: true, disabled: idx <= 0, onClick: () => onChange(years[idx - 1]) }),
    h('p', { class: 'year-label', 'aria-live': 'polite' },
      icon('calendar3'),
      h('span', {}, `ปี ${year}`),
      year !== sheetYear && h('span', { class: 'badge is-warn' }, 'ประมาณการ')),
    Button({ label: 'ปีถัดไป', icon: 'chevron-right', variant: 'ghost', iconOnly: true, disabled: idx === -1 || idx >= years.length - 1, onClick: () => onChange(years[idx + 1]) }));
}

// ‹ เดือน ปี › navigator; moving is limited to the given years
export function MonthSwitch({ current, years, onChange }) {
  const step = (delta) => {
    const k = current.y * 12 + (current.m - 1) + delta;
    return { y: Math.floor(k / 12), m: (k % 12) + 1 };
  };
  const prev = step(-1);
  const next = step(1);
  return h('div', { class: 'year-switch', role: 'group', 'aria-label': 'เลือกเดือน' },
    Button({ label: 'เดือนก่อนหน้า', icon: 'chevron-left', variant: 'ghost', iconOnly: true, disabled: !years.includes(prev.y), onClick: () => onChange(prev) }),
    h('p', { class: 'year-label', 'aria-live': 'polite' }, icon('calendar3'), h('span', {}, `${MONTHS[current.m - 1]} ${current.y}`)),
    Button({ label: 'เดือนถัดไป', icon: 'chevron-right', variant: 'ghost', iconOnly: true, disabled: !years.includes(next.y), onClick: () => onChange(next) }));
}

// Compact year dropdown; years other than the sheet year are marked as projections
export function YearSelect({ year, years, sheetYear, onChange }) {
  const select = h('select', {
    class: 'input year-select-input', 'aria-label': 'เลือกปี', value: String(year),
    onChange: (e) => onChange(Number(e.target.value)),
  }, years.map((y) => h('option', { value: String(y) }, y === sheetYear ? `ปี ${y}` : `ปี ${y} (ประมาณการ)`)));
  return h('label', { class: 'year-select' }, icon('calendar3'), select);
}

// Page header: optional icon tile, title/subtitle, then refresh + year switch (when data is given) + extra actions
export function PageHero({ title, subtitle, icon: iconName, data, year, actions }) {
  return h('header', { class: 'form-hero' },
    iconName && h('span', { class: 'card-icon form-hero-icon', 'aria-hidden': 'true' }, icon(iconName)),
    h('div', { class: 'form-hero-text' },
      h('h2', { class: 'form-hero-title' }, title),
      subtitle && h('p', { class: 'form-hero-sub' }, subtitle)),
    // The hero hides the app header on wider screens, so it carries the refresh button too
    h('div', { class: `form-hero-actions${data ? ' hero-year' : ''}` },
      Button({ label: 'รีเฟรชข้อมูล', icon: 'arrow-clockwise', variant: 'secondary', iconOnly: true, className: 'hero-refresh', onClick: () => refresh({ fresh: true }) }),
      data && YearSwitch({ year, years: availableYears(data), sheetYear: data.year, onChange: setYear }),
      actions));
}

// Section heading with a round tinted icon
export const SectionHead = (text, iconName, tone) => h('h2', { class: `section-head tone-${tone}` },
  h('span', { class: 'section-icon', 'aria-hidden': 'true' }, icon(iconName)), text);

export { toast } from './alert.js';
