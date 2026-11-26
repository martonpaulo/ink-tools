"""Tests of readme_figures.py (#407): the README tables, tool map and level table follow their data, and --check sees drift."""
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
    """A throwaway root holding only what the generator reads, and the README it writes into."""
    for rel in ("AGENTS.md", "README.md", "docs/tools.json", "docs/architecture.md", "registry/items",
                "design/icons/readme", "design/icons/apps"):
        source, dest = ROOT / rel, target / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        (shutil.copytree if source.is_dir() else shutil.copy)(source, dest)


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
        self.assertIn("README.md: differs", result.stdout)

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

    def test_the_level_table_has_a_keycap_name_and_count_per_level(self):
        levels, rule = readme_figures.load_levels(ROOT)
        block = readme_figures.levels_block(levels, rule, {1: 0, 2: 4, 3: 0, 4: 1, 5: 9})
        rows = [line for line in block.splitlines() if line.startswith("| ") and line[2].isdigit()]
        self.assertEqual(len(rows), 5)
        self.assertTrue(rows[0].startswith("| 1\ufe0f\u20e3 Official plugin API |") and rows[0].endswith("| none needed |"))
        self.assertTrue(rows[4].endswith("| 9 |") and "**silently**" in rows[4])
        self.assertLess(block.index(rule), block.index("| Level |"))
        self.assertIn("Level 1 is the highest and the steadiest", block.split("| 5\ufe0f\u20e3")[1])
        self.assertNotIn("<img", block)
        self.assertFalse(set(block) & set("🟩🟦🟨🟪🟥"))

    def test_the_tool_map_draws_each_part_once_top_to_bottom(self):
        data = {"tools": [
            {"name": "Pen", "kind": "plugin", "status": "Beta",
             "map": {"sources": [], "logic": ["shapes"], "supernote": "ts", "tablet": ["the page"], "registry": ["pen"]}},
            {"name": "Sync", "kind": "plugin", "status": "Beta",
             "map": {"sources": [{"outside": ["Todoist"], "via": "TaskProvider"},
                                 {"outside": ["Chat app"], "via": "Digest source", "planned": True}],
                     "logic": ["compare"], "supernote": "ts", "tablet": ["To-Do", "Calendar"], "registry": []}},
            {"name": "Editor", "kind": "Mac app", "status": "Planned",
             "map": {"sources": [{"outside": ["files", "on the Mac"]}], "logic": ["read"], "supernote": "swift",
                     "tablet": ["notes"], "registry": []}},
            {"name": "Control", "kind": "CLI", "status": "Working",
             "map": {"sources": [], "logic": ["inkctl"], "supernote": "python", "tablet": ["screens"], "registry": ["c"]}},
            {"name": "Probe", "kind": "plugin", "status": "Internal"}]}
        block = readme_figures.map_block(data, {"pen": {5}, "c": {2, 3}})
        mermaid = block.split("```mermaid\n")[1].split("```")[0]
        self.assertTrue(mermaid.startswith("flowchart TB\n  accTitle: ") and "\n  accDescr: " in mermaid)
        # One node per adapter and one registry and tablet, however many tools use them.
        self.assertEqual(mermaid.count('a_ts["'), 1)
        self.assertEqual(mermaid.count('registry["'), 1)
        self.assertEqual(mermaid.count("--> tablet"), 1)
        self.assertNotIn("a_java", mermaid)
        self.assertNotIn("g_apps", mermaid)
        # A group with one runtime has one edge to its adapter; a mixed group one per tool.
        self.assertIn("g_plugins --> a_ts", mermaid)
        self.assertIn("t_editor --> a_swift", mermaid)
        self.assertIn("t_control --> a_python", mermaid)
        self.assertNotIn("t_pen --> a_ts", mermaid)
        # An outside group reaches its tool through its service adapter, or straight when it has none.
        self.assertIn("o_todoist --> s_taskprovider", mermaid)
        self.assertIn("s_taskprovider --> t_sync", mermaid)
        self.assertIn("o_chat_app -.-> s_digest_source", mermaid)
        self.assertIn("o_files -.-> t_editor", mermaid)
        self.assertIn('o_files["files<br/>on the Mac"]', mermaid)
        self.assertIn("class o_chat_app,s_digest_source,t_editor,o_files planned", mermaid)
        # No levels in the map; they stay in the table, as keycaps separated by spaces.
        self.assertNotIn("level", mermaid.split("accDescr")[1].split("\n", 1)[1].lower())
        self.assertNotIn("\u20e3", mermaid)
        self.assertNotIn("probe", mermaid.lower().split("accdescr")[1].split("\n", 1)[1])
        self.assertIn("| Pen | nothing from outside | sn-adapter | the page | 1\ufe0f\u20e3 5\ufe0f\u20e3 |", block)
        self.assertIn("| Sync | Todoist<br>Chat app (planned) | TaskProvider<br>Digest source (planned)<br>sn-adapter "
                      "| To-Do<br>Calendar | 1\ufe0f\u20e3 |", block)

    def test_a_row_without_an_icon_file_fails(self):
        data = {"tools": [{"name": "A", "icon": "design/icons/readme/none.png"}, {"name": "B"},
                          {"name": "C", "icon": "design/icons/readme/smart-pen.png"}]}
        problems = readme_figures.data_problems(ROOT, data)
        self.assertEqual(len(problems), 2)
        self.assertTrue(problems[0].startswith("docs/tools.json: A: no icon file") and "B: no icon" in problems[1])

    def test_a_list_joined_with_a_dot_fails(self):
        data = {"tools": [{"name": "A", "icon": "design/icons/readme/smart-pen.png",
                           "map": {"sources": [{"outside": ["Todoist \u00b7 Google"]}], "logic": [], "tablet": ["a"]}}]}
        problems = readme_figures.data_problems(ROOT, data)
        self.assertEqual(len(problems), 1)
        self.assertIn("give each item its own line", problems[0])

    def test_every_repository_row_has_an_icon(self):
        data = json.loads((ROOT / "docs/tools.json").read_text(encoding="utf-8"))
        self.assertEqual(readme_figures.data_problems(ROOT, data), [])

    def test_a_missing_marker_stops_the_generation(self):
        with self.assertRaises(SystemExit):
            readme_figures.with_block("no markers", "x", readme_figures.MAP_START, readme_figures.MAP_END)


if __name__ == "__main__":
    unittest.main()
