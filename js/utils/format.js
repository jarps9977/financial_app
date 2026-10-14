export const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatters = new Map();

export function money(n, maxDigits = 2) {
  if (!formatters.has(maxDigits)) {
    formatters.set(maxDigits, new Intl.NumberFormat('th-TH', { maximumFractionDigits: maxDigits }));
  }
  return formatters.get(maxDigits).format(Number(n) || 0);
}

export const sum = (list) => list.reduce((acc, v) => acc + (Number(v) || 0), 0);

export function parseYm(value) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value || '');
  return m ? { y: Number(m[1]), m: Number(m[2]) } : null;
}

export function ymLabel(value) {
  const p = parseYm(value);
  return p ? `${MONTHS_SHORT[p.m - 1]} ${p.y}` : '';
}

export function todayYm() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

// Months from a to b, positive when b is later
export const monthsBetween = (a, b) => (b.y - a.y) * 12 + (b.m - a.m);

export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
