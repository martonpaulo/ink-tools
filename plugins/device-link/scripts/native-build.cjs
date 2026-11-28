#!/usr/bin/env node
/**
 * Device Link's native code: the LocalSend v2 module in native/src, built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');

const root = path.resolve(__dirname, '..');
const TESTED = ['Discovery', 'Identity', 'PinnedClient', 'Protocol', 'Receiver', 'TextFiles'];

module.exports = defineBuild(
  {
    root,
    hostTools,
    packageClass: 'com.relay.localsend.RelayPackage',
    // sn-adapter's native timer ticks the editor helper's action channel with no view open (#312).
    sources: [path.join(root, 'native/src'), require('../../../packages/sn-adapter/plugin-config').nativeSources],
    test: ({jvmTests, javaSources}) =>
      jvmTests({
        prefix: 'relay',
        files: [
          ...[...TESTED, 'Timeouts'].map(name => path.join(root, `native/src/com/relay/localsend/${name}.java`)),
          ...javaSources(path.join(root, 'native/tests')),
        ],
        mains: TESTED.map(name => `com.relay.localsend.${name}Test`),
      }),
  },
  require.main === module,
);
