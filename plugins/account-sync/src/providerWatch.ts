/**
 * A tablet edit syncs at once (#296): `BridgeProviders.watch` observes the Calendar and To-Do
 * providers and emits one `BridgeProvidersChanged` per debounced burst, never for Account Sync's own
 * writes (the Java `ChangeGate`'s echo guard). Each event runs the same runner as the timer and
 * «Sync now», beside the timer, never instead of it: a failed watch leaves the timer as the only
 * sync, and says why in the log.
 */
import {NativeEventEmitter, NativeModules} from 'react-native';
import {BUNDLED_DESCRIPTOR, contentUri, Descriptor} from '@ink-tools/sn-adapter';
import {PROVIDERS_MODULE} from './deviceReader';
import type {SyncRunner} from './sync';

/** The event `BridgeProvidersModule.CHANGED_EVENT` emits. */
export const CHANGED_EVENT = 'BridgeProvidersChanged';

/** A burst of row changes waits this long for its last one [inference: one edit writes a few rows]. */
export const CHANGE_DEBOUNCE_MS = 2000;

/** The calls of the Java module the watch needs. */
export type WatchModule = {
  watch: (uris: string[], debounceMs: number) => Promise<number>;
};

/** Subscribes to the module's change event; answers the stop function. */
export type Subscribe = (event: string, listener: () => void) => () => void;

/** The URIs a tablet edit changes: the Calendar's events and the To-Do's tasks, from the descriptor. */
export function watchedUris(d: Descriptor = BUNDLED_DESCRIPTOR): string[] {
  return [contentUri(d.calendar, 'events'), contentUri(d.todo, 'tasks')];
}

function nativeSubscribe(): Subscribe {
  const emitter = new NativeEventEmitter(NativeModules[PROVIDERS_MODULE]);
  return (event, listener) => {
    const subscription = emitter.addListener(event, listener);
    return () => subscription.remove();
  };
}

/** `module` and `subscribe` are for tests; without them, the module PluginHost loaded. */
export async function watchProviders(
  runner: SyncRunner,
  log: (line: string) => void = console.log,
  module: WatchModule | undefined = NativeModules[PROVIDERS_MODULE] as WatchModule | undefined,
  subscribe: Subscribe = nativeSubscribe(),
): Promise<() => void> {
  if (!module?.watch) {
    log(`[Bridge] watch: the ${PROVIDERS_MODULE} module cannot watch yet: the timer syncs alone`);
    return () => {};
  }
  const stop = subscribe(CHANGED_EVENT, () => {
    log('[Bridge] watch: a tablet edit changed the Calendar or the To-Do: a pass starts');
    runner.syncNow();
  });
  try {
    const watched = await module.watch(watchedUris(), CHANGE_DEBOUNCE_MS);
    log(`[Bridge] watch: ${watched} providers watched`);
    return stop;
  } catch (e) {
    stop();
    log(`[Bridge] watch: not started: ${(e as Error).message}: the timer syncs alone`);
    return () => {};
  }
}
