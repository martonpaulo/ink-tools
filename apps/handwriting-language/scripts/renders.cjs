#!/usr/bin/env node
/**
 * Renders the app's screen off screen on the Mac (#285): the real `SettingsActivity` on Robolectric's
 * native graphics, on the JVM: no window, no emulator, no device, no Gradle. It writes one PNG per
 * state and size, `<screen>-light-<small|default|large>.png`, into the folder RENDER_EVIDENCE names
 * (else .scratch/renders/handwriting-language in the repository).
 *
 *   RENDER_EVIDENCE=<dir> node scripts/renders.cjs
 *
 * The first run downloads Maven, Robolectric's jars and Android 11's framework jar into
 * .toolchain/renders/ (about 400 MB), each pinned by a checksum where the source publishes one.
 * Not part of the gate: like the plugins' renders, it runs when an interface path changes.
 */
const {execFileSync} = require('node:child_process');
const crypto = require('node:crypto');
const {jdkBin, jdkTool} = require('./host-tools.cjs');
const {NATIVE_ACCESS, failOnMissingJdk, app, javaSources, tokensSource, tools} = require('./build.cjs');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '../..');
const toolchain = path.join(root, '.toolchain', 'renders');
const MAVEN = '3.10.2';
const MAVEN_URL = `https://repo1.maven.org/maven2/org/apache/maven/apache-maven/${MAVEN}/apache-maven-${MAVEN}-bin.tar.gz`;
const MAVEN_SHA512 = '57d2db6b37e7582119137ade544557bba741b29e62109ef81539a2bdfd6d0e641fdd5d8edb014af1816d0510deac6fac8f347433b3a1aa36316ba85aa77b8119';
/** The Android 11 framework Robolectric runs, the app's `minSdk` and target (scripts/build.cjs). */
const ANDROID_ALL = 'android-all-instrumented-11-robolectric-6757853-i7.jar';
const ANDROID_ALL_URL = `https://repo1.maven.org/maven2/org/robolectric/android-all-instrumented/11-robolectric-6757853-i7/${ANDROID_ALL}`;
const ANDROID_ALL_SHA1 = '2685e41b383ac4d64b0554d7d047806957ff5ac6';
/** The most one AAR's classes.jar may hold when unpacked: 256 MiB. */
const MAX_JAR_BYTES = 256 * 1024 * 1024;
const TEST_CLASS = 'com.supernotetools.lingo.ScreenRenders';

function run(binary, args, options = {}) {
  return execFileSync(binary, args, {cwd: root, stdio: 'inherit', ...options});
}

function digest(file, algorithm) {
  return crypto.createHash(algorithm).update(fs.readFileSync(file)).digest('hex');
}

/** Downloads `url` to `file` unless it is there, and fails unless its checksum is `sha`. */
function fetchPinned(url, file, algorithm, sha) {
  if (!fs.existsSync(file) || digest(file, algorithm) !== sha) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    run('curl', ['-fsSL', '--retry', '2', '-o', `${file}.part`, url]);
    if (digest(`${file}.part`, algorithm) !== sha) {
      fs.rmSync(`${file}.part`);
      throw new Error(`renders: ${algorithm} mismatch for ${url}`);
    }
    fs.renameSync(`${file}.part`, file);
  }
}

/** The jars Robolectric needs, as a classpath folder; the AARs' classes.jar are unpacked beside them. */
function libraries(env) {
  const libs = path.join(toolchain, 'libs');
  if (fs.existsSync(path.join(libs, 'done'))) {
    return libs;
  }
  const archive = path.join(toolchain, `maven-${MAVEN}.tar.gz`);
  fetchPinned(MAVEN_URL, archive, 'sha512', MAVEN_SHA512);
  const maven = path.join(toolchain, `apache-maven-${MAVEN}`);
  if (!fs.existsSync(maven)) {
    run('tar', ['xzf', archive, '-C', toolchain]);
  }
  fs.rmSync(libs, {recursive: true, force: true});
  run(path.join(maven, 'bin', 'mvn'), [
    '-q', '-B', `-Dmaven.repo.local=${path.join(toolchain, 'm2')}`, '-f', path.join(root, 'renders', 'pom.xml'),
    'dependency:copy-dependencies', `-DoutputDirectory=${libs}`,
  ], {env});
  for (const name of fs.readdirSync(libs).filter(file => file.endsWith('.aar'))) {
    const jar = path.join(libs, name.replace(/\.aar$/, '.jar'));
    fs.writeFileSync(jar, execFileSync('unzip', ['-p', path.join(libs, name), 'classes.jar'], {maxBuffer: MAX_JAR_BYTES}));
  }
  fs.writeFileSync(path.join(libs, 'done'), '');
  return libs;
}

function renders() {
  const out = path.resolve(process.env.RENDER_EVIDENCE || path.join(repo, '.scratch', 'renders', 'handwriting-language'));
  const jdk = jdkBin();
  const env = {...process.env, JAVA_HOME: path.resolve(jdk, '..')};
  const libs = libraries(jdk === '' ? process.env : env);
  const dependencies = path.join(toolchain, 'android-all');
  fetchPinned(ANDROID_ALL_URL, path.join(dependencies, ANDROID_ALL), 'sha1', ANDROID_ALL_SHA1);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-renders-'));
  try {
    const classes = path.join(work, 'classes');
    const stubs = tools().androidJar;
    run(jdkTool('javac'), [
      '-encoding', 'UTF-8', '-Xlint:-options', '-d', classes, '-cp', `${libs}/*:${stubs}`,
      ...javaSources(path.join(root, 'src')), tokensSource(work), path.join(root, 'renders', 'ScreenRenders.java'),
    ]);
    fs.mkdirSync(out, {recursive: true});
    run(jdkTool('java'), [
      NATIVE_ACCESS, `-Drender.out=${out}`, `-Drender.version=${app().versionName}`, '-Drobolectric.offline=true', `-Drobolectric.dependency.dir=${dependencies}`,
      '-Djava.awt.headless=true', '-cp', `${classes}:${libs}/*:${stubs}`, 'org.junit.runner.JUnitCore', TEST_CLASS,
    ]);
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
  const files = fs.readdirSync(out).filter(name => name.startsWith('handwriting-language-') && name.endsWith('.png'));
  console.log(`handwriting-language renders: ${files.length} pictures in ${out}`);
}

try {
  renders();
} catch (error) {
  failOnMissingJdk(error);
}
