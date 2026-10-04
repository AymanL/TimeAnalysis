import { HOUR, MINUTE, addDays, dateOf, frenchDayName, localMs, toHM } from './time.js';

export const UNKNOWN_LABEL = 'Non renseigné';

// Default Life Cycle name -> activity label. Unmapped names pass through unchanged.
// Your own labels go in the app's Settings (or an imported settings file).
export const DEFAULT_LABEL_MAP = {
  'Commute to work': 'Commute',
  'Commute to home': 'Commute',
  Transport: 'Commute',
  Cycle: 'Commute',
  Friends: 'Social',
  Sleep: 'Nap', // only non-main sleep reaches a day; the main night sleep bounds the day
};

// Lower number wins an overlap; within a tier the block that starts later wins.
// Names in the `highPriority` setting rank with Work, the first tier.
const TIERS = [
  ['Work'],
  ['Commute to work', 'Commute to home', 'Transport', 'Cycle'],
  ['Walk', 'Friends'],
  ['Sleep'],
  ['Home'],
];
const UNLISTED_TIER = 2; // a name outside the list ranks with Walk and Friends
const tierOf = (name, highPriority) => {
  if (highPriority.includes(name)) return 0;
  const i = TIERS.findIndex((t) => t.includes(name));
  return i === -1 ? UNLISTED_TIER : i;
};

function winnerAt(blocks, a, b, highPriority) {
  let best = null;
  for (const blk of blocks) {
    if (blk.start > a || blk.end < b) continue;
    if (!best) { best = blk; continue; }
    const ta = tierOf(blk.name, highPriority);
    const tb = tierOf(best.name, highPriority);
    if (ta < tb || (ta === tb && blk.start > best.start)) best = blk;
  }
  return best;
}

// Resolve Life Cycle blocks over [start, end) into segments; name null = not covered.
function resolveLifeCycle(blocks, start, end, highPriority) {
  const points = new Set([start, end]);
  for (const b of blocks) {
    if (b.start > start && b.start < end) points.add(b.start);
    if (b.end > start && b.end < end) points.add(b.end);
  }
  const sorted = [...points].sort((x, y) => x - y);
  const segments = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const w = winnerAt(blocks, a, b, highPriority);
    const name = w ? w.name : null;
    const last = segments[segments.length - 1];
    if (last && last.name === name) last.end = b;
    else segments.push({ start: a, end: b, name });
  }
  return segments;
}

// The main night sleep for each date: the longest Sleep block ending on that date.
function mainSleepByEndDate(blocks) {
  const byDate = new Map();
  for (const b of blocks) {
    if (b.name !== 'Sleep') continue;
    const date = dateOf(b.end);
    const best = byDate.get(date);
    if (!best || b.end - b.start > best.end - best.start) byDate.set(date, b);
  }
  return byDate;
}

// Build the days the Life Cycle blocks and the user's taps cover.
// taps: [{ at, label }] where label null means "stop" (ends the current activity).
export function buildDays({ blocks, taps = [], labelMap = {}, cutoffHour = 4, highPriority = [] }) {
  if (!blocks.length) return [];
  const map = { ...DEFAULT_LABEL_MAP, ...labelMap };
  const label = (name) => map[name] ?? name;
  const sortedTaps = [...taps].sort((a, b) => a.at - b.at);
  const first = Math.min(...blocks.map((b) => b.start));
  const last = Math.max(...blocks.map((b) => b.end));
  const mainSleep = mainSleepByEndDate(blocks);

  const days = [];
  for (let d = dateOf(first); d <= dateOf(last); d = addDays(d, 1)) {
    const warnings = [];
    const dayStart = localMs(`${d} 00:00`) + cutoffHour * HOUR;
    const dayEnd = dayStart + 24 * HOUR;
    const wakeBlock = mainSleep.get(d);
    const nextSleep = mainSleep.get(addDays(d, 1));

    let start = wakeBlock ? wakeBlock.end : dayStart;
    let end = nextSleep ? nextSleep.start : dayEnd;
    const covered = blocks.filter((b) => b.end > start && b.start < end);
    if (!covered.length) continue;
    if (!wakeBlock) {
      start = Math.max(start, Math.min(...covered.map((b) => b.start)));
      warnings.push('No Sleep block ends on this day: the first block marks the start.');
    }
    if (!nextSleep) end = Math.min(end, Math.max(...covered.map((b) => b.end)));
    if (end <= start) continue;

    const lc = resolveLifeCycle(covered, start, end, highPriority);

    // Taps inside this day's own window (wake to the next sleep), each lasting until the next tap or the end of
    // the Life Cycle span it started in.
    const dayTaps = sortedTaps.filter((t) => t.at >= start && t.at < end);
    const overlays = [];
    for (let i = 0; i < dayTaps.length; i++) {
      const t = dayTaps[i];
      const span = lc.find((s) => s.start <= t.at && t.at < s.end);
      if (!span || t.label == null) continue;
      const next = dayTaps[i + 1];
      const stop = Math.min(next ? next.at : Infinity, span.end);
      if (stop > t.at) overlays.push({ start: t.at, end: stop, label: t.label });
    }

    // Lay the taps over the Life Cycle segments.
    const points = new Set([start, end]);
    for (const s of lc) { points.add(s.start); points.add(s.end); }
    for (const o of overlays) { points.add(o.start); points.add(o.end); }
    const sorted = [...points].filter((p) => p >= start && p <= end).sort((a, b) => a - b);
    const segments = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const [a, b] = [sorted[i], sorted[i + 1]];
      const tap = overlays.find((o) => o.start <= a && o.end >= b);
      const span = lc.find((s) => s.start <= a && s.end >= b);
      let seg;
      if (tap) seg = { label: tap.label, source: 'tap' };
      else if (span.name === null || span.name === 'Home') seg = { label: null, source: 'gap' };
      else seg = { label: label(span.name), source: 'lifecycle' };
      const prev = segments[segments.length - 1];
      if (prev && prev.label === seg.label && prev.source === seg.source) prev.end = b;
      else segments.push({ start: a, end: b, ...seg });
    }

    absorbTinyGaps(segments);

    days.push({
      date: d,
      day_name: frenchDayName(d),
      wake_time: toHM(start),
      sleep_time: nextSleep ? toHM(nextSleep.start) : null,
      activities: segments
        .filter((s) => s.source !== 'gap')
        .map((s) => ({ activity: s.label, start: toHM(s.start), end: toHM(s.end) })),
      gaps: segments.filter((s) => s.source === 'gap').map((s) => ({ start: s.start, end: s.end })),
      warnings,
      _segments: segments,
    });
  }
  return days;
}

// Life Cycle blocks often sit a few seconds apart; that is not a gap worth showing.
function absorbTinyGaps(segments) {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.source !== 'gap' || s.end - s.start >= MINUTE) continue;
    if (i > 0) segments[i - 1].end = s.end;
    else if (segments[i + 1]) segments[i + 1].start = s.start;
    else continue;
    segments.splice(i, 1);
    i--;
  }
  for (let i = 1; i < segments.length; i++) {
    const [p, s] = [segments[i - 1], segments[i]];
    if (p.label === s.label && p.source === s.source) { p.end = s.end; segments.splice(i, 1); i--; }
  }
}

// The export has no holes: the notebook rebuilds each day from wake time plus durations.
export function fillGapsForExport(day) {
  const { _segments, ...rest } = day;
  const activities = _segments.map((s) => ({
    activity: s.source === 'gap' ? UNKNOWN_LABEL : s.label,
    start: toHM(s.start),
    end: toHM(s.end),
  }));
  return { ...rest, activities, gaps: [] };
}

// buildDays for an app state. The result is reused while the inputs are the same
// objects (state updates are immutable), so redraws and task edits cost nothing.
let cached = { key: null, days: null };
export function buildDaysFromState(state) {
  const key = [state.blocks, state.taps, state.labelMap, state.cutoffHour, state.highPriority];
  if (cached.key && key.every((part, i) => part === cached.key[i])) return cached.days;
  const days = buildDays({
    blocks: state.blocks,
    taps: state.taps,
    labelMap: state.labelMap,
    highPriority: state.highPriority,
    cutoffHour: state.cutoffHour,
  });
  cached = { key, days };
  return days;
}
