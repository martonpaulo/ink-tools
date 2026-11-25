"""Tests of boundaries.py over fixture trees (#101): each rule passes once and fails once."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import boundaries  # noqa: E402


class Boundaries(unittest.TestCase):
    def tree(self, files, pending=frozenset()):
        """A fixture tree of {relative path: text}; returns the findings as (path, rule) pairs."""
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for rel, text in files.items():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            return [(rel, rule) for rel, _number, rule, _text in boundaries.findings(root, pending)]

    def test_sdk_only_in_the_official_tier(self):
        self.assertEqual(self.tree({
            "packages/sn-adapter/src/official/note.ts": "import {PluginNoteAPI} from 'sn-plugin-lib';\n",
            "plugins/a/__tests__/x.test.ts": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/__mocks__/sn-plugin-lib.ts": "jest.mock('sn-plugin-lib');\n",
            "plugins/plugin-diagnostics/index.js": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/src/flow.ts": "/** sn-plugin-lib's code for a missing permission. */\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/index.js": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/src/b.ts": "const lib = require('sn-plugin-lib');\n",
        }), [("plugins/a/index.js", "sdk"), ("plugins/a/src/b.ts", "sdk")])

    def test_authority_only_in_sn_adapter(self):
        self.assertEqual(self.tree({
            "packages/sn-adapter/src/internals/todo.ts": "const a = 'com.ratta.supernote.task.provider';\n",
            "plugins/plugin-diagnostics/native/src/P.java": "String a = \"com.ratta.supernote.task.provider\";\n",
            "plugins/a/__tests__/a.test.ts": "expect(uri).toContain('com.ratta.supernote.task.provider');\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/native/src/F.java": "Uri u = Uri.parse(\"content://com.ratta.supernote.calendar.provider/data_info\");\n",
        }), [("plugins/a/native/src/F.java", "authority")])

    def test_service_clients_stay_in_sync_core(self):
        self.assertEqual(self.tree({
            "packages/sync-core/src/todoist.ts": "const BASE = 'https://api.todoist.com/rest/v2';\n",
            "packages/sync-core/src/index.ts": "export * from './todoist';\n",
            "plugins/a/src/run.ts": "import {syncTasks} from '@ink-tools/sync-core';\n",
            "plugins/a/scripts/fetch.sh": "curl https://www.googleapis.com/x\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/src/run.ts": "import {todoistProvider} from '../../../packages/sync-core/src/todoist';\n",
            "plugins/a/src/call.ts": "fetch('https://www.googleapis.com/calendar/v3');\n",
        }), [("plugins/a/src/call.ts", "service"), ("plugins/a/src/run.ts", "service")])

    def test_dictionary_hosts_stay_in_ink_core(self):
        self.assertEqual(self.tree({
            "packages/ink-core/src/wiktionary.ts": "const url = `https://${language}.wiktionary.org/w/api.php`;\n",
            "packages/ink-core/__tests__/w.test.ts": "expect(url).toMatch(/pt.wiktionary.org/);\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/src/define.ts": "fetch('https://pt.wiktionary.org/w/api.php');\n",
        }), [("plugins/a/src/define.ts", "dictionary")])

    def test_no_url_class_in_tablet_code(self):
        self.assertEqual(self.tree({
            "packages/sync-core/src/http.ts": "// never `new URL(url).protocol` (#209)\nconst p = parseUrl(url);\n",
            "packages/sync-core/src/google.ts": "const form = (o) => new URLSearchParams(o).toString();\n",
            "plugins/a/__tests__/u.test.ts": "expect(new URL(u).host).toBe('x');\n",
            "plugins/a/scripts/release.cjs": "const u = new URL(process.argv[2]);\n",
            "plugins/a/metro.config.js": "const u = new URL('file:///x');\n",
            "plugins/a/src/relay.ts": "const pinned = device.protocol === 'https';\n",
        }), [])
        self.assertEqual(self.tree({
            "packages/sync-core/src/http.ts": "if (new URL(url).protocol !== 'https:') throw e;\n",
            "packages/ink-core/src/w.ts": "const q = link.searchParams.get('q');\n",
            "plugins/a/index.js": "const u = new URL(x);\n",
            "plugins/plugin-diagnostics/src/p.ts": "const host = new URL(x).host;\n",
        }), [("packages/ink-core/src/w.ts", "url"), ("packages/sync-core/src/http.ts", "url"),
             ("plugins/a/index.js", "url"), ("plugins/plugin-diagnostics/src/p.ts", "url")])

    def test_plugins_take_the_kits_controls(self):
        self.assertEqual(self.tree({
            "plugins/a/src/Form.tsx": "import {Switch, ListRow} from '@ink-tools/ui-kit';\n<Switch value={on} />\n",
            "plugins/a/src/notes.ts": "// a 53 × 52 rect, the ‹ glyph\nconst size = 3; // 4 × 5\n",
            "plugins/a/__tests__/Form.test.tsx": "<Button selected={on} />\n",
            "packages/ui-kit/src/TitleBar.tsx": "<GlyphButton glyph=\"×\" />\nstyle={shared.listRow}\n",
            "plugins/plugin-diagnostics/src/View.tsx": "<Button selected={on} />\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/src/A.tsx": "<Button label=\"Sync\" selected={on} />\n",
            "plugins/a/src/B.tsx": "<Pressable accessibilityRole=\"switch\" />\n",
            "plugins/a/src/C.tsx": "<View style={shared.listRow}>\n",
            "plugins/a/src/D.tsx": "const s = {borderStyle: 'dotted'};\n",
            "plugins/a/src/copy.ts": "  'nav.next': '▶',\n",
        }), [("plugins/a/src/A.tsx", "controls"), ("plugins/a/src/B.tsx", "controls"),
             ("plugins/a/src/C.tsx", "controls"), ("plugins/a/src/D.tsx", "controls"),
             ("plugins/a/src/copy.ts", "controls")])

    def test_pending_controls_only_shrink(self):
        files = {"plugins/a/src/A.tsx": "<View style={shared.listRow}>\n", "plugins/a/src/B.tsx": "const b = 1;\n"}
        self.assertEqual(self.tree(files, frozenset({"plugins/a/src/A.tsx"})), [])
        self.assertEqual(self.tree(files, frozenset({"plugins/a/src/A.tsx", "plugins/a/src/B.tsx"})),
                         [("plugins/a/src/B.tsx", "controls")])

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
