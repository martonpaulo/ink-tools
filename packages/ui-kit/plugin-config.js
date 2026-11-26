/**
 * How a plugin reads `@ink-tools/ui-kit` (#93), for its Metro and Jest configs. The package
 * is not installed in the plugin's node_modules: Metro bundles it from this folder into the
 * .snplg, and its own `react` and `react-native` imports resolve from the plugin's node_modules,
 * so the plugin keeps one copy of each. The plugin's tsconfig.json maps the same name by `paths`.
 */
const os = require('os');
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

/** Jest's own default time limit for one test, in seconds. */
const DEFAULT_TEST_TIMEOUT_S = 5;
/** The most time one test gets, in seconds, however busy the machine is. */
const MAX_TEST_TIMEOUT_S = 60;
/** Jest reads its time limit in milliseconds. */
const MS_PER_SECOND = 1000;

/**
 * One test's time limit, scaled by how busy the machine is (#422): Jest's 5-second default times
 * the one-minute load average per CPU, never below the default or above the cap. Inside a landing
 * gate (`land.py` sets `SKD_JOBS`) it is the cap: the load read when Jest starts does not hold for
 * the run, as other gates start beside it. A gate read load 17 on 8 CPUs, so 10.5 s, then the load
 * rose to 38 and two tests that pass alone in under a second timed out (#451). A test that passes
 * alone then does not time out inside a gate; a hang still fails at the cap.
 */
exports.testTimeout = ({
  load = os.loadavg()[0],
  cpus = os.cpus().length,
  jobs = Number(process.env.SKD_JOBS) || 0,
} = {}) => {
  if (jobs > 0) {
    return MAX_TEST_TIMEOUT_S * MS_PER_SECOND;
  }
  const perCpu = Math.max(1, cpus);
  const factor = Math.max(1, load / perCpu);
  return Math.round(Math.min(MAX_TEST_TIMEOUT_S, DEFAULT_TEST_TIMEOUT_S * factor) * MS_PER_SECOND);
};

/**
 * The Jest config part: the package's source and its tests, with the plugin's node_modules, and
 * the load-scaled test time limit.
 */
exports.jest = {
  testTimeout: exports.testTimeout(),
  roots: ['<rootDir>', UI_KIT],
  moduleNameMapper: {
    [`^${NAME}$`]: path.join(UI_KIT, 'src'),
    [`^${NAME}/(.*)$`]: path.join(UI_KIT, 'src', '$1'),
  },
  modulePaths: ['<rootDir>/node_modules'],
};
