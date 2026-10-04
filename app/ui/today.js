import { HOUR, MINUTE, dayOf, localMs, pad, toHM, frenchDayName } from '../core/time.js';
import { deleteTap, editTap, undoLastTap } from '../core/store.js';
import { dueForReview } from '../core/tasks.js';
import { currentActivity, stopActivity, tapActivity } from './viewmodel.js';
import { dayMonth, esc } from './dom.js';

export const todayDate = (state, now) => dayOf(now, state.cutoffHour);

export function render({ state, now }) {
  const day = todayDate(state, now);
  const current = currentActivity(state, now);
  const due = dueForReview(state.tasks, day).length;
  const taps = state.taps
    .filter((t) => todayDate(state, t.at) === day)
    .sort((a, b) => a.at - b.at);

  return `
    <h1>${esc(frenchDayName(day))} ${esc(dayMonth(day))}</h1>
    ${due ? `<div class="card warn"><div class="row spread"><span>${due} task${due > 1 ? 's' : ''} to review</span><button class="primary" data-action="goto" data-tab="tasks">Review</button></div></div>` : ''}
    <div class="card">
      <div class="muted">Now</div>
      <div class="current">${current ? `${esc(current.label)} · ${Math.floor(current.minutes / 60)}h${pad(current.minutes % 60)}` : 'Nothing running'}</div>
      ${current ? '' : '<div class="muted">Tap an activity to start it.</div>'}
    </div>
    <div class="grid">
      ${state.activities.map((a) => `<button class="activity" data-action="tap" data-label="${esc(a)}" aria-pressed="${current?.label === a}">${esc(a)}</button>`).join('')}
    </div>
    <div class="row" style="margin-top:10px">
      <button data-action="stop">Stop</button>
      <button data-action="undo" ${taps.length ? '' : 'disabled'}>Undo last tap</button>
    </div>
    <h2>Today's taps</h2>
    ${taps.length ? `<ul class="plain">${taps.map((t) => `
      <li><span class="grow"><strong>${toHM(t.at)}</strong> ${t.label == null ? '<span class="muted">stop</span>' : esc(t.label)}</span>
        <button class="link" data-action="edit-tap" data-id="${esc(t.id)}">Edit</button>
        <button class="link danger" data-action="delete-tap" data-id="${esc(t.id)}">Delete</button></li>`).join('')}</ul>`
      : '<p class="muted">No taps yet today.</p>'}
  `;
}

export function actions({ state, now, setState }) {
  return {
    tap: (d) => setState((s) => tapActivity(s, d.label, now())),
    stop: () => setState((s) => stopActivity(s, now())),
    undo: () => setState(undoLastTap),
    'delete-tap': (d) => setState((s) => deleteTap(s, d.id)),
    'edit-tap': (d) => {
      const tap = state().taps.find((t) => t.id === d.id);
      if (!tap) return;
      const label = prompt('Activity (empty = stop)', tap.label ?? '');
      if (label === null) return;
      const time = prompt('Time (HH:MM)', toHM(tap.at));
      if (time === null || !/^\d{1,2}:\d{2}$/.test(time.trim())) return;
      const [h, m] = time.trim().split(':').map(Number);
      // keep the same day; a time before the cutoff hour belongs to the next calendar date
      const base = localMs(`${todayDate(state(), tap.at)} 00:00`);
      const at = base + (h < state().cutoffHour ? 24 * HOUR : 0) + (h * 60 + m) * MINUTE;
      setState((s) => editTap(s, d.id, { label: label.trim() || null, at }));
    },
  };
}
