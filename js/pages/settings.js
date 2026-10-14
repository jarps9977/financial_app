import { h } from '../utils/dom.js';
import { formatDateTime } from '../utils/format.js';
import { getSettings, saveSettings, applyTheme, isValidApiUrl } from '../settings.js';
import { state, refresh, clearData } from '../store.js';
import { navigate } from '../router.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { Field, Segmented } from '../components/input.js';
import { toast } from '../components/misc.js';

export default {
  title: () => 'ตั้งค่า',
  live: false,
  needsData: false,
  render,
};

function render() {
  const s = getSettings();

  const theme = Segmented({
    legend: 'ธีม',
    name: 'theme',
    value: s.theme,
    options: [['system', 'ตามระบบ'], ['light', 'สว่าง'], ['dark', 'มืด']],
    onChange: (v) => { saveSettings({ theme: v }); applyTheme(v); },
  });

  const urlField = Field({ label: 'Apps Script Web App URL', name: 'apiUrl', type: 'url', inputmode: 'url', value: s.apiUrl, autocomplete: 'off' });
  const passField = Field({ label: 'Passcode ใหม่', name: 'passcode', type: 'password', autocomplete: 'new-password', hint: 'เว้นว่างถ้าไม่เปลี่ยน' });

  async function saveConnection(e) {
    e.preventDefault();
    const apiUrl = urlField.input.value.trim();
    if (!isValidApiUrl(apiUrl)) {
      urlField.setError('ต้องเป็น URL ของ Apps Script ที่ลงท้ายด้วย /exec');
      return;
    }
    urlField.setError('');
    const patch = { apiUrl };
    if (passField.input.value) patch.passcode = passField.input.value;
    saveSettings(patch);
    passField.input.value = '';
    await refresh();
    toast(state.error ? state.error.message : 'เชื่อมต่อสำเร็จ', state.error ? 'error' : 'info');
  }

  async function reload() {
    await refresh();
    updated.textContent = lastUpdated();
    toast(state.error ? state.error.message : 'อัปเดตข้อมูลแล้ว', state.error ? 'error' : 'info');
  }

  const lastUpdated = () => (state.data ? `อัปเดตล่าสุด ${formatDateTime(state.data.updatedAt)}` : 'ยังไม่มีข้อมูลในเครื่อง');
  const updated = h('p', { class: 'muted' }, lastUpdated());

  return h('div', { class: 'grid grid-2' },
    Card({ title: 'การแสดงผล', children: theme }),
    Card({
      title: 'การเชื่อมต่อ',
      children: h('form', { class: 'stack', novalidate: true, onSubmit: saveConnection },
        urlField.el, passField.el, Button({ label: 'บันทึกการเชื่อมต่อ', type: 'submit', block: true })),
    }),
    Card({
      title: 'ข้อมูล',
      children: [
        updated,
        h('div', { class: 'btn-row' },
          Button({ label: 'รีเฟรช', icon: 'refresh', variant: 'secondary', onClick: reload }),
          Button({
            label: 'ล้างแคช',
            variant: 'ghost',
            onClick: () => { clearData(); updated.textContent = lastUpdated(); toast('ล้างแคชแล้ว'); },
          })),
      ],
    }),
    Card({
      title: 'บัญชี',
      children: Button({
        label: 'ออกจากระบบ',
        icon: 'logout',
        variant: 'danger-ghost',
        block: true,
        onClick: () => { saveSettings({ passcode: '' }); clearData(); navigate('/login'); },
      }),
    }));
}
