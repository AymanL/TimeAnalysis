import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDays, buildDaysFromState, fillGapsForExport } from '../core/timeline.js';
import { defaultState, addTap } from '../core/store.js';
import { localMs, toHM } from '../core/time.js';

const T = (s) => localMs(s);
const blk = (start, end, name, location = '') => ({ start: T(start), end: T(end), name, location });
const tap = (at, label) => ({ at: T(at), label });
const acts = (day) => day.activities.map((a) => `${a.activity} ${a.start}-${a.end}`);
const gaps = (day) => day.gaps.map((g) => `${toHM(g.start)}-${toHM(g.end)}`);

// A workday: slept 00:30-07:00 (Home overlaps it), then commute, work, home.
const base = [
  blk('2026-03-01 21:00', '2026-03-02 08:40', 'Home'),
  blk('2026-03-02 00:30', '2026-03-02 07:00', 'Sleep'),
  blk('2026-03-02 08:40', '2026-03-02 08:55', 'Commute to work'),
  blk('2026-03-02 08:55', '2026-03-02 12:20', 'Work'),
  blk('2026-03-02 12:20', '2026-03-02 18:00', 'Home'),
  blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
  blk('2026-03-02 18:00', '2026-03-03 08:00', 'Home'),
];
const day = (blocks, taps = [], opts = {}) =>
  buildDays({ blocks, taps, ...opts }).find((d) => d.date === '2026-03-02');

test('wake and sleep times come from the main night sleep', () => {
  const d = day(base);
  assert.equal(d.wake_time, '07:00');
  assert.equal(d.sleep_time, '23:30');
  assert.equal(d.day_name, 'Lundi');
});

test('Covers AE1. a Scroll tap inside Work, ended by a Work tap, splits the work block', () => {
  const d = day(base, [tap('2026-03-02 11:00', 'Scroll'), tap('2026-03-02 11:15', 'Work')]);
  const a = acts(d);
  assert.ok(a.includes('Work 08:55-11:00'), a.join('|'));
  assert.ok(a.includes('Scroll 11:00-11:15'), a.join('|'));
  assert.ok(a.includes('Work 11:15-12:20'), a.join('|'));
});

test('Work counts as Work and Commute as Commute by default', () => {
  const a = acts(day(base));
  assert.ok(a.includes('Commute 08:40-08:55'));
  assert.ok(a.includes('Work 08:55-12:20'));
});

test('Covers AE2. Home with Gaming from 15:00 and Reading from 16:00 leaves two gaps', () => {
  const blocks = [
    blk('2026-03-02 07:00', '2026-03-02 23:30', 'Home'),
    blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
    blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
  ];
  const d = day(blocks, [tap('2026-03-02 15:00', 'Gaming'), tap('2026-03-02 16:00', 'Reading'), tap('2026-03-02 18:00', null)]);
  assert.deepEqual(gaps(d), ['07:00-15:00', '18:00-23:30']);
});

test('Covers AE4. a tap inside a Home block replaces Home from that moment on', () => {
  const blocks = [
    blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
    blk('2026-03-02 14:00', '2026-03-02 18:00', 'Home'),
    blk('2026-03-02 07:00', '2026-03-02 14:00', 'Work'),
    blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
    blk('2026-03-02 18:00', '2026-03-02 23:30', 'Friends'),
  ];
  const d = day(blocks, [tap('2026-03-02 15:00', 'Gaming')]);
  const a = acts(d);
  assert.ok(a.includes('Gaming 15:00-18:00'), a.join('|'));
  assert.deepEqual(gaps(d), ['14:00-15:00']);
});

test('Sleep inside a Home block is sleep and never a gap', () => {
  const d = day(base);
  assert.deepEqual(gaps(d), ['07:00-08:40', '12:20-23:30']);
});

test('a Walk overlapping a Commute resolves to the Commute', () => {
  const blocks = base.concat([blk('2026-03-02 08:41', '2026-03-02 08:54', 'Walk')]);
  const a = acts(day(blocks));
  assert.ok(a.includes('Commute 08:40-08:55'), a.join('|'));
  assert.ok(!a.some((x) => x.startsWith('Walk')));
});

test('Work overlapping Commute to home resolves to Work', () => {
  const blocks = base.concat([blk('2026-03-02 12:00', '2026-03-02 12:30', 'Commute to home')]);
  const a = acts(day(blocks));
  assert.ok(a.includes('Work 08:55-12:20'), a.join('|'));
});

test('a tap at 22:00 stops where a later Sleep block starts', () => {
  const d = day(base, [tap('2026-03-02 22:00', 'Gaming')]);
  const a = acts(d);
  assert.ok(a.includes('Gaming 22:00-23:30'), a.join('|'));
});

test('a tap before a Commute inside the Home block stops where the Commute starts', () => {
  const blocks = base.concat([blk('2026-03-02 17:00', '2026-03-02 17:20', 'Commute to home')]);
  const d = day(blocks, [tap('2026-03-02 16:00', 'Reading')]);
  assert.ok(acts(d).includes('Reading 16:00-17:00'), acts(d).join('|'));
});

test('a stretch Life Cycle does not cover is reported as a gap', () => {
  const blocks = [
    blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
    blk('2026-03-02 07:00', '2026-03-02 20:00', 'Work'),
    blk('2026-03-02 20:30', '2026-03-02 23:30', 'Home'),
    blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
  ];
  // the uncovered 20:00-20:30 joins the Home time after it into one gap
  assert.deepEqual(gaps(day(blocks)), ['20:00-23:30']);
});

test('an unmapped Life Cycle name passes through as its own label', () => {
  const blocks = base.concat([blk('2026-03-02 12:25', '2026-03-02 12:50', 'Run')]);
  assert.ok(acts(day(blocks)).some((x) => x.startsWith('Run 12:25')));
});

test('the label table can be edited and applies to the next build', () => {
  const d = day(base, [], { labelMap: { Work: 'Bureau' } });
  assert.ok(acts(d).includes('Bureau 08:55-12:20'));
});

test('a night with three Sleep fragments picks the longest as the main sleep, and a daytime Sleep becomes Nap', () => {
  const blocks = [
    blk('2026-03-02 00:00', '2026-03-02 01:00', 'Sleep'),
    blk('2026-03-02 01:30', '2026-03-02 06:30', 'Sleep'),
    blk('2026-03-02 06:40', '2026-03-02 07:00', 'Sleep'),
    blk('2026-03-01 21:00', '2026-03-03 08:00', 'Home'),
    blk('2026-03-02 14:00', '2026-03-02 14:40', 'Sleep'),
    blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
  ];
  const d = day(blocks);
  assert.equal(d.wake_time, '06:30');
  assert.ok(acts(d).includes('Nap 14:00-14:40'), acts(d).join('|'));
});

test('a day crossing midnight keeps its date and ordered times', () => {
  const blocks = base.map((b) => b).concat([blk('2026-03-03 00:10', '2026-03-03 06:50', 'Sleep')]);
  const d = day(blocks.filter((b) => !(b.name === 'Sleep' && toHM(b.start) === '23:30')));
  assert.equal(d.sleep_time, '00:10');
  assert.equal(d.date, '2026-03-02');
});

test('a day with no Sleep block uses the first and last block as its bounds and warns', () => {
  const blocks = [blk('2026-03-02 09:00', '2026-03-02 12:00', 'Work'), blk('2026-03-02 12:00', '2026-03-02 18:00', 'Home')];
  const d = day(blocks);
  assert.equal(d.wake_time, '09:00');
  assert.equal(d.sleep_time, null);
  assert.ok(d.warnings.some((w) => /Sleep/.test(w)));
});

test('an evening import of a partial day then a fuller export leaves one day with the sleep time filled in', () => {
  const partial = [
    blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
    blk('2026-03-02 07:00', '2026-03-02 19:12', 'Home'),
  ];
  const full = [
    blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
    blk('2026-03-02 07:00', '2026-03-03 08:30', 'Home'),
    blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
  ];
  assert.equal(day(partial).sleep_time, null);
  assert.equal(day(full).sleep_time, '23:30');
});

test('a tap made at 00:30 belongs to the previous day and one at 04:30 to the new day', () => {
  const blocks = [
    blk('2026-03-01 07:00', '2026-03-03 08:00', 'Home'),
  ];
  const days = buildDays({ blocks, taps: [tap('2026-03-03 00:30', 'Gaming'), tap('2026-03-03 04:30', 'Reading')], cutoffHour: 4 });
  const d2 = days.find((d) => d.date === '2026-03-02');
  const d3 = days.find((d) => d.date === '2026-03-03');
  assert.ok(d2.activities.some((a) => a.activity === 'Gaming'));
  assert.ok(d3.activities.some((a) => a.activity === 'Reading'));
});

test('export fills every gap with Non renseigné and leaves no hole', () => {
  const d = fillGapsForExport(day(base));
  let cursor = d.wake_time;
  for (const a of d.activities) {
    assert.equal(a.start, cursor, `hole before ${a.activity} ${a.start}`);
    cursor = a.end;
  }
  assert.ok(d.activities.some((a) => a.activity === 'Non renseigné'));
});

test('a gap shorter than a minute between two blocks is absorbed, not reported', () => {
  const blocks = [
    blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
    { start: T('2026-03-02 08:55'), end: T('2026-03-02 12:20') + 12000, name: 'Work', location: '' },
    { start: T('2026-03-02 12:20') + 25000, end: T('2026-03-02 23:30'), name: 'Friends', location: '' },
    blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
  ];
  const d = day(blocks);
  assert.ok(!d.gaps.some((g) => g.end - g.start < 60000), JSON.stringify(d.gaps));
  assert.ok(!acts(d).some((x) => x.includes('12:20-12:20')));
});

test('building from a state is reused for the same inputs and rebuilt when taps change', () => {
  const state = { ...defaultState(), blocks: base };
  const first = buildDaysFromState(state);
  assert.equal(buildDaysFromState({ ...state, exportedDays: { x: 1 } }), first); // unrelated change: reuse
  const tapped = addTap(state, T('2026-03-02 22:00'), 'Gaming');
  const second = buildDaysFromState(tapped);
  assert.notEqual(second, first);
  assert.ok(second.find((d) => d.date === '2026-03-02').activities.some((a) => a.activity === 'Gaming'));
  assert.ok(!first.find((d) => d.date === '2026-03-02').activities.some((a) => a.activity === 'Gaming'));
});

test('a tap made after the cutoff hour but before sleep belongs to the day it falls in', () => {
  const blocks = [
    blk('2026-03-01 00:30', '2026-03-02 08:00', 'Sleep'),
    blk('2026-03-02 08:00', '2026-03-03 04:10', 'Work'),
    blk('2026-03-03 04:10', '2026-03-03 05:00', 'Home'),
    blk('2026-03-03 05:00', '2026-03-03 12:00', 'Sleep'),
  ];
  const d = day(blocks, [tap('2026-03-03 04:20', 'Gaming')]);
  assert.ok(acts(d).includes('Gaming 04:20-05:00'), acts(d).join('|'));
});

test('a Life Cycle name listed as high priority wins an overlap it would otherwise lose', () => {
  // Gym starts first, so the later-starting Walk wins unless Gym is high priority
  const blocks = base.concat([
    blk('2026-03-02 17:10', '2026-03-02 17:50', 'Gym'),
    blk('2026-03-02 17:20', '2026-03-02 17:40', 'Walk'),
  ]);
  const plain = acts(day(blocks));
  assert.ok(plain.includes('Walk 17:20-17:40'), plain.join('|'));
  const prioritised = acts(day(blocks, [], { highPriority: ['Gym'] }));
  assert.ok(prioritised.includes('Gym 17:10-17:50'), prioritised.join('|'));
  assert.ok(!prioritised.some((a) => a.startsWith('Walk')));
});
