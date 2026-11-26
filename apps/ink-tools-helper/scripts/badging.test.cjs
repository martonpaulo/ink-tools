// The badging rule build.cjs applies to the APK (#260): an icon, which Customize Sidebar shows, and no launcher entry.
const test = require('node:test');
const assert = require('node:assert/strict');
const {badgingProblems} = require('../../handwriting-language/scripts/build.cjs');

const PACKAGE = "package: name='com.martonpaulo.inktools.bridge' versionCode='3'";

test('an icon and no launcher entry: no problem', () => {
  const app = "application: label='Ink Tools Helper' icon='res/drawable/ic_launcher.xml'";
  assert.deepEqual(badgingProblems([PACKAGE, app].join('\n'), 0), []);
});

test('the empty icon of 0.1.0 beta 2: no application icon', () => {
  const app = "application: label='Ink Tools Helper' icon=''";
  assert.deepEqual(badgingProblems([PACKAGE, app].join('\n'), 0), ['no application icon']);
});

test('a launcher entry: the bridge must stay without a screen', () => {
  const app = "application: label='Ink Tools Helper' icon='res/drawable/ic_launcher.xml'";
  const launcher = "launchable-activity: name='com.martonpaulo.inktools.bridge.Main'";
  assert.deepEqual(badgingProblems([PACKAGE, app, launcher].join('\n'), 0), ['1 launcher entries, not 0']);
});
