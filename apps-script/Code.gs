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
 *    PASSCODE (required, 12+ characters), PIN (8 digits, asked every time the app opens),
 *    YEAR (optional, defaults to current year)
 * 3. Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone"
 *    (update: Manage deployments > Edit > Version: New version, keeps the same /exec URL)
 */

const CONFIG = {
  CONFIG_SHEET: '_ngern',
  PAID_SHEET: '_ngern_paid', // A ym, B group, C row, D item name, E paid at
  MAX_PAID_ROWS: 5000,
  LOAD_CACHE_KEY: 'load_v1',
  LOAD_CACHE_TTL_SEC: 21600, // 6 hours, the CacheService maximum
  LOAD_CACHE_MAX: 95000,
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
const BILLING_MODES = ['', 'combined', 'separate'];
const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const PIN_PATTERN = /^\d{8}$/;
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

  const authError = authorize_(req.key, req.pin);
  if (authError) return reply_(authError);

  const handlers = {
    load: () => load_(req.fresh === true),
    // Writes return only what changed (touched / added / removed groups) instead of the whole dataset
    addItem: () => writePatch_(ss => { addItem_(ss, req); return { changed: [req.group] }; }),
    updateItem: () => writePatch_(ss => { updateItem_(ss, req); return { changed: [req.group] }; }),
    deleteItem: () => writePatch_(ss => { deleteItem_(ss, req); return { changed: [req.group] }; }),
    deleteItems: () => writePatch_(ss => { deleteItems_(ss, req); return { changed: [req.group] }; }),
    // Returns only the paid list; re-reading every group sheet made each tick slow
    setPaid: () => withLock_(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      setPaid_(ss, req);
      invalidateLoad_();
      return { paid: readPaid_(ss, ss.getSpreadsheetTimeZone()) };
    }),
    addBatch: () => writePatch_(ss => {
      addBatch_(ss, req);
      return { changed: req.items.map(it => it.group).filter((g, i, all) => all.indexOf(g) === i) };
    }),
    createGroup: () => writePatch_(ss => ({ added: [createGroup_(ss, req)] })),
    removeGroup: () => writePatch_(ss => ({ removed: [removeGroup_(ss, req)] })),
    setGroupBilling: () => writePatch_(ss => ({ changed: [setGroupBilling_(ss, req)] })),
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

// Both the device passcode and the 8-digit PIN must match; failures share one lockout counter
function authorize_(key, pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('auth_fails') || 0);
  if (fails >= CONFIG.MAX_AUTH_FAILS) {
    return { ok: false, error: 'ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาที', code: 'locked' };
  }
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty('PASSCODE');
  if (!expected) return { ok: false, error: 'ยังไม่ได้ตั้งค่า PASSCODE ใน Script properties', code: 'config' };
  const expectedPin = String(props.getProperty('PIN') || '').trim();
  // Fail closed: a missing or malformed PIN property blocks every request
  if (!PIN_PATTERN.test(expectedPin)) {
    return { ok: false, error: 'ตั้งค่า PIN ใน Script properties เป็นตัวเลข 8 หลัก', code: 'config' };
  }
  const fail = (error, code) => {
    cache.put('auth_fails', String(fails + 1), CONFIG.AUTH_FAIL_WINDOW_SEC);
    return { ok: false, error: error, code: code };
  };
  if (!safeEqual_(typeof key === 'string' ? key : '', expected)) return fail('รหัสผ่านไม่ถูกต้อง', 'unauthorized');
  if (!safeEqual_(typeof pin === 'string' ? pin : '', expectedPin)) {
    const left = CONFIG.MAX_AUTH_FAILS - fails - 1;
    return fail(left > 0 ? 'PIN ไม่ถูกต้อง (เหลือ ' + left + ' ครั้ง)' : 'ใส่ PIN ผิดหลายครั้ง กรุณารอ 10 นาที', left > 0 ? 'pin' : 'locked');
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

// fn returns { changed, added, removed } group names; only changed/added sheets are re-read.
// The client replaces changed groups, appends added ones and drops removed ones by name.
function writePatch_(fn) {
  return withLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureConfig_(ss);
    const result = fn(ss);
    invalidateLoad_();
    const tz = ss.getSpreadsheetTimeZone();
    const list = readGroupList_(ss);
    const readGroups = names => (names || []).map(name => {
      const g = list.find(x => x.name === name);
      const sh = g && ss.getSheetByName(name);
      return sh ? { name: name, type: g.type, billing: g.billing, items: readItems_(sh, tz) } : null;
    }).filter(Boolean);
    return {
      partial: true,
      groups: readGroups(result.changed),
      added: readGroups(result.added),
      removed: result.removed || [],
      updatedAt: new Date().toISOString(),
    };
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
  // Column C is the billing mode for the bills page: '' (auto), 'combined' or 'separate'
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .map((r, i) => ({
      name: String(r[0]).trim(),
      type: String(r[1]).trim(),
      billing: BILLING_MODES.indexOf(String(r[2]).trim()) !== -1 ? String(r[2]).trim() : '',
      configRow: i + 2,
    }))
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

// Reading every group sheet is the slow part, so the full load is cached until a write or a manual edit.
// fresh=true (refresh button / pull-to-refresh) always re-reads the sheets.
function load_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) {
    const hit = cache.get(CONFIG.LOAD_CACHE_KEY);
    if (hit) {
      try {
        return JSON.parse(hit);
      } catch (e) { /* corrupt entry, rebuild below */ }
    }
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(CONFIG.CONFIG_SHEET)) withLock_(() => ensureConfig_(ss));
  const data = read_(ss);
  const json = JSON.stringify(data);
  // CacheService values are limited to 100KB; larger datasets simply skip the cache
  if (json.length < CONFIG.LOAD_CACHE_MAX) cache.put(CONFIG.LOAD_CACHE_KEY, json, CONFIG.LOAD_CACHE_TTL_SEC);
  return data;
}

function invalidateLoad_() {
  CacheService.getScriptCache().remove(CONFIG.LOAD_CACHE_KEY);
}

// Simple trigger: edits made directly in Google Sheets also drop the cached load
function onEdit() {
  invalidateLoad_();
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
    groups.push({ name: g.name, type: g.type, billing: g.billing, items: readItems_(sh, tz) });
  });
  return {
    year: sheetYear_(),
    updatedAt: new Date().toISOString(),
    groups: groups,
    missing: missing,
    paid: readPaid_(ss, tz),
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

// ---------- Paid checklist ----------

function readPaid_(ss, tz) {
  const sh = ss.getSheetByName(CONFIG.PAID_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = Math.min(sh.getLastRow(), CONFIG.MAX_PAID_ROWS + 1);
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .map(r => ({
      ym: normYm_(r[0], tz),
      group: String(r[1]).trim(),
      row: Number(r[2]),
      name: String(r[3]).trim(),
      paidAt: r[4] instanceof Date ? r[4].toISOString() : String(r[4] || ''),
    }))
    .filter(p => p.ym && p.group && Number.isInteger(p.row));
}

function ensurePaidSheet_(ss) {
  let sh = ss.getSheetByName(CONFIG.PAID_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(CONFIG.PAID_SHEET);
  sh.getRange(1, 1, 1, 5).setValues([['ym', 'group', 'row', 'name', 'paidAt']]);
  sh.getRange(1, 1, CONFIG.MAX_PAID_ROWS + 1, 2).setNumberFormat('@');
  sh.getRange(1, 4, CONFIG.MAX_PAID_ROWS + 1, 1).setNumberFormat('@');
  sh.hideSheet();
  return sh;
}

// Marks items of one group as paid (or not) for a month: either { row, name } or items: [{ row, name }]
// (a combined credit-card bill ticks all its items at once). The name guards against a reused sheet row.
function setPaid_(ss, req) {
  const ym = validYm_(req.ym, 'เดือน');
  if (!ym) throw userError_('ต้องระบุเดือน');
  if (groupNames_(ss).indexOf(req.group) === -1) throw userError_('หมวดไม่ถูกต้อง');
  const raw = Array.isArray(req.items) ? req.items : [{ row: req.row, name: req.name }];
  if (raw.length === 0 || raw.length > CONFIG.MAX_BATCH) throw userError_('จำนวนรายการไม่ถูกต้อง');
  const targets = raw.map(it => {
    const name = it && typeof it.name === 'string' ? it.name.trim() : '';
    if (name.length > CONFIG.MAX_NAME) throw userError_('ชื่อรายการยาวเกินไป');
    return { row: validRow_(it && it.row), name: name };
  });
  const rows = targets.map(t => t.row);
  const paid = req.paid === true;

  const sh = ensurePaidSheet_(ss);
  const last = sh.getLastRow();
  const tz = ss.getSpreadsheetTimeZone();
  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, 3).getValues();
    // Bottom-up so deleting rows does not shift the ones still to check
    for (let i = values.length - 1; i >= 0; i--) {
      if (normYm_(values[i][0], tz) === ym && String(values[i][1]).trim() === req.group && rows.indexOf(Number(values[i][2])) !== -1) {
        sh.deleteRow(i + 2);
      }
    }
  }
  if (!paid) return;
  if (sh.getLastRow() + targets.length > CONFIG.MAX_PAID_ROWS) throw userError_('ประวัติการจ่ายเต็มแล้ว');
  const now = new Date();
  sh.getRange(sh.getLastRow() + 1, 1, targets.length, 5)
    .setValues(targets.map(t => [ym, req.group, t.row, safeText_(t.name), now]));
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
  return name;
}

// Unlinks the group from the app only; the sheet tab and its data are kept
function removeGroup_(ss, req) {
  const g = readGroupList_(ss).find(x => x.name === req.name);
  if (!g) throw userError_('ไม่พบหมวดนี้', 'conflict');
  ss.getSheetByName(CONFIG.CONFIG_SHEET).deleteRow(g.configRow);
  return g.name;
}

// Whether the bills page shows the group as one combined bill (credit cards) or item by item
function setGroupBilling_(ss, req) {
  if (BILLING_MODES.indexOf(req.billing) === -1) throw userError_('รูปแบบการจ่ายไม่ถูกต้อง');
  const g = readGroupList_(ss).find(x => x.name === req.name);
  if (!g) throw userError_('ไม่พบหมวดนี้', 'conflict');
  const cfg = ss.getSheetByName(CONFIG.CONFIG_SHEET);
  const header = cfg.getRange(1, 3);
  if (header.isBlank()) header.setValue('billing');
  cfg.getRange(g.configRow, 3).setNumberFormat('@').setValue(req.billing);
  return g.name;
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
