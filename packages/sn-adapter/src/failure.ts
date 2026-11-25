import {REGISTRY_ITEMS, RegistryItem} from './registry.generated';

/**
 * The one failure value of the TypeScript adapter for a Supernote internal (#294,
 * docs/architecture.md › Layer rules, «A failure reads as a sentence»): the person sees one friendly
 * sentence, chosen by a copy key from the tool's own copy module; the agent's log line carries every
 * detail: the registry item, the method, the firmware fingerprint, the app versions and the whole
 * cause chain with each stack.
 */
export interface InternalFailure {
  readonly item: RegistryItem;
  /** The operation that failed, in our words or the SDK's, such as `writeTask` or `query`. */
  readonly method: string;
  /** The key of the person's sentence in the tool's copy module. */
  readonly copyKey: string;
  readonly environment: Environment;
  readonly cause: unknown;
}

/** What the tablet ran: `Build.FINGERPRINT` and each vendor app's version, as the probe reads them. */
export interface Environment {
  readonly firmware: string;
  readonly apps: Readonly<Record<string, string>>;
}

/** The failure of registry item `id`; an id the registry does not hold is a bug, so it throws. */
export function internalFailure(
  id: string,
  method: string,
  copyKey: string,
  environment: Environment,
  cause: unknown,
): InternalFailure {
  const item = REGISTRY_ITEMS.find(entry => entry.id === id);
  if (!item) {
    throw new Error(`no registry item ${id}`);
  }
  return {item, method, copyKey, environment, cause};
}

/** The person's sentence: the tool's copy for the key. A missing key throws, never a blank. */
export function userSentence(failure: InternalFailure, copy: Readonly<Record<string, string>>): string {
  const sentence = copy[failure.copyKey];
  if (!sentence) {
    throw new Error(`no copy for ${failure.copyKey}`);
  }
  return sentence;
}

/** Each error of the cause chain, outermost first, as `Class: message` and its stack. */
export function causeChain(cause: unknown): string[] {
  const chain: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = cause;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      chain.push(`${current.name}: ${current.message}${current.stack ? `\n${current.stack}` : ''}`);
      current = (current as {cause?: unknown}).cause;
    } else {
      chain.push(`${typeof current}: ${String(current)}`);
      current = undefined;
    }
  }
  return chain;
}

/** The agent's log text: one header line of every field, then each cause with its stack. */
export function agentLog(failure: InternalFailure): string {
  const {item, method, environment} = failure;
  const apps = Object.entries(environment.apps)
    .map(([app, version]) => `${app}@${version}`)
    .join(',');
  const header = [
    `registry=${item.id}`,
    `level=${item.level}`,
    `owner=${item.owner}`,
    `active=${item.active}`,
    `method=${method}`,
    `firmware=${environment.firmware}`,
    `apps=${apps}`,
  ].join(' ');
  return [header, ...causeChain(failure.cause).map(entry => `cause ${entry}`)].join('\n');
}
