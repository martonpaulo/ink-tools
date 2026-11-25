/** The Android tokens writer (#275), run by the Android apps' gates: `node --test android-tokens.test.cjs`. */
const assert = require('node:assert/strict');
const test = require('node:test');
const {entries, javaSource, properties, read} = require('./android-tokens.cjs');

const SAMPLE = {
  about: 'not a token',
  pxPerMm: {value: 11.8},
  mm: {titleBarHeight: {value: 14}},
  ratio: {largeFont: {value: 2}},
  colour: {context: {value: '#444444'}},
  word: {on: {value: 'ON'}},
};

test('each group gets its suffix and type', () => {
  assert.deepEqual(entries(SAMPLE), [
    {name: 'PX_PER_MM', type: 'float', value: 11.8},
    {name: 'TITLE_BAR_HEIGHT_MM', type: 'float', value: 14},
    {name: 'LARGE_FONT_RATIO', type: 'float', value: 2},
    {name: 'CONTEXT_COLOUR', type: 'int', value: '#444444'},
    {name: 'ON_TEXT', type: 'String', value: 'ON'},
  ]);
});

test('the Java class holds every token with its Java value', () => {
  const java = javaSource(SAMPLE, 'com.example');
  assert.match(java, /^package com\.example;$/m);
  assert.match(java, /static final float TITLE_BAR_HEIGHT_MM = 14f;/);
  assert.match(java, /static final int CONTEXT_COLOUR = 0xff444444;/);
  assert.match(java, /static final String ON_TEXT = "ON";/);
});

test('the properties list every token by the same name', () => {
  assert.equal(properties(SAMPLE), 'PX_PER_MM=11.8\nTITLE_BAR_HEIGHT_MM=14\nLARGE_FONT_RATIO=2\nCONTEXT_COLOUR=#444444\nON_TEXT=ON\n');
});

test('a text style resolves its font and colour', () => {
  const styled = {mm: {bodyFont: {value: 3.35}}, colour: {ink: {value: '#000000'}}, text: {rowTitle: {value: {font: 'bodyFont', colour: 'ink'}}}};
  assert.deepEqual(entries(styled).slice(2), [
    {name: 'ROW_TITLE_STYLE_FONT_MM', type: 'float', value: 3.35},
    {name: 'ROW_TITLE_STYLE_COLOUR', type: 'int', value: '#000000'},
  ]);
  assert.throws(() => entries({...styled, text: {rowTitle: {value: {font: 'nope', colour: 'ink'}}}}), /text\.rowTitle names a font/);
});

test('a short colour, a text size and an unknown group are refused', () => {
  assert.throws(() => entries({colour: {ink: {value: '#000'}}}), /colour\.ink is not a #rrggbb colour/);
  assert.throws(() => entries({mm: {space: {value: '3'}}}), /mm\.space is not a number/);
  assert.throws(() => entries({px: {space: {value: 3}}}), /unknown group "px"/);
});

test('the real tokens.json is valid', () => {
  assert.ok(entries(read()).length > 0);
});
