const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const uiKit = require('../../packages/ui-kit/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');
const pictureSearch = require('../../packages/picture-search/plugin-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    useWatchman: !process.env.CI,
  },
};

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  pictureSearch.metro(snAdapter.metro(uiKit.metro(__dirname))),
  config,
);
