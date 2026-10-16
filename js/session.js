import { navigate, currentPath, currentQuery } from './router.js';
import { saveSettings, clearPin } from './settings.js';
import { clearData } from './store.js';

// Routes reachable without an unlocked session
const OPEN_PATHS = ['/login', '/pin'];
export const isOpenPath = (path) => OPEN_PATHS.includes(path);

// The return path rides in the URL (#/pin?next=...) instead of shared state
export function lockApp(returnTo = currentPath()) {
  clearPin();
  // Sheets and alerts would otherwise stay on top of the lock screen
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  if (window.Swal) window.Swal.close();
  navigate(isOpenPath(returnTo) || returnTo === '/' ? '/pin' : `/pin?next=${encodeURIComponent(returnTo)}`);
}

// Only in-app paths are accepted so ?next= cannot point anywhere unexpected
export function unlockTarget() {
  const next = currentQuery().get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') && !isOpenPath(next) ? next : '/';
}

export function signOut() {
  saveSettings({ passcode: '' });
  clearPin();
  clearData();
  navigate('/login');
}
