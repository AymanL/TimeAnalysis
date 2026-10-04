import { dateOf, dayOf } from './time.js';
import { buildDaysFromState, fillGapsForExport } from './timeline.js';

export const HANDOFF_VERSION = 1;

function exportStart(state) {
  if (state.exportFrom) return state.exportFrom;
  const first = Math.min(
    state.taps.reduce((min, t) => Math.min(min, t.at), Infinity),
    state.blocks.reduce((min, b) => Math.min(min, b.start), Infinity),
  );
  return Number.isFinite(first) ? dateOf(first) : null;
}

// A short fingerprint of a finished day, so a day is handed off again whenever its
// content changes after it was exported (gaps filled, a Sleep block arrived).
export function dayDigest(day) {
  const text = JSON.stringify([day.wake_time, day.sleep_time, day.activities]);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

const finished = (day) => {
  const { gaps, warnings, ...rest } = fillGapsForExport(day);
  return rest;
};

// Days to hand off: from the start date up to today, minus days already exported
// with exactly this content.
function pendingDays(state, today) {
  const from = exportStart(state);
  if (!from) return [];
  return buildDaysFromState(state)
    .filter((d) => d.date >= from && d.date <= today)
    .map(finished)
    .filter((d) => state.exportedDays[d.date]?.digest !== dayDigest(d));
}

export const pendingExportDays = (state, today) => pendingDays(state, today).map((d) => d.date);

export function buildHandoff(state, nowMs) {
  const days = pendingDays(state, dayOf(nowMs, state.cutoffHour));
  return { version: HANDOFF_VERSION, exportedAt: nowMs, days, tasks: state.tasks };
}
