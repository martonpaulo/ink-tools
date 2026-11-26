"""device_build.py over a fake checkout and a fake runner: no npm, git or tablet (#310)."""
from __future__ import annotations

import contextlib
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import device_build  # noqa: E402

CONFIG = {"pluginID": "fake0plugin0id00", "versionName": "0.1.0 beta 2", "versionCode": "7", "pluginKey": "Fake"}


class FakeRunner:
    """Answers git, npm and inkctl as a clean checkout on origin/main would, and records each call."""

    def __init__(self, folder: pathlib.Path, dirty: str = "", on_main: bool = True, build_ok: bool = True, packaged: dict | None = None):
        self.folder, self.dirty, self.on_main, self.build_ok = folder, dirty, on_main, build_ok
        self.packaged = CONFIG if packaged is None else packaged
        self.calls: list[list[str]] = []

    def __call__(self, words, **_):
        self.calls.append(list(words))
        answer = lambda code=0, out="": subprocess.CompletedProcess(words, code, out, "")  # noqa: E731
        if words[0] == "git":
            verb = words[3]
            if verb == "status":
                return answer(out=self.dirty)
            if verb == "merge-base":
                return answer(0 if self.on_main else 1)
            return answer(out="abc1234\n")
        if words[:3] == ["npm", "run", "build"]:
            if not self.build_ok:
                return answer(1)
            outputs = self.folder / "build" / "outputs"
            outputs.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(outputs / "Fake.snplg", "w") as archive:
                archive.writestr("PluginConfig.json", json.dumps(self.packaged))
            return answer()
        return answer()


class DeviceBuildTest(unittest.TestCase):
    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp()).resolve()
        self.addCleanup(shutil.rmtree, self.root)
        self.folder = self.root / "plugins" / "fake"
        self.folder.mkdir(parents=True)
        (self.folder / "PluginConfig.json").write_text(json.dumps(CONFIG), encoding="utf-8")
        (self.folder / "package.json").write_text(json.dumps({"name": "Fake", "version": "0.1.0-beta.2"}), encoding="utf-8")
        (self.root / "apps" / "inktools-bridge").mkdir(parents=True)

    def run_script(self, runner, *words):
        err, out = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = device_build.main(list(words), run=runner, root=self.root)
        return code, out.getvalue(), err.getvalue()

    def test_names_the_copy_by_commit_and_keeps_the_version(self):
        code, out, _ = self.run_script(FakeRunner(self.folder), "plugins/fake")
        target = self.folder / "build" / "outputs" / "Fake-0.1.0-beta.2-main-abc1234.snplg"
        self.assertEqual(code, 0)
        self.assertIn(f"built: {target} (0.1.0 beta 2, code 7, abc1234)", out)
        self.assertEqual(device_build.identity(device_build.packaged_config(target)), device_build.identity(CONFIG))

    def test_install_hands_the_file_to_inkctl_as_a_same_version_update(self):
        runner = FakeRunner(self.folder)
        self.assertEqual(self.run_script(runner, "plugins/fake", "--install")[0], 0)
        target = self.folder / "build" / "outputs" / "Fake-0.1.0-beta.2-main-abc1234.snplg"
        self.assertEqual(runner.calls[-1], [str(device_build.INKCTL), "plugin", "install", str(target), "--same-version", "--overwrite"])

    def test_refuses_uncommitted_changes(self):
        runner = FakeRunner(self.folder, dirty=" M packages/ui-kit/src/Button.tsx")
        code, _, err = self.run_script(runner, "plugins/fake")
        self.assertEqual(code, 2)
        self.assertIn("uncommitted changes", err)
        self.assertNotIn(["npm", "run", "build"], runner.calls)

    def test_refuses_a_commit_not_on_main(self):
        self.assertEqual(self.run_script(FakeRunner(self.folder, on_main=False), "plugins/fake")[0], 2)

    def test_refuses_an_app_and_an_unknown_folder(self):
        code, _, err = self.run_script(FakeRunner(self.folder), "apps/inktools-bridge")
        self.assertEqual(code, 2)
        self.assertIn("keeps its CI build", err)
        self.assertEqual(self.run_script(FakeRunner(self.folder), "plugins/missing")[0], 2)

    def test_a_failed_build_never_reports_built(self):
        code, out, _ = self.run_script(FakeRunner(self.folder, build_ok=False), "plugins/fake", "--install")
        self.assertEqual((code, out), (1, ""))

    def test_a_package_with_another_version_fails(self):
        runner = FakeRunner(self.folder, packaged={**CONFIG, "versionCode": "6"})
        code, _, err = self.run_script(runner, "plugins/fake")
        self.assertEqual(code, 1)
        self.assertIn("differs from the checkout", err)


if __name__ == "__main__":
    unittest.main()
