# Glossary

One term per thing in Ink Tools, what it means, and the words not to write for it
([Workbench #2030](https://github.com/martonpaulo/workbench/issues/2030)). The display names and
where each one is used are decided in [`docs/product.md` › Display names](docs/product.md#display-names);
this table only names them. A new name for a product part is recorded here first.

| Term | Definition | Do not write |
| --- | --- | --- |
| Account Sync | the plugin in `plugins/account-sync` that syncs to-dos and calendars with the native Supernote apps | - |
| device check | a check that needs the tablet; an issue waiting only on one carries `status: needs-device-check` | device test |
| Device Link | the plugin in `plugins/device-link` that moves images and text between the tablet and a phone or Mac over LocalSend | Device Transfer |
| display name | the feature name a tool shows, in Supernote's own wording, in `PluginConfig.json` `name`, the visible copy and the docs | - |
| Handwriting Language | the sideloaded tablet app in `apps/handwriting-language` that switches the handwriting recognition language; the Lingo app in code | - |
| Image Editing | the plugin in `plugins/image-editing` that makes an image on the page readable on e-ink | Image Editor |
| Note Editor | the Mac app in `apps/note-editor` that reads and edits `.note` files | Ink Notebook Editor |
| Ink Tools | the product: every plugin, app and tool in this repository | Supernote Tools |
| Ink Tools Control | the Mac CLI in `cli/inkctl`, run as `inkctl`, that drives the tablet over Wi-Fi ADB | - |
| Ink Tools Helper | the sideloaded developer app in `apps/ink-tools-helper`, with no screen, that lets `inkctl` install, enable and permit plugins | Ink Tools Bridge |
| Ink Tools Probe | the developer-only plugin in `plugins/ink-tools-probe` for device experiments | Plugin Diagnostics |
| image | a raster graphic on a note page or sent between devices, the tablet's own word for it ([#529](https://github.com/martonpaulo/ink-tools/issues/529)); the plugin API's `picture` element field is code and keeps its name | picture |
| internal name | the short name a tool keeps in npm packages, `pluginID`, `pluginKey`, log prefixes and data folders; never shown | - |
| Lasso Actions | the plugin in `plugins/lasso-actions` that holds the actions on lassoed handwriting, one module each | Word Lookup |
| Lookup | the Lasso Actions module that turns a lassoed word into an image, a definition or a translation | - |
| module | one feature of a plugin that the person switches on or off in its Settings | - |
| plugin | a tool that runs inside the tablet's plugin host on `sn-plugin-lib` | - |
| Real-Time Text | the Smart Pen module that turns each handwritten word into typed text with no lasso | - |
| Smart Pen | the plugin in `plugins/smart-pen` that holds the pen features, one module each | - |
| Smart Shapes | the Smart Pen module that turns a stroke held still at its end into a clean shape | - |
| Supernote | the tablet the tools work with, named only to say so, never as part of a tool's name | - |
| tablet test round | one batched round of device checks: the agent drives every step over `inkctl`, the owner does only the pen steps | - |
