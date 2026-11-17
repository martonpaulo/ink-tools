const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');
const uiKit = require('../../packages/ui-kit/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');

/** sync-core's source, so `@supernote-tools/sync-core/settings` bundles that one file (#40). */
const SYNC_CORE = path.join(__dirname, '../../packages/sync-core/src');

/** ui-kit and sn-adapter; mergeConfig replaces watchFolders and extraNodeModules, so join here. */
const shared = snAdapter.metro(uiKit.metro(__dirname));

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [...shared.watchFolders, SYNC_CORE],
  resolver: {
    useWatchman: !process.env.CI,
    extraNodeModules: {
      ...shared.resolver.extraNodeModules,
      '@supernote-tools/sync-core': SYNC_CORE,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), shared, config);
