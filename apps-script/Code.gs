/**
 * Ngern API - Google Apps Script Web App bound to the finance spreadsheet.
 *
 * Group sheet layout (one tab per group, e.g. KTC):
 *   Row 1: A "เดือน", B..M month names, O..R item headers
 *   Row 2: A "รวม", B..M =SUM(...)
 *   Row 3+: A index, B..M monthly amount, O name, P start (YYYY-MM), Q end (YYYY-MM), R amount per month
 * Group list is kept in the hidden "_ngern" tab (A name, B type: expense | income).
 *
 * Setup:
 * 1. Spreadsheet > Extensions > Apps Script, paste this file as Code.gs
 * 2. Project Settings > Script properties:
 *    PASSCODE (required, 12+ characters), YEAR (optional, defaults to current year)
 * 3. Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone"
 *    (update: Manage deployments > Edit > Version: New version, keeps the same /exec URL)
 */

const CONFIG = {
  CONFIG_SHEET: '_ngern',
  DEFAULT_EXPENSE: ['K-Bank', 'First-Choice', 'KTC', 'Others', 'Saving'],
  DEFAULT_INCOME: 'รายรับ',
  FIRST_ITEM_ROW: 3,
  FIRST_MONTH_COL: 2, // B = Jan
  NAME_COL: 15, // O
  START_COL: 16, // P
  END_COL: 17, // Q
  AMOUNT_COL: 18, // R
  MAX_ROWS: 500,
  MAX_NAME: 100,
  MAX_GROUP_NAME: 40,
  MAX_GROUPS: 30,
  MAX_BATCH: 100,
  MAX_AMOUNT: 1e9,
  MAX_AUTH_FAILS: 10,
  AUTH_FAIL_WINDOW_SEC: 600,
};

const LAST_COL = CONFIG.AMOUNT_COL;
const TYPES = ['expense', 'income'];
const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
// Characters Sheets rejects in tab names; leading underscore is reserved for app metadata
const GROUP_NAME_PATTERN = /^[^_\[\]*?\/\\:'][^\[\]*?\/\\:']*$/;

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

  const handlers = {
    load: () => load_(),
    addItem: () => write_(ss => addItem_(ss, req)),
    updateItem: () => write_(ss => updateItem_(ss, req)),
    deleteItem: () => write_(ss => deleteItem_(ss, req)),
    deleteItems: () => write_(ss => deleteItems_(ss, req)),
    addBatch: () => write_(ss => addBatch_(ss, req)),
    createGroup: () => write_(ss => createGroup_(ss, req)),
    removeGroup: () => write_(ss => removeGroup_(ss, req)),
  };
  if (typeof req.action !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, req.action)) {
    return reply_({ ok: false, error: 'ไม่รู้จักคำสั่ง', code: 'bad_request' });
  }

  try {
    return reply_({ ok: true, data: handlers[req.action]() });
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

// Every mutation returns the full dataset so the client needs no extra load call
function write_(fn) {
  return withLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureConfig_(ss);
    fn(ss);
    return read_(ss);
  });
}

function userError_(message, code) {
  const err = new Error(message);
  err.userMessage = message;
  err.code = code || 'invalid';
  return err;
}

// ---------- Groups config ----------

function ensureConfig_(ss) {
  if (ss.getSheetByName(CONFIG.CONFIG_SHEET)) return;
  const rows = [['name', 'type']];
  CONFIG.DEFAULT_EXPENSE.forEach(name => {
    if (ss.getSheetByName(name)) rows.push([name, 'expense']);
  });
  if (!ss.getSheetByName(CONFIG.DEFAULT_INCOME)) createGroupSheet_(ss, CONFIG.DEFAULT_INCOME);
  rows.push([CONFIG.DEFAULT_INCOME, 'income']);
  const sh = ss.insertSheet(CONFIG.CONFIG_SHEET);
  sh.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
  sh.hideSheet();
}

function readGroupList_(ss) {
  const sh = ss.getSheetByName(CONFIG.CONFIG_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    .map((r, i) => ({ name: String(r[0]).trim(), type: String(r[1]).trim(), configRow: i + 2 }))
    .filter(g => g.name && TYPES.indexOf(g.type) !== -1);
}

function createGroupSheet_(ss, name) {
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, 13).setValues([['เดือน'].concat(MONTH_NAMES)]);
  sh.getRange(2, 1).setValue('รวม');
  const formulas = MONTH_NAMES.map((_, i) => {
    const col = columnLetter_(CONFIG.FIRST_MONTH_COL + i);
    return '=SUM(' + col + CONFIG.FIRST_ITEM_ROW + ':' + col + ')';
  });
  sh.getRange(2, CONFIG.FIRST_MONTH_COL, 1, 12).setFormulas([formulas]);
  ensureHeader_(sh);
  const itemRows = CONFIG.MAX_ROWS - CONFIG.FIRST_ITEM_ROW + 1;
  sh.getRange(2, CONFIG.FIRST_MONTH_COL, itemRows + 1, 12).setNumberFormat('#,##0.00');
  sh.getRange(CONFIG.FIRST_ITEM_ROW, CONFIG.START_COL, itemRows, 2).setNumberFormat('@');
  sh.getRange(CONFIG.FIRST_ITEM_ROW, CONFIG.AMOUNT_COL, itemRows, 1).setNumberFormat('#,##0.00');
  sh.setFrozenRows(2);
  return sh;
}

function ensureHeader_(sh) {
  const range = sh.getRange(1, CONFIG.NAME_COL, 1, 4);
  const current = range.getValues()[0];
  const labels = ['รายการ', 'เริ่ม (YYYY-MM)', 'สิ้นสุด (YYYY-MM)', 'ยอด/เดือน'];
  if (current.every(v => v === '')) range.setValues([labels]);
}

function columnLetter_(n) {
  return String.fromCharCode(64 + n);
}

// ---------- Read ----------

function load_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(CONFIG.CONFIG_SHEET)) withLock_(() => ensureConfig_(ss));
  return read_(ss);
}

function read_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const groups = [];
  const missing = [];
  readGroupList_(ss).forEach(g => {
    const sh = ss.getSheetByName(g.name);
    if (!sh) {
      missing.push(g.name);
      return;
    }
    groups.push({ name: g.name, type: g.type, items: readItems_(sh, tz) });
  });
  return {
    year: sheetYear_(),
    updatedAt: new Date().toISOString(),
    groups: groups,
    missing: missing,
  };
}

function readItems_(sh, tz) {
  const first = CONFIG.FIRST_ITEM_ROW;
  const last = Math.min(sh.getLastRow(), CONFIG.MAX_ROWS);
  const items = [];
  if (last < first) return items;
  const range = sh.getRange(first, 1, last - first + 1, LAST_COL);
  const values = range.getValues();
  const formulas = range.getFormulas();
  values.forEach((row, i) => {
    if (isRowEmpty_(row, formulas[i])) return;
    const amount = row[CONFIG.AMOUNT_COL - 1];
    items.push({
      row: first + i,
      name: String(row[CONFIG.NAME_COL - 1]).trim(),
      values: row.slice(1, 13).map(v => (v === '' || v === null ? null : toNum_(v))),
      formulas: formulas[i].slice(1, 13).map(f => f !== ''),
      start: normYm_(row[CONFIG.START_COL - 1], tz),
      end: normYm_(row[CONFIG.END_COL - 1], tz),
      amount: amount === '' || amount === null ? null : toNum_(amount),
    });
  });
  return items;
}

// Column A holds the running index, so only B..R decide whether a row is free
function isRowEmpty_(row, formulas) {
  for (let c = 1; c < LAST_COL; c++) {
    if ((row[c] !== '' && row[c] !== null) || formulas[c]) return false;
  }
  return true;
}

function toNum_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

function normYm_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
  const s = String(v || '').trim();
  return YM_PATTERN.test(s) ? s : '';
}

function sheetYear_() {
  const y = Number(PropertiesService.getScriptProperties().getProperty('YEAR'));
  return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
}

// ---------- Write: items ----------

function addItem_(ss, req) {
  const item = validateItem_(req, false, groupNames_(ss));
  const sh = getGroupSheet_(ss, item.group);
  ensureHeader_(sh);
  insertItems_(sh, [item]);
}

function addBatch_(ss, req) {
  if (!Array.isArray(req.items) || req.items.length === 0 || req.items.length > CONFIG.MAX_BATCH) {
    throw userError_('จำนวนรายการต้องอยู่ระหว่าง 1-' + CONFIG.MAX_BATCH);
  }
  const names = groupNames_(ss);
  // Validate everything first so a bad entry never leaves a half-written batch
  const items = req.items.map(it => validateItem_(it || {}, false, names));
  const byGroup = {};
  items.forEach(it => { (byGroup[it.group] = byGroup[it.group] || []).push(it); });
  Object.keys(byGroup).forEach(group => {
    const sh = getGroupSheet_(ss, group);
    ensureHeader_(sh);
    insertItems_(sh, byGroup[group]);
  });
}

function updateItem_(ss, req) {
  const item = validateItem_(req, true, groupNames_(ss));
  const sh = getGroupSheet_(ss, item.group);
  const current = readRowChecked_(sh, item.row, req.expectedName);
  ensureHeader_(sh);
  writeRow_(sh, item.row, item, current);
}

function deleteItem_(ss, req) {
  if (groupNames_(ss).indexOf(req.group) === -1) throw userError_('หมวดไม่ถูกต้อง');
  const row = validRow_(req.row);
  const sh = getGroupSheet_(ss, req.group);
  readRowChecked_(sh, row, req.expectedName);
  // Clear instead of deleteRow so SUM ranges and the index column stay intact
  sh.getRange(row, CONFIG.FIRST_MONTH_COL, 1, LAST_COL - 1).clearContent();
}

function deleteItems_(ss, req) {
  if (groupNames_(ss).indexOf(req.group) === -1) throw userError_('หมวดไม่ถูกต้อง');
  if (!Array.isArray(req.items) || req.items.length === 0 || req.items.length > CONFIG.MAX_BATCH) {
    throw userError_('จำนวนรายการต้องอยู่ระหว่าง 1-' + CONFIG.MAX_BATCH);
  }
  const sh = getGroupSheet_(ss, req.group);
  const targets = req.items.map(it => ({ row: validRow_(it && it.row), name: it && it.expectedName }));
  // Verify every row first so one stale row aborts the whole delete
  targets.forEach(t => readRowChecked_(sh, t.row, t.name));
  targets.forEach(t => sh.getRange(t.row, CONFIG.FIRST_MONTH_COL, 1, LAST_COL - 1).clearContent());
}

function insertItems_(sh, items) {
  const first = CONFIG.FIRST_ITEM_ROW;
  const last = Math.min(sh.getLastRow(), CONFIG.MAX_ROWS);
  const free = [];
  if (last >= first) {
    const range = sh.getRange(first, 1, last - first + 1, LAST_COL);
    const values = range.getValues();
    const formulas = range.getFormulas();
    values.forEach((row, i) => { if (isRowEmpty_(row, formulas[i])) free.push(first + i); });
  }
  let next = Math.max(last, first - 1) + 1;
  items.forEach(item => {
    let target = free.shift();
    if (!target) {
      target = next++;
      if (target > CONFIG.MAX_ROWS) throw userError_('จำนวนรายการในหมวด ' + sh.getName() + ' เต็มแล้ว');
    }
    const indexCell = sh.getRange(target, 1);
    if (indexCell.isBlank()) indexCell.setValue(target - first + 1);
    writeRow_(sh, target, item, null);
  });
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
  // Text format stops Sheets from converting YYYY-MM into a date
  sh.getRange(row, CONFIG.START_COL, 1, 2).setNumberFormat('@').setValues([[item.start, item.end]]);
  sh.getRange(row, CONFIG.AMOUNT_COL).setValue(item.amount === null ? '' : item.amount);
}

function readRowChecked_(sh, row, expectedName) {
  const stale = userError_('ข้อมูลใน Sheet เปลี่ยนไปแล้ว กรุณารีเฟรช', 'conflict');
  if (row > sh.getLastRow()) throw stale;
  const range = sh.getRange(row, 1, 1, LAST_COL);
  const values = range.getValues()[0];
  const formulas = range.getFormulas()[0];
  const name = String(values[CONFIG.NAME_COL - 1]).trim();
  const expected = typeof expectedName === 'string' ? expectedName.trim() : '';
  if (isRowEmpty_(values, formulas) || name !== expected) throw stale;
  return { values: values, formulas: formulas };
}

// ---------- Write: groups ----------

function createGroup_(ss, req) {
  const name = typeof req.name === 'string' ? req.name.trim() : '';
  if (!name || name.length > CONFIG.MAX_GROUP_NAME || !GROUP_NAME_PATTERN.test(name)) {
    throw userError_('ชื่อหมวดต้องมี 1-' + CONFIG.MAX_GROUP_NAME + ' ตัวอักษร ห้ามใช้ [ ] * ? / \\ : \' และห้ามขึ้นต้นด้วย _');
  }
  if (TYPES.indexOf(req.type) === -1) throw userError_('ประเภทหมวดไม่ถูกต้อง');
  const list = readGroupList_(ss);
  if (list.length >= CONFIG.MAX_GROUPS) throw userError_('สร้างหมวดได้สูงสุด ' + CONFIG.MAX_GROUPS + ' หมวด');
  if (list.some(g => g.name.toLowerCase() === name.toLowerCase())) throw userError_('มีหมวดชื่อนี้แล้ว');
  // An existing tab with the same name is linked instead of recreated
  if (!ss.getSheetByName(name)) createGroupSheet_(ss, name);
  const cfg = ss.getSheetByName(CONFIG.CONFIG_SHEET);
  cfg.getRange(cfg.getLastRow() + 1, 1, 1, 2).setNumberFormat('@').setValues([[name, req.type]]);
}

// Unlinks the group from the app only; the sheet tab and its data are kept
function removeGroup_(ss, req) {
  const g = readGroupList_(ss).find(x => x.name === req.name);
  if (!g) throw userError_('ไม่พบหมวดนี้', 'conflict');
  ss.getSheetByName(CONFIG.CONFIG_SHEET).deleteRow(g.configRow);
}

function groupNames_(ss) {
  return readGroupList_(ss).map(g => g.name);
}

function getGroupSheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw userError_('ไม่พบ Sheet ' + name, 'not_found');
  return sh;
}

// ---------- Validation ----------

function validateItem_(req, needRow, groupNames) {
  if (groupNames.indexOf(req.group) === -1) throw userError_('หมวดไม่ถูกต้อง');
  const name = typeof req.name === 'string' ? req.name.trim() : '';
  if (!name || name.length > CONFIG.MAX_NAME) {
    throw userError_('ชื่อรายการต้องมี 1-' + CONFIG.MAX_NAME + ' ตัวอักษร');
  }
  if (!Array.isArray(req.values) || req.values.length !== 12) throw userError_('ข้อมูลรายเดือนไม่ถูกต้อง');
  const values = req.values.map(v => {
    const n = validAmount_(v);
    return n === null ? '' : n;
  });
  const start = validYm_(req.start, 'เดือนเริ่ม');
  const end = validYm_(req.end, 'เดือนสิ้นสุด');
  if (start && end && start > end) throw userError_('เดือนเริ่มต้องไม่เกินเดือนสิ้นสุด');
  return {
    group: req.group,
    name: name,
    values: values,
    start: start,
    end: end,
    amount: validAmount_(req.amount),
    row: needRow ? validRow_(req.row) : null,
  };
}

function validAmount_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'number' && typeof v !== 'string') throw userError_('จำนวนเงินไม่ถูกต้อง');
  const n = Number(v);
  if (!isFinite(n) || Math.abs(n) > CONFIG.MAX_AMOUNT) throw userError_('จำนวนเงินไม่ถูกต้อง');
  return Math.round(n * 100) / 100;
}

function validYm_(v, label) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s && !YM_PATTERN.test(s)) throw userError_(label + 'ต้องเป็นรูปแบบ YYYY-MM');
  return s;
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
