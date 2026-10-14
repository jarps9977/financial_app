import { call } from './api.js';
import { startProgress } from './components/progress.js';

const CACHE_KEY = 'ngern.cache.v2';
const listeners = new Set();
let inflight = null;

export const state = { data: readCache(), loading: false, error: null, year: null };

function readCache() {
  try {
    const d = JSON.parse(localStorage.getItem(CACHE_KEY));
    return d && Array.isArray(d.groups) ? d : null;
  } catch {
    return null;
  }
}

function setData(data) {
  state.data = data;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* cache is optional */ }
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Year shown on dashboard/report; defaults to the sheet year
export const viewYear = () => state.year ?? (state.data ? state.data.year : new Date().getFullYear());

export function setYear(year) {
  state.year = year;
  emit();
}

// Resolves even on failure; callers read state.error
export function refresh() {
  if (inflight) return inflight;
  state.loading = true;
  state.error = null;
  emit();
  const done = startProgress();
  inflight = call('load')
    .then(setData, (e) => { state.error = e; })
    .finally(() => {
      done();
      state.loading = false;
      inflight = null;
      emit();
    });
  return inflight;
}

// Mutations return the full dataset, so no extra reload round trip; progress UI is the caller's (SweetAlert)
export async function mutate(action, payload) {
  const data = await call(action, payload);
  setData(data);
  state.error = null;
  emit();
  return data;
}

export function clearData() {
  state.data = null;
  state.error = null;
  state.year = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
  emit();
}
