"""Tests of tool_facts.py (#436): which open regression issue names which tool."""
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import tool_facts  # noqa: E402


class Regressions(unittest.TestCase):
    def test_the_longest_tool_name_in_the_title_wins_and_pull_requests_are_left_out(self):
        issues = [{"number": 5, "title": "Ink Tools Helper stops after the update"},
                  {"number": 3, "title": "smart pen draws nothing"},
                  {"number": 4, "title": "Nothing named here"},
                  {"number": 6, "title": "Smart Pen fix", "pull_request": {}}]
        found = tool_facts.regressions(issues, ["Ink Tools", "Ink Tools Helper", "Smart Pen"])
        self.assertEqual(found, [{"number": 3, "title": "smart pen draws nothing", "tool": "Smart Pen"},
                                 {"number": 5, "title": "Ink Tools Helper stops after the update",
                                  "tool": "Ink Tools Helper"}])


if __name__ == "__main__":
    unittest.main()
