"""Each npm gate in gates.json installs its subproject when node_modules is missing (#135).

A fresh cloud session or checkout has no node_modules; a gate that only runs `npm run validate`
then fails at once (ESLint finds no configuration package). The gate runs `npm ci` from the
subproject's own lockfile first, so no global toolchain is added.
"""

import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
INSTALL = "{ test -d node_modules || npm ci; } && npm run validate"


def npm_gates():
    gates = json.loads((ROOT / "gates.json").read_text())["gates"]
    return [gate for gate in gates if "npm run validate" in gate["command"]]


class GateInstallTest(unittest.TestCase):
    def test_every_npm_gate_installs_when_node_modules_is_missing(self):
        gates = npm_gates()
        self.assertTrue(gates, "no npm gate found in gates.json")
        for gate in gates:
            with self.subTest(gate=gate["name"]):
                self.assertIn(INSTALL, gate["command"])

    def test_every_npm_gate_folder_has_a_lockfile(self):
        for gate in npm_gates():
            folder = re.match(r"cd (\S+) &&", gate["command"])
            with self.subTest(gate=gate["name"]):
                self.assertIsNotNone(folder, gate["command"])
                self.assertTrue((ROOT / folder.group(1) / "package-lock.json").is_file())


if __name__ == "__main__":
    unittest.main()
