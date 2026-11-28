/** The nonogram in the Puzzles view (#384): a size and a band, «Check» of the shaded cells and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {generateNonogram, layoutNonogramPage, nonogramFromCode, puzzleCode, withPageLayout, type Grid, type InkStroke} from '@ink-tools/puzzle-core';
import {GAMES} from '../src/games';
import {NONOGRAM, nonogramCopy} from '../src/games/nonogram';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const PUZZLE = generateNonogram(SEED, {width: 5, height: 5}, 'easy');
const CODE = puzzleCode(PUZZLE.id);
const GRID = layoutNonogramPage(PUZZLE, {orientation: HERE.orientation, hand: 'right'}).grid;
const FILLED = PUZZLE.solution.flatMap((filled, cell) => (filled ? [cell] : []));
const EMPTY = PUZZLE.solution.flatMap((filled, cell) => (filled ? [] : [cell]));

/** Each cell shaded as a hand shades it: close strokes across the cell, top to bottom. */
const shaded = (grid: Grid, cells: readonly number[]): InkStroke<object>[] =>
  cells.map(cell => {
    const [x, y] = [grid.x + (cell % grid.columns) * grid.cell, grid.y + Math.floor(cell / grid.columns) * grid.cell];
    const rows = Array.from({length: 8}, (_, i) => y + grid.cell * (0.12 + i * 0.11));
    const points = rows.flatMap((row, i) => (i % 2 ? [{x: x + grid.cell * 0.88, y: row}, {x: x + grid.cell * 0.12, y: row}] : [{x: x + grid.cell * 0.12, y: row}, {x: x + grid.cell * 0.88, y: row}]));
    return {points, element: {}};
  });

/** Each run of filled cells of a row shaded with one zigzag stroke, six passes a cell, as a hand shades a run. */
const shadedRuns = (grid: Grid, filled: readonly number[]): InkStroke<object>[] => {
  const runs: number[][] = [];
  for (const cell of filled) {
    const last = runs[runs.length - 1];
    if (last && cell === last[last.length - 1] + 1 && cell % grid.columns !== 0) {
      last.push(cell);
    } else {
      runs.push([cell]);
    }
  }
  return runs.map(run => {
    const [x, y] = [grid.x + (run[0] % grid.columns) * grid.cell, grid.y + Math.floor(run[0] / grid.columns) * grid.cell];
    const passes = 6 * run.length;
    const points = Array.from({length: passes + 1}, (_, i) => ({x: x + grid.cell * (0.1 + ((run.length - 0.2) * i) / passes), y: y + grid.cell * (i % 2 ? 0.9 : 0.1)}));
    return {points, element: {}};
  });
};

describe('the nonogram game (#384)', () => {
  test('is in the game list, after bridges and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('nonogram')).toBe(ids.indexOf('bridges') + 1);
  });

  test('its page fits either orientation and hand at every size and band', () => {
    const misfits: string[] = [];
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        for (const size of NONOGRAM.options[0].choices as readonly {value: string}[]) {
          for (const band of ['easy', 'medium', 'hard']) {
            try {
              NONOGRAM.create({size: size.value, band}, SEED, {orientation, hand});
            } catch (error) {
              misfits.push(`${size.value} ${band} ${orientation} ${hand}: ${(error as Error).message}`);
            }
          }
        }
      }
    }
    expect(misfits).toEqual([]);
  });

  test('«Add Page» puts the picture of the size and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(NONOGRAM, fake.pages);
    await press(tree, `${playCopy.size}: ${playCopy.sizeLabel(15)}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    const code = puzzleCode(generateNonogram(SEED, {width: 15, height: 15}, 'hard').id);
    await expectAdded(tree, fake, NONOGRAM, code, {size: '15', band: 'hard'});
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(NONOGRAM, fakePages({code: 'BR-7X7-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](nonogramCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one cell shaded off the picture, and the picture shaded alone is solved', async () => {
    expect(nonogramFromCode(CODE)).toEqual(PUZZLE);
    const tree = await mount(NONOGRAM, fakePages({code: CODE, ink: shaded(GRID, [...FILLED, EMPTY[0]])}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.wrong'](1));
    await expectSolved(NONOGRAM, CODE, shaded(GRID, FILLED));
  });

  test('each run shaded with one stroke, as a hand shades it, is solved', async () => {
    await expectSolved(NONOGRAM, CODE, shadedRuns(GRID, FILLED));
  });

  test('a cell it cannot read says how to mark one', async () => {
    const slash = (cell: number) => {
      const [x, y] = [GRID.x + (cell % GRID.columns) * GRID.cell, GRID.y + Math.floor(cell / GRID.columns) * GRID.cell];
      return {points: [{x: x + GRID.cell * 0.2, y: y + GRID.cell * 0.8}, {x: x + GRID.cell * 0.8, y: y + GRID.cell * 0.2}], element: {}};
    };
    const tree = await mount(NONOGRAM, fakePages({code: CODE, ink: [...shaded(GRID, FILLED.slice(1)), slash(FILLED[0])]}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.open']} ${playCopy['verdict.unreadMark'](1)}`);
  });

  test('part of the picture shaded is nothing wrong so far, never solved', async () => {
    const tree = await mount(NONOGRAM, fakePages({code: CODE, ink: shaded(GRID, FILLED.slice(1))}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(NONOGRAM, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });

  test('a page printed before the page bar margin is checked in the grid it printed (#553)', async () => {
    // NO-15X15-H-7Z9GEKG7 was printed in shift 5, its name with no layout mark: its grid lies 23 px
    // lower than the current layout puts it, so read there, its shading was all «unread».
    const OLD = 'NO-15X15-H-7Z9GEKG7';
    const old = nonogramFromCode(OLD);
    const printed = withPageLayout(1, () => layoutNonogramPage(old, {orientation: HERE.orientation, hand: 'right'})).grid;
    const ink = shaded(printed, old.solution.flatMap((filled, cell) => (filled ? [cell] : [])));
    const tree = await mount(NONOGRAM, fakePages({code: OLD, layout: 1, ink}).pages);
    expect(shownTexts(tree.root)).toContain(OLD);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.solved']);
    // The same ink on a page of the current layout is off its cells.
    const now = await mount(NONOGRAM, fakePages({code: OLD, ink}).pages);
    await press(now, playCopy['here.check']);
    expect(shownTexts(now.root)).not.toContain(playCopy['verdict.solved']);
  });
});
