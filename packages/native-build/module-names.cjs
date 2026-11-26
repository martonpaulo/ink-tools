/**
 * The check behind each plugin's `__tests__/nativeModules.test.ts` (#295): a plugin keeps its native
 * module names in one golden file, `native-modules.json`, which its TypeScript reads; this lists each
 * name the Java file that registers it does not hold quoted, so a rename on one side fails the test.
 */
const fs = require('fs');
const path = require('path');

/** `[key, name, file]` for each golden name missing from its Java file; empty when they agree. */
exports.unregisteredNames = (pluginDir, golden, javaFiles) =>
  Object.entries(javaFiles)
    .map(([key, file]) => [key, golden[key], file])
    .filter(([, name, file]) => !fs.readFileSync(path.join(pluginDir, file), 'utf8').includes(`"${name}"`));
