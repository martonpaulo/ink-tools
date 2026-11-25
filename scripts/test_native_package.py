"""The light native build of each plugin with native code (#153).

- A failed native step leaves no `.snplg` without its `app.npk`: `buildPlugin.sh` writes a JS-only
  package first, and the tablet fails to load it.
- Every copy of `scripts/native-toolchain.sh` is the same script, apart from its comments and the
  prefix of the names it prints, so one fix reaches them all.
"""

import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRINTED_NAME = re.compile(r"\b[A-Z0-9]+_(BUILD_TOOLS|ANDROID_JAR|REACT_JAR|KOTLIN_JAR)\b")


def native_plugins():
    return sorted(
        folder
        for folder in (ROOT / "plugins").iterdir()
        if (folder / "scripts/native-build.cjs").is_file()
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

    def test_compile_path_holds_the_annotations_react_native_omits(self):
        # CI's javac 25 failed Image Editing on «unknown enum constant Mode.LOCAL» (#226): React
        # Native's classes carry Infer's @Nullsafe, which its jar does not ship.
        build = (ROOT / "packages/native-build/native-build.cjs").read_text(encoding="utf-8")
        stub = ROOT / "packages/native-build/compile-only/com/facebook/infer/annotation/Nullsafe.java"
        self.assertTrue(stub.is_file(), stub)
        self.assertIn("LOCAL", stub.read_text(encoding="utf-8"))
        self.assertRegex(build, r"'-cp', \[[^\]]*compileOnly\]")
        self.assertNotIn("compileOnly", build.split("'--classpath'", 1)[1].split("\n", 1)[0])

    def test_validate_workflow_compiles_the_native_code(self):
        # Cloud sessions have no Android SDK, so CI is the only place the Android Java compiles
        # before a hand-off (#235): each native plugin's validate job builds its package.
        for plugin in native_plugins():
            with self.subTest(plugin=plugin.name):
                workflow = ROOT / f".github/workflows/validate-{plugin.name}.yml"
                text = workflow.read_text()
                self.assertTrue("run: npm run build\n" in text, f"{workflow.name} never runs npm run build")
                checked = re.search(r"unzip -l build/outputs/\S+\.snplg \| grep -q app\.npk", text)
                self.assertTrue(checked, f"{workflow.name} never checks the package for app.npk")
                # A shared package whose Java the build compiles must trigger the job too.
                build = (plugin / "scripts/native-build.cjs").read_text()
                for package in sorted(set(re.findall(r"\.\./\.\./\.\./packages/([\w-]+)", build))):
                    watched = f"'packages/{package}/" in text
                    self.assertTrue(watched, f"{workflow.name} paths miss packages/{package}/")

    def test_app_validate_workflow_builds_the_apk(self):
        apps = [
            folder
            for folder in (ROOT / "apps").iterdir()
            if (folder / "scripts/build.cjs").is_file() and any((folder / "src").rglob("*.java"))
        ]
        self.assertGreaterEqual(len(apps), 1)
        for app in apps:
            with self.subTest(app=app.name):
                workflow = ROOT / f".github/workflows/validate-{app.name}.yml"
                built = "run: node scripts/build.cjs\n" in workflow.read_text()
                self.assertTrue(built, f"{workflow.name} never builds the APK")

    def test_toolchain_uses_a_checksum_tool_macos_and_linux_both_have(self):
        for plugin in native_plugins():
            with self.subTest(plugin=plugin.name):
                code = toolchain_code(plugin)
                self.assertNotIn("sha1sum", code)
                self.assertIn("shasum -a 1 -c --status", code)


if __name__ == "__main__":
    unittest.main()
