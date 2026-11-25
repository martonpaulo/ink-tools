import {existsSync, readFileSync} from 'fs';
import {join} from 'path';
import {Image} from 'react-native';
import {ok} from '@ink-tools/sn-adapter/official';
import {
  BUTTONS,
  ButtonDeps,
  resetButtonsForTests,
  syncButtons,
} from '../src/buttons';
import {ICONS} from '../src/icons';
import {defaultSettings} from '../src/settings';

const assets = join(__dirname, '..', 'assets');

// A PNG keeps its width and height as big-endian integers at bytes 16 and 20 (the IHDR chunk).
function pngSize(file: string): {width: number; height: number} {
  const bytes = readFileSync(join(assets, file));
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

describe('lasso button icons (#107)', () => {
  it.each(BUTTONS.map(button => [button.name, button.icon]))(
    '%s names an icon file, its SVG source and a bundled 96 x 96 PNG',
    (_name, icon) => {
      expect(existsSync(join(assets, icon))).toBe(true);
      expect(existsSync(join(assets, icon.replace(/\.png$/, '.svg')))).toBe(
        true,
      );
      expect(Object.keys(ICONS)).toContain(icon);
      expect(pngSize(icon)).toEqual({width: 96, height: 96});
    },
  );

  it('gives every button its own icon, by name and by content', () => {
    const icons = BUTTONS.map(button => button.icon);
    expect(new Set(icons).size).toBe(BUTTONS.length);
    const contents = icons.map(file =>
      readFileSync(join(assets, file)).toString('base64'),
    );
    expect(new Set(contents).size).toBe(BUTTONS.length);
  });

  it('registers each switched-on button with its own icon URI', async () => {
    resetButtonsForTests();
    // Jest's asset transform gives `{testUri}`; the device's resolver gives the bundled file's URI.
    const resolve = jest
      .spyOn(Image, 'resolveAssetSource')
      .mockImplementation(source => ({
        uri: `asset://${(source as unknown as {testUri: string}).testUri}`,
        width: 96,
        height: 96,
        scale: 1,
      }));
    const deps = {
      register: jest.fn(async () => ok(true as const)),
      unregister: jest.fn(async () => ok(true as const)),
      hasPermission: jest.fn(async () => ok(true)),
      requestPermission: jest.fn(async () => ok(2)),
      log: () => {},
    } satisfies ButtonDeps;
    await syncButtons(defaultSettings, deps);
    expect(deps.register).toHaveBeenCalled();
    for (const call of deps.register.mock.calls) {
      const config = (
        call as unknown as [number, string[], {id: number; icon?: string}]
      )[2];
      const button = BUTTONS.find(each => each.id === config.id);
      expect(config.icon).toBe(`asset://../../../assets/${button?.icon}`);
    }
    resolve.mockRestore();
    resetButtonsForTests();
  });
});
