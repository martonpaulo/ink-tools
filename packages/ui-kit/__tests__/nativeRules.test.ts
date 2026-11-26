/**
 * The native Settings render rules (#411): one button hierarchy, the screen's actions in one place,
 * text only at a native role's size, list rows at the native height and inset. Fixtures in layout
 * units, so each rule is shown to fail on the break it names.
 */
import {Measured, Native, nativeBreaks} from '../renders/rules';

const SCREEN = {left: 0, top: 0, right: 1000, bottom: 1400};
const NATIVE: Native = {textSizes: [19, 21], rowHeight: 86, screenPadding: 27, actionSpread: 86};
const box = (left: number, top: number, right: number, bottom: number) => ({left, top, right, bottom});
const target = (name: string, kind: string, b: ReturnType<typeof box>, inRow = false) => ({
  name,
  kind,
  inRow,
  width: b.right - b.left,
  height: b.bottom - b.top,
  box: b,
});
const page = (extra: Partial<Measured>): Measured => ({
  screen: SCREEN,
  targets: [],
  texts: [],
  scrolls: [],
  bars: [],
  rows: [],
  captions: [],
  ...extra,
});

describe('nativeBreaks (#411)', () => {
  it('passes a row action in its row, a destructive button across the width and one screen action', () => {
    expect(
      nativeBreaks(
        page({
          targets: [
            target('Sign out', 'button-row', box(830, 200, 973, 270), true),
            target('Uninstall', 'button-destructive', box(27, 1200, 973, 1280)),
          ],
          rows: [{name: 'Todoist account', box: box(27, 190, 973, 276)}],
          texts: [{name: 'a', text: 'Todoist account', fontSize: 21, glyphs: box(27, 200, 200, 230), within: []}],
        }),
        NATIVE,
      ),
    ).toEqual([]);
  });

  it('fails a full-width button that is no destructive one, and a button kind in the wrong place', () => {
    expect(
      nativeBreaks(
        page({
          targets: [
            target('Sign out', 'button-secondary', box(27, 200, 973, 270)),
            target('Remove', 'button-row', box(800, 400, 973, 470)),
            target('Add', 'button-secondary', box(800, 500, 973, 570), true),
          ],
        }),
        NATIVE,
      ),
    ).toEqual([
      'button «Sign out» spans the width: only a destructive button does; a row\'s action is an ActionRow',
      'row action «Remove» stands outside a list row',
      'button «Add» sits in a list row: a row\'s action is kind «row»',
    ]);
  });

  it('fails two screen-level actions far apart', () => {
    expect(
      nativeBreaks(
        page({
          targets: [
            target('Sync now', 'bar-action', box(800, 0, 1000, 70)),
            target('Start', 'button-primary', box(27, 900, 200, 970)),
          ],
        }),
        NATIVE,
      ),
    ).toEqual(['screen actions «Sync now» and «Start» stand apart: put them in one place']);
  });

  it('fails a text size no native role has, and a row off the native height or inset', () => {
    expect(
      nativeBreaks(
        page({
          texts: [{name: 'a', text: 'Last synced', fontSize: 17, glyphs: box(27, 0, 100, 20), within: []}],
          rows: [
            {name: 'Short', box: box(27, 100, 973, 150)},
            {name: 'Inset', box: box(40, 200, 973, 300)},
          ],
        }),
        NATIVE,
      ),
    ).toEqual([
      'text «Last synced» is 17 units, no native text role (19.0, 21.0)',
      'row «Short» is under the native row height 86',
      'row «Inset» starts off the native inset 27',
    ]);
  });

  describe('the first caption under the title bar (#416)', () => {
    const bar = {name: 'the title bar', box: box(0, 0, 1000, 80)};
    const caption = (top: number) => ({name: 'Modules', box: box(27, top, 973, top + 60)});
    const row = {name: 'Lookup', box: box(27, 170, 973, 256)};

    it('passes a first caption whose box starts at the bar', () => {
      expect(nativeBreaks(page({bars: [bar], captions: [caption(80)], rows: [row]}), NATIVE)).toEqual([]);
    });

    it('fails a first caption a section gap below the bar', () => {
      expect(nativeBreaks(page({bars: [bar], captions: [caption(98)], rows: [row]}), NATIVE)).toEqual([
        "caption «Modules» starts 18 units off the title bar's bottom: its box starts at the bar",
      ]);
    });

    it('passes a caption under a plain line, which keeps its gap', () => {
      const status = {name: 's', text: 'Loading…', fontSize: 19, glyphs: box(27, 98, 300, 120), within: []};
      expect(nativeBreaks(page({bars: [bar], captions: [caption(140)], texts: [status]}), NATIVE)).toEqual([]);
    });
  });
});
