"""Tests of user_steps.py (#507): a developer step on a user surface fails; plain mentions, developer
pages, developer sections, comments and known entries pass; a known entry that no longer hits fails."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import user_steps  # noqa: E402

DATA = {
    "surfaces": ["docs/install.md", "plugins/*/README.md", "plugins/*/src/*copy.ts"],
    "developer": ["plugins/probe/README.md"],
    "developer_headings": ["Build from source"],
    "known": [],
}


class Check(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.data(DATA)

    def tearDown(self):
        self.folder.cleanup()

    def data(self, data):
        self.track(user_steps.DATA, json.dumps(data))

    def track(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        subprocess.run(["git", "-C", str(self.root), "add", path], check=True)

    def test_each_developer_step_fails_with_its_term(self):
        samples = {
            "Open the Terminal and paste this.": "terminal",
            "Run python3 setup.py once.": "python",
            "Install Homebrew first.": "homebrew",
            "Type `adb install app.apk`.": "adb",
            "On the Mac, run inkctl secret set calendar.": "inkctl",
            "Sign in with an `inkctl` command.": "inkctl",
        }
        self.track("docs/install.md", "\n".join(samples) + "\n")
        hits, stale = user_steps.check(self.root)
        self.assertEqual(hits, [("docs/install.md", line, term) for line, term in enumerate(samples.values(), 1)])
        self.assertEqual(stale, [])
        self.assertEqual(user_steps.main(["--root", str(self.root)]), 1)

    def test_a_plain_mention_passes(self):
        self.track("docs/install.md", "It installs with no terminal step.\ninkctl controls the tablet over USB.\n")
        self.assertEqual(user_steps.check(self.root), ([], []))
        self.assertEqual(user_steps.main(["--root", str(self.root)]), 0)

    def test_a_developer_page_and_a_developer_section_pass(self):
        self.track("plugins/probe/README.md", "Run `adb shell ls`.\n")
        self.track("plugins/sync/README.md",
                   "# Sync\n\nTap Connect.\n\n## Build from source\n\n```sh\nadb install sync.apk\n```\n"
                   "Run python3 build.py.\n\n## Use it\n\nRun inkctl secret set sync.\n")
        hits, _stale = user_steps.check(self.root)
        self.assertEqual(hits, [("plugins/sync/README.md", 14, "inkctl")])

    def test_a_command_line_in_a_fenced_block_fails(self):
        self.track("plugins/sync/README.md", "# Sync\n\n```sh\n$ adb install sync.apk\n```\n")
        self.assertEqual(user_steps.check(self.root), ([("plugins/sync/README.md", 4, "adb")], []))

    def test_a_comment_in_a_copy_file_passes(self):
        self.track("plugins/sync/src/copy.ts", "// run adb tcpip 5555 to debug\nexport const a = 'Tap Connect.';\n")
        self.assertEqual(user_steps.check(self.root), ([], []))

    def test_a_known_hit_passes_and_a_stale_entry_fails(self):
        known = {"path": "plugins/sync/src/copy.ts", "text": "run inkctl secret set", "issue": 1}
        gone = {"path": "docs/install.md", "text": "brew install", "issue": 2}
        self.data({**DATA, "known": [known, gone]})
        self.track("plugins/sync/src/copy.ts", "export const a = 'On the Mac, run inkctl secret set {id}.';\n")
        self.assertEqual(user_steps.check(self.root), ([], [gone]))
        self.assertEqual(user_steps.main(["--root", str(self.root)]), 1)

    def test_a_folder_outside_git_is_a_usage_error(self):
        with tempfile.TemporaryDirectory() as plain:
            self.assertEqual(user_steps.main(["--root", plain]), 2)


if __name__ == "__main__":
    unittest.main()
