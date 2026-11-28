import { binairoFromCode, bridgesFromCode, digest, kakuroFromCode, slitherlinkFromCode, starBattleFromCode } from '../src';

/**
 * Page codes made before a game's generation changed keep their puzzle (#561). The seed banks of
 * #552 (a2c78677 for kakuro, slitherlink and Bridges, 531bde0f for binairo and star battle) changed
 * which puzzle a new page gets, so each value below is the digest the code decoded to at a2c78677^,
 * before either bank: a page already in a note must still check against the puzzle it printed.
 * The codes are banked sizes and bands, one live seed and one bank seed (B0) each, since only a
 * bank entry could answer a code differently. Hitori had no page codes before its bank.
 *
 * A changed value here is never updated to the new digest: give the new generation a mark in the
 * code and keep the old codes drawing as before, as `nonogramFromCode` reads `V2` (#384).
 */
const OLDER: readonly [string, (code: string) => unknown, string][] = [
  ['KK-6-H-7K2Q9X', kakuroFromCode, 'f1e81c14'],
  ['KK-12-H-7K2Q9X', kakuroFromCode, 'a01918b8'],
  ['KK-6-H-B0', kakuroFromCode, '78a5f5d5'],
  ['SL-7X7-H-7K2Q9X', slitherlinkFromCode, '7b4c1407'],
  ['SL-7X7-H-B0', slitherlinkFromCode, '347fadc3'],
  ['BR-7X7-H-7K2Q9X', bridgesFromCode, '0a02d242'],
  ['BR-7X7-H-B0', bridgesFromCode, '4f0cc908'],
  ['BI-6-H-7K2Q9X', binairoFromCode, 'c841654c'],
  ['BI-12-H-7K2Q9X', binairoFromCode, '709ed119'],
  ['BI-6-H-B0', binairoFromCode, '3df95b7d'],
  ['SB-5S1-H-7K2Q9X', starBattleFromCode, 'f30e7faa'],
  ['SB-8S2-M-7K2Q9X', starBattleFromCode, '6dc0e81a'],
  ['SB-5S1-H-B0', starBattleFromCode, '07545bfe'],
];

describe('a page code made before a generation change keeps its puzzle (#561)', () => {
  test.each(OLDER)('%s', (code, read, expected) => {
    expect(digest(read(code))).toBe(expected);
  });
});
