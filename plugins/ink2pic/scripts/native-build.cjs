#!/usr/bin/env node
/**
 * Ink2Pic's native code: picture-search's file and image modules, registered by
 * `Ink2PicFilesPackage`, built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands. Their JVM tests
 * run in the packages gate (#254).
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');
// The native code lives in the shared picture-search package (#125, #142).
const {nativeSources} = require('../../../packages/picture-search/plugin-config');

module.exports = defineBuild(
  {
    root: path.resolve(__dirname, '..'),
    hostTools,
    packageClass: 'com.ink2pic.files.Ink2PicFilesPackage',
    sources: [nativeSources],
  },
  require.main === module,
);
