const uiKit = require('../../packages/ui-kit/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');
const pictureSearch = require('../../packages/picture-search/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // sn-adapter's official tier resolves sn-plugin-lib, and its mock, from this plugin (#101).
  moduleNameMapper: {
    ...uiKit.jest.moduleNameMapper,
    ...snAdapter.jestModuleNameMapper,
    // Ink2Pic's picture search, shared for Lookup's picture buttons (#125).
    ...pictureSearch.jestModuleNameMapper,
  },
  // The shared package's own tests run in Bridge's suite (#93).
  roots: ['<rootDir>'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
