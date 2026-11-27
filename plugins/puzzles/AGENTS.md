# Puzzles — agent guidance

What only `plugins/puzzles/` needs, beside the root [`AGENTS.md`](../../AGENTS.md); `CLAUDE.md`
here is a symlink to this file.

## Status

**The shell, built, not yet on the device** ([#453](https://github.com/martonpaulo/ink-tools/issues/453)): the
plugin, its toolbar button and its full view, with no game. Each game is a sub-issue of
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

## Adding a game

1. The game's logic, page and check live in `packages/puzzle-core`, never here
   ([`docs/architecture.md` › Layer rules](../../docs/architecture.md#layer-rules)).
2. Add its entry to `GAMES` in `src/games.ts`: an id, its title, its view, and in `requires` what it
   needs beyond the plugin's permissions, which the view checks before the game opens.
3. Its view takes `onBack` and `onClose` and shows ui-kit's `TitleBar` with Close; its strings go in
   its own copy module.
4. A word game's languages come from `resolveLanguages()` over My languages
   ([#502](https://github.com/martonpaulo/ink-tools/issues/502)) once it lands; until then from a
   default the game declares, never a list written in the plugin. A language with no pack, or with
   letters the page font lacks, shows as unavailable with its reason
   ([#484](https://github.com/martonpaulo/ink-tools/issues/484)): a new kind of `Requirement`.

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
