export const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const moneyFmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const money = (v) => moneyFmt.format(Number(v) || 0);
export const compact = (v) => compactFmt.format(Number(v) || 0);
export const round2 = (n) => Math.round(n * 100) / 100;
export const sum = (arr) => round2(arr.reduce((a, v) => a + (Number(v) || 0), 0));

export function parseYm(s) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s || '');
  return m ? { y: Number(m[1]), m: Number(m[2]) } : null;
}

export const ymKey = (y, m) => y * 12 + (m - 1);
export const ymString = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

export function ymLabel(s) {
  const p = parseYm(s);
  return p ? `${MONTHS_SHORT[p.m - 1]} ${p.y}` : '';
}

export function todayYm() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

// Salary lands on PAY_DAY, so from 00:00 that day the bills to pay belong to next month.
// Clamped to the month's last day so short months (Feb) still roll over.
export const PAY_DAY = 29;
export function payCycleYm(d = new Date()) {
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const k = ymKey(d.getFullYear(), d.getMonth() + 1) + (d.getDate() >= Math.min(PAY_DAY, lastDay) ? 1 : 0);
  return { y: Math.floor(k / 12), m: (k % 12) + 1 };
}

// Delay to the next local midnight, used to re-check the pay cycle while a page stays open
export function msUntilMidnight(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d + 1000;
}

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
