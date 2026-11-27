#!/usr/bin/env node
/**
 * Light build of the Ink Tools Helper app without Gradle (#215), the same pipeline as the Lingo app
 * (#157): javac, D8 and aapt2 make the APK; zipalign and apksigner finish it. The toolchain and the
 * JDK finder are the Lingo app's own scripts, reused, not copied.
 *
 *   node scripts/build.cjs           build build/outputs/ink-tools-helper-<version>.apk, signed and verified
 *   node scripts/build.cjs --test    run the JVM tests (needs only a JDK) and the signing-key test
 */
const {jdkTool, JDK_MISSING} = require('../../../packages/native-build/host-tools.cjs');
const {signingArgs} = require('../../../packages/native-build/signing.cjs');
const {badgingProblems} = require('../../handwriting-language/scripts/build.cjs');
const {versionName} = require('../../../scripts/plugin-version.cjs');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
/** PluginHost's package, which the app must see: registry item pluginhost.setting-service (#294). */
const HOST_PACKAGE = require('../../../registry/items/pluginhost.json').items.find(
  item => item.id === 'pluginhost.setting-service',
).values.hostPackage;
/** The providers the firmware watch resolves (#293): Android 11 shows an app only what its queries name. */
const WATCHED_PROVIDERS = ['calendar', 'todo', 'digest'].map(
  area => require(`../../../registry/items/${area}.json`).items.find(item => item.id === `${area}.provider`).descriptor.authority,
);
const build = path.join(root, 'build');
const TOOLCHAIN = path.resolve(root, '../handwriting-language/scripts/toolchain.sh');
/** The owner's rule for new apps: com.martonpaulo.<project>.<app>. Never rename it: the tablet keys grants on it. */
const PACKAGE = 'com.martonpaulo.inktools.bridge';
const SOURCES = path.join(root, 'src', ...PACKAGE.split('.'));
const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
/** Android 11, the tablet's release. */
const MIN_API = '30';
const TARGET_API = '30';
/** The classes with no Android import, which the JVM tests compile. */
const PURE = ['HostCalls', 'Command', 'Outcome', 'Fields', 'Callbacks', 'Registry', 'InternalFailure', 'Copy', 'Watch'];
const TESTS = ['HostCallsTest', 'CommandTest', 'FieldsTest', 'RegistryTest', 'InternalFailureTest', 'WatchTest'];
/**
 * shortcut: without the stable key, a local debug key in .toolchain/, outside Git and unique to each
 * checkout, as the Lingo app does; an APK from another checkout has another key, so the tablet needs
 * an uninstall before it. Upgrade to one stored release key when the bridge gets a published release.
 */
const KEY_ALIAS = 'inktools-bridge-debug';
const KEY_PASS = 'android';
/**
 * The stable key (#223): a PKCS12 keystore path and its password in these variables, which the
 * prerelease workflow sets from repository secrets, so every CI build updates the last one. The
 * password reaches apksigner by name (`env:`), never on a command line. The key names, the
 * variables and both aliases keep the app's first name, Ink Tools Bridge: they name the stored key,
 * and only the same key lets the tablet update the app in place (#303).
 */
const STABLE_KEYSTORE_ENV = 'INKTOOLS_BRIDGE_KEYSTORE';
const STABLE_KEY_ALIAS = 'inktools-bridge';
const NATIVE_ACCESS = '--enable-native-access=ALL-UNNAMED';

function run(binary, args, options = {}) {
  return execFileSync(binary, args, {cwd: root, stdio: 'inherit', ...options});
}

function app() {
  const {version, versionCode} = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  if (!/^[1-9]\d*$/.test(String(versionCode))) {
    throw Error(`app.json versionCode "${versionCode}" is not a positive integer`);
  }
  return {version, versionCode, versionName: versionName(version)};
}

/** Paths printed by the Lingo app's toolchain.sh, which installs what is missing into its .toolchain/. */
function tools() {
  const text = execFileSync('bash', [TOOLCHAIN], {cwd: root, encoding: 'utf8'});
  const values = Object.fromEntries(
    text.split('\n').filter(line => line.startsWith('LINGO_APP_')).map(line => line.split('=')),
  );
  const bt = values.LINGO_APP_BUILD_TOOLS || '';
  const result = {
    androidJar: values.LINGO_APP_ANDROID_JAR,
    d8: path.join(bt, 'lib/d8.jar'),
    apksigner: path.join(bt, 'lib/apksigner.jar'),
    aapt2: path.join(bt, 'aapt2'),
    zipalign: path.join(bt, 'zipalign'),
  };
  for (const [name, file] of Object.entries(result)) {
    if (!file || !fs.existsSync(file)) {
      throw Error(`Missing ${name}: ${file}. Run ${TOOLCHAIN}.`);
    }
  }
  return result;
}

function javaFiles(folder) {
  return fs.readdirSync(folder).filter(name => name.endsWith('.java')).map(name => path.join(folder, name));
}

/** The app's one resource, its icon (#260): Customize Sidebar lists every app package with it. */
const ICON = path.join(root, 'res', 'drawable', 'ic_launcher.xml');

/**
 * The manifest, written from app.json so the versions cannot drift. No launcher entry: the bridge
 * has no screen; it still has an icon, which Customize Sidebar shows (#260). The receiver is
 * exported for the shell and guarded by DUMP, a permission the shell holds and no installed app can get. <queries> makes PluginHost visible on Android 11,
 * and each provider the firmware watch resolves (#293). The boot receiver runs the watch at each boot.
 */
function manifest(file, {versionCode, versionName: name}) {
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="${ANDROID_NS}"
    package="${PACKAGE}"
    android:versionCode="${versionCode}"
    android:versionName="${name}">
  <uses-sdk android:minSdkVersion="${MIN_API}" android:targetSdkVersion="${TARGET_API}" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <queries>
    <package android:name="${HOST_PACKAGE}" />
${WATCHED_PROVIDERS.map(authority => `    <provider android:authorities="${authority}" />`).join('\n')}
  </queries>
  <application android:label="Ink Tools Helper" android:icon="@drawable/ic_launcher"
      android:allowBackup="false" android:hasCode="true">
    <receiver android:name=".CommandReceiver" android:exported="true"
        android:permission="android.permission.DUMP" />
    <receiver android:name=".BootReceiver" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
      </intent-filter>
    </receiver>
  </application>
</manifest>
`,
  );
}

function debugKey() {
  const store = path.join(root, '.toolchain', `${KEY_ALIAS}.keystore`);
  if (!fs.existsSync(store)) {
    fs.mkdirSync(path.dirname(store), {recursive: true});
    run(jdkTool('keytool'), [
      '-genkeypair', '-noprompt', '-keystore', store, '-storetype', 'PKCS12', '-alias', KEY_ALIAS,
      '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Ink Tools bridge debug',
      '-storepass', KEY_PASS, '-keypass', KEY_PASS,
    ]);
  }
  return store;
}

/** This app's keys for `signing.cjs`: the stable key from the environment, else the local debug key. */
const KEY = {keystoreEnv: STABLE_KEYSTORE_ENV, stableAlias: STABLE_KEY_ALIAS, debugAlias: KEY_ALIAS, debugPass: KEY_PASS, debugStore: debugKey};

function buildApk() {
  const t = tools();
  const info = app();
  const work = path.join(build, 'work');
  fs.rmSync(work, {recursive: true, force: true});
  const classes = path.join(work, 'classes');
  fs.mkdirSync(classes, {recursive: true});
  run(jdkTool('javac'), [
    '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror',
    '-cp', t.androidJar, '-d', classes, ...javaFiles(SOURCES),
  ]);
  const jar = path.join(work, 'classes.jar');
  run(jdkTool('jar'), ['cf', jar, '-C', classes, '.']);
  const dex = path.join(work, 'dex');
  fs.mkdirSync(dex);
  run(jdkTool('java'), [
    '-cp', t.d8, 'com.android.tools.r8.D8', '--release', '--min-api', MIN_API,
    '--lib', t.androidJar, '--output', dex, jar,
  ]);
  const manifestFile = path.join(work, 'AndroidManifest.xml');
  manifest(manifestFile, info);
  const compiled = path.join(work, 'compiled');
  fs.mkdirSync(compiled);
  run(t.aapt2, ['compile', '-o', compiled, ICON]);
  const unsigned = path.join(work, 'unsigned.apk');
  run(t.aapt2, [
    'link', '--manifest', manifestFile, '-I', t.androidJar,
    '--min-sdk-version', MIN_API, '--target-sdk-version', TARGET_API, '-o', unsigned,
    ...fs.readdirSync(compiled).map(name => path.join(compiled, name)),
  ]);
  run('zip', ['-q', '-j', unsigned, path.join(dex, 'classes.dex')]);
  const aligned = path.join(work, 'aligned.apk');
  run(t.zipalign, ['-f', '-p', '4', unsigned, aligned]);
  const outputs = path.join(build, 'outputs');
  fs.mkdirSync(outputs, {recursive: true});
  const apk = path.join(outputs, `ink-tools-helper-${info.version}.apk`);
  fs.rmSync(apk, {force: true});
  const key = signingArgs(KEY);
  run(jdkTool('java'), [NATIVE_ACCESS, '-jar', t.apksigner, 'sign', ...key.args, '--out', apk, aligned]);
  run(jdkTool('java'), [NATIVE_ACCESS, '-jar', t.apksigner, 'verify', apk]);
  const badging = execFileSync(t.aapt2, ['dump', 'badging', apk], {encoding: 'utf8'});
  if (!badging.includes(`package: name='${PACKAGE}'`)) {
    throw Error(`the APK is not ${PACKAGE}:\n${badging}`);
  }
  const problems = badgingProblems(badging, 0);
  if (problems.length > 0) {
    throw Error(`ink-tools-helper: ${problems.join('; ')}:\n${badging}`);
  }
  fs.rmSync(work, {recursive: true, force: true});
  const keyName = key.stable ? 'the stable key' : 'the local debug key';
  console.log(`ink-tools-helper: ${path.relative(root, apk)} ${fs.statSync(apk).size} bytes, ${info.versionName} (${info.versionCode}), signed with ${keyName}`);
  return apk;
}

function test() {
  const classes = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-tools-helper-tests-'));
  try {
    run(jdkTool('javac'), [
      '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror', '-d', classes,
      ...PURE.map(name => path.join(SOURCES, `${name}.java`)),
      ...javaFiles(path.join(root, 'tests', ...PACKAGE.split('.'))),
    ]);
    for (const name of TESTS) {
      run(jdkTool('java'), ['-cp', classes, `${PACKAGE}.${name}`]);
    }
    run(process.execPath, ['--test', path.join(__dirname, '../../../packages/native-build/signing.test.cjs'), path.join(__dirname, 'badging.test.cjs')]);
  } finally {
    fs.rmSync(classes, {recursive: true, force: true});
  }
}

if (require.main === module) {
  try {
    if (process.argv.includes('--test')) {
      test();
    } else {
      buildApk();
    }
  } catch (error) {
    if (error.message !== JDK_MISSING) {
      throw error;
    }
    console.error(`ink-tools-helper: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {buildApk, test, KEY};
