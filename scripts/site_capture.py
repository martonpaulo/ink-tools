#!/usr/bin/env python3
"""Take the site's tool pictures and videos again, on the Mac with the tablet (#414).

Run it after a design change or a release, on the Mac with the tablet attached:

    python3 scripts/site_capture.py [--only ID]... [--tablet-ip HOST] [--dry-run]

Each shot of design/site-media/shots.json runs its `steps` through inkctl, then:

- a tablet picture is `inkctl screen`, resized and saved as site/media/ID.jpg;
- a tablet video is `screenrecord` over the cable for the shot's seconds while its `record` steps
  run, copied off the tablet, muted, resized and saved as site/media/ID.mp4 with a poster frame
  site/media/ID-poster.jpg;
- a Mac render is the Note Editor's off-screen render (`make renders`), resized.

A `hand` step is the owner's: the script prints it and waits for Enter, so the owner does only
the pen and the taps no command reaches. Privacy: every shot runs on test notes under
Note/Tests/ with synthetic content; a step that passes `--allow-notes` or opens a note outside
Note/Tests/ is refused before anything runs, and `inkctl screen` itself refuses a note outside
that folder. At the end it runs `site_media.py write` and `check`, so the page shows what was
taken. Needs ImageMagick (`magick`) for pictures and `ffmpeg` for videos. `--dry-run` prints
every command and runs none.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_media  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INKCTL = ROOT / "cli/inkctl/src/inkctl"
EDITOR = Path("apps/note-editor")
TEST_NOTES = "Note/Tests/"
NOTE_OPENERS = (("note", "open"), ("note", "new"))
REFUSED_FLAG = "--allow-notes"
TABLET_IP = "{tablet_ip}"
# Where screenrecord writes on the tablet: the shared Download folder, removed after the copy.
DEVICE_RECORDING = "/sdcard/Download/inktools-site-capture.mp4"
JPEG_QUALITY = "82"
VIDEO_CRF = "30"  # x264 quality: higher is smaller; e-ink frames are flat and stay sharp at 30
POSTER_QUALITY = "4"  # ffmpeg's JPEG scale, 2 best to 31 worst
RECORD_MARGIN_SECONDS = 15  # the time screenrecord may take past its own limit to close the file


class CaptureError(Exception):
    """A shot that cannot be taken, as one sentence that says what to do."""


def load_shots(root: Path) -> list[dict]:
    site_media.load(root)  # the same validation the site gate runs
    shots = json.loads((root / site_media.SHOTS).read_text(encoding="utf-8"))["shots"]
    for shot in shots:
        for step in shot.get("steps", []) + shot.get("record", []):
            refuse_private(shot["id"], step)
    return shots


def refuse_private(shot_id: str, step: dict) -> None:
    args = step.get("inkctl")
    if args is None:
        if not step.get("hand"):
            raise CaptureError(f"shot {shot_id} has a step that is neither inkctl nor hand")
        return
    if REFUSED_FLAG in args:
        raise CaptureError(f"shot {shot_id} passes {REFUSED_FLAG}: the site shows only test notes")
    if tuple(args[:2]) in NOTE_OPENERS and not (len(args) > 2 and args[2].startswith(TEST_NOTES)):
        raise CaptureError(f"shot {shot_id} opens a note outside {TEST_NOTES}: the site shows only test notes")


class Runner:
    """Runs, or with dry_run prints, each command; a failed command raises CaptureError."""

    def __init__(self, root: Path, inkctl: list[str], dry_run: bool, tablet_ip: str | None):
        self.root, self.inkctl, self.dry_run, self.tablet_ip = root, inkctl, dry_run, tablet_ip
        self.log: list[list[str]] = []

    def fill(self, args: list[str]) -> list[str]:
        if TABLET_IP in args and not self.tablet_ip:
            raise CaptureError("this shot sends to the tablet over the network: pass --tablet-ip with the tablet's address")
        return [self.tablet_ip if arg == TABLET_IP else arg for arg in args]

    def run(self, command: list[str], env: dict | None = None) -> None:
        self.log.append(command)
        if self.dry_run:
            print("run", " ".join(command))
            return
        done = subprocess.run(command, cwd=self.root, env=env)
        if done.returncode != 0:
            raise CaptureError(f"{' '.join(command)} failed with exit code {done.returncode}")

    def tool(self, *args: str) -> None:
        self.run([*self.inkctl, *self.fill(list(args))])

    def start(self, command: list[str]) -> subprocess.Popen | None:
        self.log.append(command)
        if self.dry_run:
            print("start", " ".join(command))
            return None
        return subprocess.Popen(command, cwd=self.root)

    def hand(self, text: str) -> None:
        print(f"owner: {text}")
        if not self.dry_run:
            input()

    def steps(self, steps: list[dict]) -> None:
        for step in steps:
            if "hand" in step:
                self.hand(step["hand"])
            else:
                self.tool(*step["inkctl"])


def picture(runner: Runner, raw: Path, out: Path, shot: dict, gray: bool) -> None:
    command = ["magick", str(raw), "-resize", f"{shot['width']}x{shot['height']}", "-strip"]
    if gray:
        command += ["-colorspace", "Gray"]
    runner.run([*command, "-quality", JPEG_QUALITY, "-interlace", "Plane", str(out)])


def video(runner: Runner, scratch: Path, out: Path, poster: Path, shot: dict) -> None:
    seconds = str(shot["seconds"])
    recorder = runner.start([*runner.inkctl, "shell", "screenrecord", "--time-limit", seconds, DEVICE_RECORDING])
    runner.steps(shot.get("record", []))
    if recorder is not None:
        try:
            code = recorder.wait(timeout=shot["seconds"] + RECORD_MARGIN_SECONDS)
        except subprocess.TimeoutExpired:
            recorder.kill()
            raise CaptureError("screenrecord did not end in time; the tablet may not allow a screen recording")
        if code != 0:
            raise CaptureError("screenrecord failed; the tablet may not allow a screen recording, so film this one from outside")
    raw = scratch / "raw.mp4"
    runner.tool("files", "pull", DEVICE_RECORDING, str(raw))
    runner.tool("shell", "rm", "-f", DEVICE_RECORDING)
    runner.run([
        "ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-t", seconds, "-an",
        "-vf", f"scale={shot['width']}:{shot['height']}", "-c:v", "libx264", "-crf", VIDEO_CRF,
        "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out),
    ])
    runner.run([
        "ffmpeg", "-loglevel", "error", "-y", "-ss", str(shot["posterAt"]), "-i", str(out),
        "-frames:v", "1", "-q:v", POSTER_QUALITY, str(poster),
    ])


def take(runner: Runner, shot: dict, scratch: Path) -> None:
    """Make the shot's files in scratch, then move them into site/media/ together, so a failed
    shot never leaves a video without its poster."""
    names = site_media.files_of(shot["id"], shot["kind"])
    made = scratch / "out"
    made.mkdir()
    if shot["source"] == "mac-render":
        renders = scratch / "renders"
        runner.run(["make", "-C", str(EDITOR), "renders"], env={**os.environ, "RENDER_EVIDENCE": str(renders)})
        picture(runner, renders / shot["render"], made / names[0], shot, gray=False)
    else:
        runner.steps(shot.get("steps", []))
        if shot["kind"] == "picture":
            raw = scratch / "screen.png"
            runner.tool("screen", str(raw))
            picture(runner, raw, made / names[0], shot, gray=True)
        else:
            video(runner, scratch, made / names[0], made / names[1], shot)
    if runner.dry_run:
        return
    media = runner.root / site_media.MEDIA
    for name in names:
        shutil.move(made / name, media / name)


def needs(shots: list[dict]) -> list[str]:
    tools = []
    if any(shot["kind"] == "picture" for shot in shots):
        tools.append("magick")
    if any(shot["kind"] == "video" for shot in shots):
        tools.append("ffmpeg")
    if any(shot["source"] == "mac-render" for shot in shots):
        tools.append("swift")
    return tools


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", action="append", default=[], metavar="ID", help="take only this shot; repeatable")
    parser.add_argument("--tablet-ip", help="the tablet's network address, for a shot the Mac sends to over LocalSend")
    parser.add_argument("--dry-run", action="store_true", help="print every command and run none")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--inkctl", default=str(INKCTL), help="the inkctl to run (default: this checkout's)")
    args = parser.parse_args(argv)
    try:
        shots = load_shots(args.root)
    except (CaptureError, site_media.MediaError) as error:
        print(f"site_capture: {error}", file=sys.stderr)
        return 1
    unknown = set(args.only) - {shot["id"] for shot in shots}
    if unknown:
        print(f"site_capture: no shot named {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2
    chosen = [shot for shot in shots if not args.only or shot["id"] in args.only]
    missing = [tool for tool in needs(chosen) if shutil.which(tool) is None]
    if missing and not args.dry_run:
        print(f"site_capture: install {', '.join(missing)} first (brew install imagemagick ffmpeg)", file=sys.stderr)
        return 1
    runner = Runner(args.root, [sys.executable, args.inkctl], args.dry_run, args.tablet_ip)
    if any(shot["source"] == "tablet" for shot in chosen):
        try:
            runner.tool("status")
        except CaptureError:
            print("site_capture: the tablet does not answer; attach it by USB or run inkctl wifi on", file=sys.stderr)
            return 1
    (args.root / site_media.MEDIA).mkdir(parents=True, exist_ok=True)
    failed = 0
    for shot in chosen:
        with tempfile.TemporaryDirectory(prefix="site-capture-") as scratch:
            try:
                take(runner, shot, Path(scratch))
                print(f"taken\t{shot['id']}")
            except CaptureError as error:
                failed += 1
                print(f"failed\t{shot['id']}\t{error}")
    if not args.dry_run:
        site_media.main(["write", "--root", str(args.root)])
        if site_media.main(["check", "--root", str(args.root)]) != 0:
            return 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
