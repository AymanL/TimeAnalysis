#!/usr/bin/env python3
"""Convert the raw '# Day → time → activity → time → ...' log in data/Planning.md
into one JSON file per day under data/days/, keyed by real calendar date.

Usage:
    python3 planning_to_json.py [data/Planning.md] [--anchor-date 2026-07-27] [--out-dir data/days]

Each day header in Planning.md is just "# <WeekdayName> <day-of-month>"
(e.g. "# Lundi 27") -- no month or year, matching how it's handwritten. To
turn that into a real calendar date, the very first day in the file is
anchored to --anchor-date (default: 2026-07-27, confirmed to be a Monday,
matching "Lundi 27"). Every following day is resolved by walking forward
from the previous day's resolved date until the day-of-month matches --
this handles both consecutive days and gaps in logging (e.g. a two-week
gap between entries) without needing an explicit date on every line, and
naturally rolls over month boundaries. If the resulting weekday doesn't
match the header's weekday name, a warning is printed (likely a mislabeled
day or a gap longer than expected).

Output: data/days/2026-07-27.json, data/days/2026-07-28.json, ... each containing
    {"date": "2026-07-27", "day_name": "Lundi", "wake_time": ..., "sleep_time": ..., "activities": [...]}

Parsing rules for a single day's line (unchanged from before):
- `wake_time` is the first time in the line; `sleep_time` is the last time
  only if it carries a trailing "!" marker, otherwise null.
- An activity's start/end are the two times surrounding it in the log.
- Parenthetical duration hints like "(1h)", "(2h45)", "(30)" are dropped.
- Every HH:MM occurrence in the line is located directly via regex, so
  malformed spots (missing arrows, e.g. "14:15 Work 15:15") are handled
  the same way as well-formed ones.
- Several activity fragments in one interval (e.g. "Lunch → Errands" between
  two times) are joined with " / ".
- An interval with no activity text is skipped.
"""
import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

TIME_RE = re.compile(r"(\d{1,2}):(\d{2})(!)?")
PAREN_RE = re.compile(r"\([^)]*\)")
HEADER_RE = re.compile(r"^#\s*([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(\d{1,2})\s*$")

FR_WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


def format_time(match: "re.Match[str]") -> str:
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def parse_day_line(line: str) -> dict:
    line = PAREN_RE.sub("", line)
    times = list(TIME_RE.finditer(line))
    if not times:
        return {"wake_time": None, "sleep_time": None, "activities": []}

    wake_time = format_time(times[0])
    sleep_time = format_time(times[-1]) if times[-1].group(3) == "!" else None

    activities = []
    for cur, nxt in zip(times, times[1:]):
        between = line[cur.end():nxt.start()]
        pieces = [p.strip() for p in re.split(r"→|/", between) if p.strip()]
        if not pieces:
            continue
        activities.append({
            "activity": " / ".join(pieces),
            "start": format_time(cur),
            "end": format_time(nxt),
        })

    return {"wake_time": wake_time, "sleep_time": sleep_time, "activities": activities}


def resolve_date(search_from: date, day_num: int, day_name: str, max_lookahead: int = 400):
    """Walk forward from search_from (inclusive) to the next date whose
    day-of-month is day_num. Returns (resolved_date, warning_or_None)."""
    d = search_from
    for _ in range(max_lookahead):
        if d.day == day_num:
            break
        d += timedelta(days=1)
    else:
        raise ValueError(
            f"Impossible de résoudre une date pour le jour {day_num} "
            f"en cherchant à partir de {search_from.isoformat()}"
        )
    expected_name = FR_WEEKDAYS[d.weekday()]
    warning = None
    if expected_name != day_name:
        warning = (
            f"Attention: '{day_name} {day_num}' tombe un {expected_name} "
            f"d'après le calendrier (date déduite: {d.isoformat()}) -- jour mal étiqueté ?"
        )
    return d, warning


def parse_planning(text: str, anchor_date: date):
    lines = text.splitlines()
    i = 0
    search_from = anchor_date
    results = []  # list of (date, day_name, day_dict)

    while i < len(lines):
        header = HEADER_RE.match(lines[i])
        if header:
            day_name, day_num = header.group(1), int(header.group(2))
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and not HEADER_RE.match(lines[j]) and lines[j].strip() != "# Processed":
                resolved, warning = resolve_date(search_from, day_num, day_name)
                if warning:
                    print(warning, file=sys.stderr)
                day_dict = parse_day_line(lines[j])
                day_dict = {"date": resolved.isoformat(), "day_name": day_name, **day_dict}
                results.append((resolved, day_dict))
                search_from = resolved + timedelta(days=1)
                i = j
            elif day_name and "processed" in day_name.lower():
                break
        elif lines[i].strip() == "# Processed":
            break
        i += 1
    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", default="data/Planning.md", help="path to Planning.md")
    ap.add_argument("--anchor-date", default="2026-07-27",
                     help="real calendar date of the first day in the file (default: 2026-07-27, a Monday, matching 'Lundi 27')")
    ap.add_argument("--out-dir", default="data/days", help="directory to write one JSON file per day into")
    args = ap.parse_args()

    anchor_date = date.fromisoformat(args.anchor_date)
    text = Path(args.input).read_text(encoding="utf-8")
    results = parse_planning(text, anchor_date)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for resolved, day_dict in results:
        out_path = out_dir / f"{resolved.isoformat()}.json"
        out_path.write_text(json.dumps(day_dict, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{len(results)} jour(s) écrit(s) dans {out_dir}/", file=sys.stderr)


if __name__ == "__main__":
    main()
