import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "handoff_to_days.py"


def day(date, wake="07:00", sleep="23:30", activities=None, name="Lundi"):
    activities = activities or [
        {"activity": "Work", "start": wake, "end": "12:00"},
        {"activity": "Scroll", "start": "12:00", "end": sleep or "20:00"},
    ]
    return {"date": date, "day_name": name, "wake_time": wake, "sleep_time": sleep, "activities": activities}


def handoff(*days, version=1):
    return {"version": version, "exportedAt": 0, "days": list(days), "tasks": {"tasks": [], "seq": 0}}


class HandoffToDays(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.days = self.dir / "days"
        self.days.mkdir()
        self.tasks = self.dir / "tasks_backup.json"

    def tearDown(self):
        self.tmp.cleanup()

    def run_writer(self, data):
        src = self.dir / "handoff.json"
        src.write_text(json.dumps(data), encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(src), "--out-dir", str(self.days), "--tasks-out", str(self.tasks)],
            capture_output=True, text=True,
        )

    def test_two_days_write_two_files_in_the_existing_schema_and_leave_others_alone(self):
        other = self.days / "2026-01-01.json"
        other.write_text('{"keep": true}\n', encoding="utf-8")
        r = self.run_writer(handoff(day("2026-03-02"), day("2026-03-03", name="Mardi")))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(sorted(p.name for p in self.days.glob("*.json")), ["2026-01-01.json", "2026-03-02.json", "2026-03-03.json"])
        self.assertEqual(other.read_text(encoding="utf-8"), '{"keep": true}\n')
        written = json.loads((self.days / "2026-03-02.json").read_text(encoding="utf-8"))
        self.assertEqual(list(written), ["date", "day_name", "wake_time", "sleep_time", "activities"])
        self.assertEqual(written["activities"][0], {"activity": "Work", "start": "07:00", "end": "12:00"})

    def test_written_activities_are_contiguous_from_wake_to_sleep(self):
        self.run_writer(handoff(day("2026-03-02")))
        d = json.loads((self.days / "2026-03-02.json").read_text(encoding="utf-8"))
        cursor = d["wake_time"]
        for a in d["activities"]:
            self.assertEqual(a["start"], cursor)
            cursor = a["end"]
        self.assertEqual(cursor, d["sleep_time"])

    def test_same_file_twice_is_byte_identical(self):
        data = handoff(day("2026-03-02"))
        self.run_writer(data)
        first = (self.days / "2026-03-02.json").read_bytes()
        self.run_writer(data)
        self.assertEqual(first, (self.days / "2026-03-02.json").read_bytes())

    def test_a_later_handoff_with_the_sleep_time_replaces_only_that_day(self):
        self.run_writer(handoff(day("2026-03-02", sleep=None, activities=[{"activity": "Work", "start": "07:00", "end": "19:00"}]), day("2026-03-01")))
        before = (self.days / "2026-03-01.json").read_bytes()
        d = json.loads((self.days / "2026-03-02.json").read_text(encoding="utf-8"))
        self.assertIsNone(d["sleep_time"])
        self.run_writer(handoff(day("2026-03-02")))
        d = json.loads((self.days / "2026-03-02.json").read_text(encoding="utf-8"))
        self.assertEqual(d["sleep_time"], "23:30")
        self.assertEqual(before, (self.days / "2026-03-01.json").read_bytes())

    def test_unknown_version_fails_and_writes_nothing(self):
        r = self.run_writer(handoff(day("2026-03-02"), version=99))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("version", r.stderr)
        self.assertEqual(list(self.days.glob("*.json")), [])

    def test_a_missing_field_is_named_and_nothing_is_written(self):
        bad = day("2026-03-02")
        del bad["wake_time"]
        r = self.run_writer(handoff(day("2026-03-03"), bad))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("wake_time", r.stderr)
        self.assertEqual(list(self.days.glob("*.json")), [])

    def test_a_hole_in_a_day_is_rejected(self):
        holey = day("2026-03-02", activities=[
            {"activity": "Work", "start": "07:00", "end": "11:00"},
            {"activity": "Scroll", "start": "12:00", "end": "23:30"},
        ])
        r = self.run_writer(handoff(holey))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("2026-03-02", r.stderr)
        self.assertEqual(list(self.days.glob("*.json")), [])

    def test_the_tasks_are_saved_to_the_backup_file(self):
        self.run_writer(handoff(day("2026-03-02")))
        self.assertEqual(json.loads(self.tasks.read_text(encoding="utf-8")), {"tasks": [], "seq": 0})

    def test_a_written_day_loads_the_way_the_notebook_loads_it(self):
        self.run_writer(handoff(day("2026-03-02")))
        for path in sorted(self.days.glob("*.json")):
            loaded = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual({"date", "day_name", "wake_time", "sleep_time", "activities"}, set(loaded))


if __name__ == "__main__":
    unittest.main()
