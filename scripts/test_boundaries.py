"""Tests of boundaries.py over fixture trees (#101): each rule passes once and fails once."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import boundaries  # noqa: E402


class Boundaries(unittest.TestCase):
    def tree(self, files, pending=frozenset(), pending_host=None, pending_toasts=None):
        """A fixture tree of {relative path: text}; returns the findings as (path, rule) pairs."""
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for rel, text in files.items():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            return [(rel, rule) for rel, _number, rule, _text in boundaries.findings(root, pending, pending_host or {}, pending_toasts or {})]

    def test_sdk_only_in_the_official_tier(self):
        self.assertEqual(self.tree({
            "packages/sn-adapter/src/official/note.ts": "import {PluginNoteAPI} from 'sn-plugin-lib';\n",
            "plugins/a/__tests__/x.test.ts": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/__mocks__/sn-plugin-lib.ts": "jest.mock('sn-plugin-lib');\n",
            "plugins/ink-tools-probe/index.js": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/src/flow.ts": "/** sn-plugin-lib's code for a missing permission. */\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/index.js": "import {PluginManager} from 'sn-plugin-lib';\n",
            "plugins/a/src/b.ts": "const lib = require('sn-plugin-lib');\n",
        }), [("plugins/a/index.js", "sdk"), ("plugins/a/src/b.ts", "sdk")])

    def test_a_vendor_name_only_in_the_registry(self):
        # Allowed: a generated reader, Ink Tools Probe's own included, tests and comments (#294).
        self.assertEqual(self.tree({
            "packages/sn-adapter/src/registry.generated.ts": "  authority: 'com.ratta.supernote.task.provider',\n",
            "apps/ink-tools-helper/src/com/martonpaulo/inktools/bridge/Registry.java": "String A = \"com.ratta.supernote.pluginhost\";\n",
            "apps/ink-notebook-editor/NoteFormat/Sources/NoteFormat/Registry.swift": "let a = \"com.ratta.supernote.note\"\n",
            "plugins/ink-tools-probe/native/src/com/probe/providers/Registry.java": "String A = \"com.ratta.supernote.task.provider\";\n",
            "plugins/ink-tools-probe/native/tests/com/probe/providers/PTest.java": "String a = \"com.ratta.supernote.task.provider\";\n",
            "plugins/a/__tests__/a.test.ts": "expect(uri).toContain('com.ratta.supernote.task.provider');\n",
            "apps/x/Tests/XTests/A.swift": "let a = \"com.ratta.settings\"\n",
            "apps/x/Sources/X/B.swift": "// com.ratta.settings is only a comment here\n",
        }), [])

    def test_a_hard_coded_internal_fails_in_each_language(self):
        self.assertEqual(self.tree({
            "plugins/a/src/a.ts": "const uri = 'content://com.ratta.supernote.calendar.provider/data_info';\n",
            "plugins/a/native/src/F.java": "String page = \"com.ratta.settings.input.HWLanguageSetting\";\n",
            "apps/x/Sources/X/B.swift": "let folder = \"/sdcard/.data/dictionary\"\n",
            "cli/t/src/t": "#!/usr/bin/env python3\nCHANGED = \"hw_type_change\"\n",
            "packages/sn-adapter/src/internals/todo.ts": "const a = 'com.ratta.supernote.task.provider';\n",
            # Ink Tools Probe reads the internals it probes through its readers too (#294).
            "plugins/ink-tools-probe/native/src/P.java": "String a = \"com.ratta.supernote.task.provider\";\n",
            "plugins/ink-tools-probe/src/p.ts": "const uri = 'content://com.ratta.supernote.task.provider';\n",
        }), [("apps/x/Sources/X/B.swift", "vendor"), ("cli/t/src/t", "vendor"), ("packages/sn-adapter/src/internals/todo.ts", "vendor"),
             ("plugins/a/native/src/F.java", "vendor"), ("plugins/a/src/a.ts", "vendor"),
             ("plugins/ink-tools-probe/native/src/P.java", "vendor"), ("plugins/ink-tools-probe/src/p.ts", "vendor")])

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
            "plugins/ink-tools-probe/src/p.ts": "const host = new URL(x).host;\n",
        }), [("packages/ink-core/src/w.ts", "url"), ("packages/sync-core/src/http.ts", "url"),
             ("plugins/a/index.js", "url"), ("plugins/ink-tools-probe/src/p.ts", "url")])

    def test_plugins_take_the_kits_controls(self):
        self.assertEqual(self.tree({
            "plugins/a/src/Form.tsx": "import {Switch, ListRow} from '@ink-tools/ui-kit';\n<Switch value={on} />\n",
            "plugins/a/src/notes.ts": "// a 53 × 52 rect, the ‹ glyph\nconst size = 3; // 4 × 5\n",
            "plugins/a/__tests__/Form.test.tsx": "<Button selected={on} />\n",
            "packages/ui-kit/src/TitleBar.tsx": "<GlyphButton glyph=\"×\" />\nstyle={shared.listRow}\n",
            "plugins/ink-tools-probe/src/View.tsx": "<Button selected={on} />\n",
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

    def test_a_plugins_root_view_takes_the_kits_controls_too(self):
        # The root App.tsx drew the switches #273's rule did not read (#274); its config files stay out.
        self.assertEqual(self.tree({
            "plugins/a/App.tsx": "<Button label=\"On\" selected={on} />\n",
            "plugins/a/index.js": "const back = '‹ Back';\n",
            "plugins/a/metro.config.js": "const s = {borderStyle: 'dotted'};\n",
        }), [("plugins/a/App.tsx", "controls"), ("plugins/a/index.js", "controls")])

    def test_plugins_take_the_sdk_button_values_from_sn_adapter(self):
        # Allowed: sn-adapter's owner file, an import, a test (#295).
        self.assertEqual(self.tree({
            "packages/sn-adapter/src/official/buttonValues.ts": "export const BUTTON_TYPE_SIDEBAR = 1;\n",
            "plugins/a/index.js": "import {BUTTON_TYPE_LASSO} from '@ink-tools/sn-adapter/official';\n",
            "plugins/a/__tests__/b.test.ts": "const SHOW_NO_VIEW = 0;\n",
        }), [])
        # The Probe is exempt from most rules, not this one.
        self.assertEqual(self.tree({
            "plugins/a/index.js": "const BUTTON_TYPE_LASSO = 2;\n",
            "plugins/ink-tools-probe/src/register.ts": "const NO_VIEW = 0;\n",
            "plugins/b/src/c.ts": "const EDIT_DATA_STROKES = 0;\n",
        }), [("plugins/a/index.js", "buttons"), ("plugins/b/src/c.ts", "buttons"),
             ("plugins/ink-tools-probe/src/register.ts", "buttons")])

    def test_every_full_view_shows_the_kits_close(self):
        # Allowed: a bar with onClose on one line or several, a full view on the Error state (#259).
        self.assertEqual(self.tree({
            "plugins/a/App.tsx": "useBackKey(close);\nreturn <TitleBar title={t} onClose={close} />;\n",
            "plugins/a/src/Sub.tsx": "<TitleBar\n  title={t}\n  onClose={busy ? undefined : leave}\n/>\n",
            "plugins/a/src/Failed.tsx": "useBackKey(close);\nreturn <ErrorView problem={p} onClose={close} />;\n",
            "plugins/a/__tests__/v.test.tsx": "<TitleBar title='x' />\n",
            "packages/ui-kit/src/ProblemView.tsx": "useBackKey(onClose);\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/src/Bar.tsx": "<TitleBar\n  title={t}\n  onBack={back}\n/>\n<Text>{t}</Text>\n",
            "plugins/a/App.tsx": "useBackKey(close);\nreturn <View><Button onPress={close} /></View>;\n",
            "plugins/ink-tools-probe/App.tsx": "useBackKey(close);\nreturn <TitleBar title={t} />;\n",
        }), [("plugins/a/App.tsx", "close"), ("plugins/a/src/Bar.tsx", "close"),
             ("plugins/ink-tools-probe/App.tsx", "close"), ("plugins/ink-tools-probe/App.tsx", "close")])

    def test_a_failure_never_ends_in_a_toast_alone(self):
        # Allowed: a notice, a toast whose block holds the failure, the port and helper declarations.
        self.assertEqual(self.tree({
            "plugins/a/src/run.ts": (
                "host.toast(copy['collection.added'](count));\n"
                "if (missing) {\n  deps.toast(copy['press.permission']);\n  await deps.ask();\n}\n"
                "} catch (error) {\n  toast(copy.failed);\n  throw error;\n}\n"
                "export function showToast(text: string): void {\n  ToastAndroid.show(text, ToastAndroid.SHORT);\n}\n"
                "type Deps = {\n  toast(line: string): void;\n};\n"
                "// toast(copy.failed) is only a comment\n"),
            "plugins/a/__tests__/run.test.ts": "toast(copy['error.unplaced']);\n",
            "packages/ui-kit/src/working.ts": "ports.toast(ports.copy.failed);\n",
        }), [])
        self.assertEqual(self.tree({
            "plugins/a/src/run.ts": (
                "if (!ok) {\n  (deps.toast ?? showToast)(copy['error.unplaced']);\n  return null;\n}\n"
                "try {\n  await go();\n} catch (error) {\n  host.toast(copy.title);\n}\n"
                "go().catch(error => ToastAndroid.show(String(error), ToastAndroid.SHORT));\n"
                "this.host.toast(\n  copy['toast.failed'],\n);\n"),
            "plugins/a/App.tsx": "const done = () => showToast(copy.refused);\n",
        }), [("plugins/a/App.tsx", "toast"), ("plugins/a/src/run.ts", "toast"), ("plugins/a/src/run.ts", "toast"),
             ("plugins/a/src/run.ts", "toast"), ("plugins/a/src/run.ts", "toast")])

    def test_a_toast_of_a_variable_line_that_returns_a_failure_is_found(self):
        # #438: Collection's `stop(` toasted every failure by a variable line the words never named.
        self.assertEqual(self.tree({
            "plugins/a/src/run.ts": (
                "function stop(host, why, text) {\n  host.toast(text);\n  return {ok: false, why};\n}\n"
                "function held(host, why, problem) {\n  host.fail(problem);\n  return {ok: false, why};\n}\n"
                "function added(host, count) {\n  host.toast(copy.added(count));\n  return {ok: true, count};\n}\n"),
        }), [("plugins/a/src/run.ts", "toast")])

    def test_pending_toasts_only_shrink(self):
        files = {"plugins/a/src/run.ts": "toast(copy['error.unplaced']);\n"}
        self.assertEqual(self.tree(files, pending_toasts={"plugins/a/src/run.ts": 1}), [])
        self.assertEqual(self.tree(files, pending_toasts={"plugins/a/src/run.ts": 2}), [("plugins/a/src/run.ts", "toast")])
        self.assertEqual(self.tree({"plugins/a/src/run.ts": "toast(copy['error.unplaced']);\ntoast(copy.failed);\n"},
                                   pending_toasts={"plugins/a/src/run.ts": 1}),
                         [("plugins/a/src/run.ts", "toast"), ("plugins/a/src/run.ts", "toast")])

    def test_pending_controls_only_shrink(self):
        files = {"plugins/a/src/A.tsx": "<View style={shared.listRow}>\n", "plugins/a/src/B.tsx": "const b = 1;\n"}
        self.assertEqual(self.tree(files, frozenset({"plugins/a/src/A.tsx"})), [])
        self.assertEqual(self.tree(files, frozenset({"plugins/a/src/A.tsx", "plugins/a/src/B.tsx"})),
                         [("plugins/a/src/B.tsx", "controls")])

    def test_a_host_tools_python_is_read_even_without_a_suffix(self):
        # inkctl is one extensionless file (#295): it was never read before.
        tool = ("#!/usr/bin/env python3\n# com.ratta.supernote.task.provider in a comment is not a finding\n"
                "TASKS = \"content://com.ratta.supernote.task.provider/tasks\"\n"
                "SCOPE = \"https://www.googleapis.com/auth/calendar.events\"\n")
        files = {"cli/t/src/t": tool, "cli/t/src/notes.txt": tool, "cli/t/README.md": tool}
        self.assertEqual(self.tree(files), [("cli/t/src/t", "vendor"), ("cli/t/src/t", "service")])
        self.assertEqual(self.tree(files, pending_host={("cli/t/src/t", "vendor"): 1, ("cli/t/src/t", "service"): 1}), [])
        self.assertEqual(self.tree(files, pending_host={("cli/t/src/t", "vendor"): 2, ("cli/t/src/t", "service"): 1}),
                         [("cli/t/src/t", "vendor")])

    def test_a_host_tools_registry_block_is_not_a_finding(self):
        # The block is written from the registry, where an internal may be named (#294).
        tool = ("#!/usr/bin/env python3\n%s\n    \"tasksUri\": \"content://com.ratta.supernote.task.provider/tasks\",\n%s\n"
                "TASKS = \"content://com.ratta.supernote.task.provider/tasks\"\n" % (boundaries.registry_readers.BLOCK_START, boundaries.registry_readers.BLOCK_END))
        self.assertEqual(self.tree({"cli/t/src/t": tool}), [("cli/t/src/t", "vendor")])

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
