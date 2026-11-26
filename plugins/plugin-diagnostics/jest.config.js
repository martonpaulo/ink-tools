const snAdapter = require('../../packages/sn-adapter/plugin-config');

module.exports = {
  preset: 'react-native',
  // The registry of internals (#294) and the action channel (#283), from sn-adapter's source.
  moduleNameMapper: snAdapter.jestModuleNameMapper,
  // sn-adapter's TypeScript resolves Babel's runtime from this plugin's node_modules.
  modulePaths: ['<rootDir>/node_modules'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
