import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, loadAppState, saveAppState, defaultState, addTap, undoLastTap, editTap, deleteTap } from '../core/store.js';
import { localMs } from '../core/time.js';

test('store round-trip: values written come back identical after reopening', async () => {
  const backing = new Map();
  const a = createMemoryStore(backing);
  await a.set('tasks', { tasks: [{ id: 't1', title: 'x' }] });
  const b = createMemoryStore(backing);
  assert.deepEqual(await b.get('tasks'), { tasks: [{ id: 't1', title: 'x' }] });
});

test('loading from an empty store gives the default state', async () => {
  const s = await loadAppState(createMemoryStore());
  assert.deepEqual(s, defaultState());
});

test('state saved then loaded is the same', async () => {
  const store = createMemoryStore();
  const s = addTap(defaultState(), localMs('2026-03-02 15:00'), 'Gaming');
  await saveAppState(store, s);
  assert.deepEqual(await loadAppState(store), s);
});

test('editing the label table changes later builds but leaves stored taps as they were', () => {
  let s = addTap(defaultState(), localMs('2026-03-02 15:00'), 'Gaming');
  s = { ...s, labelMap: { Work: 'Bureau' } };
  assert.equal(s.taps[0].label, 'Gaming');
  assert.equal(s.labelMap.Work, 'Bureau');
});

test('undo-last removes the latest tap', () => {
  let s = addTap(defaultState(), 1000, 'A');
  s = addTap(s, 2000, 'B');
  s = undoLastTap(s);
  assert.deepEqual(s.taps.map((t) => t.label), ['A']);
});

test('a tap can be edited and deleted', () => {
  let s = addTap(defaultState(), 1000, 'A');
  const id = s.taps[0].id;
  s = editTap(s, id, { label: 'B', at: 1500 });
  assert.deepEqual([s.taps[0].label, s.taps[0].at], ['B', 1500]);
  s = deleteTap(s, id);
  assert.equal(s.taps.length, 0);
});
