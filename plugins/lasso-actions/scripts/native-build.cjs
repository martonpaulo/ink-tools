#!/usr/bin/env node
/**
 * Word Lookup's native code: picture-search's file and image modules with its own
 * `LookupFilesPackage`, which registers them as `LookupFiles` and `LookupImage`; their JVM tests run
 * in the packages gate (#254), built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');
// The native code lives in the shared picture-search package (#125, #142).
const {nativeSources} = require('../../../packages/picture-search/plugin-config');

const root = path.resolve(__dirname, '..');

module.exports = defineBuild(
  {
    root,
    hostTools,
    packageClass: 'com.lookup.files.LookupFilesPackage',
    sources: [nativeSources, path.join(root, 'native')],
  },
  require.main === module,
);
