const KEY = 'ngern.settings';
export const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzKPPLthTBi5d35husOZuK8ZbSXVfzcYU5EijcwUO2DGX0EmiTQ3OS7dsnKrZi17xs94Q/exec';
const DEFAULTS = { apiUrl: DEFAULT_API_URL, passcode: '', theme: 'system' };

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
  } catch { /* storage unavailable, keep defaults */ }
  return next;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

// Only Apps Script endpoints are allowed so the passcode is never sent to another host
export function isValidApiUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:'
      && u.hostname === 'script.google.com'
      && /^(\/a\/[^/]+)?\/macros\/s\/[\w-]+\/exec$/.test(u.pathname)
      && !u.search && !u.hash;
  } catch {
    return false;
  }
}

// PIN lives only in sessionStorage/memory so reopening the app always asks for it again
const PIN_KEY = 'ngern.pin';
export const PIN_LENGTH = 8;
let pinMemory = '';
// Route to return to after unlocking
export const lock = { returnTo: '/' };

export const isValidPin = (pin) => typeof pin === 'string' && /^\d{8}$/.test(pin);

export function getPin() {
  try {
    return sessionStorage.getItem(PIN_KEY) || pinMemory;
  } catch {
    return pinMemory;
  }
}

export function setPin(pin) {
  pinMemory = pin;
  try {
    sessionStorage.setItem(PIN_KEY, pin);
  } catch { /* memory only */ }
}

export function clearPin() {
  pinMemory = '';
  try {
    sessionStorage.removeItem(PIN_KEY);
  } catch { /* ignore */ }
}

export const isUnlocked = () => isValidPin(getPin());

export function isConfigured() {
  const s = getSettings();
  return isValidApiUrl(s.apiUrl) && Boolean(s.passcode);
}
