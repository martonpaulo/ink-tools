# Puzzles

On the tablet this plugin is called **Puzzles**; `puzzles` is its folder
([#453](https://github.com/martonpaulo/ink-tools/issues/453)).

A Supernote plugin for paper puzzles and pen games: pick a game, and it arrives as a new page after
the current one, its grid drawn as the page's background, solved with the pen
([#376](https://github.com/martonpaulo/ink-tools/issues/376)).

**Status: in progress.** The plugin and its view are built; the games arrive one by one.

## What it does

- **Puzzles** on the note toolbar opens the Puzzles view: the list of games, with Close.
- Opening a game first checks that Puzzles may read and write files, which every game needs, and
  shows «Allow» when it may not.

Versions follow SemVer with a numbered beta: `0.1.0-beta.1` reads `0.1.0 beta 1` on the tablet
([#155](https://github.com/martonpaulo/ink-tools/issues/155)).

## Build

```bash
npm ci
npm run validate
npm run build
```
