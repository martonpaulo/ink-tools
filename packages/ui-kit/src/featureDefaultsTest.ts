/**
 * Test support for `docs/feature-defaults.md` (#547): the keys one tool's rows name, and the keys a
 * settings object holds, so a plugin's Jest test fails on a game or a setting with no row.
 * `scripts/feature_defaults.py` checks the rest of the file. Kept out of the entry, so out of the
 * bundle, as `problemTest` is.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

/** The repository's `docs/feature-defaults.md`, from this file's place in it. */
export const FEATURE_DEFAULTS = resolve(__dirname, '../../../docs/feature-defaults.md');

/** A tool's heading, `## <tool>`. */
const SECTION = '## ';
/** The «Key» column: the fourth, after «Feature», «Default» and «Change». */
const KEY_CELL = ['Feature', 'Default', 'Change', 'Key'].indexOf('Key');

/** One row of a tool's table: its «Feature», «Default» and «Change» cells and each key it names. */
export type DefaultRow = {feature: string; value: string; change: string; keys: string[]};

/** The rows of the `## <tool>` section. */
export function defaultRows(tool: string, text = readFileSync(FEATURE_DEFAULTS, 'utf8')): DefaultRow[] {
  const rows: DefaultRow[] = [];
  let inside = false;
  for (const line of text.split('\n')) {
    if (line.startsWith(SECTION)) {
      inside = line.slice(SECTION.length).trim() === tool;
      continue;
    }
    if (!inside || !line.trimStart().startsWith('|')) {continue;}
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
    if (cells[0] === 'Feature' || cells.every(cell => /^[:\- ]*$/.test(cell))) {continue;}
    const keys = [...(cells[KEY_CELL] ?? '').matchAll(/`([^`]+)`/g)].map(match => match[1]);
    rows.push({feature: cells[0], value: cells[1], change: cells[2], keys});
  }
  return rows;
}

/** Every leaf key path of a settings object, `text.spacing` style; an array is one leaf. */
export function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {return prefix ? [prefix] : [];}
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {return prefix ? [prefix] : [];}
  return entries.flatMap(([key, inner]) => keyPaths(inner, prefix ? `${prefix}.${key}` : key));
}

/** The keys of `wanted` no row of `tool` names. */
export function keysWithNoRow(tool: string, wanted: readonly string[]): string[] {
  const named = new Set(defaultRows(tool).flatMap(row => row.keys));
  return wanted.filter(key => !named.has(key));
}
