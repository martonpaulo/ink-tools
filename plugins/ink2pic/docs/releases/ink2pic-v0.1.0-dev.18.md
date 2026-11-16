Eighteenth Ink2Pic device test build: lasso-only, offline symbols outside file sync, photos never as contour, one icon per lasso button, and an opt-in dictionary definition. `versionName` 0.1.0, `versionCode` 18.

- Offline symbols live in the hidden folder `.ink2pic-symbols`, outside Supernote file sync ([#23](https://github.com/martonpaulo/supernote-tools/issues/23)).
- A photo or a painting is never turned into a contour drawing ([#104](https://github.com/martonpaulo/supernote-tools/issues/104)).
- Each lasso button has its own icon ([#107](https://github.com/martonpaulo/supernote-tools/issues/107)); the Lasso last word button is gone ([#32](https://github.com/martonpaulo/supernote-tools/issues/32)).
- «Insert definition», off by default in Settings, inserts a Wiktionary definition ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)).
- Thumbnail work runs on a small pool and the insert has its own lane ([#21](https://github.com/martonpaulo/supernote-tools/issues/21)).
- The lasso query and the placement moved to `ink-core`, and every Supernote call goes through `sn-adapter` ([#109](https://github.com/martonpaulo/supernote-tools/issues/109), [#101](https://github.com/martonpaulo/supernote-tools/issues/101)).

## Device checklist

1. The agent installs `Ink2Pic-0.1.0-dev.18.snplg` over ADB.
2. Open Ink2Pic Settings. Expected: the symbols are kept in `.ink2pic-symbols`, with the reason.
3. Write «apple» and lasso it. Expected: Insert best picture (a picture with a plus) and Choose picture (a grid of four); no Lasso last word.
4. Press Insert best picture. Expected: an apple drawing, inserted at once and lassoed.
5. Write «Leonardo da Vinci», lasso it, Choose picture, and pick his portrait. Expected: the portrait in greys, never a contour drawing, inserted and lassoed.
6. In Settings, turn on «Insert definition in the lasso menu». Write «maçã» and lasso it. Expected: an open-book icon; pressing it puts a definition in a text box below the word.
7. Run a Supernote file sync. Expected: it ends in about 1 s.
8. Open InkHub > Upload. Expected: a screenshot of its cover size and format rules.
