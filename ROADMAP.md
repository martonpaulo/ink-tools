# Roadmap

Future subprojects and larger ideas, not yet issues. Each becomes its own folder and backlog when
it starts. Order is not commitment.

## Plugins

- **image-edit** — a plugin to clean and edit a picture on the device (remove parts, tidy). Pairs
  with Ink2Pic's "insert raw" mode ([#35](https://github.com/martonpaulo/supernote-tools/issues/35)): Ink2Pic inserts the picture as-is, image-edit cleans it.
- **ink2def** — like Ink2Pic but for **definitions and explanations**, not pictures. Lasso a word,
  get its meaning. Inspired by the "Web Lookup" plugin. Could share Ink2Pic's lasso entry point.
- **lasso dictionary** — a lasso translator/dictionary: Spain-Spanish to Brazil-Portuguese, and
  Simplified Mandarin Chinese to English, showing pinyin and the usual dictionary detail. A sibling
  of ink2def.

## Beyond the device

- **phone2note** — send a photo or file from the phone straight into a note, fast, ideally without
  Wi-Fi. Based on LocalSend plus an iOS Shortcuts quick action; inspired by the ideas in
  `Laumss/sn-plugins`.
- **macOS .note editor** — an interesting, good way to edit a Supernote `.note` on macOS, working in
  both directions. Hard: `.note` is an undocumented binary format that changes with firmware
  (earlier research in the scratch notes). Likely starts as a prototype.

## Content

- **paper-based game templates** — a set of note templates styled as paper-based games.

## Notes

The owner's three original goals were To-Do <-> Todoist, Calendar <-> Apple/Google, and Saved ->
Digest. Calendar is the active work (`area: bridge`). To-Do sync is blocked on the provider
write investigation ([#31](https://github.com/martonpaulo/supernote-tools/issues/31)). Saved -> Digest (Digest is cloud-only) is not yet scoped.
