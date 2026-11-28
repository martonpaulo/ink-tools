# Bundling adb in Note Editor: the licences, checked before the build ships

Status: research for [#498](https://github.com/martonpaulo/ink-tools/issues/498), 2026-11-28, its
cloud Task 1. It answers one question: may Note Editor's Advanced mode ship an adb binary inside the
app, and what must ship with it. It decides nothing about the build itself, which is the Mac Task of
[#498](https://github.com/martonpaulo/ink-tools/issues/498).

Marks: **[documented]** read in a primary source below on 2026-11-28; **[read in the build files]**
read in the standalone CMake build of adb named below; **[inference]** reasoned, not run;
**[open]** to read again at the pinned revision on the Mac.

## Answer in short

- Do not ship Google's platform-tools `adb`. The Android SDK License Agreement, section 3.4, forbids
  to «copy (except for backup purposes), modify, adapt, redistribute» the SDK or any part of it,
  except where a third-party licence requires otherwise [documented].
- Build adb from source and ship that. adb's own code (AOSP `packages/modules/adb`) and the AOSP
  libraries it links (`libbase`, `libcutils`, `libcrypto_utils`, `diagnose_usb`, `liblog`,
  `libziparchive`) are Apache-2.0 [read in the build files; open: each one's `NOTICE` file]. Apache-2.0
  allows redistribution inside an app under another licence, if the app carries the licence text,
  each `NOTICE` file, and a statement of changes for each changed file (Apache-2.0 section 4)
  [documented].
- Every other library linked into adb allows the same, with one condition to plan for: **libusb is
  LGPL-2.1** [documented]. Ship it as its own dynamic library in the app bundle, not linked in
  statically, so a person can replace it (LGPL-2.1 section 6), and ship its licence text and an
  offer of its source [inference from the licence text].
- Ink Tools' own licence (CC BY-NC-SA 4.0) covers only Ink Tools' own work. Each bundled binary keeps
  its own licence; none of them limits commercial use, so the non-commercial term adds a limit on Ink
  Tools' code only and is no conflict [inference].

The licence check of this Task passes: bundling is allowed, built from source, with the files
[What ships with the binary](#what-ships-with-the-binary) lists.

## What adb links

The standalone CMake build of adb that Alpine, Arch and Void Linux use,
[`nmeum/android-tools`](https://github.com/nmeum/android-tools) at commit `fc6d1ecc` (Apache-2.0),
links the host `adb` from these parts (`vendor/CMakeLists.adb.txt`, `vendor/CMakeLists.txt`)
[read in the build files]. On macOS it adds `client/usb_osx.cpp` and the CoreFoundation and IOKit
frameworks, which are part of macOS and are not shipped.

| Part | Source | Licence | Mark |
| --- | --- | --- | --- |
| adb itself (`adb/`, `client/`, `crypto/`, `tls/`, `sysdeps/`) | AOSP `packages/modules/adb` | Apache-2.0 | read in the build files; open: its `NOTICE` |
| `libbase`, `libcutils`, `libcrypto_utils`, `diagnose_usb`, `liblog`, `libziparchive` | AOSP `system/libbase`, `system/core`, `system/logging`, `system/libziparchive` | Apache-2.0 | read in the build files; open: each `NOTICE` |
| BoringSSL (`libcrypto`, `libssl`) | `boringssl.googlesource.com` | Apache-2.0 in its current `LICENSE` | documented; inference: an older revision may still carry the OpenSSL and SSLeay licence; open: the `LICENSE` at the pinned revision |
| libusb | AOSP `external/libusb` (upstream libusb) | LGPL-2.1 | documented |
| protobuf | protocolbuffers/protobuf | BSD-3-Clause | documented |
| brotli | google/brotli | MIT | documented |
| lz4 (the library) | lz4/lz4 `lib/` | BSD-2-Clause | documented |
| zstd | facebook/zstd | BSD-3-Clause (or GPL-2.0, at the user's choice; take BSD) | documented |
| fmt | fmtlib/fmt | MIT | documented |
| zlib | macOS's own `libz` | not shipped | inference |

mDNS discovery is an optional part of the build (`ANDROID_TOOLS_ADB_ENABLE_MDNS`, a Rust crate);
leave it out, since Advanced mode pairs by USB or by a typed address. If it is built in, its crates'
licences join this table first.

## What ships with the binary

When the Mac Task bundles adb, `apps/note-editor/NOTICE.md` gets one row per part above, and the
app bundle's resources hold:

1. The Apache-2.0 text, and every `NOTICE` file of the AOSP parts and BoringSSL, unchanged.
2. A list of the files changed by the build's patches (the `patches/` of `nmeum/android-tools`,
   and any of ours), as Apache-2.0 section 4(b) asks.
3. The licence text of libusb (LGPL-2.1), of protobuf, brotli, lz4, zstd and fmt.
4. libusb as `libusb-1.0.dylib` in the bundle's `Frameworks/`, linked dynamically, with the exact
   source revision named, so the source offer of LGPL-2.1 section 6 points at it.
5. The pinned revision of every part, so this table can be read again for that build.

The build stays reproducible from source only; no binary from Google's platform-tools enters the
repository or the app.

## Open before the build ships

Read each one at the revision the Mac Task pins, since this session could not reach
`android.googlesource.com`:

- each AOSP part's `NOTICE` file, copied unchanged;
- BoringSSL's `LICENSE` at that revision;
- whether the macOS build still links libusb beside `usb_osx.cpp`, or can leave it out, which would
  drop the LGPL condition.

## Sources

- Android Software Development Kit License Agreement, sections 3.4 and 3.5, dated 2021-07-27:
  <https://developer.android.com/studio/terms>
- Apache License 2.0, section 4: <https://www.apache.org/licenses/LICENSE-2.0>
- GNU Lesser General Public License 2.1, section 6: <https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html>
- `nmeum/android-tools` at `fc6d1ecc`, `vendor/CMakeLists.adb.txt`, `vendor/CMakeLists.libusb.txt`,
  `.gitmodules`: <https://github.com/nmeum/android-tools>
- BoringSSL `LICENSE`: <https://github.com/google/boringssl/blob/main/LICENSE>
- libusb `COPYING`: <https://github.com/libusb/libusb/blob/master/COPYING>
- protobuf, brotli, lz4, zstd and fmt `LICENSE` files on their GitHub repositories, read 2026-11-28.
