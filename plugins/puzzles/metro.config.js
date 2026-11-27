const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro (https://reactnative.dev/docs/metro) bundles the shared packages from their own folders:
 * ui-kit, sn-adapter, and puzzle-core, where the games live (#93, #453).
 */
const [uiKit, snAdapter, puzzleCore] = ['ui-kit', 'sn-adapter', 'puzzle-core'].map(name =>
  require(`../../packages/${name}/plugin-config`),
);

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  puzzleCore.metro(snAdapter.metro(uiKit.metro(__dirname))),
  {resolver: {useWatchman: !process.env.CI}},
);
