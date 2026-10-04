import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLifeCycleCsv, mergeBlocks } from '../core/lifecycle.js';
import { toHM, dateOf, localMs } from '../core/time.js';

const HEADER = 'START DATE(UTC), END DATE(UTC), START TIME(LOCAL), END TIME(LOCAL), DURATION, NAME, LOCATION, NOTE\n';
const row = (start, end, name, loc = '') =>
  `2000-01-01 00:00:00, 2000-01-01 00:00:00, ${start}:00 CET, ${end}:00 CET, 0, ${name}, ${loc}, \n`;

test('reads local times, names and locations, including quoted fields', () => {
  const text = readFileSync(new URL('./fixtures/lc_sample.csv', import.meta.url), 'utf8');
  const blocks = parseLifeCycleCsv(text);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].name, 'Commute to work');
  assert.equal(toHM(blocks[0].start), '08:40');
  assert.equal(dateOf(blocks[1].start), '2026-03-02');
  assert.equal(blocks[2].location, 'Rue Exemple, 1');
});

test('a block crossing midnight keeps its start date and a later end', () => {
  const [b] = parseLifeCycleCsv(HEADER + row('2026-03-02 23:40', '2026-03-03 06:50', 'Sleep'));
  assert.equal(dateOf(b.start), '2026-03-02');
  assert.equal(dateOf(b.end), '2026-03-03');
  assert.equal(b.end - b.start, localMs('2026-03-03 06:50') - localMs('2026-03-02 23:40'));
});

test('Covers AE3. importing the same rows twice leaves one block each', () => {
  const text = HEADER + row('2026-03-02 08:55', '2026-03-02 12:20', 'Work') + row('2026-03-02 12:20', '2026-03-02 18:00', 'Home');
  const once = mergeBlocks([], parseLifeCycleCsv(text));
  const twice = mergeBlocks(once, parseLifeCycleCsv(text));
  assert.equal(twice.length, 2);
});

test('Covers AE3. a newer export repeating earlier days adds only the new blocks', () => {
  const old = HEADER + row('2026-03-02 08:55', '2026-03-02 12:20', 'Work');
  const newer = old + row('2026-03-02 12:20', '2026-03-02 18:00', 'Home');
  const merged = mergeBlocks(parseLifeCycleCsv(old), parseLifeCycleCsv(newer));
  assert.equal(merged.length, 2);
});

test('an open Home block that grew between exports keeps the later end only', () => {
  const evening = HEADER + row('2026-03-02 18:00', '2026-03-02 19:12', 'Home');
  const next = HEADER + row('2026-03-02 18:00', '2026-03-03 08:30', 'Home');
  const merged = mergeBlocks(parseLifeCycleCsv(evening), parseLifeCycleCsv(next));
  assert.equal(merged.length, 1);
  assert.equal(toHM(merged[0].end), '08:30');
  assert.equal(dateOf(merged[0].end), '2026-03-03');
});

test('a missing required column fails and names the column', () => {
  const bad = 'START DATE(UTC), END DATE(UTC), START TIME(LOCAL), DURATION, NAME\n';
  assert.throws(() => parseLifeCycleCsv(bad + 'x'), /END TIME\(LOCAL\)/);
});

test('an unknown column fails and names the column', () => {
  const bad = HEADER.trim() + ', MOOD\n';
  assert.throws(() => parseLifeCycleCsv(bad), /MOOD/);
});

test('rows with an unreadable time are reported with their line number', () => {
  const bad = HEADER + '2026-03-02 00:00:00, 2026-03-02 00:00:00, not-a-time, 2026-03-02 09:00:00 CET, 0, Work, , \n';
  assert.throws(() => parseLifeCycleCsv(bad), /line 2/);
});
