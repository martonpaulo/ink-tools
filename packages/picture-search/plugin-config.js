/**
 * How a plugin reads `@ink-tools/picture-search` (#125), for its Metro and Jest configs, as
 * `ink-core/plugin-config.js` does: Metro bundles the package's TypeScript from this folder into
 * the .snplg, and Jest maps the name, and a deep path such as `/rank`, to its source. The plugin's
 * tsconfig.json maps the same names by `paths`. The Java in `native/` (the pixel measures and the
 * native file module, #142) is compiled by the plugin's `scripts/native-build.cjs`; the JVM tests
 * of `native-tests/` run in the packages gate (`jvmTests` below, #254). The search core's tests, the measures and the device tier's
 * image module, file store and memory log run in the packages gate (#142), and so do the insert
 * flow's tests (#288).
 */
const path = require('path');

const NAME = '@ink-tools/picture-search';
const SOURCE = path.join(__dirname, 'src');

/** The Java a plugin's native build compiles: the pixel measures and the file module (#142). */
exports.nativeSources = path.join(__dirname, 'native');

/** The JVM tests of that Java, which need only a JDK. */
exports.nativeTests = path.join(__dirname, 'native-tests');

/**
 * What the packages gate's JVM tests compile and run (#254): the Android-free classes of
 * `native/`, then every test in `native-tests/`, and the mains to run.
 */
exports.jvmTests = {
  prefix: 'picture-search',
  files: [
    'Registry', 'SafePaths', 'EinkPixels', 'ThumbGate', 'ThumbMeasures', 'Contour', 'Decolor', 'PerceptualHash',
    'PngTail', 'Workers', 'FileWrites', 'StickerCollection',
  ].map(name => path.join(exports.nativeSources, `com/inktools/files/${name}.java`)),
  mains: [
    'SafePathsTest', 'EinkPixelsTest', 'ThumbGateTest', 'ThumbMeasuresTest', 'ContourTest',
    'DecolorTest', 'PerceptualHashTest', 'PngTailTest', 'WorkersTest', 'TwinsTest', 'FileWritesTest',
    'StickerCollectionTest',
  ].map(name => `com.inktools.files.${name}`),
};

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
