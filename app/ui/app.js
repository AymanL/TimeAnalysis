import { createBrowserStore, loadAppState, saveAppState } from '../core/store.js';
import { nowLocalMs } from '../core/time.js';
import { dueForReview } from '../core/tasks.js';
import { daysWithGaps } from './viewmodel.js';
import * as today from './today.js';
import * as backfill from './backfill.js';
import * as tasks from './tasks.js';
import * as settings from './settings.js';

const VERSION = '0.1.0';
const SCREENS = { today, backfill, tasks, settings };
const store = createBrowserStore();
const ui = { tab: 'today' };
let current;
let actionTable = {};

const $screen = document.getElementById('screen');
const $tabs = document.getElementById('tabs');
const $file = document.getElementById('file');
const $settingsFile = document.getElementById('settings-file');

const nowFn = nowLocalMs;
const TAB_LABELS = { today: 'Today', backfill: 'Backfill', tasks: 'Tasks', settings: 'Settings' };

// Plain function: an updater that throws (a missing reason, an overlapping fill)
// throws here, inside the caller's try/catch. Only the save is asynchronous.
function setState(fn, { rerender = true } = {}) {
  current = fn(current);
  if (rerender) render();
  return saveAppState(store, current).catch((err) => console.error('Could not save', err));
}

function context() {
  return { state: () => current, now: nowFn, setState, ui, rerender: render, pickFile: () => $file.click(), pickSettingsFile: () => $settingsFile.click() };
}

function render() {
  const screen = SCREENS[ui.tab];
  const scroll = window.scrollY;
  $screen.innerHTML = screen.render({ state: current, now: nowFn(), ui, version: VERSION });
  actionTable = { goto: (d) => { ui.tab = d.tab; render(); window.scrollTo(0, 0); }, ...screen.actions(context()) };
  const day = today.todayDate(current, nowFn());
  const due = dueForReview(current.tasks, day).length;
  const gaps = daysWithGaps(current).length;
  for (const b of $tabs.querySelectorAll('button')) {
    b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
    const badge = b.dataset.tab === 'tasks' ? due : b.dataset.tab === 'backfill' ? gaps : 0;
    b.innerHTML = `${TAB_LABELS[b.dataset.tab]}${badge ? `<span class="badge">${badge}</span>` : ''}`;
  }
  window.scrollTo(0, scroll);
}

function run(el, event) {
  if (!current) return; // still loading
  const fn = actionTable[el.dataset.action];
  if (fn) fn(el.dataset, el, event);
}

document.addEventListener('click', (e) => {
  if (!current) return;
  const tab = e.target.closest('#tabs [data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('button[data-action]');
  if (el) run(el, e);
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'reason') ui.reasonDraft = { id: e.target.dataset.id, text: e.target.value };
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && current) render(); // a resumed app shows the current time and day
});
document.addEventListener('submit', (e) => {
  const el = e.target.closest('form[data-action]');
  if (el) run(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('input[data-action]');
  if (el) run(el, e);
});

$file.addEventListener('change', async () => {
  const file = $file.files[0];
  if (!file) return;
  backfill.handleImport(await file.text(), context());
  $file.value = '';
  ui.tab = 'backfill';
  render();
});

$settingsFile.addEventListener('change', async () => {
  const file = $settingsFile.files[0];
  if (!file) return;
  settings.handleSettingsImport(await file.text(), context());
  $settingsFile.value = '';
  ui.tab = 'settings';
  render();
});

async function start() {
  current = await loadAppState(store);
  // The installed home-screen app keeps its data; a browser tab can be cleared by iOS.
  navigator.storage?.persist?.().catch(() => {});
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !standalone) {
    const banner = document.getElementById('banner');
    banner.hidden = false;
    banner.textContent = 'You are in a browser tab. Open the app from your home screen: it keeps its data separately.';
  }
  // Evening open, or anything pending, lands on what needs doing.
  const hour = new Date().getHours();
  const day = today.todayDate(current, nowFn());
  if (dueForReview(current.tasks, day).length) ui.tab = 'tasks';
  else if (hour >= 19 && (daysWithGaps(current).length || current.blocks.length === 0)) ui.tab = 'backfill';
  render();
  setInterval(() => { if (ui.tab === 'today' && !document.hidden) render(); }, 30000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
