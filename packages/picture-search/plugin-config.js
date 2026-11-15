/**
 * How a plugin reads `@supernote-tools/picture-search` (#125), for its Metro and Jest configs, as
 * `ink-core/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into
 * the .snplg, and Jest maps the name, and a deep path such as `/rank`, to its source. The plugin's
 * tsconfig.json maps the same names by `paths`. The Java in `native/` (the pixel measures and the
 * native file module, #142) is compiled by the plugin's `scripts/native-build.cjs`, whose `--test`
 * runs the JVM tests of `native-tests/`; the search core's tests run in the Ink2Pic gate, where the
 * mocks they share live.
 */
const path = require('path');

const NAME = '@supernote-tools/picture-search';
const SOURCE = path.join(__dirname, 'src');

/** The Java a plugin's native build compiles: the pixel measures and the file module (#142). */
exports.nativeSources = path.join(__dirname, 'native');

/** The JVM tests of that Java, which need only a JDK. */
exports.nativeTests = path.join(__dirname, 'native-tests');

/**
 * Adds the package to another Metro config part, such as ink-core's: Metro's mergeConfig replaces
 * `watchFolders` and `extraNodeModules` rather than joining them.
 */
exports.metro = part => ({
  ...part,
  watchFolders: [...(part.watchFolders || []), __dirname],
  resolver: {
    ...part.resolver,
    extraNodeModules: {...(part.resolver || {}).extraNodeModules, [NAME]: __dirname},
  },
});

/** The Jest moduleNameMapper part. */
exports.jestModuleNameMapper = {
  [`^${NAME}$`]: SOURCE,
  [`^${NAME}/(.*)$`]: `${SOURCE}/$1`,
};
