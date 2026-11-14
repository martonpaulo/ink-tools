const uiKit = require('../../packages/ui-kit/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
