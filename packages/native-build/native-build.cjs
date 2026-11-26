/**
 * The light native build every plugin with native code shares (#231), without Gradle: javac, D8 and
 * aapt2 produce build/native/app.npk, an APK-format ZIP that PluginHost loads. Adapted from the
 * pipeline of Keplex/supernote-pic2note at 5a210f8 (MIT, see NOTICE.md beside it), first as
 * the first plugin's own script (#11), then copied into each plugin (#59, #98, #136, #142, #40) until this
 * one replaced the copies.
 *
 * Each plugin keeps a thin `scripts/native-build.cjs` that names its package class and its Java
 * folders and calls `defineBuild`; its tools come from this folder's `native-toolchain.sh`, the one
 * copy, run for the plugin's folder (#295).
 *
 *   node scripts/native-build.cjs            build build/native/app.npk
 *   node scripts/native-build.cjs --package  build it and add it to build/outputs/<name>.snplg,
 *                                            after `bash buildPlugin.sh` made the JS package
 *   node scripts/native-build.cjs --test     run the plugin's JVM tests (needs only a JDK), when it
 *                                            has some
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const MIN_API = '27';
const TARGET_API = '35';
/** The XML namespace of Android's manifest attributes. */
const ANDROID_NAMESPACE = 'http://schemas.android.com/apk/res/android';
/** The javac flags of every compile here: Java 8 bytecode, as PluginHost's runtime loads. */
const JAVAC = ['--release', '8', '-encoding', 'UTF-8', '-Xlint:-options'];
/**
 * Annotation classes React Native's jar refers to but does not ship, on the compile class path only
 * and never in app.npk: without them javac 25 warns on any class that touches one, and -Werror
 * fails the build (Image Editing's Back key, #226).
 */
const COMPILE_ONLY = path.join(__dirname, 'compile-only');
/** The one toolchain script, which installs into the plugin's `.toolchain/` (#295). */
const TOOLCHAIN = path.join(__dirname, 'native-toolchain.sh');
/** The paths native-toolchain.sh prints, each after its `NATIVE_` prefix. */
const PRINTED = /^[A-Z0-9]+_(BUILD_TOOLS|ANDROID_JAR|REACT_JAR|KOTLIN_JAR)=(.*)$/;

/** Every `.java` file under `folder`, in directory order. */
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

/**
 * Compiles `files` with the JDK alone and runs each of `mains` headless, with `javaArgs`, through
 * `jdkTool`, from `cwd` (a test may read a file by a relative path). A temporary folder: the gate may run as another user than the one that owns build/.
 * The plugins' `--test` and the packages gate (`package-tests.cjs`, #254) both run here.
 */
function jvmTests({jdkTool, cwd, prefix, files, mains, javaArgs = []}) {
  const run = (binary, args) => execFileSync(binary, args, {cwd, stdio: 'inherit'});
  const classes = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-native-tests-`));
  // Compile inside the try, so a compile error also removes the folder.
  try {
    run(jdkTool('javac'), [...JAVAC, '-Werror', '-d', classes, ...files]);
    for (const main of mains) {
      // Headless: a test that touches AWT would otherwise show a Java app in the macOS Dock.
      run(jdkTool('java'), ['-Djava.awt.headless=true', ...javaArgs, '-cp', classes, main]);
    }
  } finally {
    fs.rmSync(classes, {recursive: true, force: true});
  }
}

/**
 * The build of one plugin.
 * - `root`: the plugin folder, which holds PluginConfig.json, package.json and scripts/.
 * - `hostTools`: the plugin's `scripts/host-tools.cjs` (`jdkTool`, `JDK_MISSING`).
 * - `packageClass`: the React package PluginHost loads; its Java package names the manifest.
 * - `sources`: the folders whose Java goes into app.npk, in compile order.
 * - `test`: optional, the plugin's JVM tests, given `jvmTests`.
 */
function nativeBuild({root, hostTools, packageClass, sources, test}) {
  const {jdkTool} = hostTools;
  const build = path.join(root, 'build');
  const out = path.join(build, 'native');
  const manifestPackage = packageClass.slice(0, packageClass.lastIndexOf('.'));

  function run(binary, args, options = {}) {
    return execFileSync(binary, args, {cwd: root, stdio: 'inherit', ...options});
  }

  /** Paths printed by native-toolchain.sh, which installs what is missing. */
  function tools() {
    const text = execFileSync('bash', [TOOLCHAIN, root], {
      cwd: root,
      encoding: 'utf8',
    });
    const values = {};
    for (const line of text.split('\n')) {
      const match = PRINTED.exec(line);
      if (match) {
        values[match[1]] = match[2];
      }
    }
    const result = {
      androidJar: values.ANDROID_JAR,
      reactJar: values.REACT_JAR,
      kotlinJar: values.KOTLIN_JAR,
      d8: path.join(values.BUILD_TOOLS || '', 'lib/d8.jar'),
      aapt2: path.join(values.BUILD_TOOLS || '', 'aapt2'),
    };
    for (const [name, file] of Object.entries(result)) {
      if (!file || !fs.existsSync(file)) {
        throw Error(`Missing ${name}: ${file}. Run bash ${TOOLCHAIN} ${root}.`);
      }
    }
    return result;
  }

  function config() {
    return JSON.parse(fs.readFileSync(path.join(root, 'PluginConfig.json'), 'utf8'));
  }

  /**
   * The package's file name: buildPlugin.sh names its JS-only `.snplg` after package.json's `name`,
   * never after the display name in PluginConfig.json, which may differ (#176).
   */
  function packageName() {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name;
  }

  /** Written from PluginConfig.json, so the native versions can never drift from the plugin's. */
  function manifest(file) {
    const {versionCode, versionName} = config();
    fs.writeFileSync(
      file,
      `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="${ANDROID_NAMESPACE}"
    package="${manifestPackage}"
    android:versionCode="${versionCode}"
    android:versionName="${versionName}">
  <uses-sdk android:minSdkVersion="${MIN_API}" android:targetSdkVersion="${TARGET_API}" />
  <application android:hasCode="true" />
</manifest>
`,
    );
  }

  function buildNative() {
    const t = tools();
    fs.rmSync(out, {recursive: true, force: true});
    const classes = path.join(out, 'classes');
    const stage = path.join(out, 'npk');
    fs.mkdirSync(classes, {recursive: true});
    fs.mkdirSync(stage, {recursive: true});
    const compileOnly = path.join(out, 'compile-only');
    run(jdkTool('javac'), [...JAVAC, '-Werror', '-d', compileOnly, ...javaSources(COMPILE_ONLY)]);
    run(jdkTool('javac'), [
      // -Werror: a new javac warning fails the build (#32).
      ...JAVAC, '-Werror',
      '-cp', [t.androidJar, t.reactJar, t.kotlinJar, compileOnly].join(path.delimiter),
      '-d', classes, ...sources.flatMap(javaSources),
    ]);
    const jar = path.join(out, 'files.jar');
    run(jdkTool('jar'), ['cf', jar, '-C', classes, '.']);
    const dex = path.join(out, 'dex.zip');
    run(jdkTool('java'), [
      '-cp', t.d8, 'com.android.tools.r8.D8', '--release', '--min-api', MIN_API,
      '--lib', t.androidJar, '--classpath', t.reactJar, '--output', dex, jar,
    ]);
    const manifestFile = path.join(out, 'AndroidManifest.xml');
    manifest(manifestFile);
    const resources = path.join(out, 'resources.apk');
    run(t.aapt2, [
      'link', '--manifest', manifestFile, '-I', t.androidJar,
      '--min-sdk-version', MIN_API, '--target-sdk-version', TARGET_API, '-o', resources,
    ]);
    run('unzip', ['-q', '-o', resources, '-d', stage]);
    run('unzip', ['-q', '-o', dex, '-d', stage]);
    for (const needed of ['classes.dex', 'AndroidManifest.xml']) {
      if (!fs.existsSync(path.join(stage, needed))) {
        throw Error(`app.npk would miss ${needed}`);
      }
    }
    const npk = path.join(out, 'app.npk');
    run('zip', ['-q', '-r', '-9', npk, '.'], {cwd: stage});
    run(t.aapt2, ['dump', 'badging', npk]);
    console.log(`native: app.npk ${fs.statSync(npk).size} bytes`);
    return npk;
  }

  /** Adds app.npk and its config fields to the package buildPlugin.sh made. */
  function packagePlugin() {
    const generated = path.join(build, 'generated');
    const generatedConfig = path.join(generated, 'PluginConfig.json');
    if (!fs.existsSync(generatedConfig)) {
      throw Error('Run `bash buildPlugin.sh` first: build/generated/PluginConfig.json is missing.');
    }
    // Remove the JS-only package buildPlugin.sh wrote before the native step, so a failed step
    // leaves no .snplg without its app.npk, which would fail on the tablet (#153).
    const outputs = path.join(build, 'outputs');
    const name = `${packageName()}.snplg`;
    for (const stale of [name, `${packageName()}.zip`]) {
      fs.rmSync(path.join(outputs, stale), {force: true});
    }
    const npk = buildNative();
    fs.copyFileSync(npk, path.join(generated, 'app.npk'));
    const cfg = JSON.parse(fs.readFileSync(generatedConfig, 'utf8'));
    cfg.nativeCodePackage = '/app.npk';
    cfg.reactPackages = [packageClass];
    fs.writeFileSync(generatedConfig, JSON.stringify(cfg, null, 2) + '\n');
    fs.mkdirSync(outputs, {recursive: true});
    run('zip', ['-q', '-r', '-9', path.join(outputs, name), '.'], {cwd: generated});
    console.log(`native: ${name} ${fs.statSync(path.join(outputs, name)).size} bytes with app.npk`);
  }

  const testNative = test
    ? () => test({jvmTests: options => jvmTests({jdkTool, cwd: root, ...options}), javaSources})
    : undefined;
  return {buildNative, packagePlugin, testNative};
}

/** Runs the command line of one plugin's thin script: `--test`, `--package` or a plain build. */
function runCommandLine(builder, hostTools, argv = process.argv) {
  try {
    if (argv.includes('--test') && builder.testNative) {
      builder.testNative();
    } else if (argv.includes('--test')) {
      throw Error('this plugin has no JVM tests');
    } else if (argv.includes('--package')) {
      builder.packagePlugin();
    } else {
      builder.buildNative();
    }
  } catch (error) {
    // A missing JDK is one line saying what to install, not a stack trace (#74).
    if (error.message !== hostTools.JDK_MISSING) {
      throw error;
    }
    console.error(`native: ${error.message}`);
    process.exit(1);
  }
}

/** One plugin's build: run as its command line when `isMain`, and returned for its tests. */
function defineBuild(options, isMain) {
  const builder = nativeBuild(options);
  if (isMain) {
    runCommandLine(builder, options.hostTools);
  }
  return {...builder, javaSources};
}

module.exports = {defineBuild, javaSources, jvmTests, nativeBuild};
