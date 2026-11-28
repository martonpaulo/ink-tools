# Feature defaults

Every user-facing feature of every Ink Tools tool, with its default and whether the person can
change it: the path to the control, or `fixed:` and why
([#547](https://github.com/martonpaulo/ink-tools/issues/547)). A plugin's path starts at its own
Settings screen, which opens from the tablet's Settings › Apps › Plugins › *plugin* › «Settings»
(`docs/supernote.md`); a Puzzles path starts at the game's view. «Key» names the stored settings key,
or the game id, and `-` for a value nothing stores.

`scripts/feature_defaults.py` (gate `docs`) fails on a tool of `docs/tools.json` with no section, a
listed feature with no row, or a row with no decision; each plugin's `__tests__/featureDefaults.test.ts`
fails on a settings key or a game with no row. The owner confirms each default he has not set
before ([#547](https://github.com/martonpaulo/ink-tools/issues/547)); until then a row records the
current value.


## Contents

- [Smart Pen](#smart-pen)
- [Lasso Actions](#lasso-actions)
- [Image Editing](#image-editing)
- [Device Link](#device-link)
- [Account Sync](#account-sync)
- [Puzzles](#puzzles)
- [Handwriting Language](#handwriting-language)
- [Note Editor](#note-editor)
- [Ink Tools Control](#ink-tools-control)
- [Ink Tools Helper](#ink-tools-helper)
- [Ink Tools Probe](#ink-tools-probe)

## Smart Pen

Settings live in the private folder's `settings.json` and survive a restart. A module's own rows
show only while that module is on.

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Real-Time Text | on | Smart Pen › Modules › Real-Time Text | `modules.text` |
| Real-Time Text › Start with Real-Time Text on | off | Smart Pen › Real-Time Text › Start with Real-Time Text on | `text.startOn` |
| Real-Time Text › Word spacing | Normal | Smart Pen › Word spacing | `text.spacing` |
| Real-Time Text › Wait before converting | Normal (2 s) | Smart Pen › Wait before converting | `text.wait` |
| Real-Time Text › Font | the tablet's default font | fixed: choosing a font comes after the device check | - |
| Undo Conversion | in the sidebar while Real-Time Text is on | Smart Pen › Modules › Real-Time Text | - |
| Smart Shapes | on | Smart Pen › Modules › Smart Shapes | `modules.shapes` |
| Smart Shapes › Smallest shape | 16 mm | Smart Pen › Smallest shape | `shapes.minSizeMm` |
| Smart Shapes › Triangle | on | Smart Pen › Shapes › Triangle | `shapes.shapes.triangle` |
| Smart Shapes › Circle | on | Smart Pen › Shapes › Circle | `shapes.shapes.circle` |
| Smart Shapes › Square | on | Smart Pen › Shapes › Square | `shapes.shapes.square` |
| Smart Shapes › Rectangle | on | Smart Pen › Shapes › Rectangle | `shapes.shapes.rect` |
| Smart Shapes › Arrow | on | Smart Pen › Shapes › Arrow | `shapes.shapes.arrow` |
| Smart Shapes › Hold still at the end | 350 ms | fixed: Snap's default | - |
| Smart Shapes › Tolerance | 3 of 5 | fixed: Snap's middle tolerance | - |
| Smart Shapes › Straighten to the page axes | within 8° | fixed: no setting yet; the owner decides whether one is needed | - |

## Lasso Actions

Settings live in the private folder's `settings.json`, version 2.

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Word Lookup | on | Lasso Actions › Modules › Lookup | `modules.lookup` |
| Word Lookup › Insert Sticker | on | Lasso Actions › Lasso buttons › Insert Sticker | `lookup.illustration` |
| Word Lookup › Insert Image | on | Lasso Actions › Lasso buttons › Insert Image | `lookup.photo` |
| Word Lookup › Choose Image | on | Lasso Actions › Lasso buttons › Choose Image | `lookup.choose` |
| Word Lookup › Insert Definition | off | Lasso Actions › Lasso buttons › Insert Definition | `lookup.definition` |
| Word Lookup › Insert Summary | on | Lasso Actions › Lasso buttons › Insert Summary | `lookup.summary` |
| Word Lookup › Translate ES→PT | on | Lasso Actions › Translation buttons › Translate ES→PT | `lookup.directions.es-pt` |
| Word Lookup › Translate PT→ES | off | Lasso Actions › Translation buttons › Translate PT→ES | `lookup.directions.pt-es` |
| Word Lookup › Translate ZH→PT | on | Lasso Actions › Translation buttons › Translate ZH→PT | `lookup.directions.zh-pt` |
| Word Lookup › Translate PT→ZH | on | Lasso Actions › Translation buttons › Translate PT→ZH | `lookup.directions.pt-zh` |
| Word Lookup › Language pairs | PT↔ES and PT↔ZH | fixed: no English pair for now | - |
| Word Lookup › Picture sources | Openclipart, Wikimedia Commons, Wikidata and OpenMoji all on | Lasso Actions › Picture sources › *source*; the last one on stays on, as a search with no source finds nothing | `lookup.sourcesOff` |
| Word Lookup › Data saver | off | Lasso Actions › Data saver | `lookup.dataSaver` |
| Word Lookup › Picture size | 200 px, below the word | fixed: the owner's one small size | - |
| Word Lookup › Saved pictures folder | the plugin's private folder | fixed: it is not synced, and each synced file slows every sync | - |
| Convert to Text | not built yet | fixed: it joins once Smart Pen's conversion engine is on `main` | - |
| Headings | on | Lasso Actions › Modules › Headings | `modules.headings` |
| Headings › Heading Size | Own Size | Lasso Actions › Heading Size | `headings.size` |
| Collection | on | Lasso Actions › Modules › Collection | `modules.collection` |
| Collection › Keep After Paste | off | Paste Collection › Keep After Paste | `collection.keepAfterPaste` |

## Image Editing

The switches live in memory only and return to their defaults when the plugin restarts, until the
plugin keeps a settings file ([#40](https://github.com/martonpaulo/ink-tools/issues/40)).

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Enhance | on; Lighter and Darker on | Image Editing › Editor buttons › Enhance, Lighter, Darker | - |
| Enhance › Lighter and Darker step | one fixed gamma step | fixed: no setting yet; the owner decides whether one is needed | - |
| Crop | on | Image Editing › Editor buttons › Crop | - |
| Erase | on | Image Editing › Editor buttons › Erase | - |
| Remove background | on | Image Editing › Editor buttons › Remove background | - |
| Make sticker | on | Image Editing › Editor buttons › Make sticker | - |
| Document | on | Image Editing › Editor buttons › Document | - |
| Other editor buttons | Undo, Restore original, Rotate 90°, Mirror, Flip, Invert, Trim, Styles, Enhance All Images and Undo All Images all on | Image Editing › Editor buttons › *edit* | - |
| Styles | Photo, Line art, Black and white, Dither and Clean dither all on | Image Editing › Styles › *style*; with every style off, the Styles button goes | - |
| Styles › White to transparent | off | Styles › White to transparent, kept in `styles.json` | `transparent` |
| Styles › Thicker lines | off | Styles › Thicker lines, kept in `styles.json` | `thick` |
| Styles › Order | the last style chosen comes first | fixed: it follows the person's last choice, kept in `styles.json` | `last` |
| Save edit input | off | Image Editing › Debug › Save edit input | - |

## Device Link

Settings live in the private folder's `settings.json`.

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Send Page | lists the device picked last first | Device Link › Show first when sending | `last` |
| Send Selection | lists the device picked last first | Device Link › Show first when sending | - |
| Send Page › Trusted receivers | each receiver pinned on the first send | Device Link › Show first when sending: picking the device again trusts a changed identity | `pins` |
| Send Page › Own identity | random, made once | fixed: a receiver knows this tablet by it | `fingerprint` |
| Send Page › Name shown to LocalSend | «Supernote» | fixed: no setting yet; the owner decides whether one is needed | - |
| Receive | off in the background; a tap on «Receive» listens for 2 minutes | Device Link › Receive in the background | `background` |
| Receive › Largest file | 30 MB | fixed: the native receiver's limit | - |
| Receive › Most pages of a PDF | 50 | fixed: more pages than a scan of study cards needs, few enough to render in seconds | - |
| Receive › Font size of a received text | 32 | fixed: no setting yet; the owner decides whether one is needed | - |
| Editor helper | applies edits only when the Mac's Note Editor sends them | fixed: the Mac decides each edit | - |

## Account Sync

Settings live in the private folder's `settings.json`, schema 1. Every module and account is off
until the person turns it on; an account's row shows «Connect» while its module is on.

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| To-Do | off | Account Sync › To-Do › Sync To-Do | `modules.todo` |
| To-Do › Todoist | off | Account Sync › To-Do › Todoist | `providers.todoist` |
| To-Do › Send tablet-only items | off | Account Sync › To-Do › Send tablet-only items | `sendTabletOnly.todo` |
| Calendar | off | Account Sync › Calendar › Sync Calendar | `modules.calendar` |
| Calendar › Google | off | Account Sync › Calendar › Google | `providers.google` |
| Calendar › iCloud | off | Account Sync › Calendar › iCloud | `providers.icloud` |
| Calendar › ICS | off | Account Sync › Calendar › ICS | `providers.ics` |
| Calendar › ICS feeds | none, at most 20 | Account Sync › ICS feeds › Add feed, Remove | `icsFeeds` |
| Calendar › Send tablet-only items | off | Account Sync › Calendar › Send tablet-only items | `sendTabletOnly.calendar` |
| Calendar › Calendar for new tablet events | None: keep them on the tablet | Account Sync › Calendar for new tablet events | `defaultCalendarId` |
| Digest | off | Account Sync › Digest › Sync Digest | `modules.digest` |
| Accounts | not connected; the row shows «Connect» | Account Sync › *provider* account › Connect, Sign out | `accounts` |
| Automatic sync | at plugin start, then every 30 minutes | fixed: a guess until a device round measures the cost; «Sync now» runs one by hand | - |

## Puzzles

Each game's view opens on the choices of its last «Add Page», kept across a restart; the defaults
below are what a game never used opens on ([#569](https://github.com/martonpaulo/ink-tools/issues/569)).

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Maze | Rectangle, Easy | Puzzles › Maze › Shape, Difficulty | `maze` |
| Jigsaw Sudoku | Easy | Puzzles › Jigsaw Sudoku › Difficulty | `jigsaw-sudoku` |
| Sudoku | 9 x 9, Easy | Puzzles › Sudoku › Size, Difficulty | `sudoku` |
| Killer Sudoku | Easy | Puzzles › Killer Sudoku › Difficulty | `killer-sudoku` |
| Calcudoku | 4 x 4, Easy | Puzzles › Calcudoku › Size, Difficulty | `calcudoku` |
| Futoshiki | 4 x 4, Easy | Puzzles › Futoshiki › Size, Difficulty | `futoshiki` |
| Kakuro | 6 x 6, Easy | Puzzles › Kakuro › Size, Difficulty | `kakuro` |
| Slitherlink | 5 x 5, Easy | Puzzles › Slitherlink › Size, Difficulty | `slitherlink` |
| Bridges | 7 x 7, Easy | Puzzles › Bridges › Size, Difficulty | `bridges` |
| Nonogram | 5 x 5, Easy | Puzzles › Nonogram › Size, Difficulty | `nonogram` |
| Star Battle | 5 x 5, 1 star, Easy | Puzzles › Star Battle › Size, Stars, Difficulty | `star-battle` |
| Binairo | 6 x 6, Easy | Puzzles › Binairo › Size, Difficulty | `binairo` |
| Hitori | 5 x 5, Easy | Puzzles › Hitori › Size, Difficulty | `hitori` |
| Dots and Boxes | no choices | fixed: a pass-and-play board has one layout | `dots-and-boxes` |
| Gomoku | no choices | fixed: a pass-and-play board has one layout | `gomoku` |
| Ultimate Tic-Tac-Toe | no choices | fixed: a pass-and-play board has one layout | `ultimate-tic-tac-toe` |
| Page hand | right | fixed: every page is laid out for the right hand until a player asks for the choice | - |
| New page place | after the current page | fixed: the page a puzzle goes on is always new, so erasing never erases the grid | - |

## Handwriting Language

The app's own screen, titled «Handwriting Language»; settings live in its preferences.

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Switch Language | cycles Português (Brasil), English (US) and Español, each only when installed | Handwriting Language › Languages in the Cycle; one stays at least | `cycle` |
| Switch Language › Cycle order | the default order, then the rest alphabetically | fixed: no setting yet; the owner decides whether one is needed | - |
| Switch Language › Writing screens | keyboard, notes, Digest, To-Do and Email | fixed: from the registry of device facts | - |
| Floating button | Where You Write | Handwriting Language › Floating Button | `button` |
| Floating button › Position | top trailing corner, 600 px from the top | drag the button; Handwriting Language › Reset Button Position | `place_x`, `place_y` |

## Note Editor

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Open a note | opens on Zoom to Width, Continuous Scroll, the Pages sidebar | View › Zoom, page layout, Pages or Headings; not kept | - |
| Open from Tablet | copies the note over the cable through `inkctl` | fixed: the one way the Mac app reads the tablet now | - |
| Edit › Where edits are saved | the tablet when connected, else the Mac | fixed: a Settings › Tablet choice waits on [#496](https://github.com/martonpaulo/ink-tools/issues/496) | - |
| Edit | the rectangle selection | Tools › Rectangle, Lasso | - |
| Edit › New text box font size | 40 | Insert › the sheet of each box | - |
| Edit › Shape line width | 3 px, black | fixed: one width for every shape | - |
| Edit › Backups per note | the 10 newest | fixed: the owner's number | - |

## Ink Tools Control

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Control | the tablet in `$SUPERNOTE_ADDRESS`, else the first line of `~/.config/inkctl/address` | inkctl › `$SUPERNOTE_ADDRESS` or the address file | - |
| Control › Read-only mode | off | inkctl › `--read-only` or `$SUPERNOTE_READ_ONLY` | - |
| Control › JSON output | off | inkctl › `--json` | - |
| Control › Wait timeout | 30 s; 60 s for a sync or a plugin action | inkctl › `--timeout` | - |
| Control › Poll interval | 0.5 s | inkctl › `$INKCTL_POLL_SECONDS` | - |
| Control › Wi-Fi ADB port | 5555 | fixed: the port `adb tcpip` opens | - |
| Plugins | installs and switches plugins through Ink Tools Helper | inkctl › plugin subcommands | - |
| Notes and ink | refuses the notes folder and the note on screen, but `Note/Tests/` | inkctl › `--allow-notes` | - |
| Notes and ink › Replace a file | refused | inkctl › `--overwrite` | - |
| Firmware watch | on connect, checks every device dependency | fixed: it guards every probe of device data | - |

## Ink Tools Helper

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Plugin settings | no screen; acts only for inkctl | fixed: a developer tool | - |
| Firmware watch | runs at boot after a firmware change | fixed: a developer tool | - |

## Ink Tools Probe

| Feature | Default | Change | Key |
| :--- | :--- | :--- | :--- |
| Run Command | runs only the command inkctl sends | fixed: a developer tool, never released | - |
| Probes | none run until asked | fixed: a developer tool, never released | - |
