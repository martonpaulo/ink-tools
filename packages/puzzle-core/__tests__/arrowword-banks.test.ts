declare function require(name: string): any;
const fs = require('node:fs');
const path = require('node:path');

import { ARROWWORD_DIFFICULTIES, countArrowwordSolutions, generateArrowword } from '../src/arrowword';
import { ARROWWORD_BANK_FILES, arrowwordBank, clueBankProblems, reviewedClueBank, type ArrowwordBankFile } from '../src/arrowword-banks';
import { drawArrowword, fitClue } from '../src/arrowword-page';
import { createPage, layoutPage } from '../src/page/layout';
import { licenceProblems, WORD_LANGUAGES, type SourceManifest } from '../src/words';
import { WORD_LISTS } from '../src/words-data';

const ROOT = path.join(__dirname, '..');
const manifest: SourceManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'words', 'sources.json'), 'utf8'));
const notice: string = fs.readFileSync(path.join(ROOT, 'NOTICE.md'), 'utf8');
const SEEDS = 40;
/** The clue cell at the 15 mm preset; two clues share it, so each has half its height. */
const layoutAt15mm = (side: number) => layoutPage({ orientation: 'portrait', hand: 'right', cellMm: 15, lattice: 'square', columns: side, rows: side });

describe.each(WORD_LANGUAGES)('the %s arrowword bank', language => {
  const file = ARROWWORD_BANK_FILES[language];
  const bank = arrowwordBank(file);

  test('names no problem against its word list, and only 2 to 6 letter words', () => {
    expect(file.language).toBe(language);
    expect(clueBankProblems(file, WORD_LISTS[language])).toEqual([]);
    expect(file.entries.filter(({ word }) => word.length < 2 || word.length > 6)).toEqual([]);
  });

  test('ships to players only once reviewed', () => {
    expect(reviewedClueBank(language)).toEqual(file.reviewed ? bank : null);
  });

  test(`draws every clue at 15 mm in half a clue cell`, () => {
    const { cell } = layoutAt15mm(9).grid;
    const unfit = file.entries.flatMap(({ word, clue }) => {
      try {
        fitClue(clue, cell, cell / 2);
        return [];
      } catch (error) {
        return [`${word}: ${(error as Error).message}`];
      }
    });
    expect(unfit).toEqual([]);
  });

  test.each(ARROWWORD_DIFFICULTIES)(`generates ${SEEDS} %s seeds in a row, each with one solution, and draws the first at 15 mm`, difficulty => {
    for (let s = 0; s < SEEDS; s++) {
      const puzzle = generateArrowword(`B${s}`, difficulty, bank);
      expect(countArrowwordSolutions(puzzle, bank)).toBe(1);
      if (s === 0) {
        const layout = layoutAt15mm(puzzle.columns);
        expect(() => drawArrowword(createPage(layout), layout.grid, puzzle)).not.toThrow();
      }
    }
  });
});

describe('the licence of the banks', () => {
  test('every bank names recorded, allowed and noticed sources', () => {
    expect(licenceProblems(manifest, Object.values(ARROWWORD_BANK_FILES), notice)).toEqual([]);
  });
});

describe('clueBankProblems', () => {
  const list = { language: 'en' as const, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', words: ['CAT', 'DOG', 'SUN'] };
  const fixture = (entries: ArrowwordBankFile['entries']): ArrowwordBankFile => ({ language: 'en', sources: ['ink-tools-clues'], reviewed: false, entries });

  test.each([
    [[{ word: 'COW', clue: 'Farm animal' }], ['«COW» is not in the en word list']],
    [[{ word: 'CAT', clue: 'Pet' }, { word: 'CAT', clue: 'Feline' }], ['«CAT» is in the bank twice']],
    [[{ word: 'DOG', clue: '  ' }], ['«DOG» has an empty clue']],
    [[{ word: 'CAT', clue: 'A small cat' }], ['«CAT»\'s clue «A small cat» holds the answer']],
    [[{ word: 'SÚN', clue: 'Star' }], ['«SÚN» has «Ú», which is not in the alphabet', '«SÚN» is not in the en word list']],
  ])('names the problem of %j', (entries, problems) => {
    expect(clueBankProblems(fixture(entries), list)).toEqual(problems);
  });

  test('takes an answer inside a longer clue word, or with its accents, apart from the answer itself', () => {
    expect(clueBankProblems(fixture([{ word: 'SUN', clue: 'Sunny star' }]), list)).toEqual([]);
    expect(clueBankProblems(fixture([{ word: 'CAT', clue: 'Not a cát' }]), list)).toEqual(['«CAT»\'s clue «Not a cát» holds the answer']);
  });
});
