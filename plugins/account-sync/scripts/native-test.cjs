#!/usr/bin/env node
/**
 * The JVM tests of Bridge's Android-free native classes (#43): sn-adapter's `DryInsertRevert` and
 * `InsertAnswer`, shared with the Probe (#213, #217), and their tests in sn-adapter's native-tests,
 * compiled with the JDK alone, no Android SDK. `npm run test:native` runs it in the gate.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {jdkTool, JDK_MISSING} = require('./host-tools.cjs');
const {javaSources} = require('./native-build.cjs');

const adapter = require('../../../packages/sn-adapter/plugin-config');

const PURE = ['DryInsertRevert', 'InsertAnswer'].map(name =>
  path.join(adapter.nativeSources, `com/inktools/provider/${name}.java`),
);
const TESTS = ['com.inktools.provider.DryInsertRevertTest', 'com.inktools.provider.InsertAnswerTest'];

let classes;
try {
  // Outside build/, which the gate's user may not own; removed whatever happens.
  classes = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-jvm-'));
  const javac = ['--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror', '-d', classes];
  const sources = [...PURE, ...javaSources(adapter.nativeTests)];
  execFileSync(jdkTool('javac'), [...javac, ...sources], {stdio: 'inherit'});
  TESTS.forEach(main => execFileSync(jdkTool('java'), ['-cp', classes, main], {stdio: 'inherit'}));
} catch (error) {
  // A missing JDK is the one line host-tools gives; anything else already printed its cause.
  console.error(error.message === JDK_MISSING ? JDK_MISSING : 'native: a JVM test failed');
  process.exitCode = 1;
} finally {
  if (classes) fs.rmSync(classes, {recursive: true, force: true});
}
