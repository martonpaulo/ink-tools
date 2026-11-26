/**
 * Jest stand-in for the one `react-native` export the packages call outside a plugin: the native
 * module registry. A test puts a module in it as the host would (#142).
 */
export const NativeModules: Record<string, any> = {};

/** The event emitter a native module's events arrive through; a test passes its own subscribe (#283). */
export class NativeEventEmitter {
  constructor(_module?: unknown) {}
  addListener(_event: string, _listener: (...args: any[]) => void): {remove(): void} {
    return {remove: () => {}};
  }
}
