# Feature defaults

One row per user-facing feature, as Skill Deck's interface standard (rule 12) asks. Every default
is fixed, with its reason ([#51](https://github.com/martonpaulo/ink2pic/issues/51)), except the rows
the plugin's Settings entry changes; each of those names its reset group, and Reset restores its
default ([#68](https://github.com/martonpaulo/ink2pic/issues/68)). The Languages screen's Reset
restores the group «languages»; the Settings screen's «Reset all» restores every group
([#70](https://github.com/martonpaulo/ink2pic/issues/70)).

| Feature | Default | Can the person change it? |
| --- | --- | --- |
| Search languages | The device's system language when the search supports it (中文, Español, English, Português), then English; English alone when the system language is unknown | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Search languages; reset group «languages» ([#68](https://github.com/martonpaulo/ink2pic/issues/68)) |
| Search after a lasso | Submitted at once with the recognised word | Fixed: the three-tap path (brief section 8.2); the word can be edited and searched again |
| Where the picture goes | Below the word, which is kept ([#39](https://github.com/martonpaulo/ink2pic/issues/39)); else above it | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Where the picture goes: Below, In place of word (the lassoed handwriting is deleted only after a tap on a picture in the grid; «Insert best picture» always keeps the word and places the picture below it, [#106](https://github.com/martonpaulo/ink2pic/issues/106)), Beside; reset group «insert» ([#70](https://github.com/martonpaulo/ink2pic/issues/70)) |
| Results per page | Six large tiles, two columns | Fixed: e-ink tap targets and one refresh per page (brief section 8.4) |
| Picture sources | Every source on: Openclipart, Wikimedia Commons, Wikipedia with Wikidata, and OpenMoji, together | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Picture sources: Clip art (Openclipart), Wikimedia (Commons), Wikipedia, Symbols (OpenMoji), each on or off, one always on ([#106](https://github.com/martonpaulo/ink2pic/issues/106)); reset group «search» ([#70](https://github.com/martonpaulo/ink2pic/issues/70)) |
| Picture style | Drawings first: photos rank below drawings | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Picture style: Drawings first, Drawings and photos, Outlines only ([#106](https://github.com/martonpaulo/ink2pic/issues/106)); reset group «insert» ([#70](https://github.com/martonpaulo/ink2pic/issues/70)) |
| Word spacing | Normal: the word gap measured on the line | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > When you lasso a whole line: space between your words: Tight, Normal, Wide ([#106](https://github.com/martonpaulo/ink2pic/issues/106)); it scales the gap that separates words when Ink2Pic picks the last word; reset group «handwriting» ([#75](https://github.com/martonpaulo/ink2pic/issues/75)) |
| Data saver | Off | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Data saver: fewer results per source and smaller thumbnails; reset group «search» ([#70](https://github.com/martonpaulo/ink2pic/issues/70)) |
| Insert definition | Off: the lasso menu has no «Insert definition» button | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Insert definition in the lasso menu: Hidden, Shown; the definition is in the first search language that is Portuguese or Spanish and has the word; reset group «insert» ([#115](https://github.com/martonpaulo/supernote-tools/issues/115)) |
| Adult and explicit pictures | Left out of every search, from every source | Fixed: the owner asked for a filter that is always on ([#69](https://github.com/martonpaulo/ink2pic/issues/69), brief section 5.6) |
| Inserted width | Medium, about one third of the page (640 px) | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Picture size: Small 400 px, Medium 640 px, Large 960 px; reset group «insert» ([#70](https://github.com/martonpaulo/ink2pic/issues/70)) |
| Recent searches | The last 8 words | Fixed: brief section 8.6 |
| Library | Every inserted picture, kept in `MyStyle/Ink2Pic/library` | The list and the recent searches: Settings > Apps > Plugins > Ink2Pic > Settings > Empty Library tab, after a question ([#106](https://github.com/martonpaulo/ink2pic/issues/106)); the files stay, and the person deletes them with the file manager ([#70](https://github.com/martonpaulo/ink2pic/issues/70)) |
| No network | The search falls back to the Library | Fixed: brief section 8.8 |
| Offline symbols | Each OpenMoji symbol shown or inserted is kept in `symbols/` in the plugin's private folder, outside Supernote file sync ([#23](https://github.com/martonpaulo/supernote-tools/issues/23)), so it shows and inserts with no network; nothing else is downloaded | Yes: Settings > Apps > Plugins > Ink2Pic > Settings > Download symbols for offline use: every symbol, about 15 MB, after a question that states the size; resumable. No reset group: the files stay, and the person deletes the old `MyStyle/Ink2Pic/symbols` folder with the file manager, because a delete needs FILE:DELETE, which is not declared ([#91](https://github.com/martonpaulo/ink2pic/issues/91)) |
| Log | Hidden behind the Log button; files in `MyStyle/Ink2Pic/logs` | Fixed: the owner's logging rule ([#36](https://github.com/martonpaulo/ink2pic/issues/36)) |
