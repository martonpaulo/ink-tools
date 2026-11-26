#!/usr/bin/env node
/**
 * Ink Tools Probe's native code: its provider module in native/src with sn-adapter's
 * dry insert revert by row id, shared with Account Sync (#213), built by the shared light native build,
 * packages/native-build/native-build.cjs (#231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const hostTools = require('./host-tools.cjs');
const adapter = require('../../../packages/sn-adapter/plugin-config');

const root = path.resolve(__dirname, '..');
/** The sn-adapter descriptor the native targets mirror (ProbeTargets.java). */
const DESCRIPTOR = path.join(root, '../../packages/sn-adapter/src/internals/descriptor.json');
const TESTED = ['ProbeTargets', 'ProbeFormat', 'ProbeListener', 'ProbeCommandFile', 'ProbeRevert', 'ProbeLegacyFiles'];

module.exports = defineBuild(
  {
    root,
    hostTools,
    packageClass: 'com.probe.providers.ProbePackage',
    sources: [path.join(root, 'native/src'), adapter.nativeSources],
    test: ({jvmTests, javaSources}) =>
      jvmTests({
        prefix: 'probe',
        files: [
          // Registry.java: the reader scripts/registry.py writes for this plugin (#294).
          ...[...TESTED, 'Registry'].map(name => path.join(root, `native/src/com/probe/providers/${name}.java`)),
          ...['DryInsertRevert', 'InsertAnswer'].map(name =>
            path.join(adapter.nativeSources, `com/inktools/provider/${name}.java`),
          ),
          ...javaSources(path.join(root, 'native/tests')),
        ],
        mains: TESTED.map(name => `com.probe.providers.${name}Test`),
        // ProbeTargetsTest checks the test rows and the row key against the descriptor (#208, #217).
        javaArgs: [`-Dprobe.descriptor=${DESCRIPTOR}`],
      }),
  },
  require.main === module,
);
