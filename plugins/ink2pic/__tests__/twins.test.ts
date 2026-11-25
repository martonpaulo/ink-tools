/**
 * The PluginHost simulator's side of the Measures contract (#100): its fake `measureThumb` answers
 * the fields of packages/picture-search/native/twins.json (#125). The Java module's map and the
 * `Measures` type are checked against the same file in the packages gate,
 * packages/picture-search/__tests__/twins.test.ts (#142, D63 A).
 */
import fs from 'node:fs';
import path from 'node:path';
import {NativeModules} from 'react-native';
import * as sdk from 'sn-plugin-lib';
import {createHost, SHARED_ROOT} from './host/pluginHost';

const ROOT = path.join(__dirname, '..');
const golden = JSON.parse(
  fs.readFileSync(path.join(ROOT, '../../packages/picture-search/native/twins.json'), 'utf8'),
) as {measures: string[]};

/** Absent from an older module and from the simulator, which hashes nothing. */
const OPTIONAL = ['hash'];

const sorted = (keys: Iterable<string>) => [...keys].sort();

describe('the simulator answers the Measures fields the Java module does (#100)', () => {
  it('has the field list of twins.json', async () => {
    const host = createHost().install(
      sdk as unknown as Record<string, Record<string, unknown>>,
      NativeModules,
    );
    host.grantDeclared();
    const files = NativeModules.Ink2PicFiles;
    const file = `${SHARED_ROOT}/MyStyle/a.png`;
    await files.downloadToFile('https://example.org/a.png', file, {});
    const fake = await NativeModules.Ink2PicImage.measureThumb(file);
    expect(sorted(Object.keys(fake))).toEqual(
      sorted(golden.measures.filter(key => !OPTIONAL.includes(key))),
    );
  });
});
