const KEY = 'ngern.settings';
const DEFAULTS = { apiUrl: '', passcode: '', theme: 'system' };

export function getSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage unavailable, keep in-memory only */ }
  return next;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

// Only allow Apps Script endpoints so the passcode is never sent to another host
export function isValidApiUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:'
      && u.hostname === 'script.google.com'
      && /^(\/a\/[^/]+)?\/macros\/s\/[\w-]+\/exec$/.test(u.pathname);
  } catch {
    return false;
  }
}

export function isConfigured() {
  const s = getSettings();
  return isValidApiUrl(s.apiUrl) && Boolean(s.passcode);
}
