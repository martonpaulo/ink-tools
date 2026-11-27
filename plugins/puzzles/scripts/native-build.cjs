#!/usr/bin/env node
/**
 * Puzzles' native code (#453): sn-adapter's Back key module as `PuzzlesBack`, compiled with the
 * plugin's own `native/` by the shared light native build (packages/native-build/native-build.cjs,
 * #231), which documents the commands.
 */
const path = require('node:path');
const {defineBuild} = require('../../../packages/native-build/native-build.cjs');
const {nativeSources: adapterSources} = require('../../../packages/sn-adapter/plugin-config');

const root = path.resolve(__dirname, '..');
const build = {
  root,
  hostTools: require('./host-tools.cjs'),
  packageClass: 'com.puzzles.view.PuzzlesPackage',
  sources: [path.join(root, 'native'), adapterSources],
};

module.exports = defineBuild(build, require.main === module);
