# Roadmap

Ideas still being considered: no commitment, no priority, no date. An issue is work we will do; a
roadmap item is not one, and the two never hold the same item. An item leaves this page and
becomes an issue only when the owner decides to do it.

Tools that already have a folder or an issue (Lasso Actions, the Handwriting Language app, Image
Editing, Device Transfer, Account Sync, Smart Pen and Ink Notebook Editor) are
described in [`docs/plugin-scope.md`](docs/plugin-scope.md), not here
([#141](https://github.com/martonpaulo/ink-tools/issues/141)).

## Content

- **note templates** — simple generated pages, such as one sudoku page. Parked by the owner until
  he asks ([`plugin-scope.md` › Note templates](docs/plugin-scope.md#note-templates)).

## Google sign-in without expiry

Deferred by the owner on 2026-11-16. Account Sync's Google app (the Google Auth Platform app of
the Google Cloud project `supernote-tools`) stays in «Testing» for now, so its refresh token
expires every 7 days and the owner signs in again (the current one lasts until 2026-11-23). A
token that does not expire needs the app published:

1. A home page and a privacy policy on martonpaulo.com, such as `/ink-tools` and
   `/ink-tools/privacy`.
2. The domain verified in Google Search Console.
3. The domain added under Authorised domains.
4. «Publish app».

Context: [#124](https://github.com/martonpaulo/ink-tools/issues/124), the sign-in on the Mac.

## Publish and announce

Deferred by the owner on 2026-11-16, until the tools are ready to share; it replaces
[#6](https://github.com/martonpaulo/ink-tools/issues/6) and
[#7](https://github.com/martonpaulo/ink-tools/issues/7), closed as not planned.

- **Ratta's plugin review** — pass it for each plugin offered to others: Lasso Actions, Image
  Editing, Device Transfer and Account Sync.
- **InkHub** — list the reviewed plugins there.
- **Announce** — post the tools, the `inkctl` CLI and the Handwriting Language app on
  r/Supernote_dev and r/Supernote.
