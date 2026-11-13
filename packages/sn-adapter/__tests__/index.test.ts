import {PACKAGE_NAME} from '../src';

test('the package loads under its own name', () => {
  expect(PACKAGE_NAME).toBe('sn-adapter');
});
