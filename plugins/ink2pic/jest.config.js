const uiKit = require('../../packages/ui-kit/plugin-config');
const inkCore = require('../../packages/ink-core/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // The shared package's own tests run in Bridge's suite (#93).
  roots: ['<rootDir>'],
  // ink-core's own tests run in the packages gate (#109).
  // sn-adapter's official tier is tested here, where sn-plugin-lib and its mock live (#101).
  moduleNameMapper: {
    ...uiKit.jest.moduleNameMapper,
    ...inkCore.jestModuleNameMapper,
    ...snAdapter.jestModuleNameMapper,
  },
  // A test fails on a console.error it did not expect (#112).
  setupFilesAfterEnv: ['<rootDir>/__tests__/host/consoleSetup.ts'],
  // Lane worktrees live under .claude/worktrees; their tests run in their own checkout. The search
  // lab (lab/, #63) runs on its own against the live sources, never in the gate.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.claude/',
    '<rootDir>/.scratch/',
    '<rootDir>/lab/',
    // The PluginHost simulator and its helpers: modules the tests import, not tests (#78).
    '<rootDir>/__tests__/host/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.claude/',
    '<rootDir>/.scratch/',
    '<rootDir>/lab/',
  ],
};
