#!/usr/bin/env python3
"""Turn the hand-off file exported by the phone app into data/days/*.json.

Usage:
    python3 handoff_to_days.py data/handoff/handoff.json [--out-dir data/days] [--tasks-out data/handoff/tasks_backup.json]

The hand-off file holds finished days (already merged from Life Cycle, taps and
backfill, with no holes) plus the task lists. Each day is written to
data/days/<date>.json in the same schema planning_to_json.py produces, so
Analyse_semaine.ipynb reads it unchanged. Only the dates in the hand-off file
are written; every other file in data/days/ is left alone. The whole file is
validated first, so a bad file writes nothing. Running it again on the same
file gives identical output.
"""
import argparse
import json
import re
import sys
from pathlib import Path

SUPPORTED_VERSION = 1
HM_RE = re.compile(r"^\d{2}:\d{2}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DAY_FIELDS = ["date", "day_name", "wake_time", "sleep_time", "activities"]


def fail(message):
    print(f"Hand-off rejected: {message}", file=sys.stderr)
    sys.exit(1)


def validate_day(day):
    where = day.get("date", "<unknown date>") if isinstance(day, dict) else "<not an object>"
    if not isinstance(day, dict):
        fail(f"a day entry is not an object ({where})")
    for field in DAY_FIELDS:
        if field not in day:
            fail(f"day {where} is missing the field '{field}'")
    if not DATE_RE.match(str(day["date"])):
        fail(f"day {where} has an invalid date")
    if not HM_RE.match(str(day["wake_time"])):
        fail(f"day {where} has an invalid wake_time")
    if day["sleep_time"] is not None and not HM_RE.match(str(day["sleep_time"])):
        fail(f"day {where} has an invalid sleep_time")
    acts = day["activities"]
    if not isinstance(acts, list) or not acts:
        fail(f"day {where} has no activities")
    cursor = day["wake_time"]
    for a in acts:
        for field in ("activity", "start", "end"):
            if field not in a:
                fail(f"day {where} has an activity missing '{field}'")
        if a["start"] != cursor:
            fail(f"day {where} has a hole or overlap at {cursor} -> {a['start']} before '{a['activity']}'")
        cursor = a["end"]
    if day["sleep_time"] is not None and cursor != day["sleep_time"]:
        fail(f"day {where} ends at {cursor} but its sleep_time is {day['sleep_time']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="hand-off file exported by the phone app")
    ap.add_argument("--out-dir", default="data/days", help="directory for the day files")
    ap.add_argument("--tasks-out", default="data/handoff/tasks_backup.json", help="where to save the task lists")
    args = ap.parse_args()

    try:
        data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        fail(f"cannot read {args.input}: {err}")
    if not isinstance(data, dict) or data.get("version") != SUPPORTED_VERSION:
        fail(f"unsupported version {data.get('version') if isinstance(data, dict) else None!r} (expected {SUPPORTED_VERSION})")
    days = data.get("days")
    if not isinstance(days, list):
        fail("the file has no 'days' list")
    for day in days:
        validate_day(day)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for day in days:
        ordered = {field: day[field] for field in DAY_FIELDS}
        (out_dir / f"{day['date']}.json").write_text(
            json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    if "tasks" in data:
        tasks_out = Path(args.tasks_out)
        tasks_out.parent.mkdir(parents=True, exist_ok=True)
        tasks_out.write_text(json.dumps(data["tasks"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{len(days)} jour(s) écrit(s) dans {out_dir}/", file=sys.stderr)


if __name__ == "__main__":
    main()
