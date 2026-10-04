import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoff, dayDigest, pendingExportDays } from '../core/export.js';
import { defaultState, addTap } from '../core/store.js';
import { localMs } from '../core/time.js';

const blk = (start, end, name) => ({ start: localMs(start), end: localMs(end), name, location: '' });
const withBlocks = (blocks) => ({ ...defaultState(), blocks, exportFrom: '2026-03-02' });
const NOW = localMs('2026-03-03 21:00');

const blocks = [
  blk('2026-03-01 23:30', '2026-03-02 07:00', 'Sleep'),
  blk('2026-03-02 07:00', '2026-03-02 08:40', 'Home'),
  blk('2026-03-02 08:40', '2026-03-02 17:00', 'Work'),
  blk('2026-03-02 17:00', '2026-03-03 07:10', 'Home'),
  blk('2026-03-02 23:30', '2026-03-03 07:10', 'Sleep'),
  blk('2026-03-03 07:10', '2026-03-03 20:50', 'Home'),
];

test('the hand-off holds finished days with no hole and no gap list', () => {
  const h = buildHandoff(withBlocks(blocks), NOW);
  assert.equal(h.version, 1);
  const d = h.days.find((x) => x.date === '2026-03-02');
  assert.equal(d.gaps, undefined);
  assert.equal(d._segments, undefined);
  let cursor = d.wake_time;
  for (const a of d.activities) { assert.equal(a.start, cursor); cursor = a.end; }
  assert.ok(d.activities.some((a) => a.activity === 'Non renseigné'));
});

test('days before the export start date are not included', () => {
  const h = buildHandoff({ ...withBlocks(blocks), exportFrom: '2026-03-03' }, NOW);
  assert.deepEqual(h.days.map((d) => d.date), ['2026-03-03']);
});

test('an evening day is handed off with a null sleep time', () => {
  const h = buildHandoff(withBlocks(blocks), NOW);
  const d = h.days.find((x) => x.date === '2026-03-03');
  assert.equal(d.sleep_time, null);
});

test('a day exported with the same content is skipped, and comes back when its content changes', () => {
  const first = buildHandoff(withBlocks(blocks), NOW);
  const exportedDays = Object.fromEntries(first.days.map((d) => [d.date, { digest: dayDigest(d), at: 1 }]));
  const s = { ...withBlocks(blocks), exportedDays };
  assert.deepEqual(pendingExportDays(s, '2026-03-03'), []);
  // the user fills a gap afterwards: that day is pending again, however old it is
  const filled = addTap(s, localMs('2026-03-02 17:30'), 'Reading');
  assert.deepEqual(pendingExportDays(filled, '2026-03-30'), ['2026-03-02']);
});

test('the task lists travel with the hand-off', () => {
  const s = withBlocks(blocks);
  const h = buildHandoff(s, NOW);
  assert.deepEqual(h.tasks, s.tasks);
});

test('taps are part of the finished days', () => {
  const s = addTap(withBlocks(blocks), localMs('2026-03-03 10:00'), 'Gaming');
  const h = buildHandoff(s, NOW);
  assert.ok(h.days.find((d) => d.date === '2026-03-03').activities.some((a) => a.activity === 'Gaming'));
});

test('with no export start date, the whole imported history is handed off', () => {
  const s = { ...defaultState(), blocks };
  const h = buildHandoff(s, NOW);
  assert.deepEqual(h.days.map((d) => d.date), ['2026-03-02', '2026-03-03']);
});
