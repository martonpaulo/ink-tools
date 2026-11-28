/** Word search in the Puzzles view (#385): a language and a band, «Check» of the strikes and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {cellCenter, newWordSearch, wordSearchLayout, type InkPoint, type InkStroke} from '@ink-tools/puzzle-core';
import {WORD_AVOID, WORD_LISTS} from '@ink-tools/puzzle-core/word-lists';
import {GAMES} from '../src/games';
import {WORD_SEARCH, wordSearchCopy} from '../src/games/wordSearch';
import {playCopy} from '../src/play/copy';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, SEED} from '../testing/gameView';

const GAME = newWordSearch(SEED, 'en', 'easy', {list: WORD_LISTS.en, avoid: WORD_AVOID.en});
const {grid: GRID} = wordSearchLayout(GAME, {orientation: HERE.orientation, hand: 'right'});
const SIDE = GAME.puzzle.size;

const at = (cell: number): InkPoint => {
  const [x, y] = cellCenter(GRID, cell % SIDE, Math.floor(cell / SIDE));
  return {x, y};
};
const strike = (from: number, to: number, steps = 30): InkStroke<object> => {
  const [a, b] = [at(from), at(to)];
  return {points: Array.from({length: steps + 1}, (_, i) => ({x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps})), element: {}};
};
/** One strike over each placed word, end to end. */
const STRUCK = GAME.puzzle.words.map(({cells}) => strike(cells[0], cells[cells.length - 1]));
/** Easy words run across or down only, so this diagonal from the corner strikes no word. */
const WRONG = strike(0, 2 * SIDE + 2);

describe('the word search game (#385)', () => {
  test('is in the game list, after hitori and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('word-search')).toBe(ids.indexOf('hitori') + 1);
  });

  test('offers every bundled language by name, and its hard page fits either orientation and hand', () => {
    const labels = (WORD_SEARCH.options[0].choices as readonly {label: string}[]).map(choice => choice.label);
    expect(labels).toEqual(['English', 'Portuguese', 'Spanish', 'German', 'French']);
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        expect(() => WORD_SEARCH.create({language: 'pt', band: 'hard'}, SEED, {orientation, hand})).not.toThrow();
      }
    }
  });

  test('«Add Page» puts the puzzle of the language and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(WORD_SEARCH, fake.pages);
    await press(tree, `${wordSearchCopy.language}: ${wordSearchCopy.languages.pt}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.hard}`);
    expect(GAME.code).toBe('WS-12EN-E-7K2Q9X');
    await expectAdded(tree, fake, WORD_SEARCH, 'WS-15PT-H-7K2Q9X', {language: 'pt', band: 'hard'});
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(WORD_SEARCH, fakePages({code: 'BR-7X7-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](wordSearchCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles exactly the one strike over no word, and every word struck is solved', async () => {
    const tree = await mount(WORD_SEARCH, fakePages({code: GAME.code, ink: [...STRUCK, WRONG]}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(wordSearchCopy.wrong(1));
    await expectSolved(WORD_SEARCH, GAME.code, STRUCK);
  });

  test('some words struck is nothing wrong so far, never solved', async () => {
    const tree = await mount(WORD_SEARCH, fakePages({code: GAME.code, ink: STRUCK.slice(1)}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(playCopy['verdict.open']);
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: GAME.code});
    const tree = await mount(WORD_SEARCH, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
