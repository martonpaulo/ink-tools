#!/usr/bin/env python3
"""Validate the registry of Supernote internals and write the files made from it (#294).

    registry.py [--root DIR] [--write]

The registry is data (`docs/architecture.md` › Layer rules): `registry/registry.json` holds its
version, the header of sn-adapter's descriptor and the ratchet's ceiling per level;
`registry/items/<area>.json` holds the items of one device area. Every file is checked against
`registry/schema.json`, and then against the rules a schema cannot state:

- an item's id starts with its file's area, and no two items share an id;
- an item below level 1 has a `reason`; its owner is the first of its `readers`, none twice;
- only an sn-adapter item of the calendar, todo or digest area carries a `descriptor`;
- the ratchet: no level holds more items than its ceiling, and a ceiling above its count is
  lowered to the count, so a ceiling only goes down;
- no two generated names collide, and every tool an item names has a reader.

Then it writes `packages/sn-adapter/src/internals/descriptor.json`, the shape `chooseDescriptor`
reads, from the three provider items, one reader per runtime (`registry_readers.py`: TypeScript,
Java, Python and Swift), and the Java adapter's failure value, `InternalFailure.java`, beside each
Java reader that reports a failed internal. Without `--write` it compares each written file with the
disk and fails on a stale or hand-edited one. Prints one `path: problem` line per finding.
Exit 0 with none, 1 with findings, 2 on a bad root.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import registry_readers

SCHEMA = "registry/schema.json"
META = "registry/registry.json"
ITEMS = "registry/items"
DESCRIPTOR = "packages/sn-adapter/src/internals/descriptor.json"
# The provider modules of descriptor.json, in its order: each is the descriptor of `<area>.provider`.
DESCRIPTOR_AREAS = ("calendar", "todo", "digest")
DESCRIPTOR_OWNER = "sn-adapter"
LEVEL_ONE = 1
WRITE_STEP = "python3 scripts/registry.py --write"


class Invalid(Exception):
    """A registry that cannot be read: one message per problem."""

    def __init__(self, problems):
        super().__init__("; ".join(problems))
        self.problems = problems


# The JSON Schema keywords registry/schema.json uses; any other keyword is refused, so the schema
# never states a rule this check skips.
KEYWORDS = {"$schema", "$id", "$defs", "$ref", "title", "description", "type", "enum", "pattern",
            "minimum", "maximum", "minLength", "minItems", "required", "properties",
            "additionalProperties", "propertyNames", "items", "oneOf"}
TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
}


def schema_errors(value, schema, defs, where):
    """[message] for each way value breaks schema, a subset of JSON Schema 2020-12."""
    unknown = set(schema) - KEYWORDS
    if unknown:
        return ["%s: the schema uses %s, which this check does not read" % (where, ", ".join(sorted(unknown)))]
    if "$ref" in schema:
        name = schema["$ref"].rpartition("/")[2]
        return schema_errors(value, defs[name], defs, where)
    if "oneOf" in schema:
        passing = [s for s in schema["oneOf"] if not schema_errors(value, s, defs, where)]
        return [] if len(passing) == 1 else ["%s: matches %d of the allowed shapes, not one" % (where, len(passing))]
    kind = schema.get("type")
    if kind and not TYPES[kind](value):
        return ["%s: must be a %s" % (where, kind)]
    errors = []
    if "enum" in schema and value not in schema["enum"]:
        errors.append("%s: %r is not one of %s" % (where, value, ", ".join(map(str, schema["enum"]))))
    if isinstance(value, str):
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append("%s: %r does not match %s" % (where, value, schema["pattern"]))
        if len(value) < schema.get("minLength", 0):
            errors.append("%s: is empty" % where)
    if isinstance(value, int) and not isinstance(value, bool):
        if value < schema.get("minimum", value) or value > schema.get("maximum", value):
            errors.append("%s: %d is out of range" % (where, value))
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append("%s: needs at least %d entries" % (where, schema["minItems"]))
        for index, entry in enumerate(value):
            errors.extend(schema_errors(entry, schema.get("items", {}), defs, "%s[%d]" % (where, index)))
    if isinstance(value, dict):
        properties = schema.get("properties", {})
        for name in schema.get("required", []):
            if name not in value:
                errors.append("%s: lacks %s" % (where, name))
        extra = schema.get("additionalProperties", True)
        for name, entry in value.items():
            if "propertyNames" in schema:
                errors.extend(schema_errors(name, schema["propertyNames"], defs, "%s key %r" % (where, name)))
            if name in properties:
                errors.extend(schema_errors(entry, properties[name], defs, "%s.%s" % (where, name)))
            elif extra is False:
                errors.append("%s: %s is not a known field" % (where, name))
            elif isinstance(extra, dict):
                errors.extend(schema_errors(entry, extra, defs, "%s.%s" % (where, name)))
    return errors


def read_json(path, problems):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        problems.append("%s: %s" % (path.name, error))
        return None


def load(root):
    """(meta, items) of the registry under root, items in file then file order; raises Invalid."""
    problems = []
    schema = read_json(root / SCHEMA, problems)
    meta = read_json(root / META, problems)
    if problems:
        raise Invalid(problems)
    defs = schema["$defs"]
    problems.extend(schema_errors(meta, defs["registry"], defs, META))
    items = []
    folder = root / ITEMS
    files = sorted(folder.glob("*.json")) if folder.is_dir() else []
    if not files:
        problems.append("%s: holds no area file" % ITEMS)
    for path in files:
        rel = "%s/%s" % (ITEMS, path.name)
        area = read_json(path, problems)
        if area is None:
            continue
        found = schema_errors(area, defs["area"], defs, rel)
        problems.extend(found)
        if found:
            continue
        if area["area"] != path.stem:
            problems.append("%s: its area is %s, not its file name" % (rel, area["area"]))
        for item in area["items"]:
            items.append((rel, area["area"], item))
    problems.extend(rule_errors(items))
    if not problems:
        problems.extend(registry_readers.name_errors([item for _, _, item in items]))
    if not problems:
        problems.extend(ratchet_errors(meta["ceilings"], [item for _, _, item in items]))
    if problems:
        raise Invalid(problems)
    return meta, [item for _, _, item in items]


def rule_errors(items):
    """[message] for each rule the schema cannot state (the module docstring lists them)."""
    errors = []
    seen = set()
    for rel, area, item in items:
        where = "%s: %s" % (rel, item["id"])
        if item["id"].partition(".")[0] != area:
            errors.append("%s: the id does not start with the area %s" % (where, area))
        if item["id"] in seen:
            errors.append("%s: the id is used twice" % where)
        seen.add(item["id"])
        if item["level"] > LEVEL_ONE and "reason" not in item:
            errors.append("%s: below level 1 with no reason" % where)
        readers = item["readers"]
        if readers[0] != item["owner"]:
            errors.append("%s: the owner %s is not the first reader" % (where, item["owner"]))
        if len(set(readers)) != len(readers):
            errors.append("%s: a reader is named twice" % where)
        if "descriptor" in item and (item["owner"] != DESCRIPTOR_OWNER or area not in DESCRIPTOR_AREAS):
            errors.append("%s: only an %s item of %s carries a descriptor" % (where, DESCRIPTOR_OWNER, ", ".join(DESCRIPTOR_AREAS)))
    return errors


def level_counts(items):
    counts = {}
    for item in items:
        counts[str(item["level"])] = counts.get(str(item["level"]), 0) + 1
    return counts


def ratchet_errors(ceilings, items):
    """[message] for each level above its ceiling, or whose ceiling has room the count left."""
    counts = level_counts(items)
    errors = []
    for level, ceiling in sorted(ceilings.items()):
        count = counts.get(level, 0)
        if count > ceiling:
            errors.append("%s: level %s holds %d items, above its ceiling %d; move an item up, or raise the ceiling with the reason in the commit" % (META, level, count, ceiling))
        elif count < ceiling:
            errors.append("%s: level %s holds %d items; lower its ceiling from %d to %d" % (META, level, count, ceiling, count))
    return errors


def descriptor(meta, items):
    """The text of sn-adapter's descriptor.json: the header, then each provider item's descriptor."""
    header = meta["descriptor"]
    body = {"schema": header["schema"], "descriptorVersion": header["version"], "device": header["device"]}
    by_id = {item["id"]: item for item in items}
    for area in DESCRIPTOR_AREAS:
        item = by_id.get(area + ".provider")
        if item is None or "descriptor" not in item:
            raise Invalid(["%s: no %s.provider item with a descriptor" % (ITEMS, area)])
        body[area] = item["descriptor"]
    return json.dumps(body, indent=2, ensure_ascii=False) + "\n"


def outputs(meta, items, root):
    """{path relative to the root: text} for every file the registry writes."""
    written = {DESCRIPTOR: descriptor(meta, items)}
    for reader in registry_readers.READERS:
        current = None
        if reader.block:
            path = root / reader.path
            if not path.exists():
                raise Invalid(["%s: missing; the registry block lives inside it" % reader.path])
            current = path.read_text(encoding="utf-8")
        try:
            written[reader.path] = registry_readers.text(reader, meta["version"], items, current)
        except ValueError as error:
            raise Invalid([str(error)])
    written.update(registry_readers.failure_files())
    return written


def main(argv=None):
    parser = argparse.ArgumentParser(description="Validate the registry of internals and write its files (#294).")
    parser.add_argument("--root", default=".", help="the checkout that holds registry/ (default: here)")
    parser.add_argument("--write", action="store_true", help="write the files instead of checking them")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not (root / ITEMS).is_dir():
        print("registry: %s has no %s folder" % (args.root, ITEMS), file=sys.stderr)
        return 2
    try:
        meta, items = load(root)
        written = outputs(meta, items, root)
    except Invalid as error:
        for problem in error.problems:
            print(problem)
        return 1
    stale = []
    for rel, text in written.items():
        path = root / rel
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == text:
            continue
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
            print("%s: written" % rel)
        else:
            stale.append(rel)
            print("%s: stale or edited by hand; run %s" % (rel, WRITE_STEP))
    return 1 if stale else 0


if __name__ == "__main__":
    sys.exit(main())
