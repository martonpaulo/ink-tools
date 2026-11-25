// ui-kit is React Native code: its tests run in Bridge's suite, which has React Native (#93).
const snAdapter = require('./sn-adapter/plugin-config');

module.exports = {
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/ui-kit/'],
  // The SDK and the native module registry are not installed here: the packages' own tests call
  // the official tier and the device tier against these stand-ins (#142). tsconfig.base.json maps
  // the same names for the type check.
  moduleNameMapper: {
    '^sn-plugin-lib$': snAdapter.jestSdkMock,
    '^react-native$': '<rootDir>/sn-adapter/testing/react-native.ts',
  },
};
