import { call, isValidData, isGroupPatch } from './api.js';
import { startProgress } from './components/progress.js';

const CACHE_KEY = 'ngern.cache.v2';
const listeners = new Set();
let inflight = null;

export const state = { data: readCache(), loading: false, error: null, year: null, groupYear: null };

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

// Group pages keep their own year, independent from the overview/report year switch
export const groupYear = () => state.groupYear ?? (state.data ? state.data.year : new Date().getFullYear());

export function setGroupYear(year) {
  state.groupYear = year;
  emit();
}

// Resolves even on failure; callers read state.error.
// fresh=true skips the server-side load cache (used by the refresh button and pull-to-refresh).
// force=true waits for any in-flight load and sends a new one (credentials may have changed since).
export function refresh({ fresh = false, force = false } = {}) {
  if (inflight) return force ? inflight.then(() => refresh({ fresh })) : inflight;
  state.loading = true;
  state.error = null;
  emit();
  const done = startProgress();
  inflight = call('load', fresh ? { fresh: true } : {})
    .then(setData, (e) => { state.error = e; })
    .finally(() => {
      done();
      state.loading = false;
      inflight = null;
      emit();
    });
  return inflight;
}

// Replaces changed groups by name, drops removed ones and appends added ones (same order as the config sheet)
function mergeGroups(data, patch) {
  const byName = new Map(patch.groups.map((g) => [g.name, g]));
  const removed = new Set(patch.removed || []);
  const added = (patch.added || []).filter((g) => !data.groups.some((x) => x.name === g.name));
  return {
    ...data,
    updatedAt: patch.updatedAt || data.updatedAt,
    groups: [...data.groups.filter((g) => !removed.has(g.name)).map((g) => byName.get(g.name) || g), ...added],
    missing: (data.missing || []).filter((name) => !removed.has(name)),
  };
}

// Writes return only the changed groups (old backends may still send the full dataset); progress UI is the caller's
export async function mutate(action, payload) {
  const res = await call(action, payload, (d) => isValidData(d) || isGroupPatch(d));
  if (isGroupPatch(res)) {
    // Nothing cached to patch into: fall back to a full load
    if (!state.data) return refresh();
    setData(mergeGroups(state.data, res));
  } else {
    setData(res);
  }
  state.error = null;
  emit();
  return state.data;
}

// setPaid answers with the paid list only, merged into the cached dataset
export async function setPaid(payload) {
  const res = await call('setPaid', payload, (d) => d && Array.isArray(d.paid));
  if (state.data) setData({ ...state.data, paid: res.paid });
  state.error = null;
  emit();
  return res.paid;
}

export function clearData() {
  state.data = null;
  state.error = null;
  state.year = null;
  state.groupYear = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
  emit();
}
