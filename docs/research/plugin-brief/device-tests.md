# Device tests

One entry per build sent to the owner's Manta ([brief section 18](brief.md#18-device-test-protocol)).
A report that comes with a session log gets a scrubbed fixture in `__tests__/fixtures/device-logs/` (`.txt`, since Git ignores `*.log`)
and a row in its `cases.json`, in the same change; `__tests__/deviceLog.test.ts` replays each one
through the PluginHost simulator ([#79](https://github.com/martonpaulo/ink2pic/issues/79)).

## Contents

- [Build 0.1.0 (1), 2026-11-06, firmware 3.31.45](#build-010-1-2026-11-06-firmware-33145)
- [Build 0.1.0 (2), 2026-11-06, firmware 3.31.45](#build-010-2-2026-11-06-firmware-33145)
- [Build 0.1.0 (3), 2026-11-06, firmware 3.31.45](#build-010-3-2026-11-06-firmware-33145)
- [Build 0.1.0 (8), 2026-11-06, firmware 3.31.45](#build-010-8-2026-11-06-firmware-33145)
- [Build 0.1.0 (9), 2026-11-06, firmware 3.31.45](#build-010-9-2026-11-06-firmware-33145)
- [Build 0.1.0 (10), 2026-11-06, firmware 3.31.45](#build-010-10-2026-11-06-firmware-33145)
- [Build 0.1.0 (11), 2026-11-06, firmware 3.31.45](#build-010-11-2026-11-06-firmware-33145)
- [Build 0.1.0 (12), 2026-11-06, firmware 3.31.45](#build-010-12-2026-11-06-firmware-33145)
- [Build 0.1.0 (13), 2026-11-06, firmware 3.31.45](#build-010-13-2026-11-06-firmware-33145)
- [Build 0.1.0 (14), 2026-11-06, firmware 3.31.45](#build-010-14-2026-11-06-firmware-33145)
- [Build 0.1.0 (15), 2026-11-07, firmware 3.31.45](#build-010-15-2026-11-07-firmware-33145)
- [Build 0.1.0 (16), 2026-11-07, firmware 3.31.45](#build-010-16-2026-11-07-firmware-33145)
- [Build 0.1.0 (18), 2026-11-15, firmware 3.31.45](#build-010-18-2026-11-15-firmware-33145)
- [Word Lookup 0.2.0 beta 27 (28), 2026-11-25, Manta](#word-lookup-020-beta-27-28-2026-11-25-manta)
- [Word Lookup 0.2.0 beta 28 (29), 2026-11-25, Manta](#word-lookup-020-beta-28-29-2026-11-25-manta)
- [Word Lookup 0.2.0 beta 30 (31), 2026-11-25, Manta](#word-lookup-020-beta-30-31-2026-11-25-manta)
- [Image Editing 0.1.0 beta 13 (14), 2026-11-25, Manta](#image-editing-010-beta-13-14-2026-11-25-manta)

## Build 0.1.0 (1), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.1`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.1), commit `3b46a22`, issue [#3](https://github.com/martonpaulo/ink2pic/issues/3). Screenshot: [`device-tests/0.1.0-1.jpg`](device-tests/0.1.0-1.jpg).

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 1-3 Install | Ink2Pic in the plugin list | Pass | Installed from `MyStyle` with Add Plugin |
| 4 Sidebar button, S0 | Native modules listed | Inconclusive | `NativeModules (0)`: the object lists no keys in PluginHost. `PixelRatio` 1.875, window 1024 x 1365.33, scale 1.875, `deviceType` 5 |
| 4 Sidebar button, S1 | Both sources answer over HTTPS | Pass | INTERNET answer 2 (always). Openclipart search HTTP 200, 18,322 chars, 32 detail links, 1,005 ms. Openclipart `400px` HTTP 200 `image/png` 24,197 bytes, 365 ms. Commons search HTTP 200, 3 `thumburl`, 885 ms |
| 4 Text box on the page | Report inserted with `insertText` | Pass | The text box appears below the handwriting |
| 6-7 Lasso button, S3 | "soup", "wine", "beer", "tree", "Napoleon" recognized | Fail | Every word: `error 117: Recognition failed. Please try again!` (4 to 8 lasso elements each). The build passed the lasso rect size; other plugins pass the page size |
| 8 Screenshots | Sent | Pass | One screenshot through the Inbox |

Follow-up: build 0.1.0 (2) probes the modules by name and passes the page size to `recognizeElements`.

## Build 0.1.0 (2), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.2`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.2), commit `2bc4bce`, issue [#3](https://github.com/martonpaulo/ink2pic/issues/3). Screenshots: [`0.1.0-2-host.jpg`](device-tests/0.1.0-2-host.jpg), [`0.1.0-2-lasso.jpg`](device-tests/0.1.0-2-lasso.jpg).

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 1-3 Install | Ink2Pic updated | Pass | Published by the `Prerelease` workflow from a tag pushed on the Mac |
| 4 Sidebar button, S0 | Modules listed by name | Pass | Found as TurboModule and legacy: `BlobModule`, `FileReaderModule`, `Networking`, `ImageLoader`, `ImageStoreManager`, `RTNFileUtils`, `FileSelector`, `NativePluginAPI`, `NativePluginManager`, `NativeUIUtils`. None of `RNFSManager`, `RNFetchBlob`, `ReactNativeBlobUtil`, `RNCFileSystem`. No module writes bytes to a file or downloads to a file |
| 4 Sidebar button, S1 | Both sources answer | Pass | Openclipart 200 (32 links), `400px` 200, Commons 200 with 3 `thumburl` |
| 5-6 Lasso button, S3 | Words recognized | Fail | `getPageSize` failed with `1503: File read permission has not been requested`, so recognition was not attempted. The build declared and requested only `INTERNET` |
| 7-8 Screenshots | Sent | Pass | Two screenshots |

Owner's note: always log everything that can help debugging, and request the permissions other plugins request (file read and write). Build 0.1.0 (3) requests `FILE:READ`, `FILE:WRITE` and `INTERNET` first and prints a log of every SDK call with its answer.

## Build 0.1.0 (3), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.3`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.3), commit `e27161e`, issue [#3](https://github.com/martonpaulo/ink2pic/issues/3), the first build the cloud published alone. Screenshots: [`0.1.0-3-host.jpg`](device-tests/0.1.0-3-host.jpg), [`0.1.0-3-lasso-1.jpg`](device-tests/0.1.0-3-lasso-1.jpg), [`0.1.0-3-lasso-3.jpg`](device-tests/0.1.0-3-lasso-3.jpg), [`0.1.0-3-lasso-4.jpg`](device-tests/0.1.0-3-lasso-4.jpg).

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 1-2 Install | Ink2Pic updated | Pass | |
| 3 Permissions | Each granted | Pass | `FILE:READ`, `FILE:WRITE`, `INTERNET`: granted before (always allow from earlier prompts) |
| 4-5 Lasso button, S3 | Five words recognized | Pass | "soup", "wine", "beer", "tree", "Napoleon", each exactly as written. `getPageSize` answered 1920 x 2560 in 15 to 18 ms; `recognizeElements` took 556 to 970 ms; `getLassoElements` 35 to 55 ms |
| 6 Sidebar button | S0 and S1 as in build 2 | Pass | Same modules; Openclipart search 817 ms, `400px` 56 ms, Commons 30 ms |
| 7-8 Screenshots and log | `[log]` readable | Pass | Lasso elements carry `stroke`, `numInPage`, `pageNum`, `layerNum`, `type` and `uuid` |

Result: S0, S1 and S3 are all answered; [#3](https://github.com/martonpaulo/ink2pic/issues/3) is done.

## Build 0.1.0 (8), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.8`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.8), commit `39cfec4`. Seen on the owner's screen mirror.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Icon | A picture frame with a pen | Pass | In the plugin list (side bar) and as «Find picture» in the lasso menu ([#31](https://github.com/martonpaulo/ink2pic/issues/31)) |
| 3 Lasso, Find picture | Six pictures | Fail | The view stayed on «Starting…» with two log lines, `view mounted` and `lifecycle 1`: no button event, no lifecycle 2, and the 2-second watchdog timer never fired. Timers do not run while the host holds the view at lifecycle 1 |
| 4-8 | | Not run | Blocked by step 3 |

Follow-up: build 0.1.0 (9) decides on mount, with no button event and no timer: an active lasso selection opens the lasso flow, else an empty search ([#13](https://github.com/martonpaulo/ink2pic/issues/13)).

## Build 0.1.0 (9), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.9`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.9), commit `42945ad`. Seen on the owner's screen mirror; the Manta was restarted after the install.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Lasso, Find picture | Six pictures | Fail | The view showed «Starting…» and 4 or 5 log lines for an instant, then closed. Nothing reached `MyStyle` (no `Ink2Pic` folder) |
| 3-8 | | Not run | Blocked by step 2 |

Cause, inferred: after deciding the flow, the view's first file call was `FileUtils.getExternalDirPath`; `RTNFileUtils` calls can throw inside the host, where JS cannot catch them, and the host closes the plugin (`j-raghavan/sn-dictionary`, device-verified [REPORTED]). Build 0.1.0 (10) no longer calls `FileUtils` in the product, writes the log file around every call from the start, and writes any JS error into the page and `crash.log` ([#13](https://github.com/martonpaulo/ink2pic/issues/13)).

## Build 0.1.0 (10), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.10`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.10), commit `eee50aa`. Seen on the owner's screen mirror.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| Open from the side bar | Onboarding, then search | Pass, with a defect | `requestPermission(INTERNET)` hit the 20 s call limit while the dialog waited for the owner, so the view said network access was missing; Settings showed it allowed. Fixed: no limit on a dialog, and a check after each request ([#13](https://github.com/martonpaulo/ink2pic/issues/13)) |
| 2 Lasso, Find picture | Six pictures | Pass | `recognizeElements` gave "SOUP" in 1337 ms; Openclipart 32 and Commons 18 results; thumbnails stored |
| 3 Tap a picture | Picture at the word | Pass | A gray ladle placed at the lassoed word; the plugin closed |
| Page 2 of 9 | Pictures | Unclear | One screenshot shows «Searching…» with the pager at 2 / 9 and no pictures |
| 4-8 | | Not reported | |

## Build 0.1.0 (11), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.11`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.11), commit `c2871d1`. Seen on the owner's screen mirror; the owner reported «all worked as expected» for the steps not shown.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Open, permissions | Log and Close, dialogs, then the search | Pass | Onboarding showed Log and Close; the dialog waited for the owner |
| 3 Lasso "apple" | Six pictures, «Loading pictures…» on page 2 | Pass | 1 / 8 pages |
| 4 Tap a picture | Just below the word | Pass | The word stays visible ([#39](https://github.com/martonpaulo/ink2pic/issues/39)) |
| 5 Wi-Fi off | The no-internet sentence and the Library | Pass | Owner report |
| 6 Network Access off | A sentence naming the internet permission | Fail, fixed | The onboarding cards showed with no word on what was missing; Start asked again. Fixed in `c198c4c`: the screen names each missing permission before Start ([#37](https://github.com/martonpaulo/ink2pic/issues/37)) |
| 7 New note, "cat" | A search for "cat" | Pass | Owner report |

## Build 0.1.0 (12), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.12`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.12), commit `256aae2`. Seen on the owner's screen mirror and reported in chat.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Network Access off, Find picture | «Ink2Pic needs internet access…» above Start | Pass | Start then showed the host's «Unable to Access the Network» dialog with Go to Settings |
| 3 Allow, search again | The search runs | Pass | The lasso context was gone after Settings, so the screen said «Could not read the word. Type it instead.»; the typed word searched |
| Library after the install | The pictures saved in builds 10 and 11 | Fail, fixed | «No saved pictures yet»: `library.json` lived in the private folder, which an install empties ([#41](https://github.com/martonpaulo/ink2pic/issues/41)) |
| Keyboard after a typed search | The six tiles and the pager | Fail, fixed | The keyboard stayed open over half of the grid ([#42](https://github.com/martonpaulo/ink2pic/issues/42)) |
| 4 Lasso "apple" again | Pictures at once, from the device | Pass | Owner report ([#16](https://github.com/martonpaulo/ink2pic/issues/16)) |
| 5 `MyStyle/Ink2Pic/logs/` | `session.log` | Pass | Owner report ([#21](https://github.com/martonpaulo/ink2pic/issues/21)) |

## Build 0.1.0 (13), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.13`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.13), commit `c94ff7d`. Owner report «everything worked except half of the pictures», with a screenshot of the Log.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 to 4, 6, 7 | Library kept, typical pictures first, latest press wins, keyboard closes | Pass | Owner report; Wikidata answered (`source wikidata: ok, count 1` for "apple") |
| 5 Tap a picture | Just below the word | Fail on about half | `SecurityException: no DELETE permission` on the second write of `insert-download.png` and of `library.json`: PluginHost counts replacing a shared file as a delete ([#62](https://github.com/martonpaulo/ink2pic/issues/62)) |

## Build 0.1.0 (14), 2026-11-06, firmware 3.31.45

Prerelease [`v0.1.0-dev.14`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.14), commit `fb69a0d`. Owner report «everything working».

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Four inserts in a row | All four in the note | Pass | Shared files written in place ([#62](https://github.com/martonpaulo/ink2pic/issues/62)) |
| 3, 4 Library, then reopen | The four pictures, kept | Pass | `library.json` saves every time |

## Build 0.1.0 (15), 2026-11-07, firmware 3.31.45

Prerelease [`v0.1.0-dev.15`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.15), commit `9ffa54c`, check card E15. Owner screenshots and two session logs.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Insert picture on «apple» | An apple drawing, inserted at once, lassoed | Partial | Inserted at once and lassoed ([#74](https://github.com/martonpaulo/ink2pic/issues/74), [#73](https://github.com/martonpaulo/ink2pic/issues/73)); the picture was the Apple logo outline, and 3 of 6 page-1 pictures were dark ([#81](https://github.com/martonpaulo/ink2pic/issues/81)) |
| 3 «apple logo» | The Apple logo on page 1 | Fail | Sub-brand wordmarks and 2 unrelated pictures on page 1; the plain logo first on page 2 ([#81](https://github.com/martonpaulo/ink2pic/issues/81)) |
| 4 «Miguel de Cervantes» | Drawings and the portrait first; no signature, no text-only picture | Partial | No signature; a monument first, a namesake logo, a quote poster and speckled contours on page 1; the owner's best pick, a clean engraving bust, first on page 2 ([#83](https://github.com/martonpaulo/ink2pic/issues/83)) |
| 5 «Confucious Institute» | «Showing results for» and pictures | Fail | 2 photos and no correction line: the suggestion runs only on an empty page ([#84](https://github.com/martonpaulo/ink2pic/issues/84)); the owner expects the institute's logo ([#81](https://github.com/martonpaulo/ink2pic/issues/81)) |
| 6 Probe pen and page | The view closes and a picture gets the lasso | Pass | The plugin can lasso by itself ([#75](https://github.com/martonpaulo/ink2pic/issues/75)) |
| 7 Lasso last word | Only that word lassoed | Partial | A lone «banana» passes; in phrases only «o» of «frio» and «na» of «China»: the walk stops at an i-dot ([#75](https://github.com/martonpaulo/ink2pic/issues/75)) |
| 8 Session log | Sent | Pass | Letter gaps 6–20 px, word gaps 48–60 px; pauses inside and between words overlap (130–656 ms against 578–1122 ms); `lassoElements` false on a 53 × 52 rect |

## Build 0.1.0 (16), 2026-11-07, firmware 3.31.45

Prerelease [`v0.1.0-dev.16`](https://github.com/martonpaulo/ink2pic/releases/tag/v0.1.0-dev.16), commit `3427c7d`, check card E16. Owner answer A, «everything worked as expected», 2026-11-10, with no note, no screenshot and no session log on record.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| 2 Settings entry, add Português | The «Settings» screen opens | Pass | Plugin Settings entry ([#68](https://github.com/martonpaulo/ink2pic/issues/68), [#70](https://github.com/martonpaulo/ink2pic/issues/70)) |
| 3 Insert best picture on «apple», then Delete | An apple drawing, not the logo, inserted at once and lassoed; Delete removes it | Pass | [#81](https://github.com/martonpaulo/ink2pic/issues/81), [#74](https://github.com/martonpaulo/ink2pic/issues/74), [#73](https://github.com/martonpaulo/ink2pic/issues/73) |
| 4 Lasso last word on «Quem foi Miguel de Cervantes», Choose picture | The whole name lassoed; a clean portrait first | Pass | [#75](https://github.com/martonpaulo/ink2pic/issues/75), [#87](https://github.com/martonpaulo/ink2pic/issues/87), [#83](https://github.com/martonpaulo/ink2pic/issues/83) |
| 5 «apple logo», «Spain», «cold» | The plain logo first; the Spanish flag first, stripes in grey; a snowflake | Pass | [#81](https://github.com/martonpaulo/ink2pic/issues/81), [#89](https://github.com/martonpaulo/ink2pic/issues/89), [#67](https://github.com/martonpaulo/ink2pic/issues/67) |
| 6 Download symbols, then «happy» offline | Symbols with no internet | Pass | [#91](https://github.com/martonpaulo/ink2pic/issues/91) |
| 7 «Confucious Institute» | «Showing results for confucius institute» | Pass | [#84](https://github.com/martonpaulo/ink2pic/issues/84) |
| 8 Session log | Sent | Not on record | The Insert picture timings of [#88](https://github.com/martonpaulo/ink2pic/issues/88) are still unmeasured |

## Build 0.1.0 (18), 2026-11-15, firmware 3.31.45

Prerelease [`ink2pic-v0.1.0-dev.18`](https://github.com/martonpaulo/supernote-tools/releases/tag/ink2pic-v0.1.0-dev.18), commit `f9a37ca`, installed with `snadb plugin install`. Run live with the owner; the agent read the screen and the log over ADB.

| Step | Expected | Result | Notes |
| --- | --- | --- | --- |
| Lasso menu | Insert best picture and Choose picture, each with its own icon; no Lasso last word | Pass | The buttons sit in the shared «⋯» list; icons about 60 px ([#107](https://github.com/martonpaulo/supernote-tools/issues/107), [#32](https://github.com/martonpaulo/supernote-tools/issues/32)) |
| Insert best picture, «apple» | An apple drawing, inserted and lassoed | Pass | `time total` 9734 ms: search 3307, thumbnails 4977, download 714, conversion 117, insert 143, lasso 418; the source search ran twice ([#109](https://github.com/martonpaulo/supernote-tools/issues/109), [#21](https://github.com/martonpaulo/supernote-tools/issues/21), [#19](https://github.com/martonpaulo/supernote-tools/issues/19)) |
| Choose picture, «Leonardo da Vinci» | The red-chalk portrait as found, inserted in grey and lassoed | Pass | No `photo` or `dark` tile became a contour ([#104](https://github.com/martonpaulo/supernote-tools/issues/104), [#109](https://github.com/martonpaulo/supernote-tools/issues/109)) |
| Settings, symbols | The symbols kept in `.ink2pic-symbols` | Fail | «Saved symbols cannot be read now»: the host refuses the path outside its whitelist ([#23](https://github.com/martonpaulo/supernote-tools/issues/23)) |
| Insert definition, «maçã», English only | A clear refusal | Pass | «Add Portuguese or Spanish to the search languages» ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)) |
| Insert definition, «maçã», with Portuguese | A definition below the word | Partial | Inserted in 3.1 s; the box is 200 px wide, the second sense «cama» is wrong, and a picture search ran too ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)) |
| InkHub upload rules | The cover size and format | Pass | Upload Item takes up to 6 thumbnails in a 3:4 slot from the tablet's folders; no pixel size or file type stated ([#100](https://github.com/martonpaulo/supernote-tools/issues/100)) |

## Word Lookup 0.2.0 beta 27 (28), 2026-11-25, Manta

The shared «Insert best picture» flow, now in Word Lookup (Ink2Pic is retired). Prerelease
[`word-lookup-v0.2.0-beta.27`](https://github.com/martonpaulo/ink-tools/releases/tag/word-lookup-v0.2.0-beta.27),
commit `942e2aa`, installed with `inkctl plugin install`; beta 26 measured just before as the base.
«Insert Image» on `Note/Tests/Fixtures.note` page 1, read as «appe»; the agent lassoed the word over
Plugin Diagnostics and read the log over ADB; the fixture note was restored after
([#19](https://github.com/martonpaulo/ink-tools/issues/19)).

| Run | Search | Thumbnails | Insert and lasso | `time total` |
| --- | ---: | ---: | ---: | ---: |
| beta 26, cache hit | 2 ms | 1726 ms | 216 + 392 ms | 2343 ms |
| beta 27, cache miss | 3185 ms (Commons 557, Wikidata 1953, rank 1057) | 1486 ms | 233 + 455 ms | 5380 ms |
| beta 27, cache hit | 2 ms | 1100 ms | 379 + 446 ms | 1932 ms |
| beta 27, «casa» read as «a a», cache miss | 6808 ms (Commons timed out at 5037, then the thin-page retry 1607; Wikidata 2085; rank 72 and 87) | 2698 ms (downloads) | 179 + 448 ms | 10981 ms |

- Recognition takes about 1 s before `time total` starts: 999, 976 and 963 ms.
- Beta 26 measured page 1 one thumbnail per 120 ms, though each took 20 to 110 ms on three threads:
  the leader check re-ran the text scorers after every thumbnail. Beta 27 scores once; the gap is 50 ms.
- No run stopped early (`12 of 12 measured`): the contour of one «solid» tile (479 to 780 ms) sets
  the end of the measure.
- `time rank` is new: ranking 18 results took 1057 ms in the first search after the install, and
  87 ms in a later one on the same JS instance; the first scoring of an instance pays the rest.
- A Commons timeout (5 s) followed by the thin-page retry made the slowest search of the round.

## Word Lookup 0.2.0 beta 28 (29), 2026-11-25, Manta

The Wikidata supplement now waits at most 1.5 s after the main sources (owner D67 C). Prerelease
[`word-lookup-v0.2.0-beta.28`](https://github.com/martonpaulo/ink-tools/releases/tag/word-lookup-v0.2.0-beta.28),
commit `b8b5400`, installed with `inkctl plugin install`; beta 27 measured just before as the base.
«Insert Image» on `Note/Tests/Fixtures.note`, lassoed with `inkctl fixture NAME --lasso word`, log
read over ADB; the fixture note was restored after, checksum checked
([#19](https://github.com/martonpaulo/ink-tools/issues/19)). Each run is a cache miss: a new build
searches each word again.

| Run | Commons | Wikidata | Rank | Search | Thumbnails | `time total` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| beta 27, «maçã» read as «Maea» | 3693 ms | 6566 ms, no results | 137 ms | 6874 ms | 2635 ms | 11114 ms |
| beta 28, «maçã» read as «Maea» | 545 ms | 1943 ms, no results | 136 ms | 2178 ms | 1588 ms | 4556 ms |
| beta 28, «apple» read as «appe» | 1029 ms | 2549 ms, cut (`failed timeout`) | 1077 ms | 3643 ms | 1066 ms | 5375 ms |

- The deadline fired once: Wikidata was cut 1520 ms after Commons answered. On beta 27 the same
  tail held the «maçã» search 2.9 s after Commons; beta 28 would have ended it 1.5 s after.
- The second beta 28 run had a fast network: Wikidata answered 1398 ms after Commons, inside the
  grace, so nothing was cut. Network time varies by about 3 s between runs of the same word.
- «maçã» inserted the same picture on both builds (`commons:136995162`); Wikidata had no results
  for either word, so the cut changed no page 1 here.
- Ranking 18 results for «appe» took 1077 ms in the second search of a fresh JS instance; the first,
  17 results for «Maea», took 136 ms. The slow rank follows the titles, not only a cold instance.

## Word Lookup 0.2.0 beta 30 (31), 2026-11-25, Manta

The ranking no longer builds its style patterns on every query read, nor parses the whole OpenMoji
index for «Insert Image», which searches without OpenMoji (`c5288e8`); the contour hold of `3ed8819`
is in it too. Prerelease
[`word-lookup-v0.2.0-beta.30`](https://github.com/martonpaulo/ink-tools/releases/tag/word-lookup-v0.2.0-beta.30),
commit `1cd89f2`, installed with `inkctl plugin install`. «Insert Image» on `Note/Tests/Fixtures.note`,
lassoed with `inkctl fixture NAME --lasso word` over Plugin Diagnostics (switched off after), log
read over ADB; the fixture note was restored after, checksum checked
([#19](https://github.com/martonpaulo/ink-tools/issues/19)). The first run is the first search of a
fresh JS instance, after the install.

| Run | Commons | Rank | Search | Thumbnails | Insert and lasso | `time total` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| «apple» read as «appe», cache miss | 1395 ms | 192 ms | 1686 ms | 541 ms, 11 of 12 | 244 + 485 ms | 2978 ms |
| «apple» read as «appe», cache hit | | | 2 ms | 413 ms, 11 of 12 | 243 + 560 ms | 1223 ms |
| «maçã» read as «Maea», cache miss | 1820 ms | 60 ms | 1887 ms | 768 ms, 12 of 12 | 179 + 370 ms | 3212 ms |
| «maçã» read as «Maea», cache hit | | | 2 ms | 768 ms, 12 of 12 | 194 + 442 ms | 1413 ms |

- Ranking «appe» took 192 ms in a fresh instance, against 1057 ms (beta 27) and 1077 ms (beta 28);
  «Maea» 60 ms against 136 ms. Under the Hermes VM on the Mac, on the same live lists, the change cut
  the first «appe» ranking from 265-418 ms to 40 ms.
- A cache hit is now inside the 1.5 s limit: 1223 and 1413 ms, against 1932 ms on beta 27.
- A cache miss is 3.0 to 3.2 s, against 4.6 and 5.4 s on beta 28: the search's network wait
  (Commons 1.4 to 1.8 s, Wikidata answering with it) is now most of it.
- «maçã» inserted the same picture as on beta 27 and 28 (`commons:136995162`).
- Recognition still takes 0.8 to 1.5 s before `time total` starts: 1458, 930, 792 and 846 ms.

## Image Editing 0.1.0 beta 13 (14), 2026-11-25, Manta

The toolbar button and the plugin icon ([#248](https://github.com/martonpaulo/ink-tools/issues/248)). Prerelease
[`image-editing-v0.1.0-beta.13`](https://github.com/martonpaulo/ink-tools/releases/tag/image-editing-v0.1.0-beta.13),
commit `2f374d9`, installed with `inkctl plugin install`, driven with `inkctl`; nothing was written
on the fixture note.

| Check | Expected | Result | Evidence |
| --- | --- | --- | --- |
| Plugin icon | The plugin list holds an icon | Pass | `iconPath` reads the plugin's own `icon.png` |
| Buttons | Lasso row and toolbar button both registered | Pass | `register Image Editing: ok`, `register Image Editing toolbar button: ok` |
| Toolbar press, nothing lassoed | Needs: «Lasso a picture first», two steps, Close | Pass | the view showed it; `getLassoElements` answered 904; Close closed it |
| Toolbar press after a lasso, through the «Plugins» menu | The editor on the picture | Fail | opening the menu cleared the lasso: 904 again, so Needs showed |

- A pinned toolbar button is one tap with no menu; whether it keeps the lasso needs the owner's pin.
