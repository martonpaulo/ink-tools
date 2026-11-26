#!/usr/bin/env node
/**
 * Image Editing's native code: its pixel module in native/src with Ink2Pic's pixel code
 * and file module, reused unchanged from picture-search (#136, #142), built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');
const {nativeSources} = require('../../../packages/picture-search/plugin-config');
// sn-adapter's Java: the Back key module, shared with Device Link (#300).
const snAdapter = require('../../../packages/sn-adapter/plugin-config').nativeSources;

const root = path.resolve(__dirname, '..');
/** The picture-search classes the pure JVM tests need: no Android or React type. */
const PURE_SHARED = ['Registry', 'SafePaths', 'EinkPixels', 'ThumbMeasures', 'Decolor', 'Contour'];

module.exports = defineBuild(
  {
    root,
    hostTools,
    packageClass: 'com.retouch.image.RetouchPackage',
    sources: [path.join(root, 'native/src'), nativeSources, snAdapter],
    test: ({jvmTests, javaSources}) =>
      jvmTests({
        prefix: 'retouch',
        files: [
          path.join(root, 'native/src/com/retouch/image/Retouch.java'),
          path.join(root, 'native/src/com/retouch/image/Png.java'),
          path.join(root, 'native/src/com/retouch/image/GraphCut.java'),
          ...PURE_SHARED.map(name => path.join(nativeSources, `com/inktools/files/${name}.java`)),
          ...javaSources(path.join(root, 'native/tests')),
        ],
        mains: ['com.retouch.image.RetouchTest'],
      }),
  },
  require.main === module,
);
