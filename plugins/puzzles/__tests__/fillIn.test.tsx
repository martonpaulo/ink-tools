/** Fill-in in the Puzzles view (#398): a language and a band, «Check» of the written letters and «Show Solution». */
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {fillInExpected, fillInFromCode, generateFillIn, layoutFillInPage, puzzleCode, WORD_LANGUAGE_NAMES} from '@ink-tools/puzzle-core';
import {WORD_LISTS} from '@ink-tools/puzzle-core/src/words-data';
import {GAMES} from '../src/games';
import {FILL_IN, fillInCopy} from '../src/games/fillIn';
import {playCopy} from '../src/play/copy';
import {languageOption} from '../src/play/languages';
import {settle} from '../src/play/puzzle';
import {expectAdded, expectSolved, fakePages, HERE, mount, press, readDigits, SEED, writtenCells} from '../testing/gameView';

const PUZZLE = generateFillIn(SEED, 'easy', WORD_LISTS.en);
const CODE = puzzleCode(PUZZLE.id);
const GRID = layoutFillInPage(PUZZLE, {orientation: HERE.orientation, hand: 'right'}, fillInCopy.heading).page.grid;
const OPEN = [...fillInExpected(PUZZLE)];
const written = (change?: (cell: number, letter: string) => string) => writtenCells(GRID, OPEN, change);

describe('the fill-in game (#398)', () => {
  test('is in the game list, after hitori and before the boards', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids.indexOf('fill-in')).toBe(ids.indexOf('hitori') + 1);
  });

  test('its page fits either orientation and hand at the hardest band', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const hand of ['right', 'left'] as const) {
        expect(() => FILL_IN.create({language: 'en', band: 'hard'}, SEED, {orientation, hand})).not.toThrow();
      }
    }
  });

  test('«Add Page» puts the puzzle of the language and band picked on a new page', async () => {
    const fake = fakePages();
    const tree = await mount(FILL_IN, fake.pages);
    await press(tree, `${playCopy.language}: ${WORD_LANGUAGE_NAMES.pt}`);
    await press(tree, `${playCopy.difficulty}: ${playCopy.bands.medium}`);
    const code = puzzleCode(generateFillIn(SEED, 'medium', WORD_LISTS.pt).id);
    await expectAdded(tree, fake, FILL_IN, code, {language: 'pt', band: 'medium'});
  });

  test('a language with no word list is greyed out with its reason, and never chosen', () => {
    const option = languageOption({en: WORD_LISTS.en});
    const choices = option.choices as readonly {value: string; unavailable?: string}[];
    expect(choices.find(choice => choice.value === 'en')?.unavailable).toBeUndefined();
    expect(choices.find(choice => choice.value === 'pt')?.unavailable).toBe('No word list is installed');
    expect(settle([option], {language: 'pt'})).toEqual({language: 'en'});
  });

  test('a language whose letters the page font lacks is greyed out, naming them', () => {
    const option = languageOption({...WORD_LISTS, de: {alphabet: 'ABCẞ'}});
    const de = (option.choices as readonly {value: string; unavailable?: string}[]).find(choice => choice.value === 'de');
    expect(de?.unavailable).toBe('The page font lacks ẞ');
  });

  test('a page with another game offers only a new one', async () => {
    const tree = await mount(FILL_IN, fakePages({code: 'HI-5-E-7K2Q9X'}).pages);
    expect(shownTexts(tree.root)).toContain(playCopy['here.none'](fillInCopy.title));
    expect(pressables(tree.root, playCopy['here.check'])).toHaveLength(0);
  });

  test('«Check» circles the one wrong letter, names an unread one, and a page filled right is solved', async () => {
    expect(fillInFromCode(CODE, WORD_LISTS)).toEqual(PUZZLE);
    const [[first], [second]] = OPEN;
    const marked = written((cell, letter) => (cell === first ? (letter === 'A' ? 'B' : 'A') : cell === second ? 'x' : letter));
    const tree = await mount(FILL_IN, fakePages({code: CODE, ink: marked, read: readDigits}).pages);
    await press(tree, playCopy['here.check']);
    expect(shownTexts(tree.root)).toContain(`${playCopy['verdict.wrong'](1)} ${playCopy['verdict.unread'](1)}`);
    await expectSolved(FILL_IN, CODE, written());
  });

  test('«Show Solution» writes nothing to the note', async () => {
    const {pages, calls} = fakePages({code: CODE});
    const tree = await mount(FILL_IN, pages);
    await press(tree, playCopy['here.answer']);
    expect(shownTexts(tree.root)).toContain(playCopy['answer.note']);
    expect(calls).toEqual(['clear', 'here', 'codeOf', 'here', 'codeOf']);
  });
});
