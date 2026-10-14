import { sum, parseYm, todayYm, monthsBetween } from './utils/format.js';

const MONTH_INDEXES = [...Array(12).keys()];

export const findSheet = (data, name) => data.monthly.find((s) => s.name === name) || null;
export const findRaw = (data, name) => data.sheets.find((s) => s.name === name) || null;

export const itemTotal = (item) => sum(item.values);
export const sheetMonthly = (sheet) => MONTH_INDEXES.map((m) => sum(sheet.items.map((i) => i.values[m])));
export const totalMonthly = (data) => MONTH_INDEXES.map((m) => sum(data.monthly.map((s) => sum(s.items.map((i) => i.values[m])))));

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

export function installments(data) {
  const today = todayYm();
  const yearEnd = { y: data.year, m: 12 };
  return data.monthly
    .flatMap((s) => s.items.map((item) => ({ sheet: s.name, item, end: parseYm(item.end) })))
    .filter((x) => x.end)
    .map((x) => {
      const monthly = lastAmount(x.item);
      const afterYear = Math.max(0, monthsBetween(yearEnd, x.end));
      return {
        ...x,
        monthly,
        left: Math.max(0, monthsBetween(today, x.end) + 1),
        afterYear,
        remainingAfterYear: monthly * afterYear,
      };
    })
    .sort((a, b) => monthsBetween(b.end, a.end));
}

export function nextYearMonthly(list, year) {
  return MONTH_INDEXES.map((m) => sum(
    list.filter((x) => monthsBetween({ y: year + 1, m: m + 1 }, x.end) >= 0).map((x) => x.monthly),
  ));
}
