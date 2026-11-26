"""Tests of scripts/registry.py over small registries in a temporary folder (#294)."""
import contextlib
import copy
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

# The scripts folder first: the root's registry/ folder would otherwise import as a namespace package.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import registry  # noqa: E402
import registry_readers  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

ITEM = {
    "id": "calendar.provider", "title": "The Calendar provider", "level": 2, "impact": "user",
    "owner": "sn-adapter", "readers": ["sn-adapter"], "reason": "no official calendar API",
    "evidence": {"source": "a vendor class, observed device behaviour", "date": "2026-11-17"}, "upgradePath": "an official API",
    "lastVerified": "unverified", "publicApiRequest": "not asked", "probe": {"name": "probeCapability"},
    "active": "internals/calendar.ts", "values": {"action": "an.action"},
    "descriptor": {"authority": "a.provider", "tables": {}, "rules": {}},
}
META = {"version": "2026.11.25", "descriptor": {"schema": 1, "version": "2026.11.17", "device": {}},
        "ceilings": {"2": 1, "3": 0, "4": 0, "5": 0}}


def provider(area):
    item = copy.deepcopy(ITEM)
    item["id"] = area + ".provider"
    return item


class RegistryTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)
        (self.root / "registry/items").mkdir(parents=True)
        shutil.copy(ROOT / registry.SCHEMA, self.root / registry.SCHEMA)
        self.meta = copy.deepcopy(META)
        self.meta["ceilings"]["2"] = 3
        self.areas = {area: [provider(area)] for area in registry.DESCRIPTOR_AREAS}
        inkctl = self.root / "cli/inkctl/src/inkctl"
        inkctl.parent.mkdir(parents=True)
        inkctl.write_text("before\n%s\nold\n%s\nafter\n" % (registry_readers.BLOCK_START, registry_readers.BLOCK_END))

    def save(self):
        (self.root / registry.META).write_text(json.dumps(self.meta))
        for area, items in self.areas.items():
            (self.root / registry.ITEMS / (area + ".json")).write_text(json.dumps({"area": area, "items": items}))

    def run_main(self, *args):
        self.save()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = registry.main(["--root", str(self.root), *args])
        return code, out.getvalue()

    def problems(self):
        self.save()
        with self.assertRaises(registry.Invalid) as caught:
            registry.load(self.root)
        return " | ".join(caught.exception.problems)

    def test_the_repository_registry_is_valid_and_current(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = registry.main(["--root", str(ROOT)])
        self.assertEqual(code, 0, out.getvalue())

    def test_write_then_check_passes_and_a_hand_edit_fails(self):
        code, out = self.run_main("--write")
        self.assertEqual(code, 0, out)
        written = self.root / registry.DESCRIPTOR
        self.assertEqual(json.loads(written.read_text())["calendar"]["authority"], "a.provider")
        self.assertEqual(self.run_main()[0], 0)
        written.write_text(written.read_text().replace("a.provider", "b.provider"))
        code, out = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn("stale or edited by hand", out)

    def test_each_java_tool_that_reports_failures_gets_one_failure_value(self):
        code, out = self.run_main("--write")
        self.assertEqual(code, 0, out)
        lingo = self.root / "apps/handwriting-language/src/com/supernotetools/lingo/InternalFailure.java"
        helper = self.root / "apps/ink-tools-helper/src/com/martonpaulo/inktools/bridge/InternalFailure.java"
        self.assertTrue(lingo.read_text().startswith("package com.supernotetools.lingo;\n"))
        self.assertTrue(helper.read_text().startswith("package com.martonpaulo.inktools.bridge;\n"))
        self.assertIn('append("\\n\\tat ")', lingo.read_text())
        self.assertEqual(lingo.read_text().split("\n", 1)[1], helper.read_text().split("\n", 1)[1])
        self.assertFalse((self.root / "packages/picture-search/native/com/inktools/files/InternalFailure.java").exists())
        lingo.write_text(lingo.read_text().replace("unread", "unknown"))
        code, out = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn("lingo/InternalFailure.java: stale or edited by hand", out)

    def test_a_kill_switch_past_its_review_date_fails(self):
        self.areas["todo"][0]["off"] = {"reason": "the To-Do columns changed", "review": "2000-01-01"}
        self.assertIn("review date 2000-01-01 has passed", self.problems())
        self.areas["todo"][0]["off"]["review"] = "2999-01-01"
        self.save()
        registry.load(self.root)

    def test_the_watch_reader_lists_every_item_with_its_kill_switch(self):
        self.areas["todo"][0]["off"] = {"reason": "the To-Do columns changed", "review": "2999-01-01"}
        code, out = self.run_main("--write")
        self.assertEqual(code, 0, out)
        helper = (self.root / "apps/ink-tools-helper/src/com/martonpaulo/inktools/bridge/Registry.java").read_text()
        for area in registry.DESCRIPTOR_AREAS:
            self.assertIn('new Item("%s.provider"' % area, helper)
        self.assertIn('"until 2999-01-01: the To-Do columns changed")', helper)
        self.assertNotIn("class TodoProvider", helper)
        lingo = (self.root / "apps/handwriting-language/src/com/supernotetools/lingo/Registry.java").read_text()
        self.assertNotIn('new Item("todo.provider"', lingo)
        inkctl = (self.root / "cli/inkctl/src/inkctl").read_text()
        for area in registry.DESCRIPTOR_AREAS:
            self.assertIn('{"id": "%s.provider"' % area, inkctl)
        self.assertIn('"off": "until 2999-01-01: the To-Do columns changed"}', inkctl)
        self.assertNotIn('"todo.provider": {', inkctl)
        ts = (self.root / "packages/sn-adapter/src/registry.generated.ts").read_text()
        self.assertIn("off: 'until 2999-01-01: the To-Do columns changed'}", ts)
        self.assertIn("readonly off: string | null;", ts)
        swift = (self.root / "apps/ink-notebook-editor/NoteFormat/Sources/NoteFormat/Registry.swift").read_text()
        self.assertIn("public let off: String?", swift)

    def test_an_item_below_level_one_needs_a_reason(self):
        del self.areas["todo"][0]["reason"]
        self.assertIn("below level 1 with no reason", self.problems())

    def test_an_unprobed_item_needs_its_reason(self):
        self.areas["todo"][0]["probe"] = {"unprobed": ""}
        self.assertIn("todo.json", self.problems())

    def test_an_unknown_field_or_level_is_refused(self):
        self.areas["todo"][0]["colour"] = "red"
        self.areas["digest"][0]["level"] = 6
        problems = self.problems()
        self.assertIn("colour is not a known field", problems)
        self.assertIn("6 is out of range", problems)

    def test_a_value_must_be_a_scalar_or_a_flat_list(self):
        self.areas["todo"][0]["values"] = {"nested": {"a": 1}}
        self.assertIn("matches 0 of the allowed shapes", self.problems())

    def test_an_id_outside_its_area_or_used_twice_is_refused(self):
        self.areas["todo"].append(provider("todo"))
        self.areas["digest"][0]["id"] = "calendar.other"
        self.meta["ceilings"]["2"] = 4
        problems = self.problems()
        self.assertIn("the id is used twice", problems)
        self.assertIn("does not start with the area digest", problems)

    def test_the_owner_reads_first(self):
        self.areas["todo"][0]["readers"] = ["inkctl", "sn-adapter"]
        self.assertIn("is not the first reader", self.problems())

    def test_only_a_provider_item_of_sn_adapter_carries_a_descriptor(self):
        other = provider("todo")
        other["id"] = "todo.rules"
        other["owner"] = other["readers"][0] = "inkctl"
        self.areas["todo"].append(other)
        self.meta["ceilings"]["2"] = 4
        self.assertIn("only an sn-adapter item", self.problems())

    def test_the_ratchet_refuses_a_level_above_its_ceiling(self):
        self.meta["ceilings"]["2"] = 2
        self.assertIn("above its ceiling 2", self.problems())

    def test_the_ratchet_lowers_a_ceiling_with_room(self):
        self.meta["ceilings"]["2"] = 5
        self.assertIn("lower its ceiling from 5 to 3", self.problems())

    def test_each_reader_holds_the_items_of_its_tools(self):
        self.areas["todo"][0]["readers"] = ["sn-adapter", "inkctl", "ink-tools-helper", "ink-notebook-editor"]
        code, out = self.run_main("--write")
        self.assertEqual(code, 0, out)
        ts = (self.root / "packages/sn-adapter/src/registry.generated.ts").read_text()
        self.assertIn("todoProvider: {", ts)
        self.assertIn("action: 'an.action',", ts)
        self.assertIn("authority: 'a.provider',", ts)
        bridge = (self.root / "apps/ink-tools-helper/src/com/martonpaulo/inktools/bridge/Registry.java").read_text()
        self.assertIn("public static final class TodoProvider {", bridge)
        self.assertIn('public static final String ACTION = "an.action";', bridge)
        self.assertNotIn("CalendarProvider", bridge)
        swift = (self.root / "apps/ink-notebook-editor/NoteFormat/Sources/NoteFormat/Registry.swift").read_text()
        self.assertIn('public static let action: String = "an.action"', swift)
        lingo = (self.root / "apps/handwriting-language/src/com/supernotetools/lingo/Registry.java").read_text()
        self.assertNotIn("TodoProvider", lingo)
        inkctl = (self.root / "cli/inkctl/src/inkctl").read_text()
        self.assertTrue(inkctl.startswith("before\n") and inkctl.endswith("after\n"), inkctl)
        self.assertNotIn("\nold\n", inkctl)
        self.assertIn('"todo.provider": {', inkctl)

    def test_a_python_block_that_runs_gives_the_values(self):
        self.areas["todo"][0]["readers"] = ["sn-adapter", "inkctl"]
        self.areas["todo"][0]["values"] = {"one": ["a"], "flag": True, "count": 3}
        self.run_main("--write")
        namespace = {}
        exec((self.root / "cli/inkctl/src/inkctl").read_text().replace("before", "").replace("after", ""), namespace)
        values = namespace["REGISTRY"]["todo.provider"]
        self.assertEqual(values["one"], ("a",))
        self.assertIs(values["flag"], True)
        self.assertEqual(values["count"], 3)

    def test_a_missing_python_block_is_refused(self):
        (self.root / "cli/inkctl/src/inkctl").write_text("no block\n")
        code, out = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn("has no registry block", out)

    def test_colliding_reader_names_are_refused(self):
        other = provider("todo")
        other["id"] = "todo.a-b"
        del other["descriptor"]
        twin = copy.deepcopy(other)
        twin["id"] = "todo.ab"
        self.areas["todo"] += [other, twin]
        self.meta["ceilings"]["2"] = 5
        self.assertNotIn("reader name", self.problems_or_none())
        twin["id"] = "todo.a-b-"
        self.assertIn("reader name TodoAB is also todo.a-b's", self.problems())

    def test_a_value_named_like_a_derived_one_is_refused(self):
        self.areas["todo"][0]["values"] = {"authority": "x"}
        self.assertIn("derived from its descriptor", self.problems())

    def test_a_reader_tool_with_no_reader_is_refused(self):
        saved = registry_readers.READERS
        registry_readers.READERS = tuple(r for r in saved if "inkctl" not in r.tools)
        self.addCleanup(setattr, registry_readers, "READERS", saved)
        self.areas["todo"][0]["readers"] = ["sn-adapter", "inkctl"]
        self.assertIn("inkctl: no reader serves this tool", self.problems())

    def problems_or_none(self):
        self.save()
        try:
            registry.load(self.root)
        except registry.Invalid as error:
            return " | ".join(error.problems)
        return ""

    def test_a_missing_items_folder_is_a_bad_root(self):
        shutil.rmtree(self.root / registry.ITEMS)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(registry.main(["--root", str(self.root)]), 2)


if __name__ == "__main__":
    unittest.main()
