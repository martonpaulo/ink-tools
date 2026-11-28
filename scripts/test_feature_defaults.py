"""Tests for feature_defaults.py over fixture repositories (#547)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import feature_defaults  # noqa: E402

TOOLS = {
    "tools": [
        {"name": "Pen", "features": [{"name": "Shapes"}, {"name": "Gestures", "planned": True}]},
        {"name": "Games"},
    ]
}
GOOD = """# Feature defaults

## Pen

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Shapes | on | Settings › Smart Shapes | `modules.shapes` |
| Shapes › Minimum size | 5 mm | Settings › Smart Shapes › Minimum size | `shapes.minSizeMm` |

## Games

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Sudoku | 9 x 9, Easy | Sudoku › Size, Difficulty | `sudoku` |
| Hand | right | fixed: one layout until a player asks | - |
"""


class FeatureDefaultsTest(unittest.TestCase):
    def run_on(self, doc):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "docs").mkdir()
            (root / "docs/tools.json").write_text(json.dumps(TOOLS), encoding="utf-8")
            if doc is not None:
                (root / "docs/feature-defaults.md").write_text(doc, encoding="utf-8")
            return [problem[0] for problem in feature_defaults.check(root)]

    def test_a_whole_file_passes(self):
        self.assertEqual(self.run_on(GOOD), [])

    def test_the_contents_list_is_no_tool(self):
        self.assertEqual(self.run_on(GOOD.replace("## Pen", "## Contents\n\n- [Pen](#pen)\n\n## Pen")), [])

    def test_a_missing_file_fails(self):
        self.assertEqual(self.run_on(None), ["missing-file"])

    def test_a_tool_with_no_section_fails(self):
        self.assertEqual(self.run_on(GOOD.split("## Games")[0]), ["missing-tool"])

    def test_a_section_of_no_tool_fails(self):
        self.assertIn("unknown-tool", self.run_on(GOOD + "\n## Other\n\n| Feature | Default | Change | Key |\n| a | b | fixed: c | - |\n"))

    def test_a_listed_feature_with_no_row_fails_and_a_planned_one_passes(self):
        self.assertEqual(self.run_on(GOOD.replace("| Shapes", "| Strokes")), ["missing-feature"])

    def test_a_row_with_no_decision_fails(self):
        self.assertEqual(self.run_on(GOOD.replace("fixed: one layout until a player asks", "no")), ["no-decision"])
        self.assertEqual(self.run_on(GOOD.replace("fixed: one layout until a player asks", "fixed: ")), ["no-decision"])

    def test_a_row_with_no_default_fails(self):
        self.assertEqual(self.run_on(GOOD.replace("| 9 x 9, Easy |", "|  |")), ["bad-row"])

    def test_a_key_named_twice_fails(self):
        self.assertEqual(self.run_on(GOOD.replace("`shapes.minSizeMm`", "`modules.shapes`")), ["duplicate-key"])

    def test_the_repository_file_passes(self):
        root = Path(__file__).resolve().parent.parent
        self.assertEqual(feature_defaults.check(root), [])


if __name__ == "__main__":
    unittest.main()
