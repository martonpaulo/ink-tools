const uiKit = require('../../packages/ui-kit/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  moduleNameMapper: {
    // The shared Settings look, Needs, Error and Close (#257); its own tests run in the Account Sync gate.
    ...uiKit.jest.moduleNameMapper,
    // The registry of internals (#294) and the action channel (#283), from sn-adapter's source.
    ...snAdapter.jestModuleNameMapper,
  },
  roots: ['<rootDir>'],
  // sn-adapter's TypeScript resolves Babel's runtime from this plugin's node_modules.
  modulePaths: ['<rootDir>/node_modules'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
