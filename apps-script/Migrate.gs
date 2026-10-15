/**
 * One-off migration from the old budget spreadsheet into the Ngern layout.
 *
 * Run from the Apps Script editor (not exposed through doPost):
 *   1. previewMigration  - read-only, logs what will be imported per sheet
 *   2. runMigration      - deletes every app group tab + paid history, then imports
 * Delete this file after the migration to drop the extra Drive/Sheets scope.
 *
 * Rules:
 *   - One group per visible source tab, except MIGRATION.SKIP_SHEETS
 *   - An item filled in all 12 months has no start/end (runs forever)
 *   - Otherwise start = first filled month, end = source end column or last filled month
 */

const MIGRATION = {
  SOURCE_ID: '1UZy0SsN-QIKP5Ta75tOVTZymSAu95vg9X9Df6xsuWoQ',
  SKIP_SHEETS: ['Budget Plan/Y'],
  TEMP_SHEET: '_ngern_tmp',
  HEADER_SCAN_ROWS: 5,
  INCOME_NAME: /รายรับ|income|เงินเดือน|salary/i,
  SUMMARY_ROW: /^(รวม|total|sum)/i,
  NAME_HEADER: /รายการ|ชื่อ|item|name/i,
  START_HEADER: /เริ่ม|start/i,
  END_HEADER: /สิ้นสุด|หมด|end/i,
};

// Thai full/short and English month labels, Jan..Dec
const MONTH_HINTS = [
  /^(ม\.?ค|มกรา|jan)/i, /^(ก\.?พ|กุมภา|feb)/i, /^(มี\.?ค|มีนา|mar)/i, /^(เม\.?ย|เมษา|apr)/i,
  /^(พ\.?ค|พฤษภา|may)/i, /^(มิ\.?ย|มิถุนา|jun)/i, /^(ก\.?ค|กรกฎา|jul)/i, /^(ส\.?ค|สิงหา|aug)/i,
  /^(ก\.?ย|กันยา|sep)/i, /^(ต\.?ค|ตุลา|oct)/i, /^(พ\.?ย|พฤศจิกา|nov)/i, /^(ธ\.?ค|ธันวา|dec)/i,
];

function previewMigration() {
  const plan = planMigration_();
  console.log('Target year: ' + plan.year);
  plan.sheets.forEach(s => {
    if (s.skip) {
      console.log('SKIP  ' + s.name + ' - ' + s.skip);
      return;
    }
    const forever = s.items.filter(it => !it.start && !it.end).length;
    console.log('OK    ' + s.name + ' (' + s.type + ') items=' + s.items.length + ' no-end=' + forever +
      ' layout: header row ' + s.layout.headerRow + ', name col ' + columnLetter_(s.layout.nameCol) +
      (s.layout.endCol ? ', end col ' + columnLetter_(s.layout.endCol) : ''));
    s.items.slice(0, 5).forEach(it => console.log('      - ' + it.name + ' | ' + (it.start || '-') + ' .. ' +
      (it.end || 'ไม่มีสิ้นสุด') + ' | ' + it.amount));
  });
}

function runMigration() {
  const plan = planMigration_();
  const groups = plan.sheets.filter(s => !s.skip);
  if (groups.length === 0) throw new Error('No source sheet matches the expected layout, nothing was changed');
  if (groups.length + 1 > CONFIG.MAX_GROUPS) throw new Error('Too many groups: ' + groups.length);

  withLock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Sheets refuses to delete the last visible tab, so park on a temporary one
    const temp = ss.getSheetByName(MIGRATION.TEMP_SHEET) || ss.insertSheet(MIGRATION.TEMP_SHEET);
    ss.setActiveSheet(temp);

    let cfg = ss.getSheetByName(CONFIG.CONFIG_SHEET);
    const doomed = readGroupList_(ss).map(g => g.name).concat(groups.map(g => g.name));
    doomed.forEach(name => {
      const sh = ss.getSheetByName(name);
      if (sh && name.charAt(0) !== '_') ss.deleteSheet(sh);
    });

    if (!cfg) {
      cfg = ss.insertSheet(CONFIG.CONFIG_SHEET);
      cfg.hideSheet();
    }
    cfg.clearContents();
    const paid = ss.getSheetByName(CONFIG.PAID_SHEET);
    if (paid && paid.getLastRow() >= 2) paid.getRange(2, 1, paid.getLastRow() - 1, 5).clearContent();

    const config = [['name', 'type', 'billing']];
    groups.forEach(g => {
      const sh = createGroupSheet_(ss, g.name);
      writeMigratedItems_(sh, g.items);
      config.push([g.name, g.type, '']);
    });
    // The app needs an income group for the Max line; keep an empty one when the source has none
    if (!groups.some(g => g.type === 'income')) {
      const name = CONFIG.DEFAULT_INCOME;
      if (!ss.getSheetByName(name)) createGroupSheet_(ss, name);
      config.push([name, 'income', '']);
    }
    cfg.getRange(1, 1, config.length, 3).setNumberFormat('@').setValues(config);

    ss.setActiveSheet(ss.getSheetByName(groups[0].name));
    ss.deleteSheet(temp);
    invalidateLoad_();
  });
  console.log('Migrated ' + groups.length + ' groups: ' + groups.map(g => g.name + ' (' + g.items.length + ')').join(', '));
}

function planMigration_() {
  const source = SpreadsheetApp.openById(MIGRATION.SOURCE_ID);
  const tz = source.getSpreadsheetTimeZone();
  const year = sheetYear_();
  const sheets = source.getSheets()
    .filter(sh => !sh.isSheetHidden() && MIGRATION.SKIP_SHEETS.indexOf(sh.getName()) === -1)
    .map(sh => planSheet_(sh, year, tz));
  return { year: year, sheets: sheets };
}

function planSheet_(sh, year, tz) {
  const name = sh.getName().trim();
  const base = { name: name, type: MIGRATION.INCOME_NAME.test(name) ? 'income' : 'expense' };
  if (!name || name.length > CONFIG.MAX_GROUP_NAME || !GROUP_NAME_PATTERN.test(name)) {
    return Object.assign(base, { skip: 'invalid tab name for the app' });
  }
  const lastRow = Math.min(sh.getLastRow(), CONFIG.MAX_ROWS + MIGRATION.HEADER_SCAN_ROWS);
  const lastCol = Math.max(sh.getLastColumn(), LAST_COL);
  if (lastRow < 2) return Object.assign(base, { skip: 'empty sheet' });
  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();

  const layout = detectLayout_(values);
  if (!layout) return Object.assign(base, { skip: 'row of 12 month headers in B..M not found' });

  const items = [];
  for (let r = layout.headerRow; r < values.length && items.length < CONFIG.MAX_ROWS - CONFIG.FIRST_ITEM_ROW + 1; r++) {
    const item = planItem_(values[r], layout, year, tz, r + 1);
    if (item) items.push(item);
  }
  return Object.assign(base, { layout: layout, items: items });
}

// Header row = first row whose B..M look like Jan..Dec; name/start/end columns come from its labels
function detectLayout_(values) {
  for (let r = 0; r < Math.min(MIGRATION.HEADER_SCAN_ROWS, values.length); r++) {
    const row = values[r];
    let hits = 0;
    for (let m = 0; m < 12; m++) if (isMonthHeader_(row[CONFIG.FIRST_MONTH_COL - 1 + m], m)) hits++;
    if (hits < 10) continue;
    const after = CONFIG.FIRST_MONTH_COL + 12; // first column after M
    const find = re => {
      for (let c = after; c <= row.length; c++) if (re.test(String(row[c - 1]).trim())) return c;
      return 0;
    };
    const nameCol = find(MIGRATION.NAME_HEADER) || CONFIG.NAME_COL;
    const startCol = find(MIGRATION.START_HEADER);
    // Old layout kept the end month right after the name without a label
    const endCol = find(MIGRATION.END_HEADER) || (startCol ? 0 : nameCol + 1);
    return { headerRow: r + 1, nameCol: nameCol, startCol: startCol, endCol: endCol };
  }
  return null;
}

function isMonthHeader_(v, m) {
  if (v instanceof Date) return v.getMonth() === m;
  return MONTH_HINTS[m].test(String(v).trim());
}

function planItem_(row, layout, year, tz, rowNumber) {
  const label = String(row[0]).trim();
  let name = String(row[layout.nameCol - 1]).trim();
  if (MIGRATION.SUMMARY_ROW.test(label) || MIGRATION.SUMMARY_ROW.test(name)) return null;

  const months = [];
  for (let m = 0; m < 12; m++) months.push(cellAmount_(row[CONFIG.FIRST_MONTH_COL - 1 + m]));
  const filled = months.map((v, m) => (v !== null && v !== 0 ? m : -1)).filter(m => m !== -1);
  if (filled.length === 0) return null;
  if (!name) name = 'รายการแถว ' + rowNumber;

  const ym = m => year + '-' + String(m + 1).padStart(2, '0');
  let start = '';
  let end = '';
  const srcEnd = layout.endCol ? normYm_(row[layout.endCol - 1], tz) : '';
  const srcStart = layout.startCol ? normYm_(row[layout.startCol - 1], tz) : '';
  if (filled.length < 12 || srcEnd) {
    start = srcStart || ym(filled[0]);
    end = srcEnd || ym(filled[filled.length - 1]);
    if (start > end) start = ym(filled[0]) <= end ? ym(filled[0]) : '';
  }

  return {
    name: name.slice(0, CONFIG.MAX_NAME),
    values: months.map(v => (v === null ? '' : v)),
    start: start,
    end: end,
    amount: commonAmount_(filled.map(m => months[m])),
  };
}

function cellAmount_(v) {
  if (v === '' || v === null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s฿]/g, ''));
  if (!isFinite(n) || Math.abs(n) > CONFIG.MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

// Most frequent monthly amount; ties go to the latest month
function commonAmount_(list) {
  const counts = {};
  list.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return list.reduce((best, v) => (counts[v] >= counts[best] ? v : best), list[0]);
}

function writeMigratedItems_(sh, items) {
  if (items.length === 0) return;
  const rows = items.map((it, i) => {
    const row = [i + 1].concat(it.values);
    row.push('', safeText_(it.name), it.start, it.end, it.amount);
    return row;
  });
  sh.getRange(CONFIG.FIRST_ITEM_ROW, 1, rows.length, LAST_COL).setValues(rows);
}
