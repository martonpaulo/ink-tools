#!/usr/bin/env node
/**
 * The packages gate's JVM tests (#254): each shared package with Java lists its Android-free
 * classes and its tests in its `plugin-config.js` (`jvmTests`), and they run here with the JDK
 * alone, no Android SDK, through the native build's own runner. A plugin that compiles the Java
 * no longer owns its tests, so they keep running when a plugin is retired.
 *
 *   node native-build/package-tests.cjs     from packages/, as `npm run test:native`
 */
const path = require('node:path');
const {jvmTests, javaSources} = require('./native-build.cjs');
const {jdkTool, JDK_MISSING} = require('./host-tools.cjs');

/** The packages whose Java has JVM tests: every folder with `native-tests/`. */
const PACKAGES = ['picture-search', 'sn-adapter'];

try {
  for (const name of PACKAGES) {
    const folder = path.join(__dirname, '..', name);
    const config = require(path.join(folder, 'plugin-config.js'));
    const {prefix, files, mains} = config.jvmTests;
    jvmTests({jdkTool, cwd: folder, prefix, files: [...files, ...javaSources(config.nativeTests)], mains});
  }
} catch (error) {
  // A missing JDK is one line saying what to install; anything else already printed its cause.
  console.error(error.message === JDK_MISSING ? `native: ${JDK_MISSING}` : 'native: a JVM test failed');
  process.exitCode = 1;
}
