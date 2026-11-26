/**
 * How a plugin reads `@ink-tools/ink-core` (#109), for its Metro and Jest configs, as
 * `ui-kit/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into the
 * .snplg, and Jest maps the name to its source. The package's own tests run in the packages gate.
 * The plugin's tsconfig.json maps the same name by `paths`.
 */
const path = require('path');

const NAME = '@ink-tools/ink-core';
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

/**
 * The Jest moduleNameMapper part: the package, and its conversion engine's own entry (#305), which
 * Metro finds as `conversion.ts` at the package root by itself.
 */
exports.jestModuleNameMapper = {
  [`^${NAME}$`]: SOURCE,
  [`^${NAME}/conversion$`]: path.join(SOURCE, 'conversion'),
};

/** The synthetic strokes the engine's tests write, for a plugin's tests of it (#305). */
exports.testInk = path.join(__dirname, 'testing', 'ink');

/**
 * The Jest part for `@ink-tools/ink-core/pinyin-data` (#129), the entry only a plugin with a
 * ZH button maps, as Lookup does: Metro finds `pinyin-data.ts` at the package root by itself.
 */
exports.jestPinyinDataMapper = {
  [`^${NAME}/pinyin-data$`]: path.join(__dirname, 'pinyin-data'),
};
