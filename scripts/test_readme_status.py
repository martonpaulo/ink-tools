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

    def test_a_status_wrapped_in_its_release_link_passes(self):
        html = '<table>\n  <tr><th>Tool</th><th>Status</th></tr>\n  <tr><td>A</td><td>{}</td></tr>\n</table>\n'
        link = '<a href="https://example.com/releases?q=a&amp;expanded=true">🟡&nbsp;Beta</a>'
        self.assertEqual(readme_status.bad_cells(html.format(link), ["🟡 Beta"]), (True, []))
        self.assertEqual(readme_status.bad_cells(TABLE.format("[🟡 Beta](https://example.com)"), ["🟡 Beta"]), (True, []))
        self.assertEqual(readme_status.bad_cells(html.format(link.replace("Beta", "Gamma")), ["🟡 Beta"])[1][0][0], 3)

    def test_the_emoji_before_a_linked_word_passes(self):
        html = '<table>\n  <tr><th>Tool</th><th>Status</th></tr>\n  <tr><td>A</td><td>{}</td></tr>\n</table>\n'
        link = '🟡&nbsp;<a href="https://example.com/releases?q=a&amp;expanded=true">Beta</a>'
        self.assertEqual(readme_status.bad_cells(html.format(link), ["🟡 Beta"]), (True, []))
        self.assertEqual(readme_status.bad_cells(html.format(link.replace("Beta<", "Gamma<")), ["🟡 Beta"])[1][0][0], 3)

    def test_other_text_after_the_status_fails(self):
        html = '<table>\n  <tr><th>Tool</th><th>Status</th></tr>\n  <tr><td>A</td><td>{}</td></tr>\n</table>\n'
        for cell in ('🟡 Beta<br>Not yet on the tablet', '🟡 Beta<br><a href="https://example.com">Docs</a>', '🟡 Beta <a href="https://example.com">Download</a>'):
            self.assertEqual(readme_status.bad_cells(html.format(cell), ["🟡 Beta"]), (True, [(3, cell)]))

    def test_a_progress_note_fails(self):
        cell = "Beta 1, not yet on the tablet ([#144](https://example.com/144))"
        self.assertEqual(readme_status.bad_cells(TABLE.format(cell), ["🟡 Beta"]), (True, [(3, cell)]))

    def test_the_word_without_its_emoji_fails(self):
        self.assertEqual(readme_status.bad_cells(TABLE.format("Beta"), ["🟡 Beta"]), (True, [(3, "Beta")]))

    def test_only_the_table_with_a_status_column_is_checked(self):
        html = (
            '<table>\n  <tr><th>Name</th><th>Status</th></tr>\n  <tr><td>A</td><td>🟡&nbsp;Beta</td></tr>\n</table>\n'
            '<table>\n  <tr><th>Name</th><th>What it does</th></tr>\n  <tr><td>B</td><td>CLI</td></tr>\n</table>\n'
        )
        self.assertEqual(readme_status.bad_cells(html, ["🟡 Beta"]), (True, []))

    def test_a_name_and_what_it_does_table_is_ignored(self):
        # The Developer tools and Shared code tables have no Type or Status column (owner, 2026-11-25).
        html = '<table>\n  <tr><th>Name</th><th>What it does</th></tr>\n  <tr><td><b>A</b> (app)</td><td>x</td></tr>\n</table>\n'
        self.assertEqual(readme_status.bad_cells(html, ["🟡 Beta"]), (False, []))

    def test_a_status_dot_before_the_name_passes(self):
        # The Tools table holds each status at the end of its Name cell (owner, 2026-11-25).
        row = '<td align="center"><p align="center"><img src="i.png"></p>{}&nbsp;<a href="r"><b>A</b></a><br>(plugin)</td>'
        html = '<table>\n  <tr><th>Name</th><th>What it does</th></tr>\n  <tr>' + row + '<td>x</td></tr>\n</table>\n'
        self.assertEqual(readme_status.bad_cells(html.format("🟡"), ["🟡 Beta"]), (True, []))
        self.assertEqual(readme_status.bad_cells(html.format("🟣"), ["🟡 Beta"]), (True, [(3, "🟣")]))
        # A smaller dot is the emoji inside <sub><sup> (owner, 2026-11-25).
        self.assertEqual(readme_status.bad_cells(html.format("<sub><sup>🟡</sup></sub>"), ["🟡 Beta"]), (True, []))

    def test_a_table_without_status_is_ignored(self):
        self.assertEqual(readme_status.bad_cells("| A | B |\n| :--- | :--- |\n| x | y |\n", ["🟡 Beta"]), (False, []))

    def test_this_repository_passes(self):
        root = Path(__file__).resolve().parent.parent
        values = readme_status.allowed((root / "AGENTS.md").read_text(encoding="utf-8"))
        self.assertEqual(readme_status.bad_cells((root / "README.md").read_text(encoding="utf-8"), values), (True, []))


if __name__ == "__main__":
    unittest.main()
