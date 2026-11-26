"""Tests of release_notes.py (#373): notes come from the plugin's data, and data that would lie fails."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_notes  # noqa: E402

READ = "plugin.permission.FILE:READ"
NET = "plugin.permission.INTERNET"


class Notes(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "docs").mkdir()
        (self.root / release_notes.RISK_NOTICE).write_text("**Unofficial.** Use at your own risk.\n")
        self.tools = [{"name": "Pen", "status": "Beta", "network": []}, {"name": "Probe", "status": "Internal"}]
        self.plugin("pen", "Pen", [READ])
        self.plugin("probe", "Probe", [NET, "plugin.permission.CAMERA"])

    def plugin(self, folder, name, permissions):
        path = self.root / "plugins" / folder
        path.mkdir(parents=True, exist_ok=True)
        config = {"name": name, "versionName": "0.1.0", "uses-permissions": permissions}
        (path / "PluginConfig.json").write_text(json.dumps(config))

    def save_tools(self):
        (self.root / release_notes.TOOLS).write_text(json.dumps({"tools": self.tools}))

    def test_notes_hold_the_notice_permissions_and_network(self):
        self.save_tools()
        text = release_notes.notes(self.root, "plugins/pen")
        self.assertTrue(text.startswith("Pen 0.1.0, an unofficial plugin"))
        self.assertIn("**Unofficial.** Use at your own risk.", text)
        self.assertIn(f"- {release_notes.PERMISSIONS[READ][0]}", text)
        self.assertIn("- None: it sends nothing over the network.", text)
        self.assertIn(release_notes.INSTALL_GUIDE, text)

    def test_the_internet_without_a_network_entry_fails(self):
        self.plugin("pen", "Pen", [READ, NET])
        self.save_tools()
        with self.assertRaisesRegex(ValueError, "asks for the internet: True, but its network list has 0"):
            release_notes.notes(self.root, "plugins/pen")

    def test_a_network_entry_without_the_internet_fails(self):
        self.tools[0]["network"] = ["Example service"]
        self.save_tools()
        self.assertEqual(len(release_notes.check(self.root)), 1)

    def test_an_unknown_permission_fails(self):
        self.tools[1]["status"] = "Beta"
        self.tools[1]["network"] = ["Example"]
        self.save_tools()
        self.assertEqual(release_notes.check(self.root), [
            "plugins/probe: permission plugin.permission.CAMERA has no words in release_notes.py PERMISSIONS"])

    def test_an_internal_tool_is_not_checked(self):
        self.save_tools()
        self.assertEqual(release_notes.check(self.root), [])

    def test_a_plugin_missing_from_tools_fails(self):
        self.plugin("other", "Other", [READ])
        self.save_tools()
        self.assertEqual(release_notes.check(self.root), ["plugins/other: no entry named 'Other' in docs/tools.json"])


if __name__ == "__main__":
    unittest.main()
