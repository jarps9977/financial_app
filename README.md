# Ngern

ติดตามรายรับรายจ่ายรายปี (PWA, Vanilla JS) บันทึกลง Google Sheets ผ่าน Google Apps Script

## โครงสร้างโฟลเดอร์

```text
index.html               App shell + CSP
manifest.webmanifest     PWA manifest
sw.js                    Service worker (offline shell)
icons/app_icon.png
apps-script/Code.gs      Back-end API (วางใน Apps Script ของ Spreadsheet)
css/
  tokens.css             สี / ฟอนต์ / spacing + Dark mode
  layout.css             Header, Sidebar/Drawer, Bottom nav, Grid, Breakpoints
  components.css         Button, Card, Input, Bottom sheet, Table, Chart ...
js/
  app.js                 Router + lazy load หน้า + add picker
  api.js / store.js      เรียก API, cache, state
  selectors.js           คำนวณ Report / ประมาณการข้ามปี
  layout/shell.js        Layout หลัก
  components/            Button, Card, Field, BottomSheet, States, Chart, LazyList, PullToRefresh, Progress
  services/ocr.js        Tesseract.js (โหลดจาก CDN ตอนใช้ครั้งแรก) อ่านสลิปในเครื่อง
  utils/slip-parser.js   ดึงยอดเงิน/วันที่จากข้อความ OCR
  pages/                 home, groups, group, item-form, group-form, report, import, settings, login
```

## Library ภายนอก (CDN jsdelivr, pin version)

- SweetAlert2 11.14.5: loading / confirm / toast / progress (`js/components/alert.js`)
- Highcharts 11.4.8 (styledMode, lazy load): กราฟทั้งหมด (`js/components/chart.js`) — ใช้ฟรีเฉพาะงานส่วนตัว/ไม่เชิงพาณิชย์
- Tesseract.js 5.1.1 (lazy load): OCR สลิป
- Phosphor Icons 2.1.1 (Fill, MIT) ผ่าน `js/components/icon.js`, Google Fonts Noto Sans Thai

## โครงสร้าง Sheet

- 1 หมวด = 1 Tab (เช่น `KTC`, `K-Bank`) แถว 1 หัวตาราง, แถว 2 `รวม` (SUM), แถว 3+ รายการ
- คอลัมน์ B..M = ยอด ม.ค.-ธ.ค., O = ชื่อรายการ, P = เริ่ม (YYYY-MM), Q = สิ้นสุด (YYYY-MM), R = ยอด/เดือน
- Tab `_ngern` (ซ่อน) เก็บรายชื่อหมวดและประเภท (`expense` / `income`)
- Tab `รายรับ` สร้างอัตโนมัติ ใส่เงินเดือน, OT ฯลฯ ใช้เป็นค่า Max ในหน้า Report
- ปีอื่นนอกเหนือจาก `YEAR` คำนวณจาก ยอด/เดือน + ช่วงเริ่ม-สิ้นสุด (รองรับข้ามปี)

## Breakpoints

| ขนาด | Navigation | Layout |
| --- | --- | --- |
| Mobile < 640px | Bottom nav (4 เมนู + ปุ่มเพิ่ม) + Hamburger drawer | 1 คอลัมน์, Report เป็น Card รายเดือน, Modal เป็น Bottom sheet, ปุ่มบันทึก sticky |
| Tablet 640-1023px | Sidebar ถาวร | 2 คอลัมน์, Report เป็น Card 2 คอลัมน์, Modal กลางจอ |
| Desktop >= 1024px | Sidebar + Content | 3-4 คอลัมน์, ตาราง Report / รายการเต็มรูปแบบ |
