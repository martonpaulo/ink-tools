const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro (https://reactnative.dev/docs/metro) bundles the shared packages from their own folders:
 * ui-kit, sn-adapter, puzzle-core, where the games live (#93, #453), and ink-core, whose language
 * registry the games fold letters through (#500).
 */
const [uiKit, snAdapter, puzzleCore, inkCore] = ['ui-kit', 'sn-adapter', 'puzzle-core', 'ink-core'].map(name =>
  require(`../../packages/${name}/plugin-config`),
);

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  inkCore.metro(puzzleCore.metro(snAdapter.metro(uiKit.metro(__dirname)))),
  {resolver: {useWatchman: !process.env.CI}},
);
