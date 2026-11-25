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

ROOT = Path(__file__).resolve().parent.parent

ITEM = {
    "id": "calendar.provider", "title": "The Calendar provider", "level": 2, "impact": "user",
    "owner": "sn-adapter", "readers": ["sn-adapter"], "reason": "no official calendar API",
    "evidence": {"source": "a decompiled class", "date": "2026-11-17"}, "upgradePath": "an official API",
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

    def test_a_missing_items_folder_is_a_bad_root(self):
        shutil.rmtree(self.root / registry.ITEMS)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(registry.main(["--root", str(self.root)]), 2)


if __name__ == "__main__":
    unittest.main()
