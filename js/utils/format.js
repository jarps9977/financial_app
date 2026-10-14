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

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
