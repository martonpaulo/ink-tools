/**
 * The screen-layout render rules (owner, 2026-11-28): a list never ends inside a row and never
 * scrolls its rows (#548), no fixed control lies over a row (#578), an image sits centred in its
 * frame and none is sized by aspectRatio (#576), a choice row's radio ends at its list's end
 * (#546), and no text falls under the contrast floor (#575). Fixtures in layout units, so each rule
 * is shown to fail on the break it names and to pass the shape that keeps it.
 */
import {layoutBreaks, Measured} from '../renders/rules';

const LIMITS = {textContrast: 7};
const box = (left: number, top: number, right: number, bottom: number) => ({left, top, right, bottom});
const page = (extra: Partial<Measured>): Measured => ({
  screen: box(0, 0, 1000, 1400),
  targets: [],
  texts: [],
  scrolls: [],
  bars: [],
  rows: [],
  captions: [],
  radioLists: [],
  ...extra,
});
const target = (name: string, b: ReturnType<typeof box>, extra: object = {}) => ({
  name,
  width: b.right - b.left,
  height: b.bottom - b.top,
  box: b,
  ...extra,
});

describe('layoutBreaks', () => {
  it('passes whole rows, a button under them, a centred picture, a radio at its end and dark text', () => {
    expect(
      layoutBreaks(
        page({
          rows: [{name: 'Sudoku', box: box(27, 100, 973, 186), clip: box(0, 60, 1000, 1200)}],
          targets: [target('Add Page', box(27, 1210, 200, 1280))],
          media: [{name: 'grid', box: box(100, 300, 900, 1100), frame: box(0, 200, 1000, 1200)}],
          rings: [{name: '9 x 9', box: box(900, 120, 931, 151), list: box(27, 100, 931, 400)}],
          texts: [{name: 'a', text: 'Sudoku', fontSize: 21, glyphs: box(27, 110, 200, 140), within: [], contrast: 21}],
        }),
        LIMITS,
      ),
    ).toEqual([]);
  });

  it('fails a list that ends inside a row (#548)', () => {
    expect(
      layoutBreaks(page({rows: [{name: 'Difficulty: Hard', box: box(27, 1150, 973, 1236), clip: box(0, 60, 1000, 1200)}]}), LIMITS),
    ).toEqual(["list ends inside row «Difficulty: Hard»: page the list with ui-kit's PagedList (#548)"]);
  });

  it('fails rows that scroll past their view, and passes a scroll view with none (#548)', () => {
    expect(layoutBreaks(page({scrolled: [{name: 'scroll view «Games»', rows: 16}, {name: 'scroll view «log»', rows: 0}]}), LIMITS)).toEqual([
      "scroll view «Games» scrolls past its end, holding 16 rows: page them with ui-kit's PagedList or PagedColumn (#548)",
    ]);
  });

  it('fails a fixed control over a row, and passes the row itself and a button in it (#578)', () => {
    const row = box(27, 1150, 973, 1236);
    expect(
      layoutBreaks(
        page({
          rows: [{name: 'Medium', box: row}],
          targets: [
            target('Add Page', box(27, 1200, 200, 1270)),
            target('Medium', row, {kind: 'list-row'}),
            target('Check', box(800, 1160, 960, 1226), {inRow: true}),
          ],
        }),
        LIMITS,
      ),
    ).toEqual(["«Add Page» lies over row «Medium»: keep fixed controls under the list (#578)"]);
  });

  it('fails an image off-centre in its frame and one sized by aspectRatio (#576)', () => {
    expect(
      layoutBreaks(
        page({
          media: [{name: 'grid', box: box(0, 200, 800, 1000), frame: box(0, 200, 1000, 1000)}],
          looseImages: [{name: 'Solution', box: box(0, 200, 800, 1000)}],
        }),
        LIMITS,
      ),
    ).toEqual([
      'image «grid» sits off-centre in its frame, 200 across and 0 down (#576)',
      "image «Solution» sizes its box by aspectRatio, which the device lays out at the leading edge: show it in ui-kit's MediaFrame (#576)",
    ]);
  });

  it('fails a radio that ends before its list ends (#546)', () => {
    expect(
      layoutBreaks(page({rings: [{name: '6 x 6', box: box(868, 120, 899, 151), list: box(27, 100, 931, 400)}]}), LIMITS),
    ).toEqual(['radio of «6 x 6» ends 32 units before its list\'s end (#546)']);
  });

  it('fails a text under the contrast floor and passes a disabled one, which has no contrast (#575)', () => {
    expect(
      layoutBreaks(
        page({
          texts: [
            {name: 'a', text: 'Faded option', fontSize: 19, glyphs: box(27, 110, 200, 140), within: [], contrast: 4.48},
            {name: 'b', text: 'Disabled', fontSize: 19, glyphs: box(27, 150, 200, 180), within: []},
          ],
        }),
        LIMITS,
      ),
    ).toEqual(['text «Faded option» is 4.48:1, under the floor 7:1 (#575)']);
  });
});
