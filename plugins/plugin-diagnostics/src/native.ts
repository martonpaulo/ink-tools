import {NativeModules} from 'react-native';
import {copy} from './copy';
import {NeedError, type Log} from './probe';

interface ProbeProviders {
  run(): Promise<string[]>;
  startHeartbeat(): void;
  startListener(): Promise<string[]>;
}

/**
 * Runs the native Digest-provider probe (#59) and logs its lines. The native module logs the same
 * lines to logcat tag SNPROBE itself. Without the module (a JS-only build) it throws a `NeedError`,
 * which the view shows as the Needs state with the rebuild steps (#257), never "ok".
 */
export async function runNativeProviderProbe(log: Log, modules: Record<string, unknown> = NativeModules): Promise<void> {
  const native = modules.ProbeProviders as ProbeProviders | undefined;
  if (!native) {
    throw new NeedError(copy['needs.native']);
  }
  for (const line of await native.run()) {
    log(`native: ${line}`);
  }
  native.startHeartbeat();
  log('heartbeat started: close the view and watch `adb logcat -s SNPROBE` for about 30 s');
}

/**
 * Opens a TCP listener in the plugin (#91) and logs its port and addresses. The native side then
 * waits two minutes for one connection and logs the outcome to logcat tag SNPROBE. Without the
 * module it throws a `NeedError` (#257), never "ok".
 */
export async function runNativeListenProbe(log: Log, modules: Record<string, unknown> = NativeModules): Promise<void> {
  const native = modules.ProbeProviders as ProbeProviders | undefined;
  if (!native?.startListener) {
    throw new NeedError(copy['needs.listener']);
  }
  for (const line of await native.startListener()) {
    log(`native: ${line}`);
  }
  log('listener open for 2 minutes: from the Mac run `nc <address> <port>`, then once more with the screen off; read `adb logcat -s SNPROBE`');
}
