# Contributing

Read [`docs/product.md`](docs/product.md) first. It says what belongs in this project.

1. Open an issue before a large change.
2. Run `make validate`.
3. Use only synthetic data in tests. Never add a real address, serial number or note name.
4. Write a commit in the [Conventional Commits](https://www.conventionalcommits.org/) form.

A change to how the command talks to the tablet needs a test with the `adb` stub in `tests/inkctl.test.sh`. Say in the pull request which firmware you ran it on, if any.
