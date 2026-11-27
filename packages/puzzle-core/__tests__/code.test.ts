import { dailySeed, GAMES, parsePuzzleCode, puzzleCode, seedFromNumber } from '../src/code';

describe('puzzle codes', () => {
  test('a code names game, size, band and seed, and reads back', () => {
    const id = { game: 'sudoku' as const, size: '9', difficulty: 'hard' as const, seed: '7K2Q9X' };
    expect(puzzleCode(id)).toBe('SU-9-H-7K2Q9X');
    expect(parsePuzzleCode('SU-9-H-7K2Q9X')).toEqual(id);
    expect(parsePuzzleCode(' su-9-h-7k2q9x ')).toEqual(id);
    expect(parsePuzzleCode(puzzleCode({ game: 'maze', size: 'c12', difficulty: 'easy', seed: 'D20261126' }))).toEqual({
      game: 'maze',
      size: 'C12',
      difficulty: 'easy',
      seed: 'D20261126',
    });
  });

  test.each([
    ['SU-9-H', 'is not GAME-SIZE-BAND-SEED'],
    ['QQ-9-H-AB', 'is not a game code'],
    ['SU-9-Q-AB', 'is not a difficulty code'],
    ['SU-9-H-OIL', 'is not a seed'],
    ['SU-9!-H-AB', 'is not a size'],
  ])('«%s» is refused: %s', (code, why) => {
    expect(() => parsePuzzleCode(code)).toThrow(why);
  });

  test('every game reads back from its own code (two games never share one, #400)', () => {
    for (const game of GAMES) {
      const id = { game, size: '9', difficulty: 'easy' as const, seed: '1' };
      expect(parsePuzzleCode(puzzleCode(id)).game).toBe(game);
    }
  });

  test('seeds come from numbers and dates', () => {
    expect(seedFromNumber(0)).toBe('0');
    expect(seedFromNumber(31)).toBe('Z');
    expect(seedFromNumber(32)).toBe('10');
    expect(() => seedFromNumber(-1)).toThrow(RangeError);
    expect(dailySeed('2026-11-26')).toBe('D20261126');
    expect(() => dailySeed('26/11/2026')).toThrow(RangeError);
  });
});
