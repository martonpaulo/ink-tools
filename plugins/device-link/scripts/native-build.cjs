#!/usr/bin/env node
/**
 * Device Link's native code: the LocalSend v2 module in native/src, built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');

const root = path.resolve(__dirname, '..');
const TESTED = ['Discovery', 'Identity', 'PinnedClient', 'Receiver', 'TextFiles'];

module.exports = defineBuild(
  {
    root,
    hostTools,
    packageClass: 'com.relay.localsend.RelayPackage',
    sources: [path.join(root, 'native/src')],
    test: ({jvmTests, javaSources}) =>
      jvmTests({
        prefix: 'relay',
        files: [
          ...TESTED.map(name => path.join(root, `native/src/com/relay/localsend/${name}.java`)),
          ...javaSources(path.join(root, 'native/tests')),
        ],
        mains: TESTED.map(name => `com.relay.localsend.${name}Test`),
      }),
  },
  require.main === module,
);
