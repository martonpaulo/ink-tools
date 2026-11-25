/**
 * Jest stand-in for the one `react-native` export the packages call outside a plugin: the native
 * module registry. A test puts a module in it as the host would (#142).
 */
export const NativeModules: Record<string, any> = {};
