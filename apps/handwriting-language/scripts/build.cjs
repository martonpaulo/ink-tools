#!/usr/bin/env node
/**
 * Light build of the Lingo app without Gradle (#157), the same pipeline as the plugins'
 * scripts/native-build.cjs (#59, #98): javac, D8 and aapt2 make the APK; zipalign and apksigner
 * finish it.
 *
 *   node scripts/build.cjs           build build/outputs/lingo-app-<version>.apk, signed and verified
 *   node scripts/build.cjs --test    run the JVM tests (needs only a JDK)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {jdkTool, JDK_MISSING} = require('./host-tools.cjs');
const {versionName} = require('../../../scripts/plugin-version.cjs');
const androidTokens = require('../../../packages/ui-kit/android-tokens.cjs');

const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build');
const PACKAGE = 'com.supernotetools.lingo';
/** The XML namespace of the manifest and the watcher's configuration. */
const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
/** Android 11, the tablet's release; MANAGE_EXTERNAL_STORAGE starts here. */
const MIN_API = '30';
const TARGET_API = '30';
/** The classes with no Android import, which the JVM tests compile. */
const PURE = ['ButtonGesture', 'ButtonPlace', 'ButtonRule', 'LanguageCycle', 'LanguageFiles', 'FileFailure', 'Copy', 'Registry'];
const TESTS = ['ButtonGestureTest', 'ButtonPlaceTest', 'ButtonRuleTest', 'LanguageCycleTest', 'LanguageFilesTest', 'FileFailureTest', 'RegistryTest'];
/** The native look's tokens, written from ui-kit's tokens.json before javac, never by hand (#275). */
const TOKENS_CLASS = 'Tokens';
/**
 * shortcut: a local debug key in .toolchain/, outside Git and unique to each checkout; an APK
 * from another checkout or CI has another key, so the tablet needs an uninstall before it.
 * Upgrade to one stored release key when Lingo gets a published release.
 */
const KEY_ALIAS = 'lingo-app-debug';
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
<manifest xmlns:android="${ANDROID_NS}"
    package="${PACKAGE}"
    android:versionCode="${versionCode}"
    android:versionName="${name}">
  <uses-sdk android:minSdkVersion="${MIN_API}" android:targetSdkVersion="${TARGET_API}" />
  <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <application android:label="Handwriting Language" android:icon="@drawable/ic_launcher"
      android:allowBackup="false" android:hasCode="true">
    <activity android:name=".SettingsActivity" android:label="Handwriting Language" android:exported="true"
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
    <service android:name=".WritingWatcher" android:label="Handwriting Language" android:exported="true"
        android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
      <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService" />
      </intent-filter>
      <meta-data android:name="android.accessibilityservice" android:resource="@xml/writing_watcher" />
    </service>
    <receiver android:name=".BootReceiver" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
        <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
      </intent-filter>
    </receiver>
  </application>
</manifest>
`,
  );
}

/**
 * The two resources: the icon, res/drawable/ic_launcher.xml (#246), and WritingWatcher's
 * configuration (#195), written here. Window reading (canRetrieveWindowContent,
 * flagRetrieveInteractiveWindows) can be declared only in that XML, never from code; the views
 * stay in code.
 */
function resources(work, aapt2) {
  const folder = path.join(work, 'res', 'xml');
  fs.mkdirSync(folder, {recursive: true});
  const file = path.join(folder, 'writing_watcher.xml');
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="${ANDROID_NS}"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowsChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagRetrieveInteractiveWindows"
    android:canRetrieveWindowContent="true"
    android:notificationTimeout="0" />
`,
  );
  const compiled = path.join(work, 'compiled');
  fs.mkdirSync(compiled);
  run(aapt2, ['compile', '-o', compiled, file]);
  run(aapt2, ['compile', '-o', compiled, path.join(root, 'res', 'drawable', 'ic_launcher.xml')]);
  return fs.readdirSync(compiled).map(name => path.join(compiled, name));
}

/**
 * What is wrong with the APK's `aapt2 dump badging` output (#246): the app needs its icon, since
 * Customize Sidebar lists every app package with it, and `launchers` launcher entries: one here,
 * since the sidebar lists one entry per app (#160); none for Ink Tools Bridge, which has no screen
 * (#260).
 */
function badgingProblems(badging, launchers = 1) {
  const problems = [];
  if (!/^application-icon-\d+:'[^']+'$/m.test(badging) && !/^application: .*icon='[^']+'/m.test(badging)) {
    problems.push('no application icon');
  }
  const found = (badging.match(/^launchable-activity:/gm) || []).length;
  if (found !== launchers) {
    problems.push(`${found} launcher entries, not ${launchers}`);
  }
  return problems;
}

function signingKey() {
  const store = path.join(root, '.toolchain', 'lingo-app-debug.keystore');
  if (!fs.existsSync(store)) {
    fs.mkdirSync(path.dirname(store), {recursive: true});
    run(jdkTool('keytool'), [
      '-genkeypair', '-noprompt', '-keystore', store, '-storetype', 'PKCS12', '-alias', KEY_ALIAS,
      '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Lingo debug',
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
    '-cp', t.androidJar, '-d', classes, ...javaSources(path.join(root, 'src')), tokensSource(work),
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
    ...resources(work, t.aapt2),
  ]);
  run('zip', ['-q', '-j', unsigned, path.join(dex, 'classes.dex')]);
  const aligned = path.join(work, 'aligned.apk');
  run(t.zipalign, ['-f', '-p', '4', unsigned, aligned]);
  const outputs = path.join(build, 'outputs');
  fs.mkdirSync(outputs, {recursive: true});
  const apk = path.join(outputs, `lingo-app-${info.version}.apk`);
  fs.rmSync(apk, {force: true});
  run(jdkTool('java'), [
    NATIVE_ACCESS, '-jar', t.apksigner, 'sign', '--ks', signingKey(), '--ks-key-alias', KEY_ALIAS,
    '--ks-pass', `pass:${KEY_PASS}`, '--key-pass', `pass:${KEY_PASS}`, '--out', apk, aligned,
  ]);
  run(jdkTool('java'), [NATIVE_ACCESS, '-jar', t.apksigner, 'verify', apk]);
  const badging = execFileSync(t.aapt2, ['dump', 'badging', apk], {cwd: root, encoding: 'utf8'});
  process.stdout.write(badging);
  const problems = badgingProblems(badging);
  if (problems.length > 0) {
    throw new Error(`lingo-app: ${problems.join('; ')}`);
  }
  fs.rmSync(work, {recursive: true, force: true});
  console.log(`lingo-app: ${path.relative(root, apk)} ${fs.statSync(apk).size} bytes, ${info.versionName} (${info.versionCode})`);
  return apk;
}

/** Write `Tokens.java` under `work`, and with `propertiesFile` the values its test reads; its path. */
function tokensSource(work, propertiesFile) {
  const file = path.join(work, 'gen', ...PACKAGE.split('.'), `${TOKENS_CLASS}.java`);
  androidTokens.write(PACKAGE, file, propertiesFile);
  return file;
}

function test() {
  // A temporary folder: the gate may run as another user than the one that owns build/.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-app-tests-'));
  const classes = path.join(work, 'classes');
  const tokens = path.join(work, 'tokens.properties');
  try {
    run(process.execPath, ['--test', androidTokens.TEST]);
    run(jdkTool('javac'), [
      '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror', '-d', classes,
      ...PURE.map(name => path.join(root, `src/com/supernotetools/lingo/${name}.java`)),
      tokensSource(work, tokens),
      ...javaSources(path.join(root, 'tests')),
    ]);
    for (const name of TESTS) {
      run(jdkTool('java'), ['-cp', classes, `com.supernotetools.lingo.${name}`]);
    }
    run(jdkTool('java'), ['-cp', classes, `com.supernotetools.lingo.${TOKENS_CLASS}Test`, tokens]);
    testBadging();
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
}

/** The badging rule over synthetic `aapt2 dump badging` lines (#246). */
function testBadging() {
  const app = "application: label='Handwriting Language' icon='res/drawable/ic_launcher.xml'";
  const launcher = "launchable-activity: name='com.supernotetools.lingo.SettingsActivity'";
  const cases = [
    [[app, launcher], []],
    [["application: label='Handwriting Language'", launcher], ['no application icon']],
    [[app, launcher, launcher], ['2 launcher entries, not 1']],
    [[app], ['0 launcher entries, not 1']],
  ];
  for (const [lines, expected] of cases) {
    const found = badgingProblems(lines.join('\n'));
    if (JSON.stringify(found) !== JSON.stringify(expected)) {
      throw new Error(`badging rule: ${JSON.stringify(lines)} gave ${JSON.stringify(found)}`);
    }
  }
  console.log('badging rule ok');
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
    console.error(`lingo-app: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {badgingProblems, buildApk, test};
