#!/usr/bin/env node
/**
 * Ink2Pic's native code: picture-search's file and image modules, registered by
 * `Ink2PicFilesPackage`, whose JVM tests run here, built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');
// The native code lives in the shared picture-search package (#125, #142).
const {nativeSources, nativeTests} = require('../../../packages/picture-search/plugin-config');

const PURE = [
  'SafePaths', 'EinkPixels', 'ThumbGate', 'ThumbMeasures', 'Contour', 'Decolor', 'PerceptualHash',
  'PngTail', 'Workers', 'FileWrites',
];
const TESTS = [
  'SafePathsTest', 'EinkPixelsTest', 'ThumbGateTest', 'ThumbMeasuresTest', 'ContourTest',
  'DecolorTest', 'PerceptualHashTest', 'PngTailTest', 'WorkersTest', 'TwinsTest', 'FileWritesTest',
];

module.exports = defineBuild(
  {
    root: path.resolve(__dirname, '..'),
    hostTools,
    packageClass: 'com.ink2pic.files.Ink2PicFilesPackage',
    sources: [nativeSources],
    test: ({jvmTests, javaSources}) =>
      jvmTests({
        prefix: 'ink2pic',
        files: [
          ...PURE.map(name => path.join(nativeSources, `com/ink2pic/files/${name}.java`)),
          ...javaSources(nativeTests),
        ],
        mains: TESTS.map(name => `com.ink2pic.files.${name}`),
      }),
  },
  require.main === module,
);
