#!/usr/bin/env node
/**
 * Builds the pinyin index the ZH button looks pinyin up in, packages/ink-core/src/data/pinyin-index.json
 * (#129, owner D47 B: offline, from CC-CEDICT). The data comes from one pinned file, the npm
 * tarball of `cc-cedict` 1.1.1, which carries CC-CEDICT of 2026-01-04 as `data/simplified.js`;
 * mdbg.net, CC-CEDICT's home, is not reachable from every session, the npm registry is. The
 * tarball is pinned to its SHA-256, so a run reproduces the committed index byte for byte.
 *
 *   node scripts/build-pinyin-index.cjs [--cache <dir>] [--check]
 *
 * --cache keeps the download in <dir> and reads it from there next time. --check builds the index
 * and fails when it differs from the committed file. Behind a proxy, Node needs
 * NODE_USE_ENV_PROXY=1 (and NODE_EXTRA_CA_CERTS for its certificate). The plugin never fetches
 * this file: only this script does.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'src', 'data', 'pinyin-index.json');
const SOURCE = {
  url: 'https://registry.npmjs.org/cc-cedict/-/cc-cedict-1.1.1.tgz',
  sha256: '50e6cca2c2dd84057d618fa8e1a50dc7ef7c6e273d4c5e69df032ecfc358f1d3',
  member: 'package/data/simplified.js',
  cedict: '2026-01-04',
};
const TAR_BLOCK = 512;

/** One CJK ideograph or 〇, so a word of Latin letters or digits (`3D打印`) is left out. */
const HAN = /^[\u3007\u3400-\u4dbf\u4e00-\u9fff\u{20000}-\u{3134f}]+$/u;
/** The basic block: a word made only of these ranks before one with a rare extension character. */
const BASIC = /^[\u4e00-\u9fff]+$/u;
/** One CC-CEDICT syllable: letters, `u:` for ü, then its tone, 5 for the neutral one. */
const SYLLABLE = /^[a-z]*(u:)?[a-z]*[1-5]$/;

async function load(cacheDir) {
  const cached = cacheDir && path.join(cacheDir, path.basename(SOURCE.url));
  let body;
  if (cached && fs.existsSync(cached)) {
    body = fs.readFileSync(cached);
  } else {
    const response = await fetch(SOURCE.url);
    if (!response.ok) {
      throw new Error(`${SOURCE.url}: HTTP ${response.status}`);
    }
    body = Buffer.from(await response.arrayBuffer());
    if (cached) {
      fs.mkdirSync(cacheDir, {recursive: true});
      fs.writeFileSync(cached, body);
    }
  }
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  if (digest !== SOURCE.sha256) {
    throw new Error(`${SOURCE.url}: SHA-256 ${digest}, expected ${SOURCE.sha256}`);
  }
  return member(zlib.gunzipSync(body), SOURCE.member);
}

/** The text of one file of a ustar archive. */
function member(tar, name) {
  for (let at = 0; at + TAR_BLOCK <= tar.length; ) {
    const header = tar.subarray(at, at + TAR_BLOCK);
    const field = (start, length) =>
      header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const prefix = field(345, 155);
    const file = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    if (!file) {
      break;
    }
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const start = at + TAR_BLOCK;
    if (file === name) {
      return tar.subarray(start, start + size).toString('utf8');
    }
    at = start + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }
  throw new Error(`${SOURCE.url}: no ${name}`);
}

/**
 * `{word: {reading: ...}}`, the readings as CC-CEDICT writes them (`Ping2 guo3`), one per entry.
 * The file is `export default {...}`: only the object is read.
 */
function entries(text) {
  return JSON.parse(text.slice(text.indexOf('{')).trim().replace(/;$/, ''));
}

/**
 * One line per toneless spelling, sorted: `pingguo 苹果ping2guo3 平果ping2guo3 平锅ping2guo1`. Each
 * candidate is the word and its numbered reading with `v` for ü, best first: a common word before
 * a name (CC-CEDICT capitalizes a name's reading), a word of basic-block characters before one
 * with a rare character, more CC-CEDICT entries before fewer, then a word whose least productive
 * character is in more CC-CEDICT words (a stand-in for frequency, which CC-CEDICT lacks), then
 * CC-CEDICT's order.
 */
function build(data) {
  const productive = new Map();
  for (const word of Object.keys(data)) {
    for (const char of new Set(word)) {
      productive.set(char, (productive.get(char) ?? 0) + 1);
    }
  }
  const leastProductive = word => Math.min(...[...word].map(char => productive.get(char)));
  const byKey = new Map();
  let order = 0;
  for (const [word, readings] of Object.entries(data)) {
    if (!HAN.test(word)) {
      continue;
    }
    for (const written of Object.keys(readings)) {
      const syllables = written.toLowerCase().split(' ');
      if ([...word].length !== syllables.length || !syllables.every(s => SYLLABLE.test(s))) {
        continue;
      }
      const reading = syllables.join('').replace(/u:/g, 'v');
      const key = reading.replace(/\d/g, '');
      const candidates = byKey.get(key) ?? new Map();
      byKey.set(key, candidates);
      const id = word + reading;
      const found = candidates.get(id) ?? {
        id,
        common: false,
        basic: BASIC.test(word),
        count: 0,
        productive: leastProductive(word),
        order: order++,
      };
      found.common = found.common || written === written.toLowerCase();
      found.count += 1;
      candidates.set(id, found);
    }
  }
  const rank = (a, b) =>
    Number(b.common) - Number(a.common) ||
    Number(b.basic) - Number(a.basic) ||
    b.count - a.count ||
    b.productive - a.productive ||
    a.order - b.order;
  const lines = [...byKey.keys()]
    .sort()
    .map(key => [key, ...[...byKey.get(key).values()].sort(rank).map(c => c.id)].join(' '));
  return {
    source: `CC-CEDICT ${SOURCE.cedict}, CC BY-SA 4.0, from ${SOURCE.url}`,
    entries: lines,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const cacheAt = args.indexOf('--cache');
  const cacheDir = cacheAt >= 0 ? args[cacheAt + 1] : undefined;
  const text = `${JSON.stringify(build(entries(await load(cacheDir))))}\n`;
  const bytes = Buffer.byteLength(text);
  const size = `${bytes} B, ${zlib.gzipSync(text).length} B gzipped`;
  if (args.includes('--check')) {
    if (fs.readFileSync(OUT, 'utf8') !== text) {
      throw new Error(`${OUT} differs from a fresh build (${size})`);
    }
    console.log(`pinyin index: up to date (${size})`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, text);
  console.log(`pinyin index: wrote ${OUT} (${size})`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
