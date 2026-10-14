import { api } from './api.js';

const CACHE_KEY = 'ngern.cache';
const listeners = new Set();
let inflight = null;

export const state = { data: readCache(), loading: false, error: null };

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
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

// Resolves even on failure; callers read state.error
export function refresh() {
  if (inflight) return inflight;
  state.loading = true;
  state.error = null;
  emit();
  inflight = api.load()
    .then(setData, (e) => { state.error = e; })
    .finally(() => {
      state.loading = false;
      inflight = null;
      emit();
    });
  return inflight;
}

// Mutations return the full dataset, so no extra reload round trip
export async function mutate(action, payload) {
  const data = await api[action](payload);
  setData(data);
  state.error = null;
  emit();
  return data;
}

export function clearData() {
  state.data = null;
  state.error = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
  emit();
}
