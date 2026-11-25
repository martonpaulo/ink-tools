/**
 * The TypeScript side of the rules both languages hold (#100), against native/twins.json (#125),
 * which native-tests/com/inktools/files/TwinsTest.java reads too; dry-check.json's `twins` names
 * each rule's owner. The Measures contract is written four times (the Java module's map, the
 * `ThumbMeasures` fields, the `Measures` type, the PluginHost simulator's fake): every copy is
 * checked here or in TwinsTest, so a field added on one side only fails; the simulator's fake
 * has no check since the retired picture plugin's twins test went (#288, #302).
 */
import fs from 'node:fs';
import path from 'node:path';
import {MEASURE_WIDTH} from '../src/insert';
import {CLEAN_BORDER, Measures} from '../src/measures';

const ROOT = path.join(__dirname, '..');
const golden = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'native/twins.json'), 'utf8'),
) as {cleanBorder: number; measureWidth: number; measures: string[]};

/** Every key of `Measures`: the type check fails when the type gains or loses one. */
const TS_FIELDS: Record<keyof Measures, true> = {
  width: true,
  height: true,
  mean: true,
  dark: true,
  white: true,
  mid: true,
  border: true,
  borderMedian: true,
  ink: true,
  inkLeft: true,
  inkTop: true,
  inkWidth: true,
  inkHeight: true,
  bands: true,
  lineAspect: true,
  thickness: true,
  edge: true,
  edgeBox: true,
  colours: true,
  shading: true,
  objectShare: true,
  hash: true,
  fragments: true,
  darkest: true,
  faintLines: true,
  ms: true,
};

const sorted = (keys: Iterable<string>) => [...keys].sort();

/** The keys `Ink2PicImageModule.measureThumb` puts in the map it answers. */
function moduleKeys(): string[] {
  const java = fs.readFileSync(
    path.join(ROOT, 'native/com/inktools/files/Ink2PicImageModule.java'),
    'utf8',
  );
  const start = java.indexOf('public void measureThumb(');
  const end = java.indexOf('@ReactMethod', start);
  const body = java.slice(start, end < 0 ? undefined : end);
  return [...body.matchAll(/\.put\w+\("(\w+)"/g)].map(match => match[1]);
}


describe('the rules the Java and the TypeScript share (#100)', () => {
  it('reads the same clean border and measure width', () => {
    expect(CLEAN_BORDER).toBe(golden.cleanBorder);
    expect(MEASURE_WIDTH).toBe(golden.measureWidth);
  });

  it('has one Measures field list in the type and the Java module', () => {
    expect(sorted(Object.keys(TS_FIELDS))).toEqual(sorted(golden.measures));
    expect(moduleKeys().length).toBeGreaterThan(0);
    expect(sorted(moduleKeys())).toEqual(sorted(golden.measures));
  });
});
