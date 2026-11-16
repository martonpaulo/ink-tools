Seventeenth Ink2Pic device test build, the first from the `supernote-tools` monorepo: your picks lead the next search, better portraits and pictures for names, numbers and places, and safer files. `versionName` 0.1.0, `versionCode` 17. The file name now carries the version: `Ink2Pic-0.1.0-dev.17.snplg`.

- A picture you choose in the grid leads the next search for the same word ([#34](https://github.com/martonpaulo/supernote-tools/issues/34)).
- A person's search leads with their Wikidata portrait, not a namesake or a pattern ([#15](https://github.com/martonpaulo/supernote-tools/issues/15)).
- «Eiffel Tower», «clock» and «Rio de Janeiro» lead with the asked picture; a busy aerial photo shows as found ([#24](https://github.com/martonpaulo/supernote-tools/issues/24)).
- A flag keeps its greys and is never a contour drawing ([#20](https://github.com/martonpaulo/supernote-tools/issues/20)).
- A query made of numbers, such as «1984», keeps its subject ([#96](https://github.com/martonpaulo/supernote-tools/issues/96)); unrelated Openclipart pictures tagged with a name stay off page 1 ([#73](https://github.com/martonpaulo/supernote-tools/issues/73)).
- The small picture size is 200 page pixels ([#33](https://github.com/martonpaulo/supernote-tools/issues/33)).
- A settings file that is not JSON is kept, never overwritten; overlapping searches keep each other's cache ([#94](https://github.com/martonpaulo/supernote-tools/issues/94), [#95](https://github.com/martonpaulo/supernote-tools/issues/95)).

## Device checklist

1. Install `Ink2Pic-0.1.0-dev.17.snplg` through `MyStyle` and Settings > Apps > Plugins > Add Plugin.
2. Write «Leonardo da Vinci», lasso it, Choose picture. Expected: his portrait first.
3. Write «maçã», lasso it, Choose picture, pick the second picture. Lasso «maçã» again with Choose picture. Expected: the picture you picked is first.
4. Lasso «Spain» with Choose picture. Expected: the Spanish flag first, in greys.
