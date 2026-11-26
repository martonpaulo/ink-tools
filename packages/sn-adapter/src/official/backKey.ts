/**
 * The device Back key for a plugin's full view (#226, #300): `native/com/inktools/backkey`'s
 * `BackKeyModule`, which each plugin registers under its own name, makes the view's React root
 * take Back and turns it into `hardwareBackPress`, which ui-kit's `useBackKey` hears. Without it,
 * Back went past the view to the note behind it and closed the note (Device Link 0.2.0 beta 1,
 * measured on the tablet, device round 9, 2026-11-26).
 */
import {NativeModules} from 'react-native';
import {fail, MODULE_CODE, ok, Result} from './result';

type BackKeyNative = {listenBackKey(rootTag: number): Promise<boolean>};

/** Arms the module `name` on the root view `rootTag`; MISSING when the plugin did not register it. */
export async function listenBackKey(
  name: string,
  rootTag: number,
  modules: Record<string, unknown> = NativeModules,
): Promise<Result<boolean>> {
  const module = modules[name] as BackKeyNative | undefined;
  if (!module?.listenBackKey) {
    return fail(MODULE_CODE, `MISSING: ${name} is not loaded; check reactPackages`, 'MISSING');
  }
  try {
    return ok(await module.listenBackKey(rootTag));
  } catch (error) {
    const code = (error as {code?: string}).code ?? 'IO';
    return fail(MODULE_CODE, (error as {message?: string}).message ?? code, code);
  }
}

/** Arms the module `name` on `rootTag` and logs the answer, for a view's root effect (#300). */
export function armBackKey(
  name: string,
  rootTag: number,
  log: (line: string) => void = line => console.log(line),
  modules: Record<string, unknown> = NativeModules,
): void {
  listenBackKey(name, rootTag, modules).then(result =>
    log(`INKTOOLS ${name}: back key: ${result.ok ? 'listening' : result.message}`),
  );
}
