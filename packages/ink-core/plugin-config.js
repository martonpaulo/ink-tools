/**
 * How a plugin reads `@supernote-tools/ink-core` (#109), for its Metro and Jest configs, as
 * `ui-kit/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into the
 * .snplg, and Jest maps the name to its source. The package's own tests run in the packages gate.
 * The plugin's tsconfig.json maps the same name by `paths`.
 */
const path = require('path');

const NAME = '@supernote-tools/ink-core';
const SOURCE = path.join(__dirname, 'src');

/**
 * Adds the package to another Metro config part, such as ui-kit's: Metro's mergeConfig replaces
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
exports.jestModuleNameMapper = {[`^${NAME}$`]: SOURCE};
