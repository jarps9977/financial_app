import { h } from '../utils/dom.js';
import { getSettings, saveSettings, applyTheme, isValidApiUrl, clearPin, lock } from '../settings.js';
import { state, refresh, clearData } from '../store.js';
import { navigate } from '../router.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Field } from '../components/input.js';
import { kv } from '../components/misc.js';
import { runTask, confirmAction } from '../components/alert.js';

export default {
  title: () => 'ตั้งค่า',
  live: false,
  needsData: false,
  render: () => view(),
};

function view() {
  const settings = getSettings();
  const data = state.data;

  const theme = Field({
    label: 'ธีม', name: 'theme', value: settings.theme,
    options: [['system', 'ตามระบบ'], ['light', 'สว่าง'], ['dark', 'มืด']],
    onChange: (e) => {
      saveSettings({ theme: e.target.value });
      applyTheme(e.target.value);
    },
  });

  const urlField = Field({ label: 'Apps Script URL', type: 'url', inputmode: 'url', value: settings.apiUrl, autocomplete: 'off' });
  const passField = Field({ label: 'รหัสผ่านใหม่', type: 'password', autocomplete: 'new-password', hint: 'เว้นว่างถ้าไม่เปลี่ยน' });
  const testBtn = Button({ label: 'บันทึกและทดสอบ', type: 'submit', variant: 'secondary', icon: 'plug' });

  async function saveConnection(e) {
    e.preventDefault();
    const apiUrl = urlField.input.value.trim();
    if (!isValidApiUrl(apiUrl)) {
      urlField.setError('ต้องเป็น https://script.google.com/macros/s/.../exec');
      return;
    }
    urlField.setError('');
    const patch = { apiUrl };
    if (passField.input.value) patch.passcode = passField.input.value;
    saveSettings(patch);
    await runTask({
      title: 'กำลังทดสอบการเชื่อมต่อ...',
      success: 'เชื่อมต่อสำเร็จ',
      task: async () => {
        await refresh();
        if (state.error) throw state.error;
      },
    });
  }

  function lockNow() {
    clearPin();
    lock.returnTo = '/';
    navigate('/pin');
  }

  async function logout() {
    const ok = await confirmAction({
      title: 'ออกจากระบบ?',
      text: 'ล้างรหัสผ่านและข้อมูลที่เก็บไว้ในเครื่องนี้ ข้อมูลใน Google Sheets ไม่ได้รับผลกระทบ',
      confirmText: 'ออกจากระบบ',
      danger: true,
    });
    if (!ok) return;
    saveSettings({ passcode: '' });
    clearPin();
    clearData();
    navigate('/login');
  }

  return h('div', { class: 'grid grid-2' },
    Card({ title: 'การแสดงผล', children: theme.el }),
    Card({
      title: 'ข้อมูล',
      children: data
        ? h('dl', { class: 'kv' },
          kv('ปีของ Sheet', String(data.year)),
          kv('จำนวนหมวด', `${data.groups.length} หมวด`),
          kv('จำนวนรายการ', `${data.groups.reduce((n, g) => n + g.items.length, 0)} รายการ`),
          kv('อัปเดตล่าสุด', new Date(data.updatedAt).toLocaleString('th-TH')))
        : h('p', { class: 'muted' }, 'ยังไม่มีข้อมูล'),
    }),
    Card({
      title: 'การเชื่อมต่อ',
      children: h('form', { class: 'stack', novalidate: true, onSubmit: saveConnection },
        urlField.el, passField.el, testBtn),
    }),
    Card({
      title: 'บัญชี',
      children: h('div', { class: 'stack' },
        Button({ label: 'ล็อกแอปตอนนี้', icon: 'lock', variant: 'secondary', block: true, onClick: lockNow }),
        Button({ label: 'ออกจากระบบ', icon: 'box-arrow-right', variant: 'danger-ghost', block: true, onClick: logout })),
    }));
}
