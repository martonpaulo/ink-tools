# Puzzles — agent guidance

What only `plugins/puzzles/` needs, beside the root [`AGENTS.md`](../../AGENTS.md); `CLAUDE.md`
here is a symlink to this file.

## Status

**The shell and its first games, built, not yet on the device** ([#453](https://github.com/martonpaulo/ink-tools/issues/453),
[#386](https://github.com/martonpaulo/ink-tools/issues/386), [#397](https://github.com/martonpaulo/ink-tools/issues/397),
[#402](https://github.com/martonpaulo/ink-tools/issues/402), [#390](https://github.com/martonpaulo/ink-tools/issues/390),
[#383](https://github.com/martonpaulo/ink-tools/issues/383), [#387](https://github.com/martonpaulo/ink-tools/issues/387), [#388](https://github.com/martonpaulo/ink-tools/issues/388), [#389](https://github.com/martonpaulo/ink-tools/issues/389)): the plugin, its toolbar button, its full view,
the maze, the jigsaw sudoku, the sudoku, the killer sudoku, calcudoku, futoshiki, kakuro and the pass-and-play boards.
Each game is a sub-issue of
[#376](https://github.com/martonpaulo/ink-tools/issues/376). On the tablet the plugin is called
**Puzzles**; `puzzles` is its folder, gate, workflow and tag prefix, and `Puzzles` its `pluginKey`
(also `package.json` and `app.json` `name`). Its `pluginID` (`kfrnz9x0vwj8h9z2`) names its private
data folder. Log lines start `Puzzles:`.

## The view

- `index.js` registers one note toolbar button, «Puzzles», whose press shows the full view.
- `src/PuzzlesView.tsx` shows the game list. Opening a game first checks what it needs
  (`src/requirements.ts`): ui-kit's Loading while that runs, Needs with «Allow» for a permission not
  granted, then the steps in Settings once the host refused it, and Error with Retry when the host
  cannot answer. Nothing is asked before a game is opened, so the empty list asks for nothing.
- Every control comes from `@ink-tools/ui-kit`, with its Close on every screen; Back goes through
  the native module `PuzzlesBack` (`native/com/puzzles/view/PuzzlesPackage.java`, built by
  `scripts/native-build.cjs`), so it never reaches the note behind the view.

## A game's view

`src/play/GameView.tsx` is every game's view ([#386](https://github.com/martonpaulo/ink-tools/issues/386)): the
game's choices and «Add Page»; on a page a puzzle made, «Check» and «Show Solution», whose pictures
show only in the view, so the note never gets the answer. A pass-and-play board has no `open`, so
its view is the choices and «Add Page» alone ([#402](https://github.com/martonpaulo/ink-tools/issues/402)). `src/play/pages.ts` reads and writes the
pages: a new puzzle is `<code>.png` in the plugin's hidden folder (`.data/plugin/inktools-puzzles/pages/`,
never `MyStyle/`, which Supernote Cloud syncs), written by the native module `PuzzlesPages`
(`native/com/puzzles/view/PageFileModule.java`, as sn-plugin-lib writes no bytes), and inserted as
the background of a new page after the current one once the note saved. A successful insert reloads
the note and ends the plugin's JavaScript, so the view closes before it and the next game view
deletes the page files an earlier one left; each press of the button starts at the game list
([#386](https://github.com/martonpaulo/ink-tools/issues/386)). The page's background then reads
`user_<code>`, so the view finds the puzzle of the current page from it and stores nothing.
The view outlives a close and the page can turn before the next press, so «Add Page», «Check» and
«Show Solution» each read the page on screen again, never the read the view opened with; a page
that holds another puzzle of the game is checked or solved as that one, and a page with none shows
instead ([#542](https://github.com/martonpaulo/ink-tools/issues/542)).

## Adding a game

1. The game's logic, page, check and view pictures live in `packages/puzzle-core`, never here
   ([`docs/architecture.md` › Layer rules](../../docs/architecture.md#layer-rules)): its generator, a
   `…FromCode` that makes the same puzzle from its code, and its check and answer drawn on a copy of
   the page (`packages/puzzle-core/src/page/view.ts`; a game of cells uses its `drawCellCheck` and
   `drawCellAnswers`, [#397](https://github.com/martonpaulo/ink-tools/issues/397)).
2. A game is one `PuzzleGame` in `src/games/<game>.ts` (`src/play/puzzle.ts`): its choices (an
   option's choices may follow the earlier ones, as futoshiki's bands follow its size,
   [#390](https://github.com/martonpaulo/ink-tools/issues/390)) and `create`, and for a puzzle `open`, whose `Puzzle` has its `check` and `answer`, each a call into
   puzzle-core; a pass-and-play board has no `open` ([#402](https://github.com/martonpaulo/ink-tools/issues/402)). Its
   strings are its own, the shared ones in `src/play/copy.ts`. Add it to `GAMES` in `src/games.ts`,
   with in `requires` what it needs beyond the plugin's permissions, which the view checks before
   the game opens. A game whose play the shared view cannot hold gives its own view, which takes
   `onBack` and `onClose` and shows ui-kit's `TitleBar` with Close. Its Jest test drives the view
   through `testing/gameView.tsx`'s fake pages.
3. A word game's languages come from `resolveLanguages()` over My languages
   ([#502](https://github.com/martonpaulo/ink-tools/issues/502)) once it lands; until then from a
   default the game declares, never a list written in the plugin. A language with no pack, or with
   letters the page font lacks, shows as unavailable with its reason
   ([#484](https://github.com/martonpaulo/ink-tools/issues/484)): a new kind of `Requirement`.
4. Its screens join `packages/ui-kit/renders/screens.tsx`.

## Permissions

`PluginConfig.json` declares `FILE:READ` and `FILE:WRITE`, the one list: every game writes its
page background and inserts the page after the current one (`docs/supernote.md`). The view reads
the list from there; `__tests__/pluginConfig.test.ts` pins both.

## Build

```bash
npm ci
npm run validate
npm run build
```

`npm run build` makes `build/outputs/Puzzles.snplg` with the light native build
([`packages/native-build`](../../packages/native-build/native-build.cjs)).
