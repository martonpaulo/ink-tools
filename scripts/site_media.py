#!/usr/bin/env python3
"""Write and check the tool pictures and videos of the site's home page (#414).

design/site-media/shots.json owns every shot: its tool card (slot), size, text alternative,
caption and the steps scripts/site_capture.py takes it with. Each slot is one block of
site/index.html between `<!-- media:SLOT ... -->` and `<!-- /media:SLOT -->`, inside its tool
card. A block holds the shots whose files are all in site/media/, so a shot not taken yet shows
nothing and the page never links a missing file:

- a picture is site/media/ID.jpg, an <img> with its width, height and alt text, loaded lazily
  (the tool cards sit below the fold), with its caption as the <figcaption>;
- a video is site/media/ID.mp4 with its poster site/media/ID-poster.jpg, a muted <video> with
  controls, playsinline and preload="none", so it loads only when played; its caption is the
  text description beside it, named by aria-describedby.

`write` rewrites the blocks. `check` (the site gate) fails when a block differs from what
`write` makes, a slot's block is missing or doubled, a shot lacks an alt text or caption, a
video has only some of its files, a file in site/media/ names no shot, or a file breaks the
budget or the shot's size: a JPEG's width and height, an MP4's track size and duration.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

SHOTS = Path("design/site-media/shots.json")
PAGE = Path("site/index.html")
MEDIA = Path("site/media")
MEDIA_URL = "/media/"
WRITER = f"written by scripts/site_media.py from {SHOTS}"
KINDS = ("picture", "video")
SOURCES = ("tablet", "mac-render")
POSTER_SUFFIX = "-poster.jpg"

# JPEG start-of-frame markers carry the size; C4, C8 and CC are other segments in the same range.
JPEG_SOF = set(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC}
JPEG_SOI = b"\xff\xd8"
JPEG_PREFIX = 0xFF  # every segment starts with it, then its marker byte
JPEG_SEGMENT = struct.Struct(">BBH")  # prefix, marker, then the length that counts itself
JPEG_MARKER_BYTES = 2  # the prefix and marker, which the length does not count
JPEG_PRECISION_BYTES = 1  # a frame header's sample precision, before its height and width
JPEG_FRAME_SIZE = struct.Struct(">HH")
# MP4 boxes that hold other boxes on the way to a track's header.
MP4_CONTAINERS = {b"moov", b"trak"}
FIXED_16_16 = 1 << 16  # a 16.16 fixed-point value is this many times its whole part
# A movie header's timescale and duration: after 32-bit times in version 0, 64-bit in version 1.
MVHD_LAYOUTS = {0: (">II", 12), 1: (">IQ", 20)}
TKHD_SIZE = struct.Struct(">II")  # a track header ends with its width and height, 16.16 fixed


class MediaError(Exception):
    """A shot list, page or media file the check refuses, as one sentence."""


@dataclass(frozen=True)
class Shot:
    id: str
    slot: str
    kind: str
    width: int
    height: int
    alt: str
    caption: str
    seconds: int | None

    def files(self) -> list[str]:
        return files_of(self.id, self.kind)


def files_of(shot_id: str, kind: str) -> list[str]:
    """A shot's files in site/media/: a picture's JPEG, or a video's MP4 and then its poster."""
    if kind == "picture":
        return [f"{shot_id}.jpg"]
    return [f"{shot_id}.mp4", f"{shot_id}{POSTER_SUFFIX}"]


def load(root: Path) -> tuple[dict, list[str], list[Shot]]:
    data = json.loads((root / SHOTS).read_text(encoding="utf-8"))
    slots = data["slots"]
    budget = data["budget"]
    shots: list[Shot] = []
    seen: set[str] = set()
    for raw in data["shots"]:
        shot_id = raw["id"]
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", shot_id):
            raise MediaError(f"shot id «{shot_id}» is not kebab case")
        if re.search(r"(^|-)(light|dark)(-|$)", shot_id):
            raise MediaError(f"shot id «{shot_id}» has a light or dark part, which the site check reads as an appearance twin")
        if shot_id in seen:
            raise MediaError(f"shot id «{shot_id}» is listed twice")
        seen.add(shot_id)
        if raw["slot"] not in slots:
            raise MediaError(f"shot {shot_id} names the slot «{raw['slot']}», which slots does not list")
        if raw["kind"] not in KINDS or raw.get("source") not in SOURCES:
            raise MediaError(f"shot {shot_id} needs a kind in {KINDS} and a source in {SOURCES}")
        alt, caption = raw.get("alt", "").strip(), raw.get("caption", "").strip()
        if not alt or not caption:
            raise MediaError(f"shot {shot_id} needs an alt text and a caption")
        # A screen reader reads an alt text whole, so it stays one sentence.
        if len(alt) > budget["altCharacters"]:
            raise MediaError(f"shot {shot_id}'s alt text is longer than {budget['altCharacters']} characters")
        seconds = raw.get("seconds")
        if raw["kind"] == "video":
            if not seconds or seconds > budget["videoSeconds"]:
                raise MediaError(f"video {shot_id} needs seconds, at most {budget['videoSeconds']}")
            if not 0 <= raw.get("posterAt", -1) < seconds:
                raise MediaError(f"video {shot_id} needs a posterAt second inside its length")
        if raw["source"] == "mac-render" and not raw.get("render"):
            raise MediaError(f"shot {shot_id} comes from a Mac render and needs its render file name")
        shots.append(Shot(shot_id, raw["slot"], raw["kind"], raw["width"], raw["height"], alt, caption, seconds))
    return budget, slots, shots


def jpeg_size(data: bytes) -> tuple[int, int]:
    if not data.startswith(JPEG_SOI):
        raise MediaError("is not a JPEG")
    at = len(JPEG_SOI)
    while at + JPEG_SEGMENT.size <= len(data):
        prefix, marker, length = JPEG_SEGMENT.unpack_from(data, at)
        if prefix != JPEG_PREFIX:
            raise MediaError("has a broken JPEG segment")
        if marker in JPEG_SOF:
            height, width = JPEG_FRAME_SIZE.unpack_from(data, at + JPEG_SEGMENT.size + JPEG_PRECISION_BYTES)
            return width, height
        at += JPEG_MARKER_BYTES + length
    raise MediaError("has no JPEG frame header")


def mp4_boxes(data: bytes, start: int, end: int):
    at = start
    while at + 8 <= end:
        size, kind = struct.unpack(">I4s", data[at:at + 8])
        header = 8
        if size == 1:
            size = struct.unpack(">Q", data[at + 8:at + 16])[0]
            header = 16
        elif size == 0:
            size = end - at
        if size < header:
            raise MediaError("has a broken MP4 box")
        yield kind, at + header, at + size
        at += size


def mp4_facts(data: bytes) -> tuple[float, tuple[int, int]]:
    """The movie's duration in seconds and its first video track's width and height."""
    duration: float | None = None
    size: tuple[int, int] | None = None

    def walk(start: int, end: int) -> None:
        nonlocal duration, size
        for kind, body, stop in mp4_boxes(data, start, end):
            if kind in MP4_CONTAINERS:
                walk(body, stop)
            elif kind == b"mvhd" and duration is None:
                if data[body] not in MVHD_LAYOUTS:
                    raise MediaError("has a movie header of an unknown version")
                layout, offset = MVHD_LAYOUTS[data[body]]
                scale, length = struct.unpack_from(layout, data, body + offset)
                duration = length / scale if scale else None
            elif kind == b"tkhd" and size is None:
                width, height = TKHD_SIZE.unpack_from(data, stop - TKHD_SIZE.size)
                if width and height:
                    size = (width // FIXED_16_16, height // FIXED_16_16)

    walk(0, len(data))
    if duration is None or size is None:
        raise MediaError("is not an MP4 with a movie header and a video track")
    return duration, size


def present(root: Path, shot: Shot) -> bool:
    found = [(root / MEDIA / name).is_file() for name in shot.files()]
    if any(found) and not all(found):
        missing = [name for name, there in zip(shot.files(), found) if not there]
        raise MediaError(f"shot {shot.id} has only some of its files; missing {', '.join(missing)}")
    return all(found)


def check_files(root: Path, budget: dict, shot: Shot) -> list[str]:
    problems: list[str] = []
    for name in shot.files():
        data = (root / MEDIA / name).read_bytes()
        is_video = name.endswith(".mp4")
        limit = budget["videoBytes"] if is_video else budget["pictureBytes"]
        if len(data) > limit:
            problems.append(f"{MEDIA}/{name} is {len(data)} bytes, over the budget of {limit}")
        try:
            if is_video:
                seconds, size = mp4_facts(data)
                if seconds > budget["videoSeconds"]:
                    problems.append(f"{MEDIA}/{name} lasts {seconds:.1f} s, over {budget['videoSeconds']} s")
            else:
                size = jpeg_size(data)
        except MediaError as error:
            problems.append(f"{MEDIA}/{name} {error}")
            continue
        if size != (shot.width, shot.height):
            problems.append(f"{MEDIA}/{name} is {size[0]}x{size[1]}, not the {shot.width}x{shot.height} its shot names")
    return problems


def figure(shot: Shot) -> str:
    alt, caption = html.escape(shot.alt), html.escape(shot.caption, quote=False)
    if shot.kind == "picture":
        return (
            '<figure class="shot">\n'
            f'  <img src="{MEDIA_URL}{shot.id}.jpg" width="{shot.width}" height="{shot.height}" alt="{alt}" loading="lazy" decoding="async">\n'
            f"  <figcaption>{caption}</figcaption>\n"
            "</figure>"
        )
    return (
        '<figure class="shot">\n'
        f'  <video controls muted playsinline preload="none" poster="{MEDIA_URL}{shot.id}{POSTER_SUFFIX}" width="{shot.width}" height="{shot.height}" aria-label="{alt}" aria-describedby="{shot.id}-text">\n'
        f'    <source src="{MEDIA_URL}{shot.id}.mp4" type="video/mp4">\n'
        "  </video>\n"
        f'  <figcaption id="{shot.id}-text">{caption}</figcaption>\n'
        "</figure>"
    )


def block_pattern(slot: str) -> re.Pattern[str]:
    return re.compile(
        rf"^(?P<indent>[ \t]*)<!-- media:{re.escape(slot)}: .*?-->\n(?P<body>.*?)^[ \t]*<!-- /media:{re.escape(slot)} -->$",
        re.MULTILINE | re.DOTALL,
    )


def render(page: str, slots: list[str], shots: list[Shot], shown: set[str]) -> str:
    for slot in slots:
        pattern = block_pattern(slot)
        found = pattern.findall(page)
        if len(found) != 1:
            raise MediaError(f"{PAGE} needs one media block for the slot {slot}, and has {len(found)}")
        match = pattern.search(page)
        indent = match.group("indent")
        figures = [figure(shot) for shot in shots if shot.slot == slot and shot.id in shown]
        body = "".join(
            "".join(f"{indent}{line}\n" for line in item.splitlines()) for item in figures
        )
        block = f"{indent}<!-- media:{slot}: {WRITER} -->\n{body}{indent}<!-- /media:{slot} -->"
        page = page[:match.start()] + block + page[match.end():]
    return page


def run(root: Path, write: bool) -> list[str]:
    budget, slots, shots = load(root)
    problems: list[str] = []
    shown = {shot.id for shot in shots if present(root, shot)}
    known = {name for shot in shots for name in shot.files()}
    folder = root / MEDIA
    if folder.is_dir():
        problems += [f"{MEDIA}/{path.name} names no shot of {SHOTS}" for path in sorted(folder.iterdir()) if path.name not in known]
    for shot in shots:
        if shot.id in shown:
            problems += check_files(root, budget, shot)
    page_path = root / PAGE
    page = page_path.read_text(encoding="utf-8")
    wanted = render(page, slots, shots, shown)
    if write:
        if wanted != page:
            page_path.write_text(wanted, encoding="utf-8")
    elif wanted != page:
        problems.append(f"{PAGE}'s media blocks are behind {SHOTS} and {MEDIA}/: run python3 scripts/site_media.py write")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=("check", "write"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args(argv)
    try:
        problems = run(args.root, args.action == "write")
    except (MediaError, KeyError, json.JSONDecodeError) as error:
        print(f"site_media: {error}", file=sys.stderr)
        return 1
    for problem in problems:
        print(f"site_media: {problem}", file=sys.stderr)
    if problems:
        return 1
    print(f"site_media: OK ({args.action})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
