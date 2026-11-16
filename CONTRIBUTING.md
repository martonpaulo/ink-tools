# Contributing to Ink Tools

Ink Tools is a set of unofficial tools for Supernote e-ink tablets. Thank you for helping.
Read [`README.md`](README.md) for what each tool does and [`docs/product.md`](docs/product.md) for what the project will and will not do.

## Report a problem or suggest a change

1. Search the [open issues](https://github.com/martonpaulo/ink-tools/issues) first.
2. Open a new issue with the bug report or feature request form.
3. Name the tool (`inkctl`, a plugin or the Handwriting Language app), its version and your Supernote model and firmware.

## Send a change

1. Open an issue first for anything larger than a typo, so we agree on the scope.
2. Fork the repository and change one subproject at a time. Each plugin, package, app and CLI has its own `AGENTS.md` with its rules.
3. Run the subproject's validation before you push. The commands are the `command` fields of [`gates.json`](gates.json); `python3 scripts/gates.py` prints the gates your change needs.
4. Write commit subjects as [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) in English, ending with `(#<issue number>)`.
5. Open a pull request and fill in its template.

## Rules that apply to every change

- Code, comments, commits and documents are in English.
- A bug fix comes with a test that fails without it.
- Never commit a secret, a device serial number or a personal note file.
- Device behavior goes into [`docs/supernote.md`](docs/supernote.md) only when you have seen it on a real device.

## Security

Report a vulnerability privately through GitHub's security advisory form of this repository, not in a public issue.

## License

By contributing you agree that your work is released under the [MIT license](LICENSE).
