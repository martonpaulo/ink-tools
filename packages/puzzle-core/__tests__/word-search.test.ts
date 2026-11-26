import { findWord, generateWordSearch, WORD_SEARCH_DIRECTIONS } from '../src/word-search';

const ANIMALS = ['GATO', 'CACHORRO', 'LEAO', 'URSO', 'SAPO', 'PATO', 'CABRA', 'PEIXE'];

describe('generateWordSearch', () => {
  test.each(['easy', 'medium', 'hard'] as const)('%s: every word is there exactly once, in the band’s directions', band => {
    const puzzle = generateWordSearch('BANDS', 12, band, ANIMALS);
    expect(puzzle.letters).toHaveLength(144);
    for (const placed of puzzle.words) {
      expect(WORD_SEARCH_DIRECTIONS[band]).toContain(placed.direction);
      expect(placed.cells.map(cell => puzzle.letters[cell]).join('')).toBe(placed.word);
    }
    for (const word of ANIMALS) expect(findWord(12, puzzle.letters, word)).toHaveLength(1);
  });

  test('a palindrome counts once, not once each way', () => {
    expect(findWord(3, ['A', 'N', 'A', 'X', 'X', 'X', 'X', 'X', 'X'], 'ANA')).toHaveLength(1);
  });

  test('Spanish keeps Ñ in its alphabet', () => {
    const puzzle = generateWordSearch('ES', 8, 'easy', ['NIÑO', 'AÑO', 'SOL'], { alphabet: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ' });
    expect(findWord(8, puzzle.letters, 'NIÑO')).toHaveLength(1);
  });

  test('the same seed gives the same grid', () => {
    expect(generateWordSearch('S', 10, 'hard', ANIMALS)).toEqual(generateWordSearch('S', 10, 'hard', ANIMALS));
  });

  test.each([
    [['ELEPHANT'], 6, 'longer than the 6-cell side'],
    [['GATO', 'GATOS'], 8, '«GATO» is inside «GATOS»'],
    [['OTAG', 'GATOS'], 8, '«OTAG» is inside «GATOS»'],
    [['NIÑO'], 8, "not in the grid's alphabet"],
    [['A'], 8, 'shorter than 2 letters'],
    [[], 8, 'at least one word'],
  ])('%j in a side of %i is refused: %s', (words, size, why) => {
    expect(() => generateWordSearch('S', size, 'easy', words)).toThrow(why);
  });

  test('words that cannot all fit end in an error naming one', () => {
    const many = Array.from({ length: 12 }, (_, i) => 'ABCDE'.slice(0, 4) + String.fromCharCode(70 + i));
    expect(() => generateWordSearch('S', 5, 'easy', many)).toThrow(/found no place|only once/);
  });
});
