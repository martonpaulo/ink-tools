#!/usr/bin/env node
/**
 * Light build of the Lingo app without Gradle (#157), the same pipeline as the plugins'
 * scripts/native-build.cjs (#59, #98): javac, D8 and aapt2 make the APK; zipalign and apksigner
 * finish it.
 *
 *   node scripts/build.cjs           build build/outputs/lingo-app-<version>.apk, signed and verified
 *   node scripts/build.cjs --test    run the JVM tests (needs only a JDK)
 *
 * The floating button is off in the build (#617): add `--floating-button`, or set LINGO_FLOATING_BUTTON=1,
 * to build it back in (OverlayService, WritingWatcher, BootReceiver, their permissions and manifest entries).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {jdkTool, JDK_MISSING} = require('../../../packages/native-build/host-tools.cjs');
const {signingArgs} = require('../../../packages/native-build/signing.cjs');
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
/** The classes the floating button needs, left out of the APK while it is off (#617). */
const BUTTON_CLASSES = ['OverlayService', 'WritingWatcher', 'BootReceiver'];
/** The class of the build's one switch, written before javac like Tokens. */
const FEATURES_CLASS = 'Features';
/** The classes with no Android import, which the JVM tests compile. */
const PURE = ['ButtonGesture', 'ButtonPlace', 'ButtonRule', 'LanguageCycle', 'LanguageFiles', 'FileFailure', 'InternalFailure', 'Copy', 'Registry'];
const TESTS = ['ButtonGestureTest', 'CopyTest', 'ButtonPlaceTest', 'ButtonRuleTest', 'LanguageCycleTest', 'LanguageFilesTest', 'FileFailureTest', 'RegistryTest'];
/** The native look's tokens, written from ui-kit's tokens.json before javac, never by hand (#275). */
const TOKENS_CLASS = 'Tokens';
/**
 * The release key (#494): the prerelease workflow sets INKTOOLS_LINGO_KEYSTORE and its _PASSWORD
 * from repository secrets, so every published APK updates the last one on the tablet. A local build
 * keeps a debug key in .toolchain/, outside Git and unique to each checkout; the tablet needs an
 * uninstall before an APK signed by the other key.
 */
const KEY_ALIAS = 'lingo-app-debug';
const KEY_PASS = 'android';
const STABLE_KEYSTORE_ENV = 'INKTOOLS_LINGO_KEYSTORE';
const STABLE_KEY_ALIAS = 'inktools-lingo';
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

/** Whether this build includes the floating button (#617): `--floating-button` or LINGO_FLOATING_BUTTON=1. Off by default. */
function floatingButton() {
  return process.argv.includes('--floating-button') || process.env.LINGO_FLOATING_BUTTON === '1';
}

/** The manifest text, from app.json so the versions cannot drift; the button's parts only when `button` is on (#617). */
function manifestText({versionCode, versionName: name}, button) {
  const permissions = button
    ? `  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
`
    : '';
  const components = button
    ? `    <service android:name=".OverlayService" android:exported="false" />
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
`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="${ANDROID_NS}"
    package="${PACKAGE}"
    android:versionCode="${versionCode}"
    android:versionName="${name}">
  <uses-sdk android:minSdkVersion="${MIN_API}" android:targetSdkVersion="${TARGET_API}" />
  <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
${permissions}  <application android:label="Handwriting Language" android:icon="@drawable/ic_launcher"
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
${components}  </application>
</manifest>
`;
}

/**
 * The two resources: the icon, res/drawable/ic_launcher.xml (#246), and WritingWatcher's
 * configuration (#195), written here. Window reading (canRetrieveWindowContent,
 * flagRetrieveInteractiveWindows) can be declared only in that XML, never from code; the views
 * stay in code.
 */
function resources(work, aapt2, button) {
  const compiled = path.join(work, 'compiled');
  fs.mkdirSync(compiled);
  if (button) {
    watcherConfig(work, aapt2, compiled);
  }
  run(aapt2, ['compile', '-o', compiled, path.join(root, 'res', 'drawable', 'ic_launcher.xml')]);
  return fs.readdirSync(compiled).map(name => path.join(compiled, name));
}

/** WritingWatcher's configuration, compiled into `compiled`; only a build with the floating button has it. */
function watcherConfig(work, aapt2, compiled) {
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
  run(aapt2, ['compile', '-o', compiled, file]);
}

/**
 * What is wrong with the APK's `aapt2 dump badging` output (#246): the app needs its icon, since
 * Customize Sidebar lists every app package with it, and `launchers` launcher entries: one here,
 * since the sidebar lists one entry per app (#160); none for Ink Tools Helper, which has no screen
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

function debugKey() {
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

/** This app's keys for `signing.cjs`. */
const KEY = {keystoreEnv: STABLE_KEYSTORE_ENV, stableAlias: STABLE_KEY_ALIAS, debugAlias: KEY_ALIAS, debugPass: KEY_PASS, debugStore: debugKey};

function buildApk() {
  const t = tools();
  const info = app();
  const button = floatingButton();
  const work = path.join(build, 'work');
  fs.rmSync(work, {recursive: true, force: true});
  const classes = path.join(work, 'classes');
  fs.mkdirSync(classes, {recursive: true});
  run(jdkTool('javac'), [
    // -Werror: a new javac warning fails the build, as in the plugins (#32).
    '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror',
    '-cp', t.androidJar, '-d', classes, ...javaSources(path.join(root, 'src')), tokensSource(work), featuresSource(work, button),
  ]);
  if (!button) {
    pruneButton(classes);
  }
  const jar = path.join(work, 'classes.jar');
  run(jdkTool('jar'), ['cf', jar, '-C', classes, '.']);
  const dex = path.join(work, 'dex');
  fs.mkdirSync(dex);
  run(jdkTool('java'), [
    '-cp', t.d8, 'com.android.tools.r8.D8', '--release', '--min-api', MIN_API,
    '--lib', t.androidJar, '--output', dex, jar,
  ]);
  const manifestFile = path.join(work, 'AndroidManifest.xml');
  fs.writeFileSync(manifestFile, manifestText(info, button));
  const unsigned = path.join(work, 'unsigned.apk');
  run(t.aapt2, [
    'link', '--manifest', manifestFile, '-I', t.androidJar,
    '--min-sdk-version', MIN_API, '--target-sdk-version', TARGET_API, '-o', unsigned,
    ...resources(work, t.aapt2, button),
  ]);
  run('zip', ['-q', '-j', unsigned, path.join(dex, 'classes.dex')]);
  const aligned = path.join(work, 'aligned.apk');
  run(t.zipalign, ['-f', '-p', '4', unsigned, aligned]);
  const outputs = path.join(build, 'outputs');
  fs.mkdirSync(outputs, {recursive: true});
  const apk = path.join(outputs, `lingo-app-${info.version}.apk`);
  fs.rmSync(apk, {force: true});
  run(jdkTool('java'), [
    NATIVE_ACCESS, '-jar', t.apksigner, 'sign', ...signingArgs(KEY).args, '--out', apk, aligned,
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

/** Write `Features.java`, the build's one switch, under `work`; its path. Off, the compiler drops every guarded use of the button. */
function featuresSource(work, button) {
  const file = path.join(work, 'gen', ...PACKAGE.split('.'), `${FEATURES_CLASS}.java`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(
    file,
    `package ${PACKAGE};\n\n/** Written by scripts/build.cjs (#617); never edit. */\nfinal class ${FEATURES_CLASS} {\n  static final boolean FLOATING_BUTTON = ${button};\n\n  private ${FEATURES_CLASS}() {}\n}\n`,
  );
  return file;
}

/** Remove the floating button's classes from `classes`, so the APK holds none of them. */
function pruneButton(classes) {
  const folder = path.join(classes, ...PACKAGE.split('.'));
  for (const name of fs.readdirSync(folder)) {
    if (BUTTON_CLASSES.some(cls => name === `${cls}.class` || name.startsWith(`${cls}$`))) {
      fs.rmSync(path.join(folder, name));
    }
  }
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
    run(process.execPath, ['--test', androidTokens.TEST, path.join(__dirname, '../../../packages/native-build/signing.test.cjs')]);
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
    // The watcher command over a stand-in adb, and the docs that show it (#489).
    run(jdkTool('java'), ['-cp', classes, 'com.supernotetools.lingo.WatcherCommandTest', root]);
    require('./look-check.cjs').test(path.join(work, 'look'));
    testBadging();
    testManifest();
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

/** The manifest with and without the floating button (#617): off, no overlay permission, accessibility service or OverlayService. */
function testManifest() {
  const info = {versionCode: 1, versionName: '0.0.0'};
  const off = manifestText(info, false);
  const on = manifestText(info, true);
  const parts = ['SYSTEM_ALERT_WINDOW', 'FOREGROUND_SERVICE', 'RECEIVE_BOOT_COMPLETED', 'OverlayService', 'WritingWatcher', 'BootReceiver', 'AccessibilityService', 'BIND_ACCESSIBILITY_SERVICE'];
  for (const part of parts) {
    if (off.includes(part)) {
      throw new Error(`manifest: the default build holds ${part}`);
    }
    if (!on.includes(part)) {
      throw new Error(`manifest: the floating-button build lacks ${part}`);
    }
  }
  for (const manifestFile of [off, on]) {
    if (!manifestFile.includes('MANAGE_EXTERNAL_STORAGE') || !manifestFile.includes('.SettingsActivity')) {
      throw new Error('manifest: the files permission or the launcher screen is missing');
    }
  }
  console.log('manifest rule ok');
}

// Before the main block: scripts/look-check.cjs, which the test below loads, reads these.
module.exports = {NATIVE_ACCESS, app, failOnMissingJdk, badgingProblems, buildApk, featuresSource, floatingButton, javaSources, manifestText, test, tokensSource, tools};

/** A missing JDK is one line saying what to install, not a stack trace (#78); any other error is thrown on. */
function failOnMissingJdk(error) {
  if (error.message !== JDK_MISSING) {
    throw error;
  }
  console.error(`lingo-app: ${error.message}`);
  process.exit(1);
}

if (require.main === module) {
  try {
    if (process.argv.includes('--test')) {
      test();
    } else {
      buildApk();
    }
  } catch (error) {
    failOnMissingJdk(error);
  }
}

