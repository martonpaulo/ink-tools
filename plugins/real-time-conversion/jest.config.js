const uiKit = require('../../packages/ui-kit/plugin-config');
const inkCore = require('../../packages/ink-core/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // sn-adapter's official tier resolves sn-plugin-lib, and its mock, from this plugin (#101).
  moduleNameMapper: {
    ...uiKit.jest.moduleNameMapper,
    // ink-core's page types (#109); its own tests run in the packages gate.
    ...inkCore.jestModuleNameMapper,
    ...snAdapter.jestModuleNameMapper,
  },
  roots: ['<rootDir>'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
