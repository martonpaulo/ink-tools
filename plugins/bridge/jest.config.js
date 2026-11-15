const path = require('path');
const uiKit = require('../../packages/ui-kit/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // sn-adapter's official tier resolves sn-plugin-lib, and its mock, from this plugin (#101).
  moduleNameMapper: {
    ...uiKit.jest.moduleNameMapper,
    ...snAdapter.jestModuleNameMapper,
    // sync-core's status rules, which the probe switch test drives (#101).
    '^@supernote-tools/sync-core$': path.join(
      __dirname,
      '../../packages/sync-core/src',
    ),
  },
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
