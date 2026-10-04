import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSettings, applySettings, settingsFromState } from '../core/settings.js';
import { defaultState } from '../core/store.js';

const sample = {
  version: 1,
  activities: ['Alpha', 'Beta'],
  labelMap: { Work: 'Office' },
  highPriority: ['Gym'],
  cutoffHour: 5,
  exportFrom: '2026-03-01',
  backfillDays: 5,
};

test('a valid settings file is read as it is', () => {
  assert.deepEqual(parseSettings(JSON.stringify(sample)), sample);
});

test('applying settings replaces only the fields the file contains', () => {
  const s = applySettings(defaultState(), parseSettings(JSON.stringify({ version: 1, labelMap: { Work: 'Office' } })));
  assert.deepEqual(s.labelMap, { Work: 'Office' });
  assert.deepEqual(s.activities, defaultState().activities);
});

test('all fields of a full file are applied', () => {
  const s = applySettings(defaultState(), sample);
  assert.deepEqual([s.activities, s.labelMap, s.highPriority, s.cutoffHour, s.exportFrom],
    [['Alpha', 'Beta'], { Work: 'Office' }, ['Gym'], 5, '2026-03-01']);
});

test('settings exported from a state read back identically', () => {
  const s = applySettings(defaultState(), sample);
  assert.deepEqual(parseSettings(JSON.stringify(settingsFromState(s))), settingsFromState(s));
});

test('a file that is not JSON is rejected with a readable message', () => {
  assert.throws(() => parseSettings('not json'), /not valid JSON/i);
});

test('an unsupported version is rejected', () => {
  assert.throws(() => parseSettings(JSON.stringify({ version: 9 })), /version/i);
});

test('wrong field types are rejected and name the field', () => {
  assert.throws(() => parseSettings(JSON.stringify({ version: 1, activities: 'Work' })), /activities/);
  assert.throws(() => parseSettings(JSON.stringify({ version: 1, labelMap: { Work: 3 } })), /labelMap/);
  assert.throws(() => parseSettings(JSON.stringify({ version: 1, cutoffHour: 40 })), /cutoffHour/);
  assert.throws(() => parseSettings(JSON.stringify({ version: 1, exportFrom: 'tomorrow' })), /exportFrom/);
});

test('an unknown field is rejected, so a typo does not silently do nothing', () => {
  assert.throws(() => parseSettings(JSON.stringify({ version: 1, activitys: [] })), /activitys/);
});

test('the backfill horizon must be a whole number of at least 1', () => {
  for (const bad of [0, -2, 1.5, '7']) {
    assert.throws(() => parseSettings(JSON.stringify({ version: 1, backfillDays: bad })), /backfillDays/);
  }
});

test('the backfill horizon round-trips through export and import', () => {
  const s = applySettings(defaultState(), parseSettings(JSON.stringify({ version: 1, backfillDays: 10 })));
  assert.equal(settingsFromState(s).backfillDays, 10);
  assert.equal(defaultState().backfillDays, 7);
});
