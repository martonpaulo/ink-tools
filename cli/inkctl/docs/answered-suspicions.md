# Answered suspicions

Suspected defects that were measured and are not defects. Read this before reporting one.

| Date | Suspicion | Measurement | Why it is not a defect | Reopened when | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-10 | `scripts/dry_check.py` does not read `src/inkctl` (then `src/snadb`), because the file has no extension ([#12](https://github.com/martonpaulo/supernote-adb/issues/12)). | On a copy of the repository, one `time.sleep(12345)` added to `src/snadb` made `dry_check.py magic` exit 1 and name the line. | The checker picks the language of a file with no extension from its `#!` line. | The check in `tests/supernote.test.sh` fails. | answered |
