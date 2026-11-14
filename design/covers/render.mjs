#!/usr/bin/env node
// Renders InkHub covers from one template and one data file per plugin (#100).
//
//   node design/covers/render.mjs                      every template, every plugin
//   node design/covers/render.mjs --template a lookup  one template, one plugin
//
// Output: design/covers/out/<template>/<plugin>.svg, plus a PNG at the full size and at the
// grid size for each. Needs `rsvg-convert` (librsvg) on the PATH; it uses only the fonts in
// design/fonts, so a render is the same on every machine. No npm dependency.
//
// shortcut: the sizes are not published by Ratta (the InkHub upload screen asks for a
// «thumbnail» with no stated size); 1920x2560 is the Manta screen at 3:4, the grid size is an
// estimate. Change SIZES when InkHub's upload rules are known.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS_CONF = join(HERE, '..', 'fonts', 'fonts.conf');
const SIZES = [
  { name: 'full', width: 1920, height: 2560 },
  { name: 'grid', width: 480, height: 640 },
];

const escapeXml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const readFragment = (path) => readFileSync(join(HERE, path), 'utf8').trim();

function lookup(data, key) {
  const value = key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), data);
  if (value === undefined) throw new Error(`missing value «${key}»`);
  return value;
}

export function fill(template, data) {
  // A slot whose value is missing (fewer than four features) is dropped whole.
  let svg = template.replace(/<!--slot:([\w.]+)-->([\s\S]*?)<!--\/slot-->/g, (_, key, body) =>
    key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), data) === undefined ? '' : body,
  );
  return svg.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const [kind, ...args] = expr.split(':');
    if (kind === 'NAME') return escapeXml(data.name.toUpperCase());
    if (kind === 'icon' && args.length === 0) return readFragment(data.icon);
    if (kind === 'icon') return readFragment(`icons/${lookup(data, args[0])}.svg`);
    if (kind === 'lines') {
      const [key, x, y, lineHeight] = args;
      return String(lookup(data, key))
        .split('\n')
        .map((line, i) => `<tspan x="${x}" ${i === 0 ? `y="${y}"` : `dy="${lineHeight}"`}>${escapeXml(line)}</tspan>`)
        .join('');
    }
    if (kind.endsWith('.art')) return readFragment(lookup(data, kind));
    return escapeXml(lookup(data, kind));
  });
}

function main(argv) {
  const templateArg = argv.indexOf('--template');
  const onlyTemplate = templateArg >= 0 ? argv[templateArg + 1] : null;
  const plugins = argv.filter((arg, i) => !arg.startsWith('--') && i !== templateArg + 1);
  const templates = readdirSync(HERE)
    .filter((f) => /^template-\w+\.svg$/.test(f))
    .map((f) => f.slice('template-'.length, -'.svg'.length))
    .filter((t) => !onlyTemplate || t === onlyTemplate);
  const names = plugins.length
    ? plugins
    : readdirSync(join(HERE, 'plugins')).filter((f) => f.endsWith('.json')).map((f) => basename(f, '.json'));
  if (!templates.length) throw new Error(`no template «${onlyTemplate}»`);

  const env = { ...process.env, FONTCONFIG_FILE: FONTS_CONF, XDG_CACHE_HOME: mkdtempSync(join(tmpdir(), 'covers-')) };
  for (const template of templates) {
    const source = readFileSync(join(HERE, `template-${template}.svg`), 'utf8');
    const outDir = join(HERE, 'out', template);
    mkdirSync(outDir, { recursive: true });
    for (const name of names) {
      const data = JSON.parse(readFileSync(join(HERE, 'plugins', `${name}.json`), 'utf8'));
      const svgPath = join(outDir, `${name}.svg`);
      writeFileSync(svgPath, fill(source, data));
      for (const size of SIZES) {
        const png = join(outDir, `${name}-${size.width}x${size.height}.png`);
        execFileSync('rsvg-convert', ['-w', String(size.width), '-h', String(size.height), '-o', png, svgPath], { env });
        console.log(png);
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
