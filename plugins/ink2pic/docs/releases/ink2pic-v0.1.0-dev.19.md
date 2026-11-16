Nineteenth Ink2Pic device test build: the definition fixes of the 2026-11-16 round, offline symbols in the private folder, and the shorter thumbnail wait. `versionName` 0.1.0, `versionCode` 19.

- «Insert definition» no longer runs a picture search beside it: the view's decision on open skips a lasso that a no-view press owns ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)).
- The definition keeps only part-of-speech senses, so the anagram list at the end of a pt.wiktionary page («cama» for «maçã») is no longer read as a sense ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)).
- The definition text box is 640 px wide at every picture size ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)).
- Offline symbols live in the plugin's private folder: PluginHost refuses the hidden `.ink2pic-symbols` folder of dev.18 ([#23](https://github.com/martonpaulo/supernote-tools/issues/23)).
- «Insert best picture» stops measuring thumbnails once its picture is fixed ([#19](https://github.com/martonpaulo/supernote-tools/issues/19)).
- Near-black photos and paintings stay photos on pages 1 and 2 ([#104](https://github.com/martonpaulo/supernote-tools/issues/104)); the picture search, the file store and the lasso placement moved to `packages/picture-search` ([#125](https://github.com/martonpaulo/supernote-tools/issues/125), [#142](https://github.com/martonpaulo/supernote-tools/issues/142)).

## Device checklist

1. The agent installs `Ink2Pic-0.1.0-dev.19.snplg` over ADB and confirms `versionCode` 19 in `plugin ls`.
2. Lasso «maçã» and press «Insert definition». Expected: one sense, «o fruto comestível da macieira», in a 640 px box; the log shows no `search "maçã"` and, if the view mounted, `decide skipped`.
3. Lasso «apple» and press «Insert best picture». Expected: one search in the log, `pixels: k of n measured … leader decided`, and the `time total` line.
4. Settings › Download symbols, offline, then insert a symbol word. Expected: the files are listed under the plugin folder's `symbols/`, and the symbol inserts with Wi-Fi off.
5. Run a Supernote file sync. Expected: no symbol file is synced and no `_CONFLICT_` folder appears.
