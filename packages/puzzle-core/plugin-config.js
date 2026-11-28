/**
 * How a plugin reads `@ink-tools/puzzle-core` (#453), for its Metro and Jest configs, as
 * `ink-core/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into the
 * .snplg, and Jest maps the name to its source. The package's own tests run in the packages gate.
 * The plugin's tsconfig.json maps the same name by `paths`.
 */
const path = require('path');

const NAME = '@ink-tools/puzzle-core';

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

/**
 * The Jest moduleNameMapper part: the package, to its source, and one of its modules that
 * `index.ts` leaves out, as the word lists (`src/words-data`, #398), by its path.
 */
exports.jestModuleNameMapper = {
  [`^${NAME}$`]: path.join(__dirname, 'src'),
  [`^${NAME}/src/(.*)$`]: path.join(__dirname, 'src/$1'),
};
