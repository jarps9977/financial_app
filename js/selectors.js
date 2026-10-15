import { round2, parseYm, ymKey, todayYm } from './utils/format.js';

export const MONTH_IDX = [...Array(12).keys()];
const zeros = () => MONTH_IDX.map(() => 0);
const addInto = (acc, arr) => arr.forEach((v, m) => { acc[m] += v; });

export const findGroup = (data, name) => data.groups.find((g) => g.name === name) || null;
export const expenseGroups = (data) => data.groups.filter((g) => g.type === 'expense');
export const incomeGroups = (data) => data.groups.filter((g) => g.type === 'income');

export function currentMonthIndex(year) {
  const t = todayYm();
  if (t.y < year) return 0;
  if (t.y > year) return 11;
  return t.m - 1;
}

// Latest non-zero month is treated as the ongoing installment amount
export function lastAmount(item) {
  for (let m = 11; m >= 0; m--) {
    const v = Number(item.values[m]) || 0;
    if (v) return v;
  }
  return 0;
}

function projectedAmount(item) {
  if (item.amount != null) return Number(item.amount) || 0;
  return item.end ? lastAmount(item) : 0;
}

// Sheet year uses real cell values; other years are projected from start/end/amount
export function itemMonths(item, year, sheetYear) {
  if (year === sheetYear) return item.values.map((v) => Number(v) || 0);
  const amount = projectedAmount(item);
  if (!amount) return zeros();
  const start = parseYm(item.start) || { y: sheetYear, m: 1 };
  const end = parseYm(item.end);
  const from = ymKey(start.y, start.m);
  const to = end ? ymKey(end.y, end.m) : Infinity;
  return MONTH_IDX.map((i) => {
    const k = ymKey(year, i + 1);
    return k >= from && k <= to ? amount : 0;
  });
}

export function groupMonths(group, year, sheetYear) {
  const out = zeros();
  group.items.forEach((item) => addInto(out, itemMonths(item, year, sheetYear)));
  return out.map(round2);
}

export function buildReport(data, year) {
  const sy = data.year;
  const rows = expenseGroups(data).map((g) => ({ name: g.name, months: groupMonths(g, year, sy) }));
  const incomeRows = incomeGroups(data).flatMap((g) => g.items.map((item) => ({
    group: g.name, name: item.name, months: itemMonths(item, year, sy),
  })));
  const total = zeros();
  rows.forEach((r) => addInto(total, r.months));
  const income = zeros();
  incomeRows.forEach((r) => addInto(income, r.months));
  return {
    year,
    projected: year !== sy,
    rows,
    incomeRows,
    total: total.map(round2),
    income: income.map(round2),
    balance: MONTH_IDX.map((m) => round2(income[m] - total[m])),
  };
}

// Expense items due in a month, with their paid state (paid record must match group, row and name)
export function billsFor(data, year, month) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const paid = Array.isArray(data.paid) ? data.paid.filter((p) => p.ym === ym) : [];
  return expenseGroups(data).flatMap((g) => g.items.map((item) => {
    const amount = itemMonths(item, year, data.year)[month - 1];
    const record = paid.find((p) => p.group === g.name && p.row === item.row && p.name === item.name);
    return { group: g.name, item, amount, paid: Boolean(record), paidAt: record ? record.paidAt : '' };
  })).filter((b) => b.amount);
}

export function availableYears(data) {
  const sy = data.year;
  let min = sy;
  let max = sy + 1;
  data.groups.forEach((g) => g.items.forEach((i) => {
    const s = parseYm(i.start);
    const e = parseYm(i.end);
    if (s) min = Math.min(min, s.y);
    if (e) max = Math.max(max, e.y);
  }));
  min = Math.max(min, sy - 3);
  max = Math.min(max, sy + 5);
  const years = [];
  for (let y = min; y <= max; y++) years.push(y);
  return years;
}

export function endingItems(data) {
  const t = todayYm();
  const now = ymKey(t.y, t.m);
  return data.groups
    .flatMap((g) => g.items.map((item) => ({ group: g.name, item, end: parseYm(item.end) })))
    .filter((x) => x.end && ymKey(x.end.y, x.end.m) >= now)
    .map((x) => ({ ...x, left: ymKey(x.end.y, x.end.m) - now + 1 }))
    .sort((a, b) => a.left - b.left);
}
