/**
 * How a plugin reads `@ink-tools/sn-adapter` (#101), for its Metro and Jest configs, as
 * `ink-core/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into the
 * .snplg, and its `sn-plugin-lib` import resolves from the plugin's node_modules (ui-kit's
 * `nodeModulesPaths`), so the plugin keeps one copy. The plugin's tsconfig.json maps the same names
 * by `paths`. Both tiers' own tests run in the packages gate, the official tier's against the SDK
 * mock and type stand-in in `testing/` (#142); the plugins that call it type-check it against the
 * real `sn-plugin-lib`. The Java in `native/` (the dry insert's
 * revert by row id, #213, whether an insert wrote a row, #217, and the timer that ticks with no view
 * open, `timer/TickModule.java`, #283) is compiled by Account Sync's and the Probe's `scripts/native-build.cjs`;
 * its JVM tests in `native-tests/` run in the packages gate (`jvmTests` below, #254).
 */
const path = require('path');

const NAME = '@ink-tools/sn-adapter';

/** The Java a plugin's native build compiles: the dry insert's revert by row id (#213). */
exports.nativeSources = path.join(__dirname, 'native');

/** The JVM tests of that Java, which need only a JDK. */
exports.nativeTests = path.join(__dirname, 'native-tests');

/**
 * What the packages gate's JVM tests compile and run (#254): the Android-free classes of
 * `native/` and the mains, with every test in `native-tests/`.
 */
exports.jvmTests = {
  prefix: 'sn-adapter',
  files: ['DryInsertRevert', 'InsertAnswer'].map(name =>
    path.join(exports.nativeSources, `com/inktools/provider/${name}.java`),
  ),
  mains: ['com.inktools.provider.DryInsertRevertTest', 'com.inktools.provider.InsertAnswerTest'],
};

/**
 * Adds the package to another Metro config part, such as ui-kit's: Metro's mergeConfig replaces
 * `watchFolders` and `extraNodeModules` rather than joining them. `/official` resolves to this
 * folder's `official.ts`, `/registry` to `registry.ts` (#294), `/actions` to `actions.ts` (#283) and `/buttons` to
 * `buttons.ts` (#295).
 */
exports.metro = part => ({
  ...part,
  watchFolders: [...(part.watchFolders || []), __dirname],
  resolver: {
    ...part.resolver,
    extraNodeModules: {...(part.resolver || {}).extraNodeModules, [NAME]: __dirname},
  },
});

/** The Jest mock of `sn-plugin-lib`, which the packages gate maps too (#142). */
exports.jestSdkMock = path.join(__dirname, 'testing', 'sn-plugin-lib.ts');

/** The Jest moduleNameMapper part: the five entries, to their source. */
exports.jestModuleNameMapper = {
  [`^${NAME}$`]: path.join(__dirname, 'src'),
  [`^${NAME}/official$`]: path.join(__dirname, 'src', 'official'),
  [`^${NAME}/registry$`]: path.join(__dirname, 'registry'),
  [`^${NAME}/actions$`]: path.join(__dirname, 'src', 'official', 'actions'),
  [`^${NAME}/buttons$`]: path.join(__dirname, 'src', 'official', 'buttonValues'),
};
