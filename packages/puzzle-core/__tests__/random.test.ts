import { childSeed, createRandom, digest } from '../src/random';

describe('createRandom', () => {
  test('the same seed draws the same numbers, pinned so the tablet can compare', () => {
    const r = createRandom('P1');
    expect([1, 2, 3, 4, 5].map(() => r.int(1000))).toEqual([434, 130, 903, 190, 910]);
    const empty = createRandom('');
    expect([1, 2, 3].map(() => empty.int(1000000))).toEqual([688151, 530603, 761935]);
  });

  test('near seeds diverge at once', () => {
    expect(createRandom('A').int(1 << 30)).not.toBe(createRandom('B').int(1 << 30));
  });

  test('int stays in range and refuses a bad bound', () => {
    const r = createRandom('range');
    for (let i = 0; i < 1000; i++) {
      const x = r.int(7);
      expect(x >= 0 && x < 7 && Number.isInteger(x)).toBe(true);
    }
    expect(() => r.int(0)).toThrow(RangeError);
    expect(() => r.int(2.5)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
  });

  test('shuffle keeps every item', () => {
    const list = Array.from({ length: 50 }, (_, i) => i);
    expect(createRandom('s').shuffle(list.slice()).sort((a, b) => a - b)).toEqual(list);
  });

  test('a child seed is its own stream', () => {
    expect(createRandom(childSeed('S', 1)).int(1 << 30)).not.toBe(createRandom(childSeed('S', 2)).int(1 << 30));
  });

  test('digest is short, stable and sensitive', () => {
    expect(digest({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
    expect(digest({ a: 1 })).toBe(digest({ a: 1 }));
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  });
});
