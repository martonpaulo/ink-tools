/** Every user-facing string of Bridge. English only; never inline in components (#93). */
export const copy = {
  title: 'Account Sync',
  'settings.loading': 'Loading the settings…',
  /** The Error state's title (#256); the reason is the read's own message. */
  'settings.error': 'The settings did not load',
  'settings.saveError': 'The change was not saved, so it is lost when Account Sync restarts: {reason}',
  /** What each module does, under its switch while it is off (#411). */
  'about.todo': 'Syncs To-Do with {providers}, both ways.',
  'about.calendar': 'Syncs Calendar with {providers}.',
  'about.digest': 'Saves messages from a connected account to Digest. No account connects yet.',
  'status.blocked': 'On, but not running: {reasons}.',
  'status.tried': 'Last tried at {time}.',
  /**
   * Why the device check blocks a module, one sentence per kind of probe problem (#417); each
   * follows «On, but not running: », and the provider, table and columns go only to the log.
   */
  'probe.changed': "the tablet's {app} app changed, so {app} sync is paused until Account Sync is updated",
  'probe.silent': "the tablet's {app} app did not answer the device check",
  'probe.refused': "the tablet's {app} app refused the safe test write, so nothing is written",
  'probe.unsafe': "the tablet's {app} app did not keep to the safe test write, so nothing is written",
  'probe.unknown': "the tablet's {app} app did not pass the device check",
  'probe.noTestWrite': "the tablet's {app} app has no safe test write yet, so nothing is written",
  'app.todo': 'To-Do',
  'app.calendar': 'Calendar',
  'app.digest': 'Digest',
  'status.waiting': 'Not synced yet.',
  /** One short line per module, as native Settings states a status (#411): when, then what changed. */
  'status.synced': 'Synced at {time} · {changes}',
  'status.noChanges': 'no changes',
  'status.added': '{items} added',
  'status.changed': '{items} changed',
  'status.removed': '{items} removed',
  /** A failed or inexact item is named in the log; the status says only that there was one (#411). */
  'status.failed': 'some {things} not synced',
  'status.inPart': 'some {things} synced in part',
  'things.todo': 'tasks',
  'things.calendar': 'events',
  'things.digest': 'entries',
  'sync.button': 'Sync now',
  'sync.running': 'Syncing…',
  'sync.problem': 'The sync did not start: {reason}',
  'remove.title': 'Remove what Account Sync wrote',
  'remove.about': 'Your own events and tasks stay.',
  /** Asked in the host's confirm dialog, so it names what it removes and stands alone (#296). */
  'remove.confirm': 'Remove what Account Sync wrote for {module}? Your own events and tasks stay.',
  'remove.yes': 'Remove',
  cancel: 'Cancel',
  'account.title': '{provider} account',
  'signIn.in': 'Signed in ({tail})',
  'signIn.out': 'Not connected',
  'connect.button': 'Connect',
  'connect.label': 'Connect {provider}',
  /** The Needs state «Connect» opens (#256): what is missing, why, and the steps only the owner can do. */
  'connect.what': '{provider} is not connected',
  'connect.why': 'Account Sync reads {provider} with your own sign-in, which comes from the Mac.',
  'connect.step.mac': 'On the Mac, run inkctl secret set {id}.',
  'connect.step.sync': 'Close this view and press Sync now.',
  'signIn.unreadable': 'The sign-in did not read: {reason}',
  'signOut.button': 'Sign out',
  'signOut.label': 'Sign out of {provider}',
  'signOut.confirm': 'Sign out of {provider}? Account Sync deletes its sign-in from the tablet.',
  'signOut.yes': 'Sign out',
  'signOut.problem': 'The {provider} sign-out did not finish. Try again.',
  'sendTabletOnly.button': 'Send tablet-only items',
  /** The tablet-only notice, said once, at its own setting (#411). */
  'sendTabletOnly.kept.one': '{items} exists only on the tablet. Turn this on to send it to {providers}.',
  'sendTabletOnly.kept.other': '{items} exist only on the tablet. Turn this on to send them to {providers}.',
  'sendTabletOnly.sent.one': '{items} goes to {providers} at the next sync.',
  'sendTabletOnly.sent.other': '{items} go to {providers} at the next sync.',
  'item.task.one': '{count} task',
  'item.task.other': '{count} tasks',
  'item.event.one': '{count} event',
  'item.event.other': '{count} events',
  'item.entry.one': '{count} entry',
  'item.entry.other': '{count} entries',
  'list.and': '{first} and {last}',
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

/** The keys that come in a `.one` and an `.other` form, by their shared stem. */
type PluralStem = CopyKey extends infer K
  ? K extends `${infer Stem}.one`
    ? Stem
    : never
  : never;

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

/**
 * The form of `stem` for `count`, English singular or plural (#411), with `{count}` and `values`
 * filled in: never «task(s)».
 */
export function plural(
  stem: PluralStem,
  count: number,
  values: Record<string, string> = {},
): string {
  const key = `${stem}.${count === 1 ? 'one' : 'other'}` as CopyKey;
  return format(key, {...values, count: String(count)});
}

/** Names joined as a person writes them: «A», «A and B», «A, B and C». */
export function joinNames(names: readonly string[]): string {
  if (names.length < 2) {
    return names.join('');
  }
  return format('list.and', {
    first: names.slice(0, -1).join(', '),
    last: names[names.length - 1],
  });
}
