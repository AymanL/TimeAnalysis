// A settings file lets the user keep their own activity names and Life Cycle
// mapping outside the code: export from one device, import on another.

export const SETTINGS_VERSION = 1;
const FIELDS = ['version', 'activities', 'labelMap', 'highPriority', 'cutoffHour', 'exportFrom', 'backfillDays'];

const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '');
const isStringMap = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');

export function parseSettings(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The settings file is not valid JSON.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('The settings file must be a JSON object.');
  if (data.version !== SETTINGS_VERSION) throw new Error(`Unsupported settings version ${JSON.stringify(data.version)} (expected ${SETTINGS_VERSION}).`);
  const unknown = Object.keys(data).filter((k) => !FIELDS.includes(k));
  if (unknown.length) throw new Error(`Unknown field in the settings file: ${unknown.join(', ')}`);

  if ('activities' in data && !isStringList(data.activities)) throw new Error('"activities" must be a list of names.');
  if ('labelMap' in data && !isStringMap(data.labelMap)) throw new Error('"labelMap" must map names to names.');
  if ('highPriority' in data && !isStringList(data.highPriority)) throw new Error('"highPriority" must be a list of names.');
  if ('cutoffHour' in data && !(Number.isInteger(data.cutoffHour) && data.cutoffHour >= 0 && data.cutoffHour <= 12)) {
    throw new Error('"cutoffHour" must be a whole number from 0 to 12.');
  }
  if ('exportFrom' in data && data.exportFrom !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data.exportFrom)) {
    throw new Error('"exportFrom" must be a date like 2026-03-01.');
  }
  if ('backfillDays' in data && !(Number.isInteger(data.backfillDays) && data.backfillDays >= 1)) {
    throw new Error('"backfillDays" must be a whole number of at least 1.');
  }
  return data;
}

// Only the fields the file contains are changed.
export function applySettings(state, settings) {
  const next = { ...state };
  for (const key of ['activities', 'labelMap', 'highPriority', 'cutoffHour', 'exportFrom', 'backfillDays']) {
    if (key in settings) next[key] = settings[key];
  }
  return next;
}

export const settingsFromState = (s) => ({
  version: SETTINGS_VERSION,
  activities: s.activities,
  labelMap: s.labelMap,
  highPriority: s.highPriority,
  cutoffHour: s.cutoffHour,
  exportFrom: s.exportFrom,
  backfillDays: s.backfillDays,
});
