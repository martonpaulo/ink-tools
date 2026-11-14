const uiKit = require('../../packages/ui-kit/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // The shared package's own tests run in Bridge's suite (#93).
  roots: ['<rootDir>'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/'],
};
