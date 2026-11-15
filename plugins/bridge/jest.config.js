const path = require('path');
const uiKit = require('../../packages/ui-kit/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');

/** sync-core's source, read as tsconfig.json maps it (#40, #101). */
const SYNC_CORE = path.join(__dirname, '../../packages/sync-core/src');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // sn-adapter's official tier resolves sn-plugin-lib, and its mock, from this plugin (#101).
  moduleNameMapper: {
    ...uiKit.jest.moduleNameMapper,
    ...snAdapter.jestModuleNameMapper,
    // sync-core's status rules, which the probe switch test drives (#101), and its Settings
    // rules by subpath (#40).
    '^@supernote-tools/sync-core$': SYNC_CORE,
    '^@supernote-tools/sync-core/(.*)$': path.join(SYNC_CORE, '$1'),
  },
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
