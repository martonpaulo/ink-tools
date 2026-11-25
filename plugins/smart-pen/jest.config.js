const uiKit = require('../../packages/ui-kit/plugin-config');
const inkCore = require('../../packages/ink-core/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');
const pictureSearch = require('../../packages/picture-search/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // sn-adapter's official tier resolves sn-plugin-lib, and its mock, from this plugin (#101).
  moduleNameMapper: {
    ...uiKit.jest.moduleNameMapper,
    // ink-core's page types (#109) and its conversion engine (#305); its own tests run in the
    // packages gate.
    ...inkCore.jestModuleNameMapper,
    ...snAdapter.jestModuleNameMapper,
    // picture-search's settings store, for the module switches (#305).
    ...pictureSearch.jestModuleNameMapper,
  },
  roots: ['<rootDir>'],
  // The fake tablet checks page writes with sn-plugin-lib's own TypeScript schema (#206).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|sn-plugin-lib)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
