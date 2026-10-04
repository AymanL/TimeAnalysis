import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tapActivity, stopActivity, currentActivity, fillGap, daysWithGaps, backfillQueue, importLifeCycle, unmappedNames } from '../ui/viewmodel.js';
import { defaultState } from '../core/store.js';
import { buildDays } from '../core/timeline.js';
import { localMs, toHM } from '../core/time.js';

const T = (s) => localMs(s);
const blk = (start, end, name) => ({ start: T(start), end: T(end), name, location: '' });
const HOME_DAY = [
  blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
  blk('2026-03-02 07:00', '2026-03-02 23:30', 'Home'),
  blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
];
const withHome = () => ({ ...defaultState(), blocks: HOME_DAY });
const gapsOf = (s, date = '2026-03-02') => buildDays({ blocks: s.blocks, taps: s.taps, cutoffHour: 4 }).find((d) => d.date === date).gaps;
const hm = (g) => `${toHM(g.start)}-${toHM(g.end)}`;

test('tapping an activity records it at the tap time', () => {
  const s = tapActivity(defaultState(), 'Gaming', T('2026-03-02 15:00'));
  assert.deepEqual(s.taps.map((t) => [t.label, t.at]), [['Gaming', T('2026-03-02 15:00')]]);
});

test('tapping the same activity twice does not create a second block', () => {
  let s = tapActivity(defaultState(), 'Gaming', T('2026-03-02 15:00'));
  s = tapActivity(s, 'Gaming', T('2026-03-02 15:05'));
  assert.equal(s.taps.length, 1);
});

test('the current activity and its elapsed minutes come from the latest tap', () => {
  let s = tapActivity(defaultState(), 'Gaming', T('2026-03-02 15:00'));
  assert.deepEqual(currentActivity(s, T('2026-03-02 15:42')), { label: 'Gaming', minutes: 42 });
  s = stopActivity(s, T('2026-03-02 16:00'));
  assert.equal(currentActivity(s, T('2026-03-02 16:10')), null);
});

test('with no tap yet there is no current activity', () => {
  assert.equal(currentActivity(defaultState(), T('2026-03-02 09:00')), null);
});

test('splitting a gap into two activities leaves no remaining gap', () => {
  let s = withHome();
  assert.deepEqual(gapsOf(s).map(hm), ['07:00-23:30']);
  s = fillGap(s, { start: T('2026-03-02 07:00'), end: T('2026-03-02 23:30') }, [
    { label: 'Reading', minutes: 60 },
    { label: 'Gaming', minutes: null }, // the rest of the gap
  ]);
  assert.deepEqual(gapsOf(s), []);
});

test('a partial fill leaves the rest of the gap open', () => {
  let s = withHome();
  s = fillGap(s, { start: T('2026-03-02 07:00'), end: T('2026-03-02 23:30') }, [{ label: 'Reading', minutes: 30 }]);
  assert.deepEqual(gapsOf(s).map(hm), ['07:30-23:30']);
});

test('a fill that runs over a Life Cycle boundary keeps filling the next stretch of the gap', () => {
  let s = { ...defaultState(), blocks: [
    blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
    blk('2026-03-02 07:00', '2026-03-02 10:00', 'Home'),
    blk('2026-03-02 11:00', '2026-03-02 23:30', 'Home'), // 10:00-11:00 is not covered
    blk('2026-03-02 23:30', '2026-03-03 06:50', 'Sleep'),
  ] };
  s = fillGap(s, { start: T('2026-03-02 07:00'), end: T('2026-03-02 11:00') }, [{ label: 'Work', minutes: null }]);
  assert.deepEqual(gapsOf(s).map(hm), ['11:00-23:30']);
});

test('a fill that would overlap an existing tap is rejected', () => {
  let s = withHome();
  s = tapActivity(s, 'Gaming', T('2026-03-02 09:00'));
  s = stopActivity(s, T('2026-03-02 10:00'));
  assert.throws(() => fillGap(s, { start: T('2026-03-02 08:00'), end: T('2026-03-02 11:00') }, [{ label: 'Reading', minutes: null }]), /overlap/i);
});

test('days with gaps are listed newest first, and a day without gaps is left out', () => {
  let s = { ...defaultState(), blocks: [
    blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
    blk('2026-03-02 07:00', '2026-03-03 07:00', 'Home'),
    blk('2026-03-02 23:30', '2026-03-03 07:00', 'Sleep'),
    blk('2026-03-03 07:00', '2026-03-04 07:00', 'Work'),
    blk('2026-03-03 23:30', '2026-03-04 07:00', 'Sleep'),
    blk('2026-03-04 07:00', '2026-03-05 07:00', 'Home'),
  ] };
  const listed = daysWithGaps(s).map((d) => d.date);
  assert.ok(listed.indexOf('2026-03-04') < listed.indexOf('2026-03-02'));
  assert.ok(!listed.includes('2026-03-03'));
});

test('importing Life Cycle rows adds them once and reports the days and blocks added', () => {
  const csv = 'START DATE(UTC), END DATE(UTC), START TIME(LOCAL), END TIME(LOCAL), DURATION, NAME, LOCATION, NOTE\n' +
    '2026-03-02 08:00:00, 2026-03-02 09:00:00, 2026-03-02 09:00:00 CET, 2026-03-02 10:00:00 CET, 3600, Work, , \n';
  const first = importLifeCycle(defaultState(), csv);
  assert.equal(first.summary.added, 1);
  const second = importLifeCycle(first.state, csv);
  assert.equal(second.summary.added, 0);
  assert.equal(second.state.blocks.length, 1);
});

test('names that have no mapping yet are listed for the label table', () => {
  const s = { ...defaultState(), blocks: [blk('2026-03-02 09:00', '2026-03-02 10:00', 'Run'), blk('2026-03-02 10:00', '2026-03-02 11:00', 'Work')] };
  assert.deepEqual(unmappedNames(s), ['Run', 'Work']);
});

test('tapping the same activity on a later day starts it again', () => {
  let s = tapActivity(defaultState(), 'Work', T('2026-03-02 09:00'));
  s = tapActivity(s, 'Work', T('2026-03-03 09:00'));
  assert.equal(s.taps.length, 2);
});

test('an activity tapped yesterday is not shown as running today', () => {
  const s = tapActivity(defaultState(), 'Work', T('2026-03-02 09:00'));
  assert.equal(currentActivity(s, T('2026-03-03 09:00')), null);
});

test('a gap after the 04:00 cutoff on a long day can be filled, and closes', () => {
  // slept until 08:00, out until 04:10 the next morning, then home until sleep at 05:00
  let s = { ...defaultState(), blocks: [
    blk('2026-03-01 00:30', '2026-03-02 08:00', 'Sleep'),
    blk('2026-03-02 08:00', '2026-03-03 04:10', 'Walk'),
    blk('2026-03-03 04:10', '2026-03-03 05:00', 'Home'),
    blk('2026-03-03 05:00', '2026-03-03 12:00', 'Sleep'),
  ] };
  const gapsOn = (st) => buildDays({ blocks: st.blocks, taps: st.taps, cutoffHour: 4 }).find((d) => d.date === '2026-03-02').gaps;
  assert.deepEqual(gapsOn(s).map(hm), ['04:10-05:00']);
  s = fillGap(s, { start: T('2026-03-03 04:10'), end: T('2026-03-03 05:00') }, [{ label: 'Scroll', minutes: null }]);
  assert.deepEqual(gapsOn(s), []);
  assert.ok(s.taps.length <= 2);
});

test('the backfill queue holds only days with gaps inside the horizon, newest first', () => {
  const gappy = (date) => [blk(`${date} 07:00`, `${date} 12:00`, 'Home')];
  const s = { ...defaultState(), backfillDays: 3, blocks: ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'].flatMap(gappy) };
  // Today is 03-05 with a 3-day window: 03-05, 03-04, 03-03. 03-02 is outside.
  assert.deepEqual(backfillQueue(s, '2026-03-05').map((d) => d.date), ['2026-03-05', '2026-03-04', '2026-03-03']);
});

test('filling the newest queued day brings the next one up', () => {
  const gappy = (date) => [blk(`${date} 07:00`, `${date} 12:00`, 'Home')];
  let s = { ...defaultState(), blocks: ['2026-03-03', '2026-03-04'].flatMap(gappy) };
  assert.equal(backfillQueue(s, '2026-03-04')[0].date, '2026-03-04');
  const gaps = backfillQueue(s, '2026-03-04')[0].gaps;
  for (const g of gaps) s = fillGap(s, g, [{ label: 'Reading', minutes: null }]);
  assert.equal(backfillQueue(s, '2026-03-04')[0].date, '2026-03-03');
});

test('a day just outside the horizon is not queued even when it has gaps', () => {
  const s = { ...defaultState(), backfillDays: 1, blocks: [blk('2026-03-04 07:00', '2026-03-04 12:00', 'Home')] };
  assert.deepEqual(backfillQueue(s, '2026-03-05'), []);
});
