/**
 * How a plugin reads `@supernote-tools/picture-search` (#125), for its Metro and Jest configs, as
 * `ink-core/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into
 * the .snplg, and Jest maps the name, and a deep path such as `/rank`, to its source. The plugin's
 * tsconfig.json maps the same names by `paths`. The pure-Java pixel measures in `native/` are
 * compiled by the plugin's `scripts/native-build.cjs`, and the search core's tests run in the
 * Ink2Pic gate, where the mocks they share live.
 */
const path = require('path');

const NAME = '@supernote-tools/picture-search';
const SOURCE = path.join(__dirname, 'src');

/** The pure-Java pixel measures a plugin's native build compiles beside its own. */
exports.nativeSources = path.join(__dirname, 'native');

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
