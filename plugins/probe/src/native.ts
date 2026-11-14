import {NativeModules} from 'react-native';
import type {Log} from './probe';

interface ProbeProviders {
  run(): Promise<string[]>;
  startHeartbeat(): void;
}

/**
 * Runs the native Digest-provider probe (#59) and logs its lines. The native module logs the same
 * lines to logcat tag SNPROBE itself. Without the module (a JS-only build) it says so, not "ok".
 */
export async function runNativeProviderProbe(log: Log, modules: Record<string, unknown> = NativeModules): Promise<void> {
  const native = modules.ProbeProviders as ProbeProviders | undefined;
  if (!native) {
    log('native module ProbeProviders is missing: this build has no native step. Build with `npm run build`.');
    return;
  }
  for (const line of await native.run()) {
    log(`native: ${line}`);
  }
  native.startHeartbeat();
  log('heartbeat started: close the view and watch `adb logcat -s SNPROBE` for about 30 s');
}
