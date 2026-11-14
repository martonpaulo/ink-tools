/** Every user-facing string of Bridge. English only; never inline in components (#93). */
export const copy = {
  title: 'Bridge',
  'settings.loading': 'Loading the settings…',
  'settings.error': 'The settings did not load: {reason}',
  'settings.retry': 'Try again',
  'settings.empty': 'No module is ready yet.',
  'module.unavailable': 'Not available: {reason}',
} as const;

export type CopyKey = keyof typeof copy;

/** A copy string with its `{name}` parts filled in. */
export function format(key: CopyKey, values: Record<string, string> = {}): string {
  return copy[key].replace(/\{(\w+)\}/g, (part, name: string) => values[name] ?? part);
}
