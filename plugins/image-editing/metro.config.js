const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const uiKit = require('../../packages/ui-kit/plugin-config');
const inkCore = require('../../packages/ink-core/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');

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
  snAdapter.metro(inkCore.metro(uiKit.metro(__dirname))),
  config,
);
