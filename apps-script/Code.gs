/**
 * Ngern API - Google Apps Script Web App bound to the "My-Financial-Port" spreadsheet.
 *
 * Setup:
 * 1. Spreadsheet > Extensions > Apps Script, paste this file as Code.gs
 * 2. Project Settings > Script properties:
 *    PASSCODE (required, 12+ characters), YEAR (optional, defaults to current year)
 * 3. Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone"
 * 4. Put the /exec URL and PASSCODE into the app login screen
 */

const CONFIG = {
  MONTHLY_SHEETS: ['KTC', 'First-Choice', 'K-Bank', 'Others', 'Saving'],
  OTHER_SHEETS: ['หนี้', 'Pre Gunpla', 'Feature Plan', 'New-Year Plan', 'Budget Plan/Y'],
  INCOME_SHEET: 'Budget Plan/Y',
  INCOME_CELL: 'P2',
  FIRST_ITEM_ROW: 3,
  FIRST_MONTH_COL: 2, // B = Jan
  NAME_COL: 15, // O
  END_COL: 16, // P, installment end month as YYYY-MM text
  MAX_ROWS: 500,
  MAX_NAME: 100,
  MAX_AMOUNT: 1e9,
  MAX_RAW_ROWS: 200,
  MAX_RAW_COLS: 26,
  MAX_AUTH_FAILS: 10,
  AUTH_FAIL_WINDOW_SEC: 600,
};

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: 'คำขอไม่ถูกต้อง', code: 'bad_request' });
  }
  if (!req || typeof req !== 'object') {
    return reply_({ ok: false, error: 'คำขอไม่ถูกต้อง', code: 'bad_request' });
  }

  const authError = authorize_(req.key);
  if (authError) return reply_(authError);

  try {
    switch (req.action) {
      case 'load':
        return reply_({ ok: true, data: load_() });
      case 'add':
        return reply_({ ok: true, data: withLock_(() => { addItem_(req); return load_(); }) });
      case 'update':
        return reply_({ ok: true, data: withLock_(() => { updateItem_(req); return load_(); }) });
      case 'delete':
        return reply_({ ok: true, data: withLock_(() => { deleteItem_(req); return load_(); }) });
      default:
        return reply_({ ok: false, error: 'ไม่รู้จักคำสั่ง', code: 'bad_request' });
    }
  } catch (err) {
    if (err && err.userMessage) return reply_({ ok: false, error: err.userMessage, code: err.code });
    console.error(err && err.stack ? err.stack : err);
    return reply_({ ok: false, error: 'เกิดข้อผิดพลาดที่ server', code: 'server' });
  }
}

function doGet() {
  return reply_({ ok: false, error: 'ใช้ POST เท่านั้น', code: 'bad_request' });
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Auth ----------

function authorize_(key) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('auth_fails') || 0);
  if (fails >= CONFIG.MAX_AUTH_FAILS) {
    return { ok: false, error: 'ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาที', code: 'locked' };
  }
  const expected = PropertiesService.getScriptProperties().getProperty('PASSCODE');
  if (!expected) return { ok: false, error: 'ยังไม่ได้ตั้งค่า PASSCODE ใน Script properties', code: 'config' };
  if (!safeEqual_(typeof key === 'string' ? key : '', expected)) {
    cache.put('auth_fails', String(fails + 1), CONFIG.AUTH_FAIL_WINDOW_SEC);
    return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง', code: 'unauthorized' };
  }
  return null;
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('ระบบกำลังบันทึกอยู่ ลองใหม่อีกครั้ง', 'busy');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function userError_(message, code) {
  const err = new Error(message);
  err.userMessage = message;
  err.code = code || 'invalid';
  return err;
}

// ---------- Read ----------

function load_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = Number(PropertiesService.getScriptProperties().getProperty('YEAR')) || new Date().getFullYear();
  const incomeSheet = ss.getSheetByName(CONFIG.INCOME_SHEET);
  const income = incomeSheet ? toNum_(incomeSheet.getRange(CONFIG.INCOME_CELL).getValue()) : 0;
  const tz = ss.getSpreadsheetTimeZone();
  return {
    year: year,
    income: income,
    updatedAt: new Date().toISOString(),
    monthly: CONFIG.MONTHLY_SHEETS.map(name => readMonthly_(ss, name, tz)).filter(Boolean),
    sheets: CONFIG.OTHER_SHEETS.map(name => readRaw_(ss, name)).filter(Boolean),
  };
}

function readMonthly_(ss, name, tz) {
  const sh = ss.getSheetByName(name);
  if (!sh) return null;
  const first = CONFIG.FIRST_ITEM_ROW;
  const last = Math.min(sh.getLastRow(), CONFIG.MAX_ROWS);
  const items = [];
  if (last >= first) {
    const range = sh.getRange(first, 1, last - first + 1, CONFIG.END_COL);
    const values = range.getValues();
    const formulas = range.getFormulas();
    values.forEach((row, i) => {
      if (isRowEmpty_(row, formulas[i])) return;
      items.push({
        row: first + i,
        name: String(row[CONFIG.NAME_COL - 1]).trim(),
        values: row.slice(1, 13).map(v => (v === '' || v === null ? null : toNum_(v))),
        formulas: formulas[i].slice(1, 13).map(f => f !== ''),
        end: normEnd_(row[CONFIG.END_COL - 1], tz),
      });
    });
  }
  return { name: name, items: items };
}

// Column A holds the running index, so only B..P decide whether a row is free
function isRowEmpty_(row, formulas) {
  for (let c = 1; c < CONFIG.END_COL; c++) {
    if ((row[c] !== '' && row[c] !== null) || formulas[c]) return false;
  }
  return true;
}

function readRaw_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return null;
  const lastRow = Math.min(sh.getLastRow(), CONFIG.MAX_RAW_ROWS);
  const lastCol = Math.min(sh.getLastColumn(), CONFIG.MAX_RAW_COLS);
  if (lastRow < 1 || lastCol < 1) return { name: name, cols: [], rows: [] };
  const grid = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const keep = [];
  for (let c = 0; c < lastCol; c++) if (grid.some(r => r[c] !== '')) keep.push(c);
  return {
    name: name,
    cols: keep.map(c => String.fromCharCode(65 + c)),
    rows: grid.filter(r => r.some(v => v !== '')).map(r => keep.map(c => r[c])),
  };
}

function toNum_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

function normEnd_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
  const s = String(v || '').trim();
  return YM_PATTERN.test(s) ? s : '';
}

// ---------- Write ----------

function addItem_(req) {
  const item = validateItem_(req, false);
  const sh = getSheet_(item.sheet);
  const first = CONFIG.FIRST_ITEM_ROW;
  const last = Math.min(sh.getLastRow(), CONFIG.MAX_ROWS);
  let target = 0;
  if (last >= first) {
    const range = sh.getRange(first, 1, last - first + 1, CONFIG.END_COL);
    const values = range.getValues();
    const formulas = range.getFormulas();
    for (let i = 0; i < values.length; i++) {
      if (isRowEmpty_(values[i], formulas[i])) { target = first + i; break; }
    }
  }
  if (!target) {
    target = Math.max(last, first - 1) + 1;
    if (target > CONFIG.MAX_ROWS) throw userError_('จำนวนรายการเต็มแล้ว');
    sh.getRange(target, 1).setValue(target - first + 1);
  }
  ensureEndHeader_(sh);
  writeRow_(sh, target, item, null);
}

function updateItem_(req) {
  const item = validateItem_(req, true);
  const sh = getSheet_(item.sheet);
  const current = readRowChecked_(sh, item.row, req.expectedName);
  ensureEndHeader_(sh);
  writeRow_(sh, item.row, item, current);
}

function deleteItem_(req) {
  if (CONFIG.MONTHLY_SHEETS.indexOf(req.sheet) === -1) throw userError_('หมวดไม่ถูกต้อง');
  const row = validRow_(req.row);
  const sh = getSheet_(req.sheet);
  readRowChecked_(sh, row, req.expectedName);
  // Clear instead of deleteRow so SUM ranges and the index column stay intact
  sh.getRange(row, CONFIG.FIRST_MONTH_COL, 1, CONFIG.END_COL - 1).clearContent();
}

function writeRow_(sh, row, item, current) {
  if (!current) {
    sh.getRange(row, CONFIG.FIRST_MONTH_COL, 1, 12).setValues([item.values]);
  } else {
    // Write only changed, non-formula cells to keep existing sheet formulas
    item.values.forEach((v, m) => {
      const idx = CONFIG.FIRST_MONTH_COL - 1 + m;
      if (current.formulas[idx]) return;
      const old = current.values[idx] === '' ? '' : toNum_(current.values[idx]);
      if (old !== v) sh.getRange(row, idx + 1).setValue(v);
    });
  }
  sh.getRange(row, CONFIG.NAME_COL).setValue(safeText_(item.name));
  // Leading apostrophe stops Sheets from converting YYYY-MM into a date
  sh.getRange(row, CONFIG.END_COL).setValue(item.end ? "'" + item.end : '');
}

function readRowChecked_(sh, row, expectedName) {
  const stale = userError_('ข้อมูลใน Sheet เปลี่ยนไปแล้ว กรุณารีเฟรช', 'conflict');
  if (row > sh.getLastRow()) throw stale;
  const range = sh.getRange(row, 1, 1, CONFIG.END_COL);
  const values = range.getValues()[0];
  const formulas = range.getFormulas()[0];
  const name = String(values[CONFIG.NAME_COL - 1]).trim();
  const expected = typeof expectedName === 'string' ? expectedName.trim() : '';
  if (isRowEmpty_(values, formulas) || name !== expected) throw stale;
  return { values: values, formulas: formulas };
}

function ensureEndHeader_(sh) {
  const cell = sh.getRange(1, CONFIG.END_COL);
  if (cell.isBlank()) cell.setValue('สิ้นสุด (YYYY-MM)');
}

function getSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw userError_('ไม่พบ Sheet ' + name, 'not_found');
  return sh;
}

// ---------- Validation ----------

function validateItem_(req, needRow) {
  if (CONFIG.MONTHLY_SHEETS.indexOf(req.sheet) === -1) throw userError_('หมวดไม่ถูกต้อง');
  const name = typeof req.name === 'string' ? req.name.trim() : '';
  if (!name || name.length > CONFIG.MAX_NAME) {
    throw userError_('ชื่อรายการต้องมี 1-' + CONFIG.MAX_NAME + ' ตัวอักษร');
  }
  if (!Array.isArray(req.values) || req.values.length !== 12) throw userError_('ข้อมูลรายเดือนไม่ถูกต้อง');
  const values = req.values.map(v => {
    if (v === null || v === '') return '';
    if (typeof v !== 'number' && typeof v !== 'string') throw userError_('จำนวนเงินไม่ถูกต้อง');
    const n = Number(v);
    if (!isFinite(n) || Math.abs(n) > CONFIG.MAX_AMOUNT) throw userError_('จำนวนเงินไม่ถูกต้อง');
    return Math.round(n * 100) / 100;
  });
  const end = typeof req.end === 'string' ? req.end.trim() : '';
  if (end && !YM_PATTERN.test(end)) throw userError_('เดือนสิ้นสุดต้องเป็นรูปแบบ YYYY-MM');
  return {
    sheet: req.sheet,
    name: name,
    values: values,
    end: end,
    row: needRow ? validRow_(req.row) : null,
  };
}

function validRow_(row) {
  const n = Number(row);
  if (!Number.isInteger(n) || n < CONFIG.FIRST_ITEM_ROW || n > CONFIG.MAX_ROWS) throw userError_('แถวไม่ถูกต้อง');
  return n;
}

// Prevent user text from being evaluated as a spreadsheet formula
function safeText_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
