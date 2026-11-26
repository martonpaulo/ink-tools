"""`.github/cloud.json` names real gates and keeps the Mac-only gates off the cloud list (#301).

Workbench's `cloud_ready.py` reads `cloud.json` to tell whether a cloud session can finish an issue:
a gate outside its `cloud` list sends the issue back to the Mac. A gate renamed or added in
`gates.json` without this file would silently move every issue that selects it off the cloud, so
each gate is either a cloud gate or a Mac gate: the Ink Notebook Editor's Xcode build, and the two
Android app builds, whose toolchain download gets a 403 from dl.google.com in the cloud.
"""

import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAC_GATES = {"ink-notebook-editor", "handwriting-language", "inktools-bridge"}


class CloudConfigTest(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / ".github" / "cloud.json").read_text())
        self.gates = {gate["name"] for gate in json.loads((ROOT / "gates.json").read_text())["gates"]}

    def test_every_gate_is_a_cloud_gate_or_a_mac_gate(self):
        cloud = set(self.config["gates"]["cloud"])
        self.assertEqual(cloud - self.gates, set(), "cloud.json names a gate gates.json lacks")
        self.assertEqual(self.gates - cloud, MAC_GATES)

    def test_the_mac_paths_hold_the_swift_app(self):
        mac_paths = self.config["mac_paths"]
        self.assertIn("apps/ink-notebook-editor/", mac_paths)
        self.assertTrue((ROOT / "apps" / "ink-notebook-editor").is_dir())

    def test_the_gate_command_runs_the_selector(self):
        command = self.config["gates"]["command"]
        self.assertEqual(command[-1], "-")
        self.assertTrue((ROOT / command[1]).is_file())


if __name__ == "__main__":
    unittest.main()
