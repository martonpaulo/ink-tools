#!/usr/bin/env node
/**
 * Light build of the Dialect app without Gradle (#157), the same pipeline as the plugins'
 * scripts/native-build.cjs (#59, #98): javac, D8 and aapt2 make the APK; zipalign and apksigner
 * finish it.
 *
 *   node scripts/build.cjs           build build/outputs/dialect-<version>.apk, signed and verified
 *   node scripts/build.cjs --test    run the JVM tests (needs only a JDK)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {jdkTool, JDK_MISSING} = require('./host-tools.cjs');
const {versionName} = require('../../../scripts/plugin-version.cjs');

const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build');
const PACKAGE = 'com.supernotetools.dialect';
/** Android 11, the tablet's release; MANAGE_EXTERNAL_STORAGE starts here. */
const MIN_API = '30';
const TARGET_API = '30';
/** The classes with no Android import, which the JVM tests compile. */
const PURE = ['LanguageCycle', 'LanguageFiles'];
const TESTS = ['LanguageCycleTest', 'LanguageFilesTest'];
/**
 * shortcut: a local debug key in .toolchain/, outside Git and unique to each checkout; an APK
 * from another checkout or CI has another key, so the tablet needs an uninstall before it.
 * Upgrade to one stored release key when Dialect gets a published release.
 */
const KEY_ALIAS = 'dialect-debug';
const KEY_PASS = 'android';
/** apksigner's Conscrypt loads a native library; this flag keeps JDK 24 and later quiet about it. */
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

/** Paths printed by scripts/toolchain.sh, which installs what is missing. */
function tools() {
  const text = execFileSync('bash', [path.join(root, 'scripts/toolchain.sh')], {cwd: root, encoding: 'utf8'});
  const values = Object.fromEntries(
    text.split('\n').filter(line => line.startsWith('DIALECT_')).map(line => line.split('=')),
  );
  const bt = values.DIALECT_BUILD_TOOLS || '';
  const result = {
    androidJar: values.DIALECT_ANDROID_JAR,
    d8: path.join(bt, 'lib/d8.jar'),
    apksigner: path.join(bt, 'lib/apksigner.jar'),
    aapt2: path.join(bt, 'aapt2'),
    zipalign: path.join(bt, 'zipalign'),
  };
  for (const [name, file] of Object.entries(result)) {
    if (!file || !fs.existsSync(file)) {
      throw Error(`Missing ${name}: ${file}. Run scripts/toolchain.sh.`);
    }
  }
  return result;
}

function javaSources(folder) {
  return fs
    .readdirSync(folder, {withFileTypes: true})
    .flatMap(entry =>
      entry.isDirectory()
        ? javaSources(path.join(folder, entry.name))
        : entry.name.endsWith('.java')
        ? [path.join(folder, entry.name)]
        : [],
    );
}

/** The manifest, written from app.json so the versions cannot drift. */
function manifest(file, {versionCode, versionName: name}) {
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${PACKAGE}"
    android:versionCode="${versionCode}"
    android:versionName="${name}">
  <uses-sdk android:minSdkVersion="${MIN_API}" android:targetSdkVersion="${TARGET_API}" />
  <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <application android:label="Dialect" android:allowBackup="false" android:hasCode="true">
    <activity android:name=".SwitchActivity" android:label="Dialect" android:exported="true"
        android:theme="@android:style/Theme.NoDisplay" android:excludeFromRecents="true"
        android:noHistory="true" android:taskAffinity="${PACKAGE}.switch">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    <activity android:name=".SettingsActivity" android:label="Dialect settings" android:exported="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar" android:launchMode="singleTask">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
      <intent-filter>
        <action android:name="android.intent.action.APPLICATION_PREFERENCES" />
        <category android:name="android.intent.category.DEFAULT" />
      </intent-filter>
    </activity>
    <service android:name=".OverlayService" android:exported="false" />
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

function signingKey() {
  const store = path.join(root, '.toolchain', 'debug.keystore');
  if (!fs.existsSync(store)) {
    fs.mkdirSync(path.dirname(store), {recursive: true});
    run(jdkTool('keytool'), [
      '-genkeypair', '-noprompt', '-keystore', store, '-storetype', 'PKCS12', '-alias', KEY_ALIAS,
      '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Dialect debug',
      '-storepass', KEY_PASS, '-keypass', KEY_PASS,
    ]);
  }
  return store;
}

function buildApk() {
  const t = tools();
  const info = app();
  const work = path.join(build, 'work');
  fs.rmSync(work, {recursive: true, force: true});
  const classes = path.join(work, 'classes');
  fs.mkdirSync(classes, {recursive: true});
  run(jdkTool('javac'), [
    // -Werror: a new javac warning fails the build, as in the plugins (#32).
    '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror',
    '-cp', t.androidJar, '-d', classes, ...javaSources(path.join(root, 'src')),
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
  const unsigned = path.join(work, 'unsigned.apk');
  run(t.aapt2, [
    'link', '--manifest', manifestFile, '-I', t.androidJar,
    '--min-sdk-version', MIN_API, '--target-sdk-version', TARGET_API, '-o', unsigned,
  ]);
  run('zip', ['-q', '-j', unsigned, path.join(dex, 'classes.dex')]);
  const aligned = path.join(work, 'aligned.apk');
  run(t.zipalign, ['-f', '-p', '4', unsigned, aligned]);
  const outputs = path.join(build, 'outputs');
  fs.mkdirSync(outputs, {recursive: true});
  const apk = path.join(outputs, `dialect-${info.version}.apk`);
  fs.rmSync(apk, {force: true});
  run(jdkTool('java'), [
    NATIVE_ACCESS, '-jar', t.apksigner, 'sign', '--ks', signingKey(), '--ks-key-alias', KEY_ALIAS,
    '--ks-pass', `pass:${KEY_PASS}`, '--key-pass', `pass:${KEY_PASS}`, '--out', apk, aligned,
  ]);
  run(jdkTool('java'), [NATIVE_ACCESS, '-jar', t.apksigner, 'verify', apk]);
  run(t.aapt2, ['dump', 'badging', apk]);
  fs.rmSync(work, {recursive: true, force: true});
  console.log(`dialect: ${path.relative(root, apk)} ${fs.statSync(apk).size} bytes, ${info.versionName} (${info.versionCode})`);
  return apk;
}

function test() {
  // A temporary folder: the gate may run as another user than the one that owns build/.
  const classes = fs.mkdtempSync(path.join(os.tmpdir(), 'dialect-tests-'));
  try {
    run(jdkTool('javac'), [
      '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror', '-d', classes,
      ...PURE.map(name => path.join(root, `src/com/supernotetools/dialect/${name}.java`)),
      ...javaSources(path.join(root, 'tests')),
    ]);
    for (const name of TESTS) {
      run(jdkTool('java'), ['-cp', classes, `com.supernotetools.dialect.${name}`]);
    }
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
    // A missing JDK is one line saying what to install, not a stack trace (#78).
    if (error.message !== JDK_MISSING) {
      throw error;
    }
    console.error(`dialect: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {buildApk, test};
