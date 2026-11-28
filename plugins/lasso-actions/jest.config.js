const uiKit = require('../../packages/ui-kit/plugin-config');
const inkCore = require('../../packages/ink-core/plugin-config');
const snAdapter = require('../../packages/sn-adapter/plugin-config');
const pictureSearch = require('../../packages/picture-search/plugin-config');
const packStore = require('../../packages/pack-store/plugin-config');

module.exports = {
  preset: 'react-native',
  ...uiKit.jest,
  // sn-adapter's official tier resolves sn-plugin-lib, and its mock, from this plugin (#101).
  moduleNameMapper: {
    ...uiKit.jest.moduleNameMapper,
    // ink-core's dictionary, lasso and placement (#115).
    ...inkCore.jestModuleNameMapper,
    // The CC-CEDICT pinyin index, «Insert translation»'s ZH input (#129, #158).
    ...inkCore.jestPinyinDataMapper,
    ...snAdapter.jestModuleNameMapper,
    // The shared picture search, for Lookup's picture buttons (#125).
    ...pictureSearch.jestModuleNameMapper,
    // The shared language pack store, which this plugin downloads into (#503).
    ...packStore.jestModuleNameMapper,
  },
  // The shared package's own tests run in Bridge's suite (#93).
  roots: ['<rootDir>'],
  // The search lab (lab/, #63) runs on its own against the live sources, never in the gate; the
  // tests of its own logic do (#288).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.scratch/', '<rootDir>/lab/'],
  modulePathIgnorePatterns: ['<rootDir>/.scratch/', '<rootDir>/lab/'],
};
