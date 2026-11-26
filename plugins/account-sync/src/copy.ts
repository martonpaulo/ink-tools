/** Every user-facing string of Bridge. English only; never inline in components (#93). */
export const copy = {
  title: 'Account Sync',
  'settings.loading': 'Loading the settings…',
  'settings.error': 'The settings did not load: {reason}',
  'settings.retry': 'Try again',
  'settings.saveError': 'The change was not saved, so it is lost when Account Sync restarts: {reason}',
  'settings.empty': 'No module is ready yet.',
  'status.off': 'Off.',
  'status.blocked': 'On, but not running: {reasons}.',
  'status.tried': 'Last tried {time}.',
  'status.waiting': 'On. Not synced since Account Sync started.',
  'status.lastSync': 'Last synced {time}.',
  'status.counts': '{added} added, {changed} changed, {removed} removed',
  'status.errors': 'Not synced ({count}):',
  'status.warnings': 'Synced, but read with care ({count}):',
  'status.more': 'and {count} more in the log',
  'sync.button': 'Sync now',
  'sync.running': 'Syncing…',
  'sync.problem': 'The sync did not start: {reason}',
  'remove.button': 'Remove what Account Sync wrote',
  'remove.confirm':
    'Remove what Account Sync wrote for {module}? Your own events and tasks stay.',
  'remove.yes': 'Remove',
  cancel: 'Cancel',
  'signIn.in': '{provider}: signed in ({tail}).',
  'signIn.out': '{provider}: not connected.',
  'connect.label': 'Connect {provider}',
  'connect.how': 'To connect {provider}, run inkctl secret set {id} on the Mac, then press Sync now.',
  'signIn.unreadable': '{provider}: the sign-in did not read: {reason}',
  'signOut.button': 'Sign out',
  'signOut.label': 'Sign out of {provider}',
  'signOut.confirm': 'Sign out of {provider}? Account Sync deletes its sign-in from the tablet.',
  'signOut.yes': 'Sign out',
  'signOut.problem': 'The {provider} sign-out did not finish. Try again.',
  'sendTabletOnly.button': 'Send tablet-only items',
  'sendTabletOnly.kept':
    '{count} tablet-only tasks stay on the tablet; only tasks made after the first sync go to the account.',
  'sendTabletOnly.sent': '{count} tablet-only tasks go to the account at the next sync.',
  'module.todo': 'To-Do',
  'module.calendar': 'Calendar',
  'module.digest': 'Digest',
  'provider.todoist': 'Todoist',
  'provider.google': 'Google',
  'provider.icloud': 'iCloud',
  'provider.ics': 'ICS',
  'ics.caption': 'ICS feeds',
  'ics.empty': 'No ICS feed yet.',
  'ics.field': 'Feed address, https:// or webcal://',
  'ics.add': 'Add feed',
  'ics.remove': 'Remove',
  'ics.removeLabel': 'Remove {name}',
  'ics.invalid': 'This is not a feed address. Use one that starts with https:// or webcal://.',
  'ics.off': 'Turn on Calendar and ICS to add or remove a feed.',
  'ics.full': 'Account Sync keeps at most {max} feeds. Remove one to add another.',
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
