#!/usr/bin/env python3
"""Check that every plugin reaches the Supernote and outside services only through their adapters (#101).

    boundaries.py [--root DIR]

The rules are `docs/architecture.md` › Layer rules:

- `sdk`: only `packages/sn-adapter/src/official/` imports `sn-plugin-lib`, so an SDK change is fixed
  in one place. Tests and Jest mocks may import it to drive its mock.
- `vendor`: no code names a Supernote internal (a `com.ratta.` package, provider, activity or
  broadcast, a private `.data/` path, a vendor class or the language broadcast) outside the registry
  of internals (#294): `registry/items/` is the allowlist, and a tool reads the name through its
  generated reader (`registry_readers.READERS`, or the registry block inside inkctl). Read in
  TypeScript and JavaScript, Java and Kotlin, Swift and the host tools' Python. Tests may name one.
- `service`: no code outside `packages/sync-core/src/` names a service host (`api.todoist.com`,
  `www.googleapis.com`, `oauth2.googleapis.com`), and no code outside `packages/sync-core/` imports a
  service client module (`todoist`, `google`, `ics`, `http`) by its path: a plugin takes the
  provider-neutral `@ink-tools/sync-core`.
- `dictionary`: no code outside `packages/ink-core/src/` names a dictionary host (`wiktionary.org`):
  a plugin takes the provider-neutral `DictionaryProvider` of `@ink-tools/ink-core` (#115).
- `url`: no code that runs on the tablet (a plugin's or package's `src/`, a plugin's `index.js`)
  constructs a `URL` or reads `searchParams`: React Native's `URL` throws on `protocol`, `host` and
  every other getter but `href`; take `parseUrl` of `@ink-tools/sync-core` (#209).
- `controls`: no plugin view (its `src/`, its root `App.tsx` and `index.js`) draws its own native control: a switch (a `Button` with `selected`, a
  view with role `switch` or `radio`), a list row (`shared.listRow`, a dotted border), or a title
  bar, pager or chevron glyph (‹ › ◀ ▶ × ✕ in a string); it takes the component of
  `@ink-tools/ui-kit` (#273). The files that still do are `PENDING_CONTROLS`, which #274 empties: a
  listed file that no longer draws one is a finding too, so the list only shrinks.

The host tools' Python under `cli/<tool>/src/` (inkctl is one extensionless file, read by its `#!`
line, #295) is read for `vendor`, `service` and `dictionary`. The values inkctl still names when
this landed are `PENDING_HOST` counts, which #295's value moves lower: a count above its row names
each line, and a count below it is a finding too, so the counts only go down.

`plugins/plugin-diagnostics/` is exempt from every rule but `url`: it exists to call the internals directly. Only code is
read (`.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, and `.java`, `.kt` and `.swift` for `vendor`), never a
comment-only mention in a document. Prints one `path:line: rule: text` line per finding.
Exit 0 with none, 1 with findings, 2 on a bad root.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import registry_readers  # noqa: E402  the registry block's markers have one owner

# The generated readers, where the registry's names are written (#294).
READER_FILES = frozenset(reader.path for reader in registry_readers.READERS if not reader.block)

SKIP = {"node_modules", ".git", ".scratch", ".claude", "build", "android", ".toolchain"}
SCRIPT = {".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"}
NATIVE = {".java", ".kt"}
EXEMPT = ("plugins/plugin-diagnostics/",)
TEST_PARTS = {"__tests__", "__mocks__", "tests"}

# An import target: `from 'x'`, `import 'x'`, `require('x')`, `import('x')`, `jest.mock('x'`.
IMPORT = re.compile(r"""(?:\bfrom\s+|\bimport\s+|\brequire\(\s*|\bimport\(\s*|\bjest\.mock\(\s*)['"]([^'"]+)['"]""")
# A Supernote internal: a vendor package (and so its providers, activities and broadcasts), a
# private folder of the shared storage, a vendor class reached by name, or the language broadcast.
VENDOR = re.compile(
    r"com\.ratta\.|(?:^|[\s/'\"(])\.data/(?:dictionary|plugin)\b|\bhw_type_change\b"
    r"|\b(?:IPluginSetting|PluginSettingService|HWLanguageSetting|NoteInsidePagesActivity)\b")
VENDOR_TEXT = "names the Supernote internal %s outside the registry; add it to registry/items and read it through the tool's reader"
SWIFT = {".swift"}
# Test code may name an internal, in each language's own test folder.
VENDOR_TEST_PARTS = {"Tests", "native-tests", "testing"}
HOST = re.compile(r"\b(?:api\.todoist\.com|www\.googleapis\.com|oauth2\.googleapis\.com)\b")
DICTIONARY_HOST = re.compile(r"\bwiktionary\.org\b")
CLIENT = re.compile(r"(?:^|/)sync-core/(?:src/)?(?:todoist|google|ics|http)(?:\.ts)?$")
URL_USE = re.compile(r"\bnew\s+URL\s*\(|\.searchParams\b")
TABLET = re.compile(r"^(?:plugins|packages)/[^/]+/(?:src/|index\.(?:js|jsx|ts|tsx)$)")
# A plugin's views: its `src/`, and the root `App.tsx` and `index.js` the host mounts (#274).
PLUGIN_VIEW = re.compile(r"^plugins/[^/]+/(?:src/|App\.tsx$|index\.(?:js|jsx|ts|tsx)$)")
OWN_CONTROLS = (
    (re.compile(r"\bselected=\{"), "a switch drawn as a Button with selected; take Switch"),
    (re.compile(r"""accessibilityRole=\{?['"](?:switch|radio)['"]"""), "its own switch or radio; take Switch or Radio"),
    (re.compile(r"\bshared\.listRow\b"), "its own list row; take ListRow"),
    (re.compile(r"""borderStyle:\s*['"]dotted['"]"""), "its own dotted separator; take ListRow or NavList"),
    (re.compile(r"""(['"`])[^'"`]*[‹›◀▶×✕][^'"`]*\1"""), "its own title bar, pager or chevron glyph; take TitleBar, Pager or Chevron"),
)
# The plugin files that drew their own controls when the kit's components landed (#273); #274 moves each.
PENDING_CONTROLS = frozenset({
    "plugins/lasso-actions/src/ui/ChooseScreen.tsx",
})
LINE_COMMENT = re.compile(r"^\s*(?://|\*|/\*)")
PYTHON_COMMENT = re.compile(r"^\s*#")
HOST_TOOL = re.compile(r"^cli/[^/]+/src/")
PYTHON = ".py"
# The (path, rule) counts inkctl held when boundaries.py first read it (#295); they only go down.
# inkctl's two providers moved into its registry block (#294).
PENDING_HOST = {}


def code_files(root):
    """Every code file under root, as (path relative to root, suffix), skipping build and tool folders."""
    stack = [root]
    while stack:
        folder = stack.pop()
        for entry in sorted(folder.iterdir()):
            if entry.is_dir():
                if entry.name not in SKIP:
                    stack.append(entry)
            elif entry.suffix in SCRIPT | NATIVE | SWIFT:
                yield entry.relative_to(root).as_posix(), entry.suffix
            elif HOST_TOOL.match(entry.relative_to(root).as_posix()) and is_python(entry):
                yield entry.relative_to(root).as_posix(), PYTHON


def is_python(path):
    """A `.py` file, or an extensionless one whose `#!` line names Python."""
    if path.suffix:
        return path.suffix == PYTHON
    try:
        with open(path, "rb") as handle:
            first = handle.readline().decode("utf-8", "replace")  # a host tool's source: a short first line
    except OSError:
        return False
    return first.startswith("#!") and "python" in first


def is_test(rel):
    return bool(TEST_PARTS & set(rel.split("/")[:-1]))


def own_controls(rel, lines):
    """[(path, line number, rule, text)] for each native control a plugin file draws itself."""
    return [(rel, number, "controls", "draws " + text)
            for number, line in enumerate(lines, 1) if not LINE_COMMENT.match(line)
            for pattern, text in OWN_CONTROLS if pattern.search(line)]


def host_findings(rel, lines):
    """[(path, line number, rule, text)] for each Supernote provider or service host a host tool names.

    The registry block (`registry_readers.BLOCK_START` to `BLOCK_END`) is written from the registry,
    the one place an internal may be named (#294), so its lines are never findings.
    """
    found = []
    in_registry = False
    for number, line in enumerate(lines, 1):
        if line.startswith(registry_readers.BLOCK_START):
            in_registry = True
        elif line.startswith(registry_readers.BLOCK_END):
            in_registry = False
        if in_registry or PYTHON_COMMENT.match(line):
            continue
        for pattern, rule, text in (
            (VENDOR, "vendor", VENDOR_TEXT),
            (HOST, "service", "names the service host %s outside sync-core"),
            (DICTIONARY_HOST, "dictionary", "names the dictionary host %s outside ink-core"),
        ):
            hit = pattern.search(line)
            if hit:
                found.append((rel, number, rule, text % hit.group(0)))
    return found


def vendor_findings(rel, lines):
    """[(path, line number, rule, text)] for each Supernote internal a file names outside a comment."""
    return [(rel, number, "vendor", VENDOR_TEXT % VENDOR.search(line).group(0).strip(" /'\"("))
            for number, line in enumerate(lines, 1) if not LINE_COMMENT.match(line) and VENDOR.search(line)]


def host_ratchet(found, pending):
    """The host tools' findings above their `PENDING_HOST` count, and each count now too high."""
    have = {}
    for rel, _number, rule, _text in found:
        have[(rel, rule)] = have.get((rel, rule), 0) + 1
    out = []
    for key in sorted(set(have) | set(pending)):
        rel, rule = key
        if have.get(key, 0) > pending.get(key, 0):
            out += [item for item in found if (item[0], item[2]) == key]
        elif have.get(key, 0) < pending.get(key, 0):
            out.append((rel, 0, rule, "holds %d, PENDING_HOST says %d; lower it" % (have.get(key, 0), pending[key])))
    return out


def findings(root, pending=PENDING_CONTROLS, pending_host=None):
    """[(path, line number, rule, text)] for every broken rule under root."""
    pending_host = PENDING_HOST if pending_host is None else pending_host
    found = []
    drawn = set()
    host = []
    for rel, suffix in code_files(root):
        if suffix == PYTHON:
            host += host_findings(rel, (root / rel).read_text(encoding="utf-8", errors="replace").splitlines())
            continue
        exempt = rel.startswith(EXEMPT)
        test = is_test(rel)
        if suffix in SWIFT:
            if not exempt and not test and not VENDOR_TEST_PARTS & set(rel.split("/")[:-1]) and rel not in READER_FILES:
                found += vendor_findings(rel, (root / rel).read_text(encoding="utf-8", errors="replace").splitlines())
            continue
        tablet = suffix in SCRIPT and not test and bool(TABLET.match(rel))
        if exempt and not tablet:
            continue
        lines = (root / rel).read_text(encoding="utf-8", errors="replace").splitlines()
        if suffix in SCRIPT and not test and not exempt and PLUGIN_VIEW.match(rel):
            controls = own_controls(rel, lines)
            if controls:
                drawn.add(rel)
            if rel not in pending:
                found.extend(controls)
        for number, line in enumerate(lines, 1):
            if LINE_COMMENT.match(line):
                continue
            if tablet and URL_USE.search(line):
                found.append((rel, number, "url", "uses React Native's URL, whose getters throw; take parseUrl of sync-core"))
            if exempt:
                continue
            if suffix in SCRIPT:
                for target in IMPORT.findall(line):
                    if target == "sn-plugin-lib" and not test and not rel.startswith("packages/sn-adapter/src/official/"):
                        found.append((rel, number, "sdk", "imports sn-plugin-lib outside sn-adapter's official tier"))
                    if CLIENT.search(target) and not rel.startswith("packages/sync-core/"):
                        found.append((rel, number, "service", "imports the service client %s; take @ink-tools/sync-core" % target))
                if HOST.search(line) and not test and not rel.startswith("packages/sync-core/src/"):
                    found.append((rel, number, "service", "names the service host %s outside sync-core" % HOST.search(line).group(0)))
                if DICTIONARY_HOST.search(line) and not test and not rel.startswith("packages/ink-core/src/"):
                    found.append((rel, number, "dictionary", "names the dictionary host wiktionary.org outside ink-core"))
            if VENDOR.search(line) and not test and not VENDOR_TEST_PARTS & set(rel.split("/")[:-1]) and rel not in READER_FILES:
                found.append((rel, number, "vendor", VENDOR_TEXT % VENDOR.search(line).group(0).strip(" /'\"(")))
    found += host_ratchet(host, pending_host)
    for rel in sorted(pending - drawn):
        found.append((rel, 0, "controls", "draws no control of its own any more; remove it from PENDING_CONTROLS"))
    return sorted(found)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check the adapter boundaries (#101).")
    parser.add_argument("--root", default=".", help="the repository's checkout (default: the current directory)")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        print("boundaries: %s is not a folder" % args.root, file=sys.stderr)
        return 2
    found = findings(root)
    for rel, number, rule, text in found:
        print("%s:%d: %s: %s" % (rel, number, rule, text))
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
