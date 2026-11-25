"""Tests of readme_status.py (#268): a vocabulary cell passes, anything else fails."""
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import readme_status  # noqa: E402

AGENTS = "# Rules\n\n- README Status values: `🟢 Working`, `🟡 Beta`.\n  More text.\n"
TABLE = "| Tool | Status |\n| :--- | :--- |\n| A | {} |\n\nAfter.\n"


class Vocabulary(unittest.TestCase):
    def test_reads_the_values_line(self):
        self.assertEqual(readme_status.allowed(AGENTS), ["🟢 Working", "🟡 Beta"])

    def test_a_missing_values_line_is_none(self):
        self.assertIsNone(readme_status.allowed("# Rules\n"))

    def test_a_vocabulary_cell_passes(self):
        self.assertEqual(readme_status.bad_cells(TABLE.format("🟡 Beta"), ["🟡 Beta"]), (True, []))

    def test_no_break_spaces_pass(self):
        self.assertEqual(readme_status.bad_cells(TABLE.format("🔵&nbsp;In&nbsp;progress"), ["🔵 In progress"]), (True, []))

    def test_an_html_table_is_read(self):
        html = '<table>\n  <tr><th width="170">Tool</th><th width="120">Status</th></tr>\n  <tr><td><b>A</b></td><td>{}</td></tr>\n</table>\n'
        self.assertEqual(readme_status.bad_cells(html.format("🟡&nbsp;Beta"), ["🟡 Beta"]), (True, []))
        self.assertEqual(readme_status.bad_cells(html.format("Beta 1"), ["🟡 Beta"]), (True, [(3, "Beta 1")]))

    def test_a_progress_note_fails(self):
        cell = "Beta 1, not yet on the tablet ([#144](https://example.com/144))"
        self.assertEqual(readme_status.bad_cells(TABLE.format(cell), ["🟡 Beta"]), (True, [(3, cell)]))

    def test_the_word_without_its_emoji_fails(self):
        self.assertEqual(readme_status.bad_cells(TABLE.format("Beta"), ["🟡 Beta"]), (True, [(3, "Beta")]))

    def test_a_table_without_status_is_ignored(self):
        self.assertEqual(readme_status.bad_cells("| A | B |\n| :--- | :--- |\n| x | y |\n", ["🟡 Beta"]), (False, []))

    def test_this_repository_passes(self):
        root = Path(__file__).resolve().parent.parent
        values = readme_status.allowed((root / "AGENTS.md").read_text(encoding="utf-8"))
        self.assertEqual(readme_status.bad_cells((root / "README.md").read_text(encoding="utf-8"), values), (True, []))


if __name__ == "__main__":
    unittest.main()
