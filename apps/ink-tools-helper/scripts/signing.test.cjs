// The signing-key choice of build.cjs (#223): the stable key from the environment, else the debug key.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {signingArgs, STABLE_KEYSTORE_ENV, STABLE_PASSWORD_ENV, STABLE_KEY_ALIAS} = require('./build.cjs');

const DEBUG_STORE = '/synthetic/debug.keystore';
const debugKey = () => DEBUG_STORE;

function withStore(body) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-tools-helper-signing-'));
  const store = path.join(folder, 'stable.keystore');
  fs.writeFileSync(store, 'synthetic');
  try {
    body(store);
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
}

test('no stable keystore: the local debug key', () => {
  const key = signingArgs({}, debugKey);
  assert.equal(key.stable, false);
  assert.equal(key.args[key.args.indexOf('--ks') + 1], DEBUG_STORE);
});

test('an empty keystore variable, as an absent secret gives: the local debug key', () => {
  const key = signingArgs({[STABLE_KEYSTORE_ENV]: '', [STABLE_PASSWORD_ENV]: ''}, debugKey);
  assert.equal(key.stable, false);
});

test('the stable key: its alias, and the password by variable name only', () => {
  withStore(store => {
    const typed = 'synthetic-value';
    const key = signingArgs({[STABLE_KEYSTORE_ENV]: store, [STABLE_PASSWORD_ENV]: typed}, () => {
      throw Error('the debug key must not be made');
    });
    assert.equal(key.stable, true);
    assert.equal(key.args[key.args.indexOf('--ks') + 1], store);
    assert.equal(key.args[key.args.indexOf('--ks-key-alias') + 1], STABLE_KEY_ALIAS);
    assert.equal(key.args[key.args.indexOf('--ks-pass') + 1], `env:${STABLE_PASSWORD_ENV}`);
    assert.equal(key.args[key.args.indexOf('--key-pass') + 1], `env:${STABLE_PASSWORD_ENV}`);
    assert.ok(!key.args.join(' ').includes(typed));
  });
});

test('a keystore without its password fails, never falls back', () => {
  withStore(store => {
    assert.throws(() => signingArgs({[STABLE_KEYSTORE_ENV]: store}, debugKey), /is empty/);
  });
});

test('a keystore path that does not exist fails', () => {
  assert.throws(
    () => signingArgs({[STABLE_KEYSTORE_ENV]: '/synthetic/missing.keystore', [STABLE_PASSWORD_ENV]: 'x'}, debugKey),
    /missing file/,
  );
});
