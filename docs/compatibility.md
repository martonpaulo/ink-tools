# Compatibility

Which Supernote internals each checked firmware still offers: one row per item of the
[registry](../registry/), one column per `inkctl firmware check` result a device round committed
in `registry/watch/` ([#293](https://github.com/martonpaulo/ink-tools/issues/293)).
`python3 scripts/registry.py --write` writes this page; do not edit it by hand.

Statuses: `ok` (the probe found the item), `broken` (the probe found it changed or gone),
`unprobed` (no safe probe, or its kill switch is off), `not checked` (the item is not in that result).

## Results

1. `Supernote/Supernote/Supernote:11/RQ2A.210505.003/eng.supern.20261019.184438:user/release-keys`, fingerprint `4eb1fa0d`, registry 2026.11.25: 10 ok, 0 broken, 37 unprobed.

## Items

| Item | Level | Owner | Result 1 |
| :--- | :--- | :--- | :--- |
| `calendar.provider` | 2 | sn-adapter | ok |
| `calendar.reading-rules` | 5 | sn-adapter | unprobed |
| `calendar.sync-broadcast` | 3 | inkctl | unprobed |
| `diagnostics.provider-probes` | 2 | ink-tools-probe | unprobed |
| `digest.provider` | 2 | sn-adapter | ok |
| `handwriting.language-file` | 2 | handwriting-language | unprobed |
| `handwriting.changed-broadcast` | 3 | handwriting-language | unprobed |
| `handwriting.writing-screens` | 3 | handwriting-language | unprobed |
| `note.activity` | 3 | inkctl | ok |
| `note.screen-ids` | 4 | inkctl | unprobed |
| `note.fonts-folder` | 5 | inkctl | unprobed |
| `notefile.format-versions` | 2 | note-editor | unprobed |
| `notefile.writer-byte-edit` | 5 | note-editor | unprobed |
| `pen.digitizer-units` | 5 | sn-adapter | unprobed |
| `pen.pen-types` | 5 | smart-pen | unprobed |
| `pen.replay-route` | 1 | sn-adapter | unprobed |
| `plugin-api.element-reads` | 5 | sn-adapter | unprobed |
| `plugin-api.unregister-unknown-button` | 5 | sn-adapter | unprobed |
| `plugin-api.pen-up-uuid` | 5 | smart-pen | unprobed |
| `plugin-api.crop-erase-elements` | 5 | image-editing | unprobed |
| `plugin-api.inserted-picture-copy` | 5 | image-editing | unprobed |
| `plugin-api.floating-insert` | 5 | device-link | unprobed |
| `plugin-api.batch-no-redraw` | 5 | sn-adapter | unprobed |
| `pluginhost.no-back-press` | 5 | ui-kit | unprobed |
| `pluginhost.overlay-back-key` | 5 | image-editing | unprobed |
| `pluginhost.file-sandbox` | 5 | picture-search | unprobed |
| `pluginhost.plugin-list` | 2 | inkctl | ok |
| `pluginhost.setting-service` | 3 | ink-tools-helper | ok |
| `pluginhost.call-numbers` | 5 | ink-tools-helper | ok |
| `pluginhost.parcel-classes` | 3 | ink-tools-helper | ok |
| `pluginhost.permission-status` | 5 | ink-tools-helper | unprobed |
| `pluginhost.host-dialogs` | 5 | sn-adapter | unprobed |
| `settings.language-page` | 3 | handwriting-language | unprobed |
| `settings.plugin-install-screens` | 4 | inkctl | unprobed |
| `settings.plugin-detail-labels` | 4 | inkctl | unprobed |
| `storage.cloud-conflict-folder` | 5 | picture-search | unprobed |
| `storage.sign-in-drop-folder` | 2 | account-sync | unprobed |
| `storage.helper-channel` | 2 | ink-tools-probe | unprobed |
| `storage.shared-folder` | 2 | sn-adapter | unprobed |
| `system.device-identity` | 2 | inkctl | ok |
| `system.firmware-page` | 2 | inkctl | unprobed |
| `system.plugin-log-tag` | 5 | inkctl | unprobed |
| `todo.provider` | 2 | sn-adapter | ok |
| `todo.row-rules` | 5 | sn-adapter | unprobed |
| `todo.twin-repair` | 5 | account-sync | unprobed |
| `todo.sync-trigger` | 5 | inkctl | ok |
| `ui.measured-tokens` | 5 | ui-kit | unprobed |
