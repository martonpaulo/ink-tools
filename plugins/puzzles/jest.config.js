const uiKit = require('../../packages/ui-kit/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');
const puzzleCore = require('../../packages/puzzle-core/plugin-config');
const inkCore = require('../../packages/ink-core/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // sn-adapter's official tier resolves sn-plugin-lib, and its mock, from this plugin (#101); the
  // games come from puzzle-core, whose own tests run in the packages gate (#453).
  moduleNameMapper: {
    ...uiKit.jest.moduleNameMapper,
    ...snAdapter.jestModuleNameMapper,
    ...puzzleCore.jestModuleNameMapper,
    // ink-core's language registry, which the games fold letters through (#500).
    ...inkCore.jestModuleNameMapper,
  },
  roots: ['<rootDir>'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|sn-plugin-lib)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
