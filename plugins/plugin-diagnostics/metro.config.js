const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * sn-adapter resolves from its folder, for the registry of internals (#294) and the action channel (#283).
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    resolver: {
        useWatchman: !process.env.CI,
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), snAdapter.metro({}), config);
