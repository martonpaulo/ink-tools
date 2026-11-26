const snAdapter = require('../../packages/sn-adapter/plugin-config');

module.exports = {
  preset: 'react-native',
  // The registry of internals (#294), from sn-adapter's source.
  moduleNameMapper: snAdapter.jestModuleNameMapper,
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
