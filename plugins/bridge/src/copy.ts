/** Every user-facing string of Bridge. English only; never inline in components (#93). */
export const copy = {
  title: 'Bridge',
  'settings.loading': 'Loading the settings…',
  'settings.error': 'The settings did not load: {reason}',
  'settings.retry': 'Try again',
  'settings.empty': 'No module is ready yet.',
  'status.off': 'Off.',
  'status.blocked': 'On, but not running: {reasons}',
  'status.waiting': 'On. Not synced since Bridge started.',
  'status.lastSync': 'Last synced {time}.',
  'status.counts': '{added} added, {changed} changed, {removed} removed',
  'status.errors': 'Not synced ({count}):',
  'status.warnings': 'Synced, but read with care ({count}):',
  'status.more': 'and {count} more in the log',
  'remove.button': 'Remove what Bridge wrote',
  'remove.confirm':
    'Remove what Bridge wrote for {module}? Your own events and tasks stay.',
  'remove.cancel': 'Cancel',
  'remove.yes': 'Remove',
} as const;

export type CopyKey = keyof typeof copy;

/** A copy string with its `{name}` parts filled in. */
export function format(
  key: CopyKey,
  values: Record<string, string> = {},
): string {
  return copy[key].replace(
    /\{(\w+)\}/g,
    (part, name: string) => values[name] ?? part,
  );
}
