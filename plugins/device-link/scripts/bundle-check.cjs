#!/usr/bin/env node
// Bundle the plugin the way buildPlugin.sh does and check that the bundle exports what the source
// calls from the LocalSend protocol module (#586). Jest resolves `./protocol` to protocol.ts first and
// Metro may resolve it to another file of that name, so a green Jest run says nothing about the bundle.
//
//   node scripts/bundle-check.cjs
//
// Exit 0 when every name the source imports by value from `localsend/protocol` is exported by the
// bundle's protocol module, 1 with the missing names, else the bundler's status.
const path = require('path');
const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');

const root = path.resolve(__dirname, '..');
const protocolSource = fs.readFileSync(path.join(root, 'src/localsend/protocol.ts'), 'utf8');

/** Names protocol.ts exports as values (types are erased and never reach the bundle). */
function valueExports(text) {
  return new Set([...text.matchAll(/^export (?:const|function) (\w+)/gm)].map(m => m[1]));
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Names the plugin's source imports from the protocol module, as `{name: first file}`. */
function importedNames(files) {
  const found = {};
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(?:\.{1,2}\/)+(?:src\/)?(?:localsend\/)?protocol'/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0];
        if (name && !name.startsWith('type ')) {
          found[name] = found[name] || path.relative(root, file);
        }
      }
    }
  }
  return found;
}

const exported = valueExports(protocolSource);
const wanted = Object.entries(importedNames([...sourceFiles(path.join(root, 'src')), path.join(root, 'App.tsx')]))
  .filter(([name]) => exported.has(name));
if (wanted.length === 0) {
  console.error('bundle-check: no value import of localsend/protocol found; the check reads nothing');
  process.exit(1);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'device-link-bundle-'));
try {
  const run = spawnSync('npx', ['react-native', 'bundle', '--entry-file', 'index.js', '--bundle-output',
    path.join(out, 'check.bundle'), '--platform', 'android', '--dev', 'false', '--minify', 'false'],
  {cwd: root, env: {...process.env, CI: '1'}, stdio: ['ignore', 'ignore', 'inherit']});
  if (run.status !== 0) {
    process.exit(run.status || 1);
  }
  const bundle = fs.readFileSync(path.join(out, 'check.bundle'), 'utf8');
  const missing = wanted.filter(([name]) => !new RegExp('exports\\.' + name + '\\s*=').test(bundle));
  for (const [name, file] of missing) {
    console.error('bundle-check: the bundle does not export ' + name + ' (' + file + ' calls it)');
  }
  if (missing.length) {
    process.exit(1);
  }
  console.log('bundle-check: ok, ' + wanted.length + ' protocol exports present');
} finally {
  fs.rmSync(out, {recursive: true, force: true});
}
