import { searchExactCover } from '../src/exact-cover';

// Knuth's example from «Dancing Links»: rows 0, 3 and 4 are its only exact cover.
const KNUTH = {
  columns: 7,
  rows: [[2, 4, 5], [0, 3, 6], [1, 2, 5], [0, 3], [1, 6], [3, 4, 6]],
};

describe('searchExactCover', () => {
  test('finds the one cover of Knuth’s example', () => {
    const result = searchExactCover(KNUTH, 2);
    expect(result.count).toBe(1);
    expect(result.first?.slice().sort()).toEqual([0, 3, 4]);
  });

  test('stops counting at the limit', () => {
    const many = { columns: 2, rows: [[0], [1], [0], [1], [0, 1]] };
    expect(searchExactCover(many, 2).count).toBe(2);
    expect(searchExactCover(many, 10).count).toBe(5);
  });

  test('chosen rows narrow the search, and clashing ones leave none', () => {
    expect(searchExactCover(KNUTH, 2, [0]).count).toBe(1);
    expect(searchExactCover(KNUTH, 2, [1]).count).toBe(0);
    expect(searchExactCover(KNUTH, 2, [1, 3]).count).toBe(0);
  });

  test('a budget stops the search and says so; without one it is never exhausted (#397)', () => {
    const many = { columns: 2, rows: [[0], [1], [0], [1], [0, 1]] };
    expect(searchExactCover(many, 10, [], 2)).toEqual({ count: 1, first: [0, 1], exhausted: true });
    expect(searchExactCover(many, 10).exhausted).toBe(false);
  });

  test('a row naming a missing column is refused', () => {
    expect(() => searchExactCover({ columns: 2, rows: [[2]] }, 1)).toThrow(RangeError);
  });
});
