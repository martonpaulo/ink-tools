"""The light native build of each plugin with native code (#153).

- A failed native step leaves no `.snplg` without its `app.npk`: `buildPlugin.sh` writes a JS-only
  package first, and the tablet fails to load it.
- Every copy of `scripts/native-toolchain.sh` is the same script, apart from its comments and the
  prefix of the names it prints, so one fix reaches them all.

Ink2Pic is left out: it is being retired and gets no new work.
"""

import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
RETIRED = {"ink2pic"}
PRINTED_NAME = re.compile(r"\b[A-Z0-9]+_(BUILD_TOOLS|ANDROID_JAR|REACT_JAR|KOTLIN_JAR)\b")


def native_plugins():
    return sorted(
        folder
        for folder in (ROOT / "plugins").iterdir()
        if (folder / "scripts/native-build.cjs").is_file() and folder.name not in RETIRED
    )


def toolchain_code(folder):
    lines = (folder / "scripts/native-toolchain.sh").read_text().splitlines()
    code = [line for line in lines if not line.lstrip().startswith("#")]
    return PRINTED_NAME.sub(r"PLUGIN_\1", "\n".join(code))


class NativePackageTest(unittest.TestCase):
    def test_plugins_with_native_code_are_found(self):
        self.assertGreaterEqual(len(native_plugins()), 2)

    def test_failed_native_step_leaves_no_package(self):
        for plugin in native_plugins():
            with self.subTest(plugin=plugin.name), tempfile.TemporaryDirectory() as temp:
                # The same depth as in the repository: some builds read ../../../packages.
                (pathlib.Path(temp) / "packages").symlink_to(ROOT / "packages")
                root = pathlib.Path(temp) / "plugins" / plugin.name
                (root / "scripts").mkdir(parents=True)
                for name in ("native-build.cjs", "host-tools.cjs"):
                    shutil.copy(plugin / "scripts" / name, root / "scripts" / name)
                # A toolchain that fails, as the Linux archive's checksum did on the Mac.
                (root / "scripts/native-toolchain.sh").write_text("echo toolchain failed >&2; exit 1\n")
                # buildPlugin.sh names the package after package.json; the display name in
                # PluginConfig.json may differ, as «Word Lookup» does for lookup (#176).
                name = json.loads((plugin / "package.json").read_text())["name"]
                (root / "package.json").write_text(json.dumps({"name": name}))
                shown = {"name": f"{name} display name"}
                (root / "PluginConfig.json").write_text(json.dumps(shown))
                generated = root / "build/generated"
                generated.mkdir(parents=True)
                (generated / "PluginConfig.json").write_text(json.dumps(shown))
                outputs = root / "build/outputs"
                outputs.mkdir()
                package = outputs / f"{name}.snplg"
                package.write_bytes(b"JS-only package from buildPlugin.sh")
                result = subprocess.run(
                    ["node", "scripts/native-build.cjs", "--package"],
                    cwd=root, capture_output=True, text=True,
                )
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertFalse(package.exists(), f"{package.name} left without app.npk")

    def test_toolchain_copies_are_one_script(self):
        plugins = native_plugins()
        first = toolchain_code(plugins[0])
        for plugin in plugins[1:]:
            with self.subTest(plugin=plugin.name):
                self.assertEqual(toolchain_code(plugin), first)

    def test_toolchain_uses_a_checksum_tool_macos_and_linux_both_have(self):
        for plugin in native_plugins():
            with self.subTest(plugin=plugin.name):
                code = toolchain_code(plugin)
                self.assertNotIn("sha1sum", code)
                self.assertIn("shasum -a 1 -c --status", code)


if __name__ == "__main__":
    unittest.main()
