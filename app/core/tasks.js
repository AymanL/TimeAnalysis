import { addDays, dateOf, weekdayIndex } from './time.js';

const PERIOD_ORDER = { day: 0, week: 1, month: 2 };

export const emptyTasks = () => ({ tasks: [], seq: 0 });

export function periodKeyFor(period, isoDate) {
  if (period === 'day') return isoDate;
  if (period === 'month') return isoDate.slice(0, 7);
  return addDays(isoDate, -weekdayIndex(isoDate));
}

// The last calendar day a period covers.
function lastDayOf(period, key) {
  if (period === 'day') return key;
  if (period === 'week') return addDays(key, 6);
  const [year, month] = key.split('-').map(Number);
  return dateOf(Date.UTC(year, month, 0)); // day 0 of the next month is the last day of this one
}

const hasEnded = (task, today) => lastDayOf(task.period, task.periodKey) < today;

const update = (state, id, fn) => ({
  ...state,
  tasks: state.tasks.map((t) => (t.id === id ? fn(t) : t)),
});

export function addTask(state, { title, period, date }) {
  const text = String(title ?? '').trim();
  if (!text) throw new Error('A task needs a title.');
  const task = {
    id: `task-${state.seq + 1}`,
    title: text,
    period,
    periodKey: periodKeyFor(period, date),
    done: false,
    status: 'open',
    reasons: [],
  };
  return { ...state, seq: state.seq + 1, tasks: [...state.tasks, task] };
}

export const editTask = (state, id, changes) =>
  update(state, id, (t) => ({ ...t, ...(changes.title !== undefined ? { title: String(changes.title).trim() } : {}) }));

export const toggleDone = (state, id) => update(state, id, (t) => ({ ...t, done: !t.done }));

export const removeTask = (state, id) => ({ ...state, tasks: state.tasks.filter((t) => t.id !== id) });

const isOpen = (t) => t.status === 'open' && !t.done;
const byPeriodThenKey = (a, b) =>
  PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period] || (a.periodKey < b.periodKey ? -1 : a.periodKey > b.periodKey ? 1 : 0);

// Undone tasks whose period has ended, shortest period first.
export function dueForReview(state, today) {
  return state.tasks.filter((t) => isOpen(t) && hasEnded(t, today)).sort(byPeriodThenKey);
}

// action: 'carry' | 'close' (both need a reason) | 'pending' (leave it for later).
export function reviewTask(state, id, { action, reason }, today) {
  if (action === 'pending') return state;
  const text = String(reason ?? '').trim();
  if (!text) throw new Error('A reason is required before a task can be carried or closed.');
  return update(state, id, (t) => {
    const reasons = [...t.reasons, { reason: text, period: t.period, periodKey: t.periodKey, reviewedOn: today }];
    if (action === 'close') return { ...t, status: 'closed', reasons };
    return { ...t, reasons, periodKey: periodKeyFor(t.period, today) };
  });
}

export function whatNow(state, today) {
  const open = state.tasks.filter(isOpen);
  const current = (period) => open.filter((t) => t.period === period && t.periodKey === periodKeyFor(period, today));
  return {
    day: current('day'),
    week: current('week'),
    month: current('month'),
    overdue: open.filter((t) => hasEnded(t, today)).sort(byPeriodThenKey),
  };
}

export function pastReasons(state) {
  return state.tasks
    .flatMap((t) => t.reasons.map((r) => ({ title: t.title, status: t.status, ...r })))
    .sort((a, b) => (a.reviewedOn < b.reviewedOn ? 1 : a.reviewedOn > b.reviewedOn ? -1 : 0));
}
