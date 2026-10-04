import { DEFAULT_LABEL_MAP } from '../core/timeline.js';
import { unmappedNames } from './viewmodel.js';
import { applySettings, parseSettings, settingsFromState } from '../core/settings.js';
import { esc } from './dom.js';

export function render({ state, version, ui }) {
  const mapped = { ...DEFAULT_LABEL_MAP, ...state.labelMap };
  const rows = [...new Set([...Object.keys(state.labelMap), ...unmappedNames(state)])];
  const defaults = Object.entries(DEFAULT_LABEL_MAP);
  return `
    <h1>Settings</h1>
    <h2>Activities</h2>
    <div class="card">
      <ul class="plain">${state.activities.map((a, i) => `
        <li><span class="grow">${esc(a)}</span>
          <button class="link" data-action="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="link" data-action="down" data-i="${i}" ${i === state.activities.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="link" data-action="rename" data-i="${i}">Rename</button>
          <button class="link danger" data-action="hide" data-i="${i}">Hide</button></li>`).join('')}</ul>
      <form class="row" data-action="add-activity" style="margin-top:10px">
        <input type="text" id="new-activity" placeholder="New activity" style="flex:1" autocomplete="off"><button class="primary" type="submit">Add</button>
      </form>
      <p class="muted">Renaming or hiding an activity leaves past taps as they were.</p>
    </div>

    <h2>Life Cycle names → your labels</h2>
    <div class="card">
      <p class="muted">Defaults: ${defaults.map(([k, v]) => `${esc(k)} → ${esc(v)}`).join(', ')}. Anything you type here overrides them; an unmapped name keeps its own name.</p>
      ${rows.length ? rows.map((n) => `<label class="field">${esc(n)}
        <input type="text" data-action="map" data-name="${esc(n)}" value="${esc(state.labelMap[n] ?? '')}" placeholder="${esc(mapped[n] ?? n)}"></label>`).join('') : '<p class="muted">Every imported name already has a label.</p>'}
    </div>

    <h2>Settings file</h2>
    <div class="card">
      <p class="muted">Keep your own activity names and Life Cycle labels in a file, so you can load them on any device.</p>
      <div class="row">
        <button class="primary" data-action="import-settings">Import</button>
        <button data-action="export-settings">Export</button>
      </div>
      ${ui?.settingsMessage ? `<p class="${ui.settingsError ? '' : 'muted'}" style="${ui.settingsError ? 'color:var(--danger)' : ''}">${esc(ui.settingsMessage)}</p>` : ''}
      <label class="field">Life Cycle names that win overlaps like Work does (comma separated)
        <input type="text" data-action="priority" value="${esc(state.highPriority.join(', '))}"></label>
    </div>

    <h2>Day</h2>
    <div class="card">
      <label class="field">A new day starts at (hour)
        <input type="number" min="0" max="12" data-action="cutoff" value="${state.cutoffHour}"></label>
      <label class="field">First day to hand off
        <input type="date" data-action="export-from" value="${esc(state.exportFrom ?? '')}"></label>
      <label class="field">Days to fill in Backfill
        <input type="number" min="1" max="60" data-action="backfill-days" value="${state.backfillDays}"></label>
    </div>
    <p class="muted version">Version ${esc(version)}</p>
  `;
}

export function actions({ state, setState, pickSettingsFile }) {
  const move = (list, from, to) => { const a = [...list]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };
  return {
    up: (d) => setState((s) => ({ ...s, activities: move(s.activities, +d.i, +d.i - 1) })),
    down: (d) => setState((s) => ({ ...s, activities: move(s.activities, +d.i, +d.i + 1) })),
    rename: (d) => {
      const name = prompt('Rename activity', state().activities[+d.i]);
      if (name && name.trim()) setState((s) => ({ ...s, activities: s.activities.map((a, i) => (i === +d.i ? name.trim() : a)) }));
    },
    hide: (d) => setState((s) => ({ ...s, activities: s.activities.filter((_, i) => i !== +d.i) })),
    'add-activity': (d, el, ev) => {
      ev.preventDefault();
      const v = el.querySelector('#new-activity').value.trim();
      if (v && !state().activities.includes(v)) setState((s) => ({ ...s, activities: [...s.activities, v] }));
    },
    map: (d, el) => {
      const v = el.value.trim();
      setState((s) => {
        const labelMap = { ...s.labelMap };
        if (v) labelMap[d.name] = v; else delete labelMap[d.name];
        return { ...s, labelMap };
      }, { rerender: false });
    },
    'import-settings': () => pickSettingsFile(),
    'export-settings': async () => {
      const file = new File([JSON.stringify(settingsFromState(state()), null, 2)], 'app-settings.json', { type: 'application/json' });
      try {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: file.name });
        else {
          const url = URL.createObjectURL(file);
          Object.assign(document.createElement('a'), { href: url, download: file.name }).click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (err) {
        if (err.name !== 'AbortError') alert(`Export failed: ${err.message}`);
      }
    },
    priority: (d, el) => {
      const names = el.value.split(',').map((n) => n.trim()).filter(Boolean);
      setState((s) => ({ ...s, highPriority: names }), { rerender: false });
    },
    cutoff: (d, el) => { const h = Number(el.value); if (h >= 0 && h <= 12) setState((s) => ({ ...s, cutoffHour: h }), { rerender: false }); },
    'backfill-days': (d, el) => { const n = Math.floor(Number(el.value)); if (n >= 1) setState((s) => ({ ...s, backfillDays: n }), { rerender: false }); },
    'export-from': (d, el) => setState((s) => ({ ...s, exportFrom: el.value || null }), { rerender: false }),
  };
}

export function handleSettingsImport(text, { state, setState, ui }) {
  try {
    const settings = parseSettings(text);
    ui.settingsError = false;
    ui.settingsMessage = `Imported: ${Object.keys(settings).filter((k) => k !== 'version').join(', ') || 'nothing'}.`;
    setState(() => applySettings(state(), settings));
  } catch (err) {
    ui.settingsError = true;
    ui.settingsMessage = err.message;
  }
}
