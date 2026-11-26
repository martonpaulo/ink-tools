"""The registry's readers, one per runtime, written by scripts/registry.py (#294).

Each reader holds the registry's version, the item table (id, level, impact, owner, probe, active
implementation) and each item's values as typed constants, for the items whose `readers` name one
of its tools. An item with a `descriptor` also gets `authority` and one `<table>Uri` per table,
derived from it, so a provider URI has one owner. Names: the item `pen.pen-types` is `penPenTypes`
in TypeScript and Python keys stay the id; a Java or Swift type is `PenPenTypes`; a value
`maxConcurrent` is `MAX_CONCURRENT` in Java and `maxConcurrent` elsewhere.

inkctl is one executable file (`cli/inkctl/AGENTS.md`, divergence `single-file-source`), so its
reader is a block inside it between `BLOCK_START` and `BLOCK_END`, never a module of its own.

The reader files are left out of the DRY checks (`dry-check.json` › `magicValues.exclude`, which
`dry_cross.py` reads too): the registry is the one owner of every value they repeat.

A Java reader marked `failure` also gets the Java adapter's failure value, `InternalFailure.java`,
beside it, from the one text `JAVA_FAILURE`, so every Java tool reports a failed internal the same
way; those files are left out of the DRY checks too.
"""
import json
import re

HEADER = "Written by scripts/registry.py from registry/ (#294); never edit it by hand."
BLOCK_START = "# BEGIN registry: " + HEADER
BLOCK_END = "# END registry"
# The tools whose code runs in the plugins' JavaScript: they read sn-adapter's reader.
TYPESCRIPT_TOOLS = ("sn-adapter", "ui-kit", "picture-search", "account-sync", "smart-pen",
                    "image-editing", "device-link", "lasso-actions",
                    "ink-tools-probe")
CONTENT = "content://"
# The item table's fields, in the order of `cells`.
FIELDS = ("id", "level", "impact", "owner", "probe", "unprobed", "active")


class Reader:
    def __init__(self, language, path, tools, package=None, block=False, failure=False, watch=False):
        self.language = language
        self.path = path
        self.tools = tools
        self.package = package
        self.block = block
        # A Java reader with `failure` also gets the adapter's failure value, InternalFailure.java,
        # beside it: one text for every Java tool that reports a failed internal (#294).
        self.failure = failure
        # A Java reader with `watch` lists every item in its table, for the firmware watch (#293);
        # its values stay those of the items its tools read.
        self.watch = watch


READERS = (
    Reader("typescript", "packages/sn-adapter/src/registry.generated.ts", TYPESCRIPT_TOOLS),
    Reader("java", "apps/handwriting-language/src/com/supernotetools/lingo/Registry.java",
           ("handwriting-language",), package="com.supernotetools.lingo", failure=True),
    Reader("java", "packages/picture-search/native/com/inktools/files/Registry.java",
           ("picture-search",), package="com.inktools.files"),
    Reader("java", "apps/ink-tools-helper/src/com/martonpaulo/inktools/bridge/Registry.java",
           ("ink-tools-helper",), package="com.martonpaulo.inktools.bridge", failure=True, watch=True),
    Reader("java", "plugins/ink-tools-probe/native/src/com/probe/providers/Registry.java",
           ("ink-tools-probe",), package="com.probe.providers"),
    Reader("python", "cli/inkctl/src/inkctl", ("inkctl",), block=True),
    Reader("swift", "apps/ink-notebook-editor/NoteFormat/Sources/NoteFormat/Registry.swift",
           ("ink-notebook-editor",)),
)


def words(text):
    return [word for word in re.split(r"[.\-]", text) if word]


def camel(item_id):
    first, *rest = words(item_id)
    return first + "".join(word[:1].upper() + word[1:] for word in rest)


def pascal(item_id):
    return "".join(word[:1].upper() + word[1:] for word in words(item_id))


def upper_snake(name):
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name).upper()


def values_of(item):
    """The item's values, with `authority` and each `<table>Uri` derived from its descriptor."""
    values = dict(item["values"])
    descriptor = item.get("descriptor")
    if descriptor:
        values["authority"] = descriptor["authority"]
        for table, spec in descriptor["tables"].items():
            values[table + "Uri"] = "%s%s/%s" % (CONTENT, descriptor["authority"], spec["path"])
    return values


def name_errors(items):
    """[message] for each pair of items or values whose generated names collide."""
    errors = []
    owners = {}
    for item in items:
        for name in (camel(item["id"]), pascal(item["id"])):
            other = owners.setdefault(name, item["id"])
            if other != item["id"]:
                errors.append("%s: its reader name %s is also %s's" % (item["id"], name, other))
        descriptor = item.get("descriptor")
        if descriptor:
            derived = {"authority"} | {table + "Uri" for table in descriptor["tables"]}
            for name in sorted(derived & set(item["values"])):
                errors.append("%s: the value %s is derived from its descriptor; remove it" % (item["id"], name))
    unread = sorted({tool for item in items for tool in item["readers"]} - {t for r in READERS for t in r.tools})
    for tool in unread:
        errors.append("%s: no reader serves this tool; add one to registry_readers.READERS" % tool)
    return errors


def selected(reader, items):
    return [item for item in items if set(item["readers"]) & set(reader.tools)]


def cells(item, literal, none):
    """The item table's row: id, level, impact, owner, probe, unprobed reason, active, as literals."""
    probe = item["probe"]
    optional = [none if probe.get(key) is None else literal(probe[key]) for key in ("name", "unprobed")]
    return [literal(item["id"]), str(item["level"]), literal(item["impact"]), literal(item["owner"]), *optional, literal(item["active"])]


def text(reader, version, items, current=None):
    """The reader's file text; a block reader splices its block into the current text."""
    chosen = selected(reader, items)
    if reader.watch:
        body = WRITERS[reader.language](reader, version, chosen, table=items)
    else:
        body = WRITERS[reader.language](reader, version, chosen)
    if not reader.block:
        return body
    start, end = current.find(BLOCK_START), current.find(BLOCK_END)
    if start < 0 or end < start:
        raise ValueError("%s: has no registry block between %r and %r" % (reader.path, BLOCK_START, BLOCK_END))
    return current[:start] + body + current[end + len(BLOCK_END):]


def quoted(value):
    """A string literal every one of the four languages reads the same: JSON's."""
    return json.dumps(value, ensure_ascii=False)


# TypeScript ------------------------------------------------------------------------------------

def ts_value(value):
    if isinstance(value, list):
        return "[" + ", ".join(ts_value(entry) for entry in value) + "]"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def typescript(reader, version, items):
    lines = [
        "/** %s */" % HEADER,
        "",
        "export const REGISTRY_VERSION = %s;" % ts_value(version),
        "",
        "export interface RegistryItem {",
        "  readonly id: string;",
        "  /** From 1, official or our own code, to 5, learned behaviour (docs/architecture.md › Layer rules). */",
        "  readonly level: number;",
        "  readonly impact: 'user' | 'tests';",
        "  readonly owner: string;",
        "  /** The probe's name; null when the item is unprobed. */",
        "  readonly probe: string | null;",
        "  /** Why no safe probe exists yet; null when the item has a probe. */",
        "  readonly unprobed: string | null;",
        "  readonly active: string;",
        "}",
        "",
        "export const REGISTRY_ITEMS: readonly RegistryItem[] = [",
    ]
    for item in items:
        lines.append("  {%s}," % ", ".join("%s: %s" % pair for pair in zip(FIELDS, cells(item, ts_value, "null"))))
    lines += ["];", "", "/** Each item's values, by the item's id in camel case. */", "export const REGISTRY = {"]
    for item in items:
        values = values_of(item)
        if not values:
            continue
        lines.append("  %s: {" % camel(item["id"]))
        lines += ["    %s: %s," % (name, ts_value(value)) for name, value in values.items()]
        lines.append("  },")
    lines += ["} as const;", ""]
    return "\n".join(lines)


# Java ------------------------------------------------------------------------------------------

def java_type(value):
    if isinstance(value, list):
        return "List<Integer>" if value and isinstance(value[0], int) else "List<String>"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "int"
    return "String"


def java_value(value):
    if isinstance(value, list):
        return "Collections.unmodifiableList(Arrays.asList(" + ", ".join(java_value(entry) for entry in value) + "))" if value else "Collections.emptyList()"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return quoted(value)


def off_text(item):
    """The kill switch as one string: null-like None when the module is on (#293)."""
    off = item.get("off")
    return None if off is None else "until %s: %s" % (off["review"], off["reason"])


def java(reader, version, items, table=None):
    lines = [
        "package %s;" % reader.package,
        "",
        "import java.util.Arrays;",
        "import java.util.Collections;",
        "import java.util.List;",
        "",
        "/** The registry of Supernote internals this app reads. %s */" % HEADER,
        "public final class Registry {",
        "  public static final String VERSION = %s;" % quoted(version),
        "",
        "  /** One registry item: docs/architecture.md › Layer rules gives the levels. */",
        "  public static final class Item {",
        "    public final String id;",
        "    public final int level;",
        "    public final String impact;",
        "    public final String owner;",
        "    /** The probe's name; null when the item is unprobed. */",
        "    public final String probe;",
        "    /** Why no safe probe exists yet; null when the item has a probe. */",
        "    public final String unprobed;",
        "    public final String active;",
        "    /** The kill switch: why the module is off and until when it is reviewed; null when it is on (#293). */",
        "    public final String off;",
        "",
        "    Item(String id, int level, String impact, String owner, String probe, String unprobed, String active, String off) {",
        "      this.id = id;",
        "      this.level = level;",
        "      this.impact = impact;",
        "      this.owner = owner;",
        "      this.probe = probe;",
        "      this.unprobed = unprobed;",
        "      this.active = active;",
        "      this.off = off;",
        "    }",
        "  }",
        "",
        "  /** %s */" % ("Every item of the registry, for the firmware watch (#293)." if table is not None else "The items this app reads."),
        "  public static final List<Item> ITEMS = Collections.unmodifiableList(Arrays.asList(",
    ]
    rows = []
    for item in (items if table is None else table):
        off = off_text(item)
        rows.append("      new Item(%s)" % ", ".join(cells(item, quoted, "null") + ["null" if off is None else quoted(off)]))
    lines.append(",\n".join(rows) + "));")
    for item in items:
        values = values_of(item)
        if not values:
            continue
        lines += ["", "  /** %s (%s). */" % (item["title"], item["id"]), "  public static final class %s {" % pascal(item["id"])]
        lines += ["    public static final %s %s = %s;" % (java_type(value), upper_snake(name), java_value(value))
                  for name, value in values.items()]
        lines += ["", "    private %s() {}" % pascal(item["id"]), "  }"]
    lines += ["", "  private Registry() {}", "}", ""]
    return "\n".join(lines)


# Python ----------------------------------------------------------------------------------------

def py_value(value):
    if isinstance(value, list):
        return "(" + "".join(py_value(entry) + ", " for entry in value).rstrip(" ") + ")"
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, int):
        return str(value)
    return quoted(value)


def python(reader, version, items):
    lines = [BLOCK_START, "REGISTRY_VERSION = %s" % quoted(version),
             "# Each item: id, level (docs/architecture.md › Layer rules), impact, owner, probe or None,",
             "# the reason it is unprobed or None, and the implementation that serves it.",
             "REGISTRY_ITEMS = ("]
    for item in items:
        lines.append("    {%s}," % ", ".join("%s: %s" % (quoted(name), cell) for name, cell in zip(FIELDS, cells(item, quoted, "None"))))
    lines += [")", "# Each item's values, by its id.", "REGISTRY = {"]
    for item in items:
        values = values_of(item)
        if not values:
            continue
        lines.append("    %s: {" % quoted(item["id"]))
        lines += ["        %s: %s," % (quoted(name), py_value(value)) for name, value in values.items()]
        lines.append("    },")
    lines += ["}", BLOCK_END]
    return "\n".join(lines)


# Swift -----------------------------------------------------------------------------------------

def swift_value(value):
    if isinstance(value, list):
        kind = "[Int]" if value and isinstance(value[0], int) else "[String]"
        return kind, "[" + ", ".join(swift_value(entry)[1] for entry in value) + "]"
    if isinstance(value, bool):
        return "Bool", "true" if value else "false"
    if isinstance(value, int):
        return "Int", str(value)
    return "String", quoted(value)


def swift(reader, version, items):
    lines = [
        "// The registry of Supernote internals this app reads. %s" % HEADER,
        "",
        "/// The registry's version, items and values.",
        "public enum Registry {",
        "    public static let version = %s" % quoted(version),
        "",
        "    /// One registry item: docs/architecture.md › Layer rules gives the levels.",
        "    public struct Item: Sendable, Equatable {",
        "        public let id: String",
        "        public let level: Int",
        "        public let impact: String",
        "        public let owner: String",
        "        /// The probe's name; nil when the item is unprobed.",
        "        public let probe: String?",
        "        /// Why no safe probe exists yet; nil when the item has a probe.",
        "        public let unprobed: String?",
        "        public let active: String",
        "    }",
        "",
        "    public static let items: [Item] = [",
    ]
    for item in items:
        lines.append("        Item(%s)," % ", ".join("%s: %s" % pair for pair in zip(FIELDS, cells(item, quoted, "nil"))))
    lines.append("    ]")
    for item in items:
        values = values_of(item)
        if not values:
            continue
        lines += ["", "    /// %s (%s)." % (item["title"], item["id"]), "    public enum %s {" % pascal(item["id"])]
        for name, value in values.items():
            kind, literal = swift_value(value)
            lines.append("        public static let %s: %s = %s" % (name, kind, literal))
        lines.append("    }")
    lines += ["}", ""]
    return "\n".join(lines)


WRITERS = {"typescript": typescript, "java": java, "python": python, "swift": swift}


# Java failure value ----------------------------------------------------------------------------

FAILURE_FILE = "InternalFailure.java"
JAVA_FAILURE = r"""package %s;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * %s
 *
 * The one failure value of the Java adapter for a Supernote internal (#294, docs/architecture.md ›
 * Layer rules, «A failure reads as a sentence»), as sn-adapter's src/failure.ts defines it: the
 * person sees one friendly sentence, chosen by a copy key from the tool's own copy; the agent's log
 * carries every detail: the registry item, the method, the firmware fingerprint, the app versions
 * and the whole cause chain with each stack. Pure Java, so the JVM tests run it.
 */
final class InternalFailure extends Exception {
  private static final long serialVersionUID = 1L;
  /** What the log says for an app version or a fingerprint that could not be read. */
  static final String UNREAD = "unread";

  final transient Registry.Item item;
  /** The operation that failed, in our words or the host's, such as {@code uninstall}. */
  final String method;
  /** The key of the person's sentence in the tool's copy. */
  final String copyKey;
  /** {@code Build.FINGERPRINT}, or {@link #UNREAD}. */
  final String firmware;
  /** Each vendor app's version name, by package, in the caller's order. */
  final Map<String, String> apps;

  /** The failure of registry item {@code id}; an id the registry does not hold is a bug, so it throws. */
  InternalFailure(String id, String method, String copyKey, String firmware, Map<String, String> apps, Throwable cause) {
    super(id + " " + method, cause);
    this.item = item(id);
    this.method = method;
    this.copyKey = copyKey;
    this.firmware = firmware;
    this.apps = Collections.unmodifiableMap(new LinkedHashMap<>(apps));
  }

  static Registry.Item item(String id) {
    for (Registry.Item entry : Registry.ITEMS) {
      if (entry.id.equals(id)) {
        return entry;
      }
    }
    throw new IllegalArgumentException("no registry item " + id);
  }

  /** The person's sentence: the tool's copy for the key. A missing key throws, never a blank. */
  String userSentence(Map<String, String> copy) {
    String sentence = copy.get(copyKey);
    if (sentence == null || sentence.isEmpty()) {
      throw new IllegalStateException("no copy for " + copyKey);
    }
    return sentence;
  }

  /** Each throwable of the chain, outermost first, as {@code Class: message} and its stack; a loop ends it. */
  static List<String> causeChain(Throwable cause) {
    List<String> chain = new ArrayList<>();
    Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
    for (Throwable current = cause; current != null && seen.add(current); current = current.getCause()) {
      String name = current.getClass().getName();
      StringBuilder entry = new StringBuilder(current.getMessage() == null ? name : name + ": " + current.getMessage());
      for (StackTraceElement frame : current.getStackTrace()) {
        entry.append("\n\tat ").append(frame);
      }
      chain.add(entry.toString());
    }
    return chain;
  }

  /** The agent's log text: one header line of every field, then each cause with its stack. */
  String agentLog() {
    StringBuilder apps = new StringBuilder();
    for (Map.Entry<String, String> app : this.apps.entrySet()) {
      apps.append(apps.length() == 0 ? "" : ",").append(app.getKey()).append('@').append(app.getValue());
    }
    StringBuilder log = new StringBuilder()
        .append("registry=").append(item.id)
        .append(" level=").append(item.level)
        .append(" owner=").append(item.owner)
        .append(" active=").append(item.active)
        .append(" method=").append(method)
        .append(" firmware=").append(firmware)
        .append(" apps=").append(apps.length() == 0 ? UNREAD : apps);
    for (String entry : causeChain(getCause())) {
      log.append("\ncause ").append(entry);
    }
    return log.toString();
  }
}
"""


def failure_path(reader):
    return reader.path.rsplit("/", 1)[0] + "/" + FAILURE_FILE


def failure_files(readers=None):
    """{path: text} of the failure value beside each Java reader that asks for it."""
    return {failure_path(reader): JAVA_FAILURE % (reader.package, HEADER)
            for reader in (READERS if readers is None else readers) if reader.failure}
