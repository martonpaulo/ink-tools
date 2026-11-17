"""Each npm gate in gates.json installs its subproject when node_modules is missing or stale (#135, #222).

A fresh cloud session or checkout has no node_modules; a gate that only runs `npm run validate`
then fails at once (ESLint finds no configuration package). A reused checkout can hold a
node_modules installed from an older lockfile, as after the `@ink-tools/*` scope rename (#179).
Each gate runs `scripts/npm_install.py`, which runs `npm ci` from the subproject's own lockfile
when node_modules is missing or its lockfile stamp differs, so no global toolchain is added.
"""

import json
import os
import pathlib
import re
import stat
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import npm_install  # noqa: E402

INSTALL = re.compile(r"^cd (\S+) && python3 (\S+) && npm run validate")


def npm_gates():
    gates = json.loads((ROOT / "gates.json").read_text())["gates"]
    return [gate for gate in gates if "npm run validate" in gate["command"]]


class GateInstallTest(unittest.TestCase):
    def test_every_npm_gate_runs_the_installer_before_validate(self):
        gates = npm_gates()
        self.assertTrue(gates, "no npm gate found in gates.json")
        for gate in gates:
            with self.subTest(gate=gate["name"]):
                match = INSTALL.match(gate["command"])
                self.assertIsNotNone(match, gate["command"])
                script = (ROOT / match.group(1) / match.group(2)).resolve()
                self.assertEqual(script, ROOT / "scripts" / "npm_install.py")

    def test_every_npm_gate_folder_has_a_lockfile(self):
        for gate in npm_gates():
            folder = re.match(r"cd (\S+) &&", gate["command"])
            with self.subTest(gate=gate["name"]):
                self.assertIsNotNone(folder, gate["command"])
                self.assertTrue((ROOT / folder.group(1) / "package-lock.json").is_file())


class InstallerTest(unittest.TestCase):
    """npm_install.install runs `npm ci` only when the lockfile changed since the last install."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = pathlib.Path(self.tmp.name)
        self.folder = base / "project"
        self.folder.mkdir()
        (self.folder / "package-lock.json").write_text('{"lockfileVersion": 3}\n')
        # A stand-in npm on PATH that counts its calls and makes node_modules, as `npm ci` does.
        bin_dir = base / "bin"
        bin_dir.mkdir()
        self.calls = base / "calls"
        fake = bin_dir / "npm"
        fake.write_text(f'#!/bin/sh\nrm -rf node_modules && mkdir node_modules && echo "$@" >> "{self.calls}"\n')
        fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
        path = f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}"
        patcher = mock.patch.dict(os.environ, {"PATH": path})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def npm_calls(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def test_missing_node_modules_installs(self):
        self.assertEqual(npm_install.install(self.folder), 0)
        self.assertEqual(self.npm_calls(), ["ci"])
        self.assertTrue(npm_install.is_current(self.folder))

    def test_unchanged_lockfile_does_not_reinstall(self):
        npm_install.install(self.folder)
        self.assertEqual(npm_install.install(self.folder), 0)
        self.assertEqual(self.npm_calls(), ["ci"])

    def test_changed_lockfile_reinstalls(self):
        npm_install.install(self.folder)
        (self.folder / "package-lock.json").write_text('{"lockfileVersion": 3, "name": "renamed"}\n')
        self.assertFalse(npm_install.is_current(self.folder))
        self.assertEqual(npm_install.install(self.folder), 0)
        self.assertEqual(self.npm_calls(), ["ci", "ci"])
        self.assertTrue(npm_install.is_current(self.folder))

    def test_node_modules_without_a_stamp_reinstalls(self):
        # A node_modules from before #222, or from a bare `npm ci`, carries no stamp.
        (self.folder / "node_modules").mkdir()
        self.assertFalse(npm_install.is_current(self.folder))
        npm_install.install(self.folder)
        self.assertEqual(self.npm_calls(), ["ci"])


if __name__ == "__main__":
    unittest.main()
