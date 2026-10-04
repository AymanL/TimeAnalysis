import {
  addTask, dueForReview, editTask, pastReasons, periodKeyFor, removeTask, reviewTask, toggleDone, whatNow,
} from '../core/tasks.js';
import { todayDate } from './today.js';
import { esc } from './dom.js';

const PERIODS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
const PERIOD_KEYS = PERIODS.map(([key]) => key);
const PERIOD_NAME = Object.fromEntries(PERIODS);
const LABEL = { day: 'Today', week: 'This week', month: 'This month' };

const toggleButton = (t) =>
  `<button class="chip" data-action="toggle" data-id="${esc(t.id)}" aria-pressed="${t.done}" aria-label="Mark done">${t.done ? '✓' : '○'}</button>`;

// Compact row for the "What now" summary: tick it off, nothing else.
const summaryRow = (t, extra = '') => `
  <li class="${t.done ? 'done' : ''}">
    ${toggleButton(t)}
    <span class="grow">${esc(t.title)}${extra}</span>
  </li>`;

const taskRow = (t) => `
  <li class="${t.done ? 'done' : ''}">
    ${toggleButton(t)}
    <span class="grow">${esc(t.title)}${t.reasons.length ? `<div class="muted">Earlier: ${esc(t.reasons[t.reasons.length - 1].reason)}</div>` : ''}</span>
    <button class="link" data-action="edit" data-id="${esc(t.id)}">Edit</button>
    <button class="link danger" data-action="remove" data-id="${esc(t.id)}">Remove</button>
  </li>`;

export function render({ state, now, ui }) {
  const today = todayDate(state, now);
  const tasks = state.tasks;
  const period = ui.taskPeriod ?? 'day';
  const due = dueForReview(tasks, today);
  const nowList = whatNow(tasks, today);
  const inPeriod = tasks.tasks.filter((t) => t.status === 'open' && t.period === period && t.periodKey === periodKeyFor(period, today));
  const first = due.find((t) => !(ui.skipped ?? []).includes(t.id));
  const reasons = pastReasons(tasks);

  return `
    <h1>Tasks</h1>
    ${first ? `
    <div class="card warn">
      <div class="muted">Review · ${due.length} left</div>
      <p><strong>${esc(first.title)}</strong><br><span class="muted">${esc(PERIOD_NAME[first.period])} ${esc(first.periodKey)} ended without this being done.</span></p>
      <textarea id="reason" data-id="${esc(first.id)}" placeholder="Why was this not done?">${ui.reasonDraft?.id === first.id ? esc(ui.reasonDraft.text) : ''}</textarea>
      <div class="row" style="margin-top:8px">
        <button class="primary" data-action="review" data-id="${esc(first.id)}" data-choice="carry">Carry over</button>
        <button data-action="review" data-id="${esc(first.id)}" data-choice="close">Close</button>
        <button class="link" data-action="review" data-id="${esc(first.id)}" data-choice="pending">Later</button>
      </div>
    </div>` : ''}

    <div class="seg" role="group" aria-label="Period">
      ${PERIODS.map(([p, name]) => `<button data-action="period" data-period="${p}" aria-pressed="${p === period}">${name}</button>`).join('')}
    </div>
    <form class="row" data-action="add" style="margin-top:10px">
      <input type="text" id="new-task" placeholder="Add a ${period} task" style="flex:1" autocomplete="off">
      <button class="primary" type="submit">Add</button>
    </form>
    <div class="card">
      ${inPeriod.length ? `<ul class="plain">${inPeriod.map((t) => taskRow(t)).join('')}</ul>` : `<p class="muted">Nothing for ${LABEL[period].toLowerCase()} yet.</p>`}
    </div>

    <h2>What now</h2>
    ${PERIOD_KEYS.map((p) => nowList[p].length ? `
      <div class="card"><div class="muted">${LABEL[p]}</div>
      <ul class="plain">${nowList[p].map((t) => summaryRow(t)).join('')}</ul></div>` : '').join('')}
    ${nowList.overdue.length ? `<div class="card warn"><div class="muted">Overdue</div>
      <ul class="plain">${nowList.overdue.map((t) => summaryRow(t, ' <span class="badge">overdue</span>')).join('')}</ul></div>` : ''}
    ${!nowList.day.length && !nowList.week.length && !nowList.month.length && !nowList.overdue.length ? '<p class="muted">All clear. Add a task above when something comes to mind.</p>' : ''}

    <h2>Past reasons</h2>
    ${reasons.length ? `<div class="card"><ul class="plain">${reasons.map((r) => `
      <li><span class="grow"><strong>${esc(r.title)}</strong> <span class="muted">· ${esc(r.status)} · ${esc(r.reviewedOn)}</span><br>${esc(r.reason)}</span></li>`).join('')}</ul></div>`
      : '<p class="muted">No reasons written yet.</p>'}
  `;
}

export function actions({ state, now, setState, ui }) {
  const today = () => todayDate(state(), now());
  return {
    period: (d) => { ui.taskPeriod = d.period; setState((s) => s); },
    add: (d, el, ev) => {
      ev.preventDefault();
      const input = el.querySelector('#new-task');
      const title = input.value.trim();
      if (!title) return;
      setState((s) => ({ ...s, tasks: addTask(s.tasks, { title, period: ui.taskPeriod ?? 'day', date: today() }) }));
    },
    toggle: (d) => setState((s) => ({ ...s, tasks: toggleDone(s.tasks, d.id) })),
    remove: (d) => { if (confirm('Remove this task?')) setState((s) => ({ ...s, tasks: removeTask(s.tasks, d.id) })); },
    edit: (d) => {
      const task = state().tasks.tasks.find((t) => t.id === d.id);
      const title = prompt('Task', task?.title ?? '');
      if (title && title.trim()) setState((s) => ({ ...s, tasks: editTask(s.tasks, d.id, { title }) }));
    },
    review: (d) => {
      if (d.choice === 'pending') {
        ui.skipped = [...(ui.skipped ?? []), d.id];
        setState((s) => s);
        return;
      }
      const reason = document.getElementById('reason')?.value ?? '';
      try {
        setState((s) => ({ ...s, tasks: reviewTask(s.tasks, d.id, { action: d.choice, reason }, today()) }));
        ui.reasonDraft = null;
      } catch (err) {
        alert(err.message);
      }
    },
  };
}
