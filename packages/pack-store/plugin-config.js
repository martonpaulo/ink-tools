/**
 * How a plugin reads `@ink-tools/pack-store` (#503), for its Metro and Jest configs, as
 * `ink-core/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into the
 * .snplg, and Jest maps the name to its source. The plugin's tsconfig.json maps the same name by
 * `paths`. The package's own tests run in the packages gate.
 */
const path = require('path');

const NAME = '@ink-tools/pack-store';

/**
 * Adds the package to another Metro config part: Metro's mergeConfig replaces `watchFolders` and
 * `extraNodeModules` rather than joining them.
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
  [`^${NAME}$`]: path.join(__dirname, 'src'),
};
