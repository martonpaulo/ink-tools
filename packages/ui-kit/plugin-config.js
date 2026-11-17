/**
 * How a plugin reads `@ink-tools/ui-kit` (#93), for its Metro and Jest configs. The package
 * is not installed in the plugin's node_modules: Metro bundles it from this folder into the
 * .snplg, and its own `react` and `react-native` imports resolve from the plugin's node_modules,
 * so the plugin keeps one copy of each. The plugin's tsconfig.json maps the same name by `paths`.
 */
const path = require('path');

const NAME = '@ink-tools/ui-kit';
const UI_KIT = __dirname;

/** The Metro config part, merged into the plugin's own. */
exports.metro = pluginDir => ({
  watchFolders: [UI_KIT],
  resolver: {
    extraNodeModules: {[NAME]: UI_KIT},
    nodeModulesPaths: [path.join(pluginDir, 'node_modules')],
  },
});

/** The Jest config part: the package's source and its tests, with the plugin's node_modules. */
exports.jest = {
  roots: ['<rootDir>', UI_KIT],
  moduleNameMapper: {
    [`^${NAME}$`]: path.join(UI_KIT, 'src'),
    [`^${NAME}/(.*)$`]: path.join(UI_KIT, 'src', '$1'),
  },
  modulePaths: ['<rootDir>/node_modules'],
};
