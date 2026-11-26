/**
 * A module's sync status in plain words for Settings, and the same record as log lines for
 * `inkctl logs --plugin Bridge` (#88). The status says «last synced», never a schedule: the sync
 * runs only while the plugin is alive (#39).
 */
import type {ModuleRun, ModuleStatus} from '@ink-tools/sync-core';
import {copy, format, plural} from './copy';

/** The reasons a blocked status names; the log keeps every one. */
export const SHOWN_MESSAGES = 5;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time as `2026-11-14 14:05`, the same on every device locale; the log's form. */
export function localTime(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** The time a person reads in a status: `03:49` today, the date before it on another day (#411). */
export function shownTime(at: number, now: number): string {
  const full = localTime(at);
  const [day, time] = full.split(' ');
  return day === localTime(now).split(' ')[0] ? time : full;
}

/** What each module syncs, by the word its counts take. */
const ITEM: Record<ModuleRun['module'], 'item.task' | 'item.event' | 'item.entry'> = {
  todo: 'item.task',
  calendar: 'item.event',
  digest: 'item.entry',
};

/** «no changes», or the counts that are not zero: «2 tasks added, 1 task removed». */
function changes({module, counts, errors, warnings}: ModuleRun): string {
  const items = (n: number) => plural(ITEM[module], n);
  const parts = [
    counts.added && format('status.added', {items: items(counts.added)}),
    counts.changed && format('status.changed', {items: items(counts.changed)}),
    counts.removed && format('status.removed', {items: items(counts.removed)}),
    errors.length && format('status.failed', {things: copy[`things.${module}`]}),
    warnings.length && format('status.inPart', {things: copy[`things.${module}`]}),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(', ') : copy['status.noChanges'];
}

/**
 * A module's status as one short line under its switch (#88, #411), the way native Settings states
 * one: when it synced and what changed, never a zero count; the messages behind a count go to the
 * log (`runLogLines`). A module that is off says what it does instead (`about`).
 */
export function statusLine(
  status: ModuleStatus,
  about: string,
  now: number = Date.now(),
): string {
  switch (status.state) {
    case 'off':
      return about;
    case 'blocked': {
      const {reasons, at} = status;
      const line = format('status.blocked', {
        // The line ends with one period, so a reason's own final period is dropped (#368).
        reasons: reasons.slice(0, SHOWN_MESSAGES).join('; ').replace(/\.$/, ''),
      });
      return at === undefined ? line : `${line} ${format('status.tried', {time: shownTime(at, now)})}`;
    }
    case 'waiting':
      return copy['status.waiting'];
    case 'ran':
      return format('status.synced', {
        time: shownTime(status.run.at, now),
        changes: changes(status.run),
      });
  }
}

const notRunLine = (module: ModuleRun['module'], reasons: string[]) =>
  `[Bridge] sync ${module}: not run: ${reasons.join('; ')}`;

/**
 * The log lines of one run, every message included, each starting with the plugin's tag. A run
 * that could not start is one «not run» line, the same as a module the probe blocked.
 */
export function runLogLines(run: ModuleRun): string[] {
  if (run.notRun) {
    return [notRunLine(run.module, run.errors)];
  }
  const {added, changed, removed} = run.counts;
  const head = `[Bridge] sync ${run.module}: ${new Date(
    run.at,
  ).toISOString()}, ${added} added, ${changed} changed, ${removed} removed, ${run.errors.length} errors, ${
    run.warnings.length
  } warnings`;
  return [
    head,
    ...run.errors.map(e => `[Bridge] sync ${run.module} error: ${e}`),
    ...run.warnings.map(w => `[Bridge] sync ${run.module} warning: ${w}`),
  ];
}

/** Writes a run to the device log, where `inkctl logs --plugin Bridge` reads it. */
export function logRun(
  run: ModuleRun,
  write: (line: string) => void = console.log,
): void {
  runLogLines(run).forEach(line => write(line));
}

/** Writes why a module that is on did not run. */
export function logBlocked(
  module: ModuleRun['module'],
  reasons: string[],
  write: (line: string) => void = console.log,
): void {
  write(notRunLine(module, reasons));
}
