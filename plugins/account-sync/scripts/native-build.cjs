#!/usr/bin/env node
/**
 * Account Sync's native code: picture-search's file and image modules with its own
 * `BridgeFilesPackage`, which registers them as `BridgeFiles` and `BridgeImage`; Account Sync uses
 * only the small text reads and writes, for its Settings file. Their JVM tests run in the Ink2Pic
 * gate, built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');
const {nativeSources} = require('../../../packages/picture-search/plugin-config');
// The insert answer check (ResolverTable, InsertAnswer) lives in sn-adapter, shared with the Probe (#213, #217).
const adapter = require('../../../packages/sn-adapter/plugin-config');

const root = path.resolve(__dirname, '..');

module.exports = defineBuild(
  {
    root,
    hostTools,
    packageClass: 'com.bridge.files.BridgeFilesPackage',
    sources: [nativeSources, adapter.nativeSources, path.join(root, 'native/com')],
  },
  require.main === module,
);
