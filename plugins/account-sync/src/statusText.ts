/**
 * A module's sync status in plain words for Settings, and the same record as log lines for
 * `inkctl logs --plugin Bridge` (#88). The status says «last synced», never a schedule: the sync
 * runs only while the plugin is alive (#39).
 */
import type {ModuleRun, ModuleStatus} from '@ink-tools/sync-core';
import {format} from './copy';

/** The messages shown per kind; the log keeps every one. */
export const SHOWN_MESSAGES = 5;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time as `2026-11-14 14:05`, the same on every device locale. */
export function localTime(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function messages(
  heading: 'status.errors' | 'status.warnings',
  list: string[],
): string[] {
  if (list.length === 0) {
    return [];
  }
  const lines = [
    format(heading, {count: String(list.length)}),
    ...list.slice(0, SHOWN_MESSAGES),
  ];
  if (list.length > SHOWN_MESSAGES) {
    lines.push(
      format('status.more', {count: String(list.length - SHOWN_MESSAGES)}),
    );
  }
  return lines;
}

const countsText = ({counts}: ModuleRun) =>
  format('status.counts', {
    added: String(counts.added),
    changed: String(counts.changed),
    removed: String(counts.removed),
  });

/** The lines under a module's name in Settings. */
export function statusLines(status: ModuleStatus): string[] {
  switch (status.state) {
    case 'off':
      return [format('status.off')];
    case 'blocked': {
      const {reasons, at} = status;
      const lines = [
        format('status.blocked', {
          // The line ends with one period, so a reason's own final period is dropped (#368).
          reasons: reasons.slice(0, SHOWN_MESSAGES).join('; ').replace(/\.$/, ''),
        }),
      ];
      if (reasons.length > SHOWN_MESSAGES) {
        lines.push(
          format('status.more', {
            count: String(reasons.length - SHOWN_MESSAGES),
          }),
        );
      }
      if (at !== undefined) {
        lines.push(format('status.tried', {time: localTime(at)}));
      }
      return lines;
    }
    case 'waiting':
      return [format('status.waiting')];
    case 'ran':
      return [
        format('status.lastSync', {time: localTime(status.run.at)}),
        countsText(status.run),
        ...messages('status.errors', status.run.errors),
        ...messages('status.warnings', status.run.warnings),
      ];
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
  const head = `[Bridge] sync ${run.module}: ${new Date(
    run.at,
  ).toISOString()}, ${countsText(run)}, ${run.errors.length} errors, ${
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
