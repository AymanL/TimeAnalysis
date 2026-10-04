// Local wall-clock times are stored as milliseconds, read as if they were UTC,
// so arithmetic never depends on the device's timezone or daylight saving.

const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;
export const HOUR = 3600 * 1000;
export const MINUTE = 60 * 1000;
export const FR_WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function localMs(text) {
  const m = TIME_RE.exec(String(text).trim());
  if (!m) return NaN;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
}

export const pad = (n) => String(n).padStart(2, '0');

export function toHM(ms) {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function dateOf(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// 0 = Monday ... 6 = Sunday
export const weekdayIndex = (isoDate) => (new Date(localMs(`${isoDate} 00:00`)).getUTCDay() + 6) % 7;

export const frenchDayName = (isoDate) => FR_WEEKDAYS[weekdayIndex(isoDate)];

// The calendar day a timestamp belongs to when a new day starts at cutoffHour.
export const dayOf = (ms, cutoffHour) => dateOf(ms - cutoffHour * HOUR);

export function addDays(isoDate, n) {
  return dateOf(localMs(`${isoDate} 00:00`) + n * 24 * HOUR);
}

// "Now" as local wall-clock milliseconds (the same convention as localMs).
export function nowLocalMs(date = new Date()) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
}
