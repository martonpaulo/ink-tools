#!/usr/bin/env python3
"""Build a plugin from the checkout for a device check, and install it with --install (#310).

    python3 scripts/device_build.py plugins/<folder> [--install] [--out DIR]

A device check tests the newest code on `main` without a version bump: the CI prerelease stays the
build of a version (docs/architecture.md › Device builds). The build keeps the plugin's
`versionName` and `versionCode`, since the owner ruled out version suffixes (#155) and PluginHost
updates a plugin over an equal `versionCode`; only the file name carries the commit, so the tablet's
picker never takes an older copy. `--install` hands the file to `inkctl plugin install
--same-version`, which proves the update by PluginHost's own install line.

The Ink Tools Helper app and the Lingo app are not plugins: they keep their CI build, whose stable
signing key lives only in the repository secrets (#223, docs/security.md).

Exit 0 when built (and installed), 2 on a refused input, 1 when the build fails, else inkctl's code.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import zipfile
from typing import Callable, Sequence

ROOT = pathlib.Path(__file__).resolve().parent.parent
INKCTL = ROOT / "cli" / "inkctl" / "src" / "inkctl"
CONFIG = "PluginConfig.json"
# The shared code a plugin bundles: a change there changes the build too.
SHARED = "packages"
EXIT_FAILED, EXIT_USAGE = 1, 2
IDENTITY = ("pluginID", "versionName", "versionCode")

Runner = Callable[..., subprocess.CompletedProcess]


class Refused(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


def git(run: Runner, root: pathlib.Path, *words: str) -> subprocess.CompletedProcess:
    return run(["git", "-C", str(root), *words], capture_output=True, text=True)


def plugin_folder(root: pathlib.Path, name: str) -> pathlib.Path:
    """The plugin folder `name` names, or a refusal that says why it is none."""
    folder = (root / name).resolve()
    if folder.parent == (root / "apps").resolve():
        raise Refused(EXIT_USAGE, f"{name} is an app, not a plugin: it keeps its CI build, signed with the stable key only CI holds (#223)")
    if folder.parent != (root / "plugins").resolve() or not (folder / CONFIG).is_file():
        raise Refused(EXIT_USAGE, f"{name} is no plugin folder under plugins/ with a {CONFIG}")
    return folder


def commit_of(run: Runner, root: pathlib.Path, folder: pathlib.Path) -> str:
    """The short commit the build holds: the tree must be clean where the plugin's code lives, and
    the commit on origin/main, so the file name names the code inside it."""
    dirty = git(run, root, "status", "--porcelain", "--", str(folder), str(root / SHARED)).stdout.strip()
    if dirty:
        raise Refused(EXIT_USAGE, f"uncommitted changes under {folder.name} or {SHARED}/; commit and land them first:\n{dirty}")
    if git(run, root, "merge-base", "--is-ancestor", "HEAD", "origin/main").returncode != 0:
        raise Refused(EXIT_USAGE, "HEAD is not on origin/main; a device check builds landed code")
    return git(run, root, "rev-parse", "--short=7", "HEAD").stdout.strip()


def identity(config: dict) -> dict:
    return {key: str(config.get(key)) for key in IDENTITY}


def packaged_config(path: pathlib.Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        member = next((name for name in archive.namelist() if name.rpartition("/")[2] == CONFIG), None)
        if member is None:
            raise Refused(EXIT_FAILED, f"{path} holds no {CONFIG}")
        return json.loads(archive.read(member))


def build(folder: pathlib.Path, out: pathlib.Path, commit: str, run: Runner) -> tuple[pathlib.Path, dict]:
    """Build the plugin and copy its package to out/<name>-<version>-main-<commit>.snplg."""
    package = json.loads((folder / "package.json").read_text(encoding="utf-8"))
    for words in ([sys.executable, str(ROOT / "scripts" / "npm_install.py")], ["npm", "run", "build"]):
        if run(words, cwd=folder).returncode != 0:
            raise Refused(EXIT_FAILED, f"{' '.join(words[-2:])} failed in {folder.name}")
    built = folder / "build" / "outputs" / f"{package['name']}.snplg"
    if not built.is_file():
        raise Refused(EXIT_FAILED, f"the build left no {built.relative_to(folder)}")
    expected = identity(json.loads((folder / CONFIG).read_text(encoding="utf-8")))
    found = identity(packaged_config(built))
    if found != expected:
        raise Refused(EXIT_FAILED, f"the package's {CONFIG} {found} differs from the checkout's {expected}")
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{package['name']}-{package['version']}-main-{commit}.snplg"
    shutil.copyfile(built, target)
    return target, found


def main(argv: Sequence[str] | None = None, run: Runner = subprocess.run, root: pathlib.Path = ROOT) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("plugin", help="a plugin folder, such as plugins/ink-tools-probe")
    parser.add_argument("--install", action="store_true", help="install it with inkctl plugin install --same-version")
    parser.add_argument("--out", type=pathlib.Path, help="the folder for the file (default: the plugin's build/outputs)")
    args = parser.parse_args(argv)
    try:
        folder = plugin_folder(root, args.plugin)
        commit = commit_of(run, root, folder)
        target, config = build(folder, args.out or folder / "build" / "outputs", commit, run)
    except Refused as refusal:
        print(f"device_build: {refusal}", file=sys.stderr)
        return refusal.code
    print(f"built: {target} ({config['versionName']}, code {config['versionCode']}, {commit})")
    if not args.install:
        return 0
    return run([str(INKCTL), "plugin", "install", str(target), "--same-version", "--overwrite"]).returncode


if __name__ == "__main__":
    sys.exit(main())
