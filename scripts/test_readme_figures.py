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
    credits = json.loads((ROOT / "docs/tools.json").read_text(encoding="utf-8"))["credits"]
    notices = subprocess.run(["git", "-C", str(ROOT), "ls-files", "*NOTICE.md"], capture_output=True, text=True,
                             check=True).stdout.split()
    for rel in notices + [row["where"] for group in credits["groups"] for row in group["rows"]]:
        dest = target / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / rel, dest)


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

    def edit_json(self, rel, change):
        """Apply `change` to the JSON file at `rel` of the throwaway root."""
        path = self.tmp / rel
        data = json.loads(path.read_text(encoding="utf-8"))
        change(data)
        path.write_text(json.dumps(data), encoding="utf-8")

    def assert_fails(self, message):
        result = check(self.tmp)
        self.assertEqual(result.returncode, 1)
        self.assertIn(message, result.stdout + result.stderr)

    def test_a_tool_change_without_regeneration_fails(self):
        self.edit_json("docs/tools.json", lambda data: data["tools"][0].update(status="Working"))
        self.assert_fails("README.md: differs")

    def test_a_registry_change_without_regeneration_fails(self):
        self.edit_json("registry/items/pen.json",
                       lambda data: data["items"].append(dict(data["items"][0], id="pen.extra", level=4)))
        self.assert_fails("README.md: differs")

    def test_a_notice_credit_missing_from_the_credits_fails(self):
        notice = self.tmp / "plugins/smart-pen/NOTICE.md"
        notice.write_text(notice.read_text(encoding="utf-8") + "\nAdapted from https://github.com/someone/new-plugin.\n",
                          encoding="utf-8")
        self.assert_fails("plugins/smart-pen/NOTICE.md: links someone/new-plugin")

    def test_a_credits_change_without_regeneration_fails(self):
        self.edit_json("docs/tools.json", lambda data: data["credits"]["groups"][0]["rows"][0].update(author="someone else"))
        self.assert_fails("README.md: differs")

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

    def test_the_credits_list_each_group_with_its_rows_and_links(self):
        credits = {"intro": "Thanks.", "closing": "Licences are in NOTICE.md.", "notCredited": [], "groups": [
            {"title": "Code we use", "rows": [
                {"project": "lib", "url": "https://github.com/a/lib", "author": "A", "text": "the reader",
                 "where": "x/NOTICE.md", "version": "v1.0"}]},
            {"title": "Ideas we follow", "rows": [
                {"project": "idea", "url": "https://github.com/b/idea", "author": "B", "text": "one plugin",
                 "where": "docs/y.md"}]}]}
        block = readme_figures.credits_block(credits)
        self.assertTrue(block.startswith(readme_figures.CREDITS_START) and block.endswith(readme_figures.CREDITS_END))
        self.assertLess(block.index("### Code we use"), block.index("### Ideas we follow"))
        lines = block.splitlines()
        for line in ("- [lib](https://github.com/a/lib) v1.0 by A: the reader.",
                     "- [idea](https://github.com/b/idea) by B: one plugin.", "Licences are in NOTICE.md."):
            self.assertIn(line, lines)
        self.assertFalse([line for line in lines if "|" in line])  # a thank-you list, never a table (#425)

    def test_the_credits_sit_after_before_you_install_and_before_the_license(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        credits = readme.index(readme_figures.CREDITS_START)
        self.assertLess(readme.index("## Before you install"), credits)  # owner's place (#427)
        self.assertLess(credits, readme.index("## License"))

    def test_notice_links_are_credited_left_out_or_our_own(self):
        root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root)
        (root / "a").mkdir()
        (root / "a/NOTICE.md").write_text(
            "[x](https://github.com/A/Lib/tree/v1) <https://github.com/c/data> https://github.com/martonpaulo/ink-tools "
            "https://github.com/d/new.git", encoding="utf-8")
        (root / "a/doc.md").write_text("x", encoding="utf-8")
        credits = {"groups": [{"rows": [{"project": "Lib", "url": "https://github.com/a/lib", "where": "a/doc.md"},
                                        {"project": "Gone", "url": "https://github.com/e/gone", "where": "a/none.md"}]}],
                   "notCredited": ["https://github.com/c/data"]}
        problems = readme_figures.credit_problems(root, credits)
        self.assertEqual(len(problems), 2, problems)
        self.assertIn("Gone: no file a/none.md", problems[0])
        self.assertTrue(problems[1].startswith("a/NOTICE.md: links d/new,"))

    def test_a_missing_marker_stops_the_generation(self):
        with self.assertRaises(SystemExit):
            readme_figures.with_block("no markers", "x", readme_figures.MAP_START, readme_figures.MAP_END)


if __name__ == "__main__":
    unittest.main()
