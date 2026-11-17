/**
 * How a plugin reads `@ink-tools/sn-adapter` (#101), for its Metro and Jest configs, as
 * `ink-core/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into the
 * .snplg, and its `sn-plugin-lib` import resolves from the plugin's node_modules (ui-kit's
 * `nodeModulesPaths`), so the plugin keeps one copy. The plugin's tsconfig.json maps the same names
 * by `paths`. The internals tier's tests run in the packages gate; the official tier is tested by
 * the plugins that call it, which have `sn-plugin-lib`. The Java in `native/` (the dry insert's
 * revert by row id, #213) is compiled by Account Sync's and the Probe's `scripts/native-build.cjs`;
 * its JVM tests in `native-tests/` run in the Account Sync gate.
 */
const path = require('path');

const NAME = '@ink-tools/sn-adapter';

/** The Java a plugin's native build compiles: the dry insert's revert by row id (#213). */
exports.nativeSources = path.join(__dirname, 'native');

/** The JVM tests of that Java, which need only a JDK. */
exports.nativeTests = path.join(__dirname, 'native-tests');

/**
 * Adds the package to another Metro config part, such as ui-kit's: Metro's mergeConfig replaces
 * `watchFolders` and `extraNodeModules` rather than joining them. `/official` resolves to this
 * folder's `official.ts`.
 */
exports.metro = part => ({
  ...part,
  watchFolders: [...(part.watchFolders || []), __dirname],
  resolver: {
    ...part.resolver,
    extraNodeModules: {...(part.resolver || {}).extraNodeModules, [NAME]: __dirname},
  },
});

/** The Jest moduleNameMapper part: both entries, to their source. */
exports.jestModuleNameMapper = {
  [`^${NAME}$`]: path.join(__dirname, 'src'),
  [`^${NAME}/official$`]: path.join(__dirname, 'src', 'official'),
};
