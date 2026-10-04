import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyTasks, addTask, toggleDone, editTask, removeTask,
  periodKeyFor, dueForReview, reviewTask, whatNow, pastReasons,
} from '../core/tasks.js';

const TODAY = '2026-03-04'; // a Wednesday
const mk = (state, title, period, date) => addTask(state, { title, period, date });
const titles = (list) => list.map((t) => t.title);

test('period keys: a day is its date, a week starts on Monday, a month is year-month', () => {
  assert.equal(periodKeyFor('day', '2026-03-04'), '2026-03-04');
  assert.equal(periodKeyFor('week', '2026-03-04'), '2026-03-02');
  assert.equal(periodKeyFor('week', '2026-03-08'), '2026-03-02');
  assert.equal(periodKeyFor('month', '2026-03-04'), '2026-03');
});

test('add, edit, tick and remove tasks', () => {
  let s = mk(emptyTasks(), 'Write report', 'day', TODAY);
  const id = s.tasks[0].id;
  s = editTask(s, id, { title: 'Write the report' });
  s = toggleDone(s, id);
  assert.equal(s.tasks[0].title, 'Write the report');
  assert.equal(s.tasks[0].done, true);
  s = toggleDone(s, id);
  assert.equal(s.tasks[0].done, false);
  s = removeTask(s, id);
  assert.equal(s.tasks.length, 0);
});

test('Covers AE5. a week ending with two undone tasks lists both, and neither closes without a reason', () => {
  let s = emptyTasks();
  s = mk(s, 'A', 'week', '2026-03-02');
  s = mk(s, 'B', 'week', '2026-03-02');
  const due = dueForReview(s, '2026-03-09');
  assert.deepEqual(titles(due), ['A', 'B']);
  assert.throws(() => reviewTask(s, due[0].id, { action: 'close', reason: '  ' }, '2026-03-09'), /reason/i);
  assert.equal(s.tasks.every((t) => t.status === 'open'), true);
});

test('a week is not due for review until it has ended', () => {
  const s = mk(emptyTasks(), 'A', 'week', '2026-03-02');
  assert.equal(dueForReview(s, '2026-03-08').length, 0);
  assert.equal(dueForReview(s, '2026-03-09').length, 1);
});

test('done tasks are never due for review', () => {
  let s = mk(emptyTasks(), 'A', 'day', '2026-03-03');
  s = toggleDone(s, s.tasks[0].id);
  assert.equal(dueForReview(s, TODAY).length, 0);
});

test('a task closed at review stays readable later with its reason', () => {
  let s = mk(emptyTasks(), 'A', 'day', '2026-03-03');
  s = reviewTask(s, s.tasks[0].id, { action: 'close', reason: 'Too tired' }, TODAY);
  assert.equal(s.tasks[0].status, 'closed');
  assert.deepEqual(pastReasons(s).map((r) => r.reason), ['Too tired']);
});

test('a carried task reappears in the next period with its earlier reason still attached', () => {
  let s = mk(emptyTasks(), 'A', 'day', '2026-03-03');
  s = reviewTask(s, s.tasks[0].id, { action: 'carry', reason: 'Meeting ran long' }, TODAY);
  const t = s.tasks[0];
  assert.equal(t.status, 'open');
  assert.equal(t.periodKey, TODAY);
  assert.equal(t.reasons[0].reason, 'Meeting ran long');
  assert.equal(dueForReview(s, TODAY).length, 0);
  assert.deepEqual(titles(whatNow(s, TODAY).day), ['A']);
});

test('a pending task stays open and overdue, and is never closed without a reason', () => {
  const s = mk(emptyTasks(), 'A', 'day', '2026-03-03');
  const pending = reviewTask(s, s.tasks[0].id, { action: 'pending' }, TODAY);
  assert.equal(pending.tasks[0].status, 'open');
  const now = whatNow(pending, TODAY);
  assert.equal(now.overdue.length, 1);
  assert.equal(now.overdue[0].title, 'A');
});

test('when a day, week and month end together the day tasks come first', () => {
  let s = emptyTasks();
  s = mk(s, 'Month', 'month', '2026-02-10');
  s = mk(s, 'Week', 'week', '2026-02-23');
  s = mk(s, 'Day', 'day', '2026-02-28');
  assert.deepEqual(titles(dueForReview(s, '2026-03-02')), ['Day', 'Week', 'Month']);
});

test('what now shows the day tasks plus open week and month tasks, and hides closed and done ones', () => {
  let s = emptyTasks();
  s = mk(s, 'Today', 'day', TODAY);
  s = mk(s, 'This week', 'week', '2026-03-02');
  s = mk(s, 'This month', 'month', TODAY);
  s = mk(s, 'Tomorrow', 'day', '2026-03-05');
  s = mk(s, 'Finished', 'day', TODAY);
  s = toggleDone(s, s.tasks[4].id);
  const now = whatNow(s, TODAY);
  assert.deepEqual(titles(now.day), ['Today']);
  assert.deepEqual(titles(now.week), ['This week']);
  assert.deepEqual(titles(now.month), ['This month']);
});

test('nothing is due for review when no task is undone', () => {
  assert.equal(dueForReview(emptyTasks(), TODAY).length, 0);
});
