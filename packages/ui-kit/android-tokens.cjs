#!/usr/bin/env node
/**
 * The native look's tokens for the Android apps (#275): src/tokens.json, the one source metrics.ts
 * and controlsCopy.ts read for the plugins, written as one Java class, so a token changes in
 * tokens.json alone and an app never holds a value of its own. An app's build writes the class
 * before javac and its JVM test compares it with `properties()`, read from the same file.
 *
 *   node android-tokens.cjs PACKAGE OUT.java [OUT.properties]
 *
 * Names: `pxPerMm` is PX_PER_MM; a size `titleBarHeight` is TITLE_BAR_HEIGHT_MM (float
 * millimetres); a ratio `largeFont` is LARGE_FONT_RATIO (float); a colour `context` is
 * CONTEXT_COLOUR (an opaque ARGB int); a word `on` is ON_TEXT (String).
 */
const fs = require('node:fs');
const path = require('node:path');

const TOKENS = path.join(__dirname, 'src', 'tokens.json');
/** This writer's own test, which each app's gate runs. */
const TEST = path.join(__dirname, 'android-tokens.test.cjs');
/** Each group of tokens.json: the suffix of its Java names and its Java type. */
const GROUPS = {
  mm: {suffix: '_MM', type: 'float'},
  ratio: {suffix: '_RATIO', type: 'float'},
  colour: {suffix: '_COLOUR', type: 'int'},
  word: {suffix: '_TEXT', type: 'String'},
};
/** The keys of tokens.json that are not tokens. */
const ABOUT = 'about';
const SCALE = 'pxPerMm';
const COLOUR = /^#[0-9a-f]{6}$/i;

const upperSnake = name => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/** Every token as {name, type, value}, in file order; a token of an unknown kind is refused. */
function entries(tokens) {
  const found = [];
  for (const [key, group] of Object.entries(tokens)) {
    if (key === ABOUT) {
      continue;
    }
    if (key === SCALE) {
      found.push({name: 'PX_PER_MM', type: 'float', value: number(key, group.value)});
      continue;
    }
    const kind = GROUPS[key];
    if (!kind) {
      throw Error(`tokens.json: unknown group "${key}"; known: ${[SCALE, ...Object.keys(GROUPS)].join(', ')}`);
    }
    for (const [name, token] of Object.entries(group)) {
      const where = `${key}.${name}`;
      found.push({name: upperSnake(name) + kind.suffix, type: kind.type, value: valueOf(kind.type, where, token.value)});
    }
  }
  return found;
}

function number(where, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw Error(`tokens.json: ${where} is not a number: ${JSON.stringify(value)}`);
  }
  return value;
}

function valueOf(type, where, value) {
  if (type === 'float') {
    return number(where, value);
  }
  if (type === 'int') {
    if (typeof value !== 'string' || !COLOUR.test(value)) {
      throw Error(`tokens.json: ${where} is not a #rrggbb colour: ${JSON.stringify(value)}`);
    }
    return value.toLowerCase();
  }
  if (typeof value !== 'string' || value === '') {
    throw Error(`tokens.json: ${where} is not a word: ${JSON.stringify(value)}`);
  }
  return value;
}

function javaValue({type, value}) {
  if (type === 'float') {
    return `${value}f`;
  }
  if (type === 'int') {
    return `0xff${value.slice(1)}`;
  }
  return JSON.stringify(value);
}

/** The Java class `Tokens` in `javaPackage`. */
function javaSource(tokens, javaPackage) {
  const lines = entries(tokens).map(token => `  static final ${token.type} ${token.name} = ${javaValue(token)};`);
  return `// Written by packages/ui-kit/android-tokens.cjs from packages/ui-kit/src/tokens.json (#275). Do not edit.
package ${javaPackage};

final class Tokens {
  private Tokens() {}

${lines.join('\n')}
}
`;
}

/** The same tokens as `NAME=value` lines, read by an app's JVM test with java.util.Properties. */
function properties(tokens) {
  const escape = text => String(text).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  return entries(tokens).map(token => `${token.name}=${escape(token.value)}`).join('\n') + '\n';
}

function read(file = TOKENS) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Write the class, and the properties when asked; the parents of both are made. */
function write(javaPackage, javaFile, propertiesFile) {
  const tokens = read();
  fs.mkdirSync(path.dirname(javaFile), {recursive: true});
  fs.writeFileSync(javaFile, javaSource(tokens, javaPackage));
  if (propertiesFile) {
    fs.mkdirSync(path.dirname(propertiesFile), {recursive: true});
    fs.writeFileSync(propertiesFile, properties(tokens));
  }
}

module.exports = {TEST, TOKENS, entries, javaSource, properties, read, write};

if (require.main === module) {
  const [javaPackage, javaFile, propertiesFile] = process.argv.slice(2);
  if (!javaPackage || !javaFile) {
    console.error('usage: node android-tokens.cjs PACKAGE OUT.java [OUT.properties]');
    process.exit(2);
  }
  write(javaPackage, javaFile, propertiesFile);
}
