// Tests for the cover template filler (#100). Run: node --test design/covers/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fill } from './render.mjs';

const data = {
  name: 'Lookup',
  tagline: 'A & B',
  features: [{ icon: 'text', label: 'One\nTwo' }],
};

test('writes the name in capitals and escapes text', () => {
  assert.equal(fill('{{NAME}} {{tagline}}', data), 'LOOKUP A &amp; B');
});

test('splits a label into one tspan per line', () => {
  assert.equal(
    fill('{{lines:features.0.label:10:20:30}}', data),
    '<tspan x="10" y="20">One</tspan><tspan x="10" dy="30">Two</tspan>',
  );
});

test('drops the slot of a missing feature and keeps a present one', () => {
  const template = '<!--slot:features.0-->[{{features.0.label}}]<!--/slot--><!--slot:features.1-->[x]<!--/slot-->';
  assert.equal(fill(template, data), '[One\nTwo]');
});

test('fails on a missing value instead of leaving it blank', () => {
  assert.throws(() => fill('{{panels.0.caption}}', data), /missing value «panels.0.caption»/);
});

test('every plugin fills every template with no missing value or file', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const here = new URL('.', import.meta.url).pathname;
  const templates = readdirSync(here).filter((f) => /^template-\w+\.svg$/.test(f));
  const plugins = readdirSync(`${here}plugins`).filter((f) => f.endsWith('.json'));
  assert.ok(templates.length > 0 && plugins.length > 1);
  for (const t of templates) {
    for (const p of plugins) {
      const svg = fill(readFileSync(`${here}${t}`, 'utf8'), JSON.parse(readFileSync(`${here}plugins/${p}`, 'utf8')));
      assert.doesNotMatch(svg, /\{\{/, `${p} in ${t}`);
    }
  }
});
