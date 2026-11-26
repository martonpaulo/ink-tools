"""Tests for site_media.py and site_capture.py over fixture repositories (#414)."""
from __future__ import annotations

import contextlib
import io
import json
import pathlib
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import site_capture  # noqa: E402
import site_media  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parent.parent
WIDTH, HEIGHT = 720, 960
SECONDS = 6
MARKER = f"written by scripts/site_media.py from {site_media.SHOTS}"
PAGE = (
    "<ul>\n"
    "  <li class=\"card\">\n"
    "    <h3>Pen Tool</h3>\n"
    "    <p>Draws.</p>\n"
    f"    <!-- media:pen: {MARKER} -->\n"
    "    <!-- /media:pen -->\n"
    "  </li>\n"
    "</ul>\n"
)


def jpeg(width: int, height: int, padding: int = 0) -> bytes:
    """The smallest JPEG the size reader accepts: a start, one frame header and an end."""
    frame = struct.pack(">BHHB", 8, height, width, 1) + b"\x01\x11\x00"
    comment = b"\xff\xfe" + struct.pack(">H", padding + 2) + b"\x00" * padding if padding else b""
    return site_media.JPEG_SOI + comment + b"\xff\xc0" + struct.pack(">H", len(frame) + 2) + frame + b"\xff\xd9"


def box(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body) + 8) + kind + body


def mp4(width: int, height: int, seconds: float) -> bytes:
    """An MP4 with a movie header of the given length and one track of the given size."""
    scale = 1000
    mvhd = b"\x00" * 12 + struct.pack(">II", scale, int(seconds * scale)) + b"\x00" * 80
    tkhd = b"\x00" * 76 + struct.pack(">II", width * site_media.FIXED_16_16, height * site_media.FIXED_16_16)
    return box(b"ftyp", b"isom") + box(b"moov", box(b"mvhd", mvhd) + box(b"trak", box(b"tkhd", tkhd)))


class Fixture(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.shots = [
            {"id": "pen-still", "slot": "pen", "kind": "picture", "source": "tablet", "width": WIDTH, "height": HEIGHT,
             "alt": "A test page with a clean triangle.", "caption": "A held stroke becomes a shape.",
             "steps": [{"inkctl": ["fixture", "blank"]}, {"hand": "Draw a triangle, then press Enter."}]},
            {"id": "pen-motion", "slot": "pen", "kind": "video", "source": "tablet", "width": WIDTH, "height": HEIGHT,
             "seconds": SECONDS, "posterAt": 2, "alt": "Video: a word becomes text.", "caption": "The word becomes typed text.",
             "steps": [{"inkctl": ["fixture", "blank"]}], "record": [{"inkctl": ["lasso", "press", "Insert Image"]}]},
        ]
        self.save()
        self.write(str(site_media.PAGE), PAGE)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def save(self) -> None:
        data = {"budget": {"pictureBytes": 4000, "videoBytes": 8000, "videoSeconds": 8}, "slots": ["pen"], "shots": self.shots}
        self.write(str(site_media.SHOTS), json.dumps(data))

    def write(self, path: str, content: str | bytes) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            target.write_bytes(content)
        else:
            target.write_text(content, encoding="utf-8")

    def media(self, name: str, content: bytes) -> None:
        self.write(f"{site_media.MEDIA}/{name}", content)

    def page(self) -> str:
        return (self.root / site_media.PAGE).read_text(encoding="utf-8")


class SiteMediaTest(Fixture):
    def test_repository_passes(self) -> None:
        self.assertEqual(site_media.run(REPO, write=False), [])

    def test_no_media_leaves_the_blocks_empty(self) -> None:
        self.assertEqual(site_media.run(self.root, write=False), [])

    def test_picture_is_lazy_with_its_size_and_alt_text(self) -> None:
        self.media("pen-still.jpg", jpeg(WIDTH, HEIGHT))
        self.assertIn("behind", site_media.run(self.root, write=False)[0])
        self.assertEqual(site_media.run(self.root, write=True), [])
        page = self.page()
        self.assertIn(f'<img src="/media/pen-still.jpg" width="{WIDTH}" height="{HEIGHT}" alt="A test page with a clean triangle." loading="lazy" decoding="async">', page)
        self.assertIn("<figcaption>A held stroke becomes a shape.</figcaption>", page)
        self.assertNotIn("<video", page)
        self.assertEqual(site_media.run(self.root, write=False), [])

    def test_video_loads_only_when_played_and_has_a_text_beside_it(self) -> None:
        self.media("pen-motion.mp4", mp4(WIDTH, HEIGHT, SECONDS))
        self.media("pen-motion-poster.jpg", jpeg(WIDTH, HEIGHT))
        self.assertEqual(site_media.run(self.root, write=True), [])
        page = self.page()
        for wanted in (
            '<video controls muted playsinline preload="none" poster="/media/pen-motion-poster.jpg"',
            'aria-describedby="pen-motion-text"',
            '<figcaption id="pen-motion-text">The word becomes typed text.</figcaption>',
        ):
            self.assertIn(wanted, page)
        self.assertNotIn("autoplay", page)

    def test_written_block_keeps_the_card_indent(self) -> None:
        self.media("pen-still.jpg", jpeg(WIDTH, HEIGHT))
        site_media.run(self.root, write=True)
        self.assertIn("\n    <figure class=\"shot\">\n      <img ", self.page())

    def test_video_without_its_poster_fails(self) -> None:
        self.media("pen-motion.mp4", mp4(WIDTH, HEIGHT, SECONDS))
        with self.assertRaisesRegex(site_media.MediaError, "missing pen-motion-poster.jpg"):
            site_media.run(self.root, write=False)

    def test_file_with_no_shot_fails(self) -> None:
        self.media("holiday.jpg", jpeg(WIDTH, HEIGHT))
        self.assertIn("names no shot", site_media.run(self.root, write=False)[0])

    def test_picture_of_another_size_fails(self) -> None:
        self.media("pen-still.jpg", jpeg(WIDTH * 2, HEIGHT * 2))
        site_media.run(self.root, write=True)
        self.assertIn("not the 720x960", site_media.run(self.root, write=False)[0])

    def test_picture_over_the_budget_fails(self) -> None:
        self.media("pen-still.jpg", jpeg(WIDTH, HEIGHT, padding=5000))
        site_media.run(self.root, write=True)
        self.assertIn("over the budget", site_media.run(self.root, write=False)[0])

    def test_video_longer_than_the_budget_fails(self) -> None:
        self.media("pen-motion.mp4", mp4(WIDTH, HEIGHT, 12))
        self.media("pen-motion-poster.jpg", jpeg(WIDTH, HEIGHT))
        site_media.run(self.root, write=True)
        self.assertIn("lasts 12.0 s", site_media.run(self.root, write=False)[0])

    def test_file_that_is_not_a_jpeg_fails(self) -> None:
        self.media("pen-still.jpg", b"GIF89a")
        site_media.run(self.root, write=True)
        self.assertIn("is not a JPEG", site_media.run(self.root, write=False)[0])

    def test_missing_block_fails(self) -> None:
        self.write(str(site_media.PAGE), "<p>No blocks.</p>\n")
        with self.assertRaisesRegex(site_media.MediaError, "has 0"):
            site_media.run(self.root, write=False)

    def test_shot_without_alt_text_fails(self) -> None:
        self.shots[0]["alt"] = " "
        self.save()
        with self.assertRaisesRegex(site_media.MediaError, "alt text and a caption"):
            site_media.run(self.root, write=False)

    def test_appearance_part_in_an_id_fails(self) -> None:
        self.shots[0]["id"] = "pen-light"
        self.save()
        with self.assertRaisesRegex(site_media.MediaError, "light or dark part"):
            site_media.run(self.root, write=False)

    def test_poster_outside_the_video_fails(self) -> None:
        self.shots[1]["posterAt"] = SECONDS
        self.save()
        with self.assertRaisesRegex(site_media.MediaError, "posterAt"):
            site_media.run(self.root, write=False)


class SiteCaptureTest(Fixture):
    def dry_run(self, *args: str) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = site_capture.main(["--dry-run", "--root", str(self.root), *args])
        return code, out.getvalue()

    def test_refuses_a_note_outside_the_test_notes(self) -> None:
        self.shots[0]["steps"] = [{"inkctl": ["note", "open", "Note/Diary.note"]}]
        self.save()
        code, out = self.dry_run()
        self.assertEqual(code, 1)
        self.assertIn("outside Note/Tests/", out)

    def test_refuses_allow_notes(self) -> None:
        self.shots[1]["record"] = [{"inkctl": ["screen", "x.png", "--allow-notes"]}]
        self.save()
        code, out = self.dry_run()
        self.assertEqual(code, 1)
        self.assertIn("--allow-notes", out)

    def test_picture_runs_its_steps_then_captures_the_screen(self) -> None:
        code, out = self.dry_run("--only", "pen-still")
        self.assertEqual(code, 0)
        lines = out.splitlines()
        self.assertTrue(lines[0].endswith("inkctl status"))
        self.assertTrue(lines[1].endswith("inkctl fixture blank"))
        self.assertEqual(lines[2], "owner: Draw a triangle, then press Enter.")
        self.assertRegex(lines[3], r"inkctl screen \S+screen\.png$")
        self.assertRegex(lines[4], r"^run magick .* -resize 720x960 -strip -colorspace Gray ")
        self.assertEqual(lines[5], "taken\tpen-still")

    def test_video_records_while_its_record_steps_run_and_is_muted(self) -> None:
        code, out = self.dry_run("--only", "pen-motion")
        self.assertEqual(code, 0)
        lines = out.splitlines()
        start = next(i for i, line in enumerate(lines) if line.startswith("start "))
        self.assertIn(f"screenrecord --time-limit {SECONDS} {site_capture.DEVICE_RECORDING}", lines[start])
        self.assertTrue(lines[start + 1].endswith("inkctl lasso press Insert Image"))
        encode = next(line for line in lines if line.startswith("run ffmpeg") and " -an " in line)
        self.assertIn("scale=720:960", encode)
        self.assertTrue(any(f"shell rm -f {site_capture.DEVICE_RECORDING}" in line for line in lines))

    def test_network_send_needs_the_tablet_address(self) -> None:
        self.shots[1]["record"] = [{"inkctl": ["localsend", "send", "a.png", "--ip", site_capture.TABLET_IP]}]
        self.save()
        code, out = self.dry_run("--only", "pen-motion")
        self.assertEqual(code, 1)
        self.assertIn("--tablet-ip", out)
        code, out = self.dry_run("--only", "pen-motion", "--tablet-ip", "192.0.2.7")
        self.assertEqual(code, 0)
        self.assertIn("--ip 192.0.2.7", out)

    def test_unknown_shot_is_bad_usage(self) -> None:
        self.assertEqual(self.dry_run("--only", "nothing")[0], 2)

    def test_repository_shot_list_plans_every_shot(self) -> None:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = site_capture.main(["--dry-run", "--root", str(REPO), "--tablet-ip", "192.0.2.7"])
        self.assertEqual(code, 0, out.getvalue())
        taken = [line.split("\t")[1] for line in out.getvalue().splitlines() if line.startswith("taken\t")]
        listed = [shot["id"] for shot in json.loads((REPO / site_media.SHOTS).read_text(encoding="utf-8"))["shots"]]
        self.assertEqual(taken, listed)
        self.assertNotIn("--allow-notes", out.getvalue())


if __name__ == "__main__":
    unittest.main()
