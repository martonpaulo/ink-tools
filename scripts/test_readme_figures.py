"""Tests of readme_figures.py (#407): the README tables and diagrams follow their data, and --check sees drift."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import readme_figures  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts/readme_figures.py"


def copy_inputs(target):
    """A throwaway root holding only what the generator reads, and its committed outputs."""
    for rel in ("AGENTS.md", "README.md", "docs/tools.json", "docs/architecture.md", "registry/items"):
        source, dest = ROOT / rel, target / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        (shutil.copytree if source.is_dir() else shutil.copy)(source, dest)
    shutil.copytree(ROOT / readme_figures.DIAGRAMS, target / readme_figures.DIAGRAMS)


def check(root):
    return subprocess.run([sys.executable, "-B", str(SCRIPT), "--root", str(root), "--check"],
                          capture_output=True, text=True)


class Repository(unittest.TestCase):
    def test_the_committed_files_are_current(self):
        result = check(ROOT)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class Drift(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        copy_inputs(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_a_tool_change_without_regeneration_fails(self):
        path = self.tmp / "docs/tools.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["tools"][0]["status"] = "Working"
        path.write_text(json.dumps(data), encoding="utf-8")
        result = check(self.tmp)
        self.assertEqual(result.returncode, 1)
        self.assertIn("README.md: differs", result.stdout)

    def test_a_registry_change_without_regeneration_fails(self):
        path = self.tmp / "registry/items/pen.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["items"].append(dict(data["items"][0], id="pen.extra", level=4))
        path.write_text(json.dumps(data), encoding="utf-8")
        result = check(self.tmp)
        self.assertEqual(result.returncode, 1)
        self.assertIn("levels-light.svg: differs", result.stdout)

    def test_regeneration_makes_the_check_pass(self):
        (self.tmp / "README.md").write_text(
            (self.tmp / "README.md").read_text(encoding="utf-8").replace("Smart Pen", "Smart Pencil"), encoding="utf-8")
        self.assertEqual(check(self.tmp).returncode, 1)
        subprocess.run([sys.executable, "-B", str(SCRIPT), "--root", str(self.tmp)], check=True)
        self.assertEqual(check(self.tmp).returncode, 0)


class Pieces(unittest.TestCase):
    def test_levels_come_from_the_registry_and_the_official_api(self):
        tool = {"map": {"registry": ["a"], "supernote": "ts"}}
        self.assertEqual(readme_figures.row_levels(tool, {"a": {5, 2}}), [1, 2, 5])
        tool = {"map": {"registry": ["a"], "supernote": "java"}}
        self.assertEqual(readme_figures.row_levels(tool, {"a": {3}}), [3])

    def test_an_unknown_status_stops_the_generation(self):
        data = {"sections": [{"id": "tools", "title": "Tools", "intro": ""}],
                "tools": [{"name": "A", "section": "tools", "status": "Shipped", "kind": "plugin", "link": "x", "features": []}]}
        with self.assertRaises(SystemExit):
            readme_figures.readme_block(data, ["🟡 Beta"])

    def test_the_level_table_is_read_with_its_public_columns(self):
        levels, rule = readme_figures.load_levels(ROOT)
        self.assertEqual([lv["Level"] for lv in levels], ["1", "2", "3", "4", "5"])
        self.assertTrue(all(lv["Public name"] and lv["Tested by"] for lv in levels))
        self.assertTrue(rule.startswith("Use the highest level") and "#" not in rule)

    def test_wrap_keeps_words_whole(self):
        self.assertEqual(readme_figures.wrap("one two three", 50), ["one two", "three"])


if __name__ == "__main__":
    unittest.main()
