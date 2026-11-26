/**
 * Test support for the Back key (#204): catches the handlers a view registers and presses the key
 * as React Native does, newest handler first, until one answers true. Kept out of the entry, so
 * out of the bundle, as `screenBreaks` is.
 */
import {BackHandler, NativeModules} from 'react-native';

type Handler = () => boolean | null | undefined;

export function catchBackKey() {
  const handlers: Handler[] = [];
  const spy = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      handlers.push(handler);
      return {
        remove: () => {
          handlers.splice(handlers.indexOf(handler), 1);
        },
      };
    });
  return {
    /** Whether a handler took the key; false is the host's own default. */
    press: (): boolean =>
      [...handlers].reverse().some(handler => handler() === true),
    count: () => handlers.length,
    restore: () => spy.mockRestore(),
  };
}

/**
 * A fake of sn-adapter's native Back key module registered as `name` (#300): `listen` records each
 * root tag a view arms it on; `restore` takes the fake away.
 */
export function fakeBackKeyModule(name: string) {
  const listen = jest.fn(async (_rootTag: number) => true);
  const modules = NativeModules as Record<string, unknown>;
  modules[name] = {listenBackKey: listen};
  return {
    listen,
    restore: () => {
      delete modules[name];
    },
  };
}
