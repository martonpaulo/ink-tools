/**
 * The native module names' one golden file, `native-modules.json` (#295): the TypeScript side reads
 * it, and the Java registers each module under the same name.
 */
import path from 'path';
import nativeModules from '../native-modules.json';
const {unregisteredNames} = require('../../../packages/native-build/module-names.cjs');

test('the Java registers every module under its golden name', () => {
  const java = {
    localSend: 'native/src/com/relay/localsend/RelayModule.java',
  };
  expect(unregisteredNames(path.join(__dirname, '..'), nativeModules, java)).toEqual([]);
});
