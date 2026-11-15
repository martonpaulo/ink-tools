"""Tests of boundaries.py over fixture trees (#101): each rule passes once and fails once."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import boundaries  # noqa: E402


class Boundaries(unittest.TestCase):
    def tree(self, files):
        """A fixture tree of {relative path: text}; returns the findings as (path, rule) pairs."""
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for rel, text in files.items():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            return [(rel, rule) for rel, _number, rule, _text in boundaries.findings(root)]

    def test_sdk_only_in_the_official_tier(self):
        self.assertEqual(self.tree({
            "packages/sn-adapter/src/official/note.ts": "import {PluginNoteAPI} from 'sn-plugin-lib';\n",
            "plugins/a/__tests__/x.test.ts": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/__mocks__/sn-plugin-lib.ts": "jest.mock('sn-plugin-lib');\n",
            "plugins/probe/index.js": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/src/flow.ts": "/** sn-plugin-lib's code for a missing permission. */\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/index.js": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/src/b.ts": "const lib = require('sn-plugin-lib');\n",
        }), [("plugins/a/index.js", "sdk"), ("plugins/a/src/b.ts", "sdk")])

    def test_authority_only_in_sn_adapter(self):
        self.assertEqual(self.tree({
            "packages/sn-adapter/src/internals/todo.ts": "const a = 'com.ratta.supernote.task.provider';\n",
            "plugins/probe/native/src/P.java": "String a = \"com.ratta.supernote.task.provider\";\n",
            "plugins/a/__tests__/a.test.ts": "expect(uri).toContain('com.ratta.supernote.task.provider');\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/native/src/F.java": "Uri u = Uri.parse(\"content://com.ratta.supernote.calendar.provider/data_info\");\n",
        }), [("plugins/a/native/src/F.java", "authority")])

    def test_service_clients_stay_in_sync_core(self):
        self.assertEqual(self.tree({
            "packages/sync-core/src/todoist.ts": "const BASE = 'https://api.todoist.com/rest/v2';\n",
            "packages/sync-core/src/index.ts": "export * from './todoist';\n",
            "plugins/a/src/run.ts": "import {syncTasks} from '@supernote-tools/sync-core';\n",
            "plugins/a/scripts/fetch.sh": "curl https://www.googleapis.com/x\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/src/run.ts": "import {todoistProvider} from '../../../packages/sync-core/src/todoist';\n",
            "plugins/a/src/call.ts": "fetch('https://www.googleapis.com/calendar/v3');\n",
        }), [("plugins/a/src/call.ts", "service"), ("plugins/a/src/run.ts", "service")])

    def test_build_folders_are_skipped(self):
        self.assertEqual(self.tree({
            "plugins/a/node_modules/x/index.js": "require('sn-plugin-lib');\n",
            "plugins/a/android/app/F.java": "String a = \"com.ratta.supernote.task.provider\";\n",
        }), [])

    def test_the_repository_passes(self):
        root = Path(__file__).resolve().parent.parent
        self.assertEqual(boundaries.findings(root), [])


if __name__ == "__main__":
    unittest.main()
