# TimeAnalysis

Personal time-tracking log and analysis.

## Files

- `data/` — **all personal data lives here and is ignored by git**:
  `Planning.md`, `days/`, `LC_export.csv`, `analysis.local.json` and
  `handoff/`. Nothing in this folder is ever committed or published.
- `data/Planning.md` — raw daily log. Each day is a `# Day Name` header (e.g.
  `# Lundi 27`, just weekday + day-of-month, no month/year) followed by one
  line of `time → activity → time → activity → ... → time[!]`.
- `planning_to_json.py` — parses `data/Planning.md` into `data/days/*.json`.
- `data/days/` — generated output, **one JSON file per day** (named by its real
  ISO date, e.g. `data/days/2026-07-27.json`), so this doesn't grow into one
  giant file as more days get logged. Each file has `date`, `day_name`,
  `wake_time`, `sleep_time`, and a list of `{activity, start, end}`.
- `Analyse_semaine.ipynb` — reads everything in `data/days/` and charts the
  chosen period (hourly timeline, totals per category, day × category
  heatmap). Has a `START_DAY` / `END_DAY` cell (ISO dates, either can be
  left `None`) to look at a subset instead of the whole history.

## How dates are resolved

`Planning.md` headers don't carry a month or year — they're transcribed
straight from the handwritten log. `planning_to_json.py` turns them into
real dates by anchoring the *first* day in the file to `--anchor-date`
(default `2026-07-27`, a Monday, matching `Lundi 27`) and then, for every
following day, walking forward day-by-day until the day-of-month matches.
That resolves gaps between logging sessions and month rollovers on its own
— it only needs the one anchor date. If a header's weekday doesn't match
what the calendar says (a typo, or a bigger gap than expected), the script
prints a warning instead of silently writing a wrong date.

## Regenerating data/days/ after editing data/Planning.md

```bash
python3 planning_to_json.py data/Planning.md --anchor-date 2026-07-27 --out-dir data/days
```

Then re-run the notebook so its charts reflect the update:

```bash
.venv/bin/jupyter nbconvert --to notebook --execute --inplace \
  --ExecutePreprocessor.kernel_name=timeanalysis-venv Analyse_semaine.ipynb
```

Your own settings for the notebook (your activity categories, their colors and
the date range to analyse) live in `data/analysis.local.json`.
It is ignored by git with the rest of `data/`, so the notebook itself
carries no personal data. Without that file the notebook uses a small generic
set of categories. Clear a notebook's outputs before committing it.

Never hand-edit files under `data/days/` directly — they're build artifacts and
get overwritten by the command above. Edit `data/Planning.md` instead.

## Setup (first time only)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m ipykernel install --user --name timeanalysis-venv --display-name "TimeAnalysis (.venv)"
```

## Phone app (time capture and tasks)

`app/` is an installable web page for logging time with one tap and keeping
day/week/month task lists. It stores everything on the phone and works
offline. Planning and decisions live in
`docs/plans/2026-10-04-1936-feat-time-capture-and-task-review-plan.md`.

### Daily routine

1. During the day, at home, open the app and tap the activity you switch to
   (**Stop** when you finish). Outside the home, Life Cycle records where you
   were, so you write nothing. A Work block counts as work time unless you log
   a different activity inside it.
2. In the evening, export from Life Cycle (Settings → Advanced → Database →
   Export database), then in the app open **Backfill** and **Import CSV**.
3. Fill the gaps shown, one day at a time, newest first (pick an activity, tap a
   duration). Only the last 7 days are offered (**Settings → Days to fill in
   Backfill**); older gaps, and anything left unfilled, are exported as
   "Non renseigné". The whole imported Life Cycle history is handed off, so you
   never need to trim the CSV.
4. Tap **Share hand-off file** and save it to the Mac (AirDrop or iCloud
   Drive), for example as `data/handoff/handoff.json`.
5. On the Mac, write the day files and the task backup:

   ```bash
   python3 handoff_to_days.py data/handoff/handoff.json
   ```

   Only the dates in the file are written to `data/days/`; other files there are
   untouched, and a day file you already have (for example from `Planning.md`) is
   never overwritten: the script skips that date and says so. Days it wrote
   itself are tracked in `data/handoff/written_days.json` so they can still be
   updated, and running it twice on the same file gives the same result. A
   day handed off in the evening has no sleep time yet: the next hand-off
   replaces it once Life Cycle has the Sleep block.
6. Re-run `Analyse_semaine.ipynb` as above.

Choose the first day to hand off in the app's **Settings → First day to hand
off**. Dates you already have from `data/Planning.md` should stay before it, or
`planning_to_json.py` and the hand-off will overwrite each other.

#### Your own labels (settings file)

The app ships with generic activity names. Your own activity list, your Life
Cycle name mapping (for example `Work` → your word for it) and the Life Cycle
names that win overlaps like Work does (`highPriority`) live in a settings
file, `data/app-settings.json`, which is ignored by git. Send it to the phone
(AirDrop or iCloud Drive) and open **Settings → Settings file → Import**.
**Export** saves the current settings back to a file. The notebook's category
names go in `data/analysis.local.json`, as before.

## Evening reminder

Use an iOS Shortcuts personal automation (Shortcuts → Automation → Time of
Day) that sends a notification each evening. Make it open the app from the
home screen. A web link in Safari opens a separate copy of the page with its
own empty data, so the app shows a warning banner when it is not running from
the home screen.

### Run the tests

```bash
node --test app/tests/
python3 -m unittest discover -s tests
```

### Publishing the page

`.github/workflows/pages.yml` publishes only `app/` to GitHub Pages. In the
repository settings, set Pages → Source to **GitHub Actions**. Do not publish
the whole repository: everything in `data/` contains place names and a home address, so the whole
folder is in `.gitignore`. Put Life Cycle exports, day logs and hand-off files
there and nothing personal can be committed by accident.

Open the published address in Safari on the phone, then Share → Add to Home
Screen. The installed app is exempt from Safari's 7-day cleanup of site data.
