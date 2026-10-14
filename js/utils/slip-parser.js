import { isoDate } from './format.js';

const TH_SHORT = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
const TH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Money needs exactly 2 decimals; the guards stop dates like 14.10.2025 from matching
const MONEY = /(?:^|[^\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d|[.,]\d)/g;
const AMOUNT_KEYS = /(จำนวน|ยอด|amount|total|บาท|thb|฿)/i;
const SKIP_KEYS = /(ค่าธรรมเนียม|fee|คงเหลือ|balance|เลขที่|รหัสอ้างอิง|ref)/i;
const MAX_AMOUNT = 1e9;

// OCR often reads 0 as O next to digits
function normalize(line) {
  return line
    .replace(/(\d)[Oo]/g, (_, d) => `${d}0`)
    .replace(/[Oo](\d)/g, (_, d) => `0${d}`)
    .replace(/\s+/g, ' ')
    .trim();
}

function moneyIn(line) {
  const out = [];
  for (const m of line.matchAll(MONEY)) {
    const n = Number(`${m[1].replace(/,/g, '')}.${m[2]}`);
    if (n > 0 && n < MAX_AMOUNT) out.push(n);
  }
  return out;
}

function findAmount(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (SKIP_KEYS.test(lines[i]) || !AMOUNT_KEYS.test(lines[i])) continue;
    const here = moneyIn(lines[i]);
    if (here.length) return here[0];
    // Label and value are often on separate lines
    const next = lines[i + 1];
    if (next && !SKIP_KEYS.test(next)) {
      const below = moneyIn(next);
      if (below.length) return below[0];
    }
  }
  const all = lines.filter((l) => !SKIP_KEYS.test(l)).flatMap(moneyIn);
  return all.length ? Math.max(...all) : null;
}

function monthIndex(token) {
  const t = token.toLowerCase().replace(/[.\s]/g, '');
  let i = TH_SHORT.indexOf(t);
  if (i < 0) i = TH_FULL.indexOf(t);
  if (i < 0 && /^[a-z]{3,9}$/.test(t)) i = EN_SHORT.indexOf(t.slice(0, 3));
  return i;
}

// Thai slips mostly print Buddhist Era years (2568 or 68)
function toIsoDate(year, month, day) {
  let y = year;
  if (y < 100) y = y >= 60 ? y + 2500 : y + 2000;
  if (y > 2400) y -= 543;
  if (month < 0 || month > 11 || day < 1 || day > 31 || y < 2000 || y > 2100) return '';
  const d = new Date(y, month, day);
  return d.getMonth() === month ? isoDate(d) : '';
}

function findDate(lines) {
  const text = lines.join(' ');
  for (const m of text.matchAll(/(\d{1,2})\s*([ก-๙a-zA-Z.]{2,12})\s*(\d{2,4})/g)) {
    const d = toIsoDate(Number(m[3]), monthIndex(m[2]), Number(m[1]));
    if (d) return d;
  }
  for (const m of text.matchAll(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/g)) {
    const d = toIsoDate(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (d) return d;
  }
  return '';
}

// Returns { amount: number|null, date: 'YYYY-MM-DD'|'' }
export function parseSlip(text) {
  const lines = String(text || '').split(/\r?\n/).map(normalize).filter(Boolean);
  return { amount: findAmount(lines), date: findDate(lines) };
}
