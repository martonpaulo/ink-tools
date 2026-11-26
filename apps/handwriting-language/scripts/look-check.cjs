#!/usr/bin/env node
/**
 * Measures a screen's picture against the native look and draws one side-by-side sheet (#299):
 * our picture with its rules marked, the native rhythm, and each measured difference with the
 * native value and ours. The native values are ui-kit's tokens (`packages/ui-kit/native-catalog.md`
 * says how each was measured); `--native` takes a tablet screencap of the native screen instead
 * and measures it the same way. JDK only: no device, no window.
 *
 *   node scripts/look-check.cjs --screen NAME --ours OURS.png --out SHEET.png [--native NATIVE.png]
 *
 * Handwriting Language's renders come from `scripts/renders.cjs`.
 */
const {execFileSync} = require('node:child_process');
const {jdkTool} = require('../../../packages/native-build/host-tools.cjs');
const path = require('node:path');
const fs = require('node:fs');
const {NATIVE_ACCESS, failOnMissingJdk, javaSources, tokensSource} = require('./build.cjs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
/** The classes with no Android import, and the sheet's own. */
const LOOK = path.join(root, 'look');
const SHEET_CLASS = 'com.supernotetools.lingo.LookSheet';
const TEST_CLASS = 'com.supernotetools.lingo.LookTest';

/** The look classes and the generated tokens, compiled into `work/classes`; the folder. */
function compile(work) {
  const classes = path.join(work, 'classes');
  const sources = javaSources(LOOK);
  execFileSync(jdkTool('javac'), [
    '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror', '-d', classes, ...sources, tokensSource(work),
  ], {stdio: 'inherit'});
  return classes;
}

function run(args) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-look-'));
  try {
    execFileSync(jdkTool('java'), [
      NATIVE_ACCESS, '-Djava.awt.headless=true', '-cp', compile(work), SHEET_CLASS, ...args,
    ], {stdio: 'inherit'});
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
}

/** The JVM test over the recorded picture, for `node scripts/build.cjs --test`. */
function test(work) {
  execFileSync(jdkTool('java'), [
    '-Djava.awt.headless=true', '-cp', compile(work), TEST_CLASS, path.join(LOOK, 'fixtures', 'handwriting-language-granted-1920.png'),
  ], {stdio: 'inherit'});
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    failOnMissingJdk(error);
  }
}

module.exports = {test};
