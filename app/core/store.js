import { emptyTasks } from './tasks.js';

export const DEFAULT_ACTIVITIES = [
  'Work', 'Study', 'Reading', 'Scroll', 'Video', 'Gaming', 'Social', 'Cooking',
  'Chores', 'Shower', 'Nap', 'Walk',
];

export const defaultState = () => ({
  version: 1,
  seq: 0,
  taps: [],            // { id, at, label } where label null means stop
  blocks: [],          // imported Life Cycle blocks
  labelMap: {},        // Life Cycle name -> the user's label (overrides defaults)
  highPriority: [],    // Life Cycle names that win overlaps like Work does
  activities: [...DEFAULT_ACTIVITIES],
  cutoffHour: 4,
  tasks: emptyTasks(),
  exportedDays: {},    // date -> { digest, at } of the version last handed off
  exportFrom: null,    // first date to hand off; null = the date of the first tap
});

const KEY = 'app-state';

// A store is { get(key), set(key, value) } over any async backing.
export function createMemoryStore(backing = new Map()) {
  return {
    async get(key) { return backing.has(key) ? structuredClone(backing.get(key)) : undefined; },
    async set(key, value) { backing.set(key, structuredClone(value)); },
  };
}

// Browser-only: IndexedDB under a single key. Not exercised by the unit tests.
export function createBrowserStore(name = 'time-analysis') {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    get: (key) => run('readonly', (s) => s.get(key)),
    set: (key, value) => run('readwrite', (s) => s.put(value, key)),
  };
}

export async function loadAppState(store) {
  const saved = await store.get(KEY);
  return saved ? { ...defaultState(), ...saved } : defaultState();
}

export const saveAppState = (store, state) => store.set(KEY, state);

export function addTap(state, at, label) {
  return { ...state, seq: state.seq + 1, taps: [...state.taps, { id: `tap-${state.seq + 1}`, at, label }] };
}

// The most recent tap at or before `atOrBefore`.
export function latestTap(taps, atOrBefore = Infinity) {
  return taps.filter((t) => t.at <= atOrBefore).sort((a, b) => a.at - b.at).pop();
}

export function undoLastTap(state) {
  const last = latestTap(state.taps);
  return last ? { ...state, taps: state.taps.filter((t) => t.id !== last.id) } : state;
}

export const editTap = (state, id, changes) => ({
  ...state,
  taps: state.taps.map((t) => (t.id === id ? { ...t, ...changes } : t)),
});

export const deleteTap = (state, id) => ({ ...state, taps: state.taps.filter((t) => t.id !== id) });
