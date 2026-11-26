#!/usr/bin/env node
/**
 * Smart Pen's native code: picture-search's file and image modules with its own
 * `SmartPenFilesPackage`, which registers them as `SmartPenFiles` and `SmartPenImage`; Smart Pen
 * uses only the small text reads and writes, for its settings file (#305). Their JVM tests run in
 * the packages gate (#254), built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');
const {nativeSources} = require('../../../packages/picture-search/plugin-config');

const root = path.resolve(__dirname, '..');

module.exports = defineBuild(
  {
    root,
    hostTools,
    packageClass: 'com.smartpen.files.SmartPenFilesPackage',
    sources: [nativeSources, path.join(root, 'native')],
  },
  require.main === module,
);
