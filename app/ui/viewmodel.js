// Screen logic with no DOM, so it can be tested without a browser.
import { MINUTE, addDays, dateOf, dayOf, toHM } from '../core/time.js';
import { addTap, latestTap } from '../core/store.js';
import { buildDaysFromState, DEFAULT_LABEL_MAP } from '../core/timeline.js';
import { blockKey, mergeBlocks, parseLifeCycleCsv } from '../core/lifecycle.js';

export function tapActivity(state, label, at) {
  const last = latestTap(state.taps);
  const sameDay = last && dayOf(last.at, state.cutoffHour) === dayOf(at, state.cutoffHour);
  if (sameDay && last.label === label) return state; // same activity again today: nothing to start
  return addTap(state, at, label);
}

export const stopActivity = (state, at) => addTap(state, at, null);

export function currentActivity(state, now) {
  const last = latestTap(state.taps, now);
  if (!last || last.label == null || dayOf(last.at, state.cutoffHour) !== dayOf(now, state.cutoffHour)) return null;
  return { label: last.label, minutes: Math.floor((now - last.at) / MINUTE) };
}

const allGaps = (state) => buildDaysFromState(state).flatMap((d) => d.gaps);

export function daysWithGaps(state) {
  return buildDaysFromState(state)
    .filter((d) => d.gaps.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Days worth asking about: gaps inside the last `backfillDays` days, newest first.
// Older gaps are not offered; they are exported as unfilled.
export function backfillQueue(state, today) {
  const oldest = addDays(today, -((state.backfillDays ?? 7) - 1));
  return daysWithGaps(state).filter((d) => d.date >= oldest && d.date <= today);
}

// Fill part of a gap with activities. Each part is { label, minutes } and minutes null
// means "the rest of the gap". A tap only lasts to the end of the Life Cycle span it
// starts in, so a fill that crosses a boundary adds a tap at each stretch.
export function fillGap(state, gap, parts) {
  const inside = allGaps(state).some((g) => g.start <= gap.start && g.end >= gap.end);
  if (!inside) throw new Error('This range overlaps an activity that is already logged.');

  let next = state;
  let pos = gap.start;
  for (const part of parts) {
    if (pos >= gap.end) break;
    const end = part.minutes == null ? gap.end : Math.min(pos + part.minutes * MINUTE, gap.end);
    let cursor = pos;
    for (let guard = 0; guard < 50 && cursor < end; guard++) {
      next = addTap(next, cursor, part.label);
      const rest = allGaps(next).find((g) => g.start >= cursor && g.start < end);
      if (!rest) break;
      if (rest.start === cursor) throw new Error(`Could not fill the gap from ${toHM(cursor)}.`);
      cursor = rest.start;
    }
    pos = end;
  }
  if (pos < gap.end) next = addTap(next, pos, null); // stop, so the last activity does not run on
  return next;
}

export function importLifeCycle(state, csvText) {
  const incoming = parseLifeCycleCsv(csvText);
  const merged = mergeBlocks(state.blocks, incoming);
  const known = new Set(state.blocks.map(blockKey));
  const fresh = incoming.filter((b) => !known.has(blockKey(b)));
  return {
    state: { ...state, blocks: merged },
    summary: { added: fresh.length, days: new Set(fresh.map((b) => dateOf(b.start))).size },
  };
}

export function unmappedNames(state) {
  const mapped = { ...DEFAULT_LABEL_MAP, ...state.labelMap };
  return [...new Set(state.blocks.map((b) => b.name))].filter((n) => n !== 'Home' && !(n in mapped)).sort();
}
