import { MINUTE, dateOf, toHM, frenchDayName } from '../core/time.js';
import { buildDaysFromState } from '../core/timeline.js';
import { buildHandoff, dayDigest, pendingExportDays } from '../core/export.js';
import { daysWithGaps, fillGap, importLifeCycle } from './viewmodel.js';
import { todayDate } from './today.js';
import { dayMonth, esc } from './dom.js';

const DURATIONS = [5, 15, 30, 60];
const gapKey = (g) => `${g.start}-${g.end}`;
const fmt = (ms) => `${Math.round(ms / MINUTE)} min`;

export function render({ state, now, ui }) {
  const today = todayDate(state, now);
  const missing = state.blocks.length === 0;
  const withGaps = daysWithGaps(state);
  const pending = pendingExportDays(state, today);
  const all = buildDaysFromState(state);
  const gapCount = (date) => all.find((d) => d.date === date)?.gaps.length ?? 0;
  const recent = all.filter((d) => d.date <= today).slice(-7).reverse();
  const lastExport = Math.max(0, ...Object.values(state.exportedDays).map((e) => e.at));

  return `
    <h1>Backfill</h1>
    <div class="card">
      <div class="row spread"><strong>Life Cycle</strong><button class="primary" data-action="pick-file">Import CSV</button></div>
      ${ui.importMessage ? `<p class="${ui.importError ? '' : 'muted'}" style="${ui.importError ? 'color:var(--danger)' : ''}">${esc(ui.importMessage)}</p>` : ''}
      ${missing ? '<p class="muted">Nothing imported yet. Export from Life Cycle (Settings → Advanced → Database → Export database), then import the file here.</p>' : `<p class="muted">${state.blocks.length} blocks stored.</p>`}
    </div>

    ${missing ? '' : `
    <h2>Recent days</h2>
    <div class="card"><ul class="plain">
      ${recent.map((d) => `<li><span class="grow">${esc(d.day_name)} ${esc(dayMonth(d.date))}</span>
        <span class="${d.gaps.length ? '' : 'muted'}">${d.gaps.length ? `${d.gaps.length} gap${d.gaps.length > 1 ? 's' : ''}` : '✓ complete'}</span></li>`).join('')}
    </ul></div>

    <h2>Gaps to fill</h2>
    ${withGaps.length === 0 ? '<p class="muted">No gaps left. Nice.</p>' : withGaps.map((d) => `
      <div class="card">
        <strong>${esc(d.day_name)} ${esc(dayMonth(d.date))}</strong>
        ${d.gaps.map((g) => `
          <div style="border-top:1px solid var(--line); margin-top:10px; padding-top:10px" data-gap="${gapKey(g)}">
            <div class="row spread"><span><strong>${toHM(g.start)}–${toHM(g.end)}</strong></span><span class="muted">${fmt(g.end - g.start)}</span></div>
            <label class="field">Activity
              <select data-role="activity">${state.activities.map((a) => `<option ${ui.gapActivity?.[gapKey(g)] === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
            </label>
            <div class="row">
              ${DURATIONS.map((m) => `<button class="chip" data-action="fill" data-start="${g.start}" data-end="${g.end}" data-minutes="${m}">${m} min</button>`).join('')}
              <button class="chip primary" data-action="fill" data-start="${g.start}" data-end="${g.end}" data-minutes="">Rest</button>
            </div>
          </div>`).join('')}
      </div>`).join('')}

    <h2>Export</h2>
    <div class="card">
      ${pending.length === 0 ? '<p class="muted">Nothing to export yet. Set the first export date in Settings if this is a fresh start.</p>' : `
      <ul class="plain">${pending.map((date) => `<li><span class="grow">${esc(frenchDayName(date))} ${esc(dayMonth(date))}</span>
        <span class="${gapCount(date) ? '' : 'muted'}">${gapCount(date) ? `${gapCount(date)} gap${gapCount(date) > 1 ? 's' : ''} → “Non renseigné”` : '✓'}</span></li>`).join('')}</ul>
      <div class="row" style="margin-top:10px"><button class="primary" data-action="export">Share hand-off file</button></div>`}
      ${lastExport ? `<p class="muted">Last exported ${esc(new Date(lastExport).toLocaleString())}</p>` : ''}
    </div>`}
  `;
}

export function actions({ state, now, setState, ui, rerender, pickFile }) {
  return {
    'pick-file': () => pickFile(),
    fill: (d, el) => {
      const card = el.closest('[data-gap]');
      const label = card.querySelector('[data-role=activity]').value;
      ui.gapActivity = { ...(ui.gapActivity ?? {}), [card.dataset.gap]: label };
      const minutes = d.minutes === '' ? null : Number(d.minutes);
      try {
        setState((s) => fillGap(s, { start: Number(d.start), end: Number(d.end) }, [{ label, minutes }]));
      } catch (err) {
        alert(err.message);
      }
    },
    export: async () => {
      const t = Date.now();
      const handoff = buildHandoff(state(), now());
      const included = handoff.days;
      const name = `handoff-${dateOf(now())}.json`;
      const file = new File([JSON.stringify(handoff, null, 2)], name, { type: 'application/json' });
      try {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
        else {
          const url = URL.createObjectURL(file);
          const a = Object.assign(document.createElement('a'), { href: url, download: name });
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        if (err.name === 'AbortError') return; // the user closed the share sheet
        alert(`Export failed: ${err.message}`);
        return;
      }
      setState((s) => ({ ...s, exportedDays: { ...s.exportedDays, ...Object.fromEntries(included.map((d) => [d.date, { digest: dayDigest(d), at: t }])) } }));
    },
  };
}

export function handleImport(text, { state, setState, ui }) {
  try {
    const { state: next, summary } = importLifeCycle(state(), text);
    ui.importError = false;
    ui.importMessage = summary.added
      ? `Imported ${summary.added} new blocks across ${summary.days} day${summary.days > 1 ? 's' : ''}.`
      : 'Nothing new in this file.';
    setState(() => next);
  } catch (err) {
    ui.importError = true;
    ui.importMessage = err.message;
  }
}
