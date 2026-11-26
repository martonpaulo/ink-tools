/**
 * The seeded random source every generator draws from (#380).
 *
 * The same seed must give the same puzzle on the Mac (Node) and on the tablet (Hermes), so this
 * uses 32-bit integer arithmetic only: `Math.imul`, shifts and `>>> 0`. No `Math.random`, no
 * floating-point sums, and callers never sort with a comparator that can tie.
 */

export interface Random {
  /** An integer in [0, n), n at least 1. */
  int(n: number): number;
  /** Shuffles the list in place (Fisher-Yates) and returns it. */
  shuffle<T>(list: T[]): T[];
  /** One item of a non-empty list. */
  pick<T>(list: readonly T[]): T;
  /** True with the given chance in percent (0 to 100). */
  chance(percent: number): boolean;
}

/** The constants of cyrb128, the seed hash: four start words, four multipliers, four final shifts. */
const CYRB128 = {
  start: [1779033703, 3144134277, 1013904242, 2773480762],
  multipliers: [597399067, 2869860233, 951274213, 2716044179],
  shifts: [18, 22, 17, 19],
} as const;
/** The constants of sfc32, the generator: its shifts, its rotation and the warm-up rounds. */
const SFC32 = { right: 9, left: 3, rotate: 21, warmup: 12 } as const;
const WORD_BITS = 32;
const TWO_POW_32 = 4294967296;
/** The constants of FNV-1a over 32 bits, the digest. */
const FNV1A = { offset: 2166136261, prime: 16777619 } as const;

/** A 128-bit hash of the seed text (cyrb128), as four 32-bit words. */
function hashSeed(seed: string): [number, number, number, number] {
  const [m1, m2, m3, m4] = CYRB128.multipliers;
  const [s1, s2, s3, s4] = CYRB128.shifts;
  let [h1, h2, h3, h4] = CYRB128.start as readonly number[];
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, m1);
    h2 = h3 ^ Math.imul(h2 ^ k, m2);
    h3 = h4 ^ Math.imul(h3 ^ k, m3);
    h4 = h1 ^ Math.imul(h4 ^ k, m4);
  }
  h1 = Math.imul(h3 ^ (h1 >>> s1), m1);
  h2 = Math.imul(h4 ^ (h2 >>> s2), m2);
  h3 = Math.imul(h1 ^ (h3 >>> s3), m3);
  h4 = Math.imul(h2 ^ (h4 >>> s4), m4);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** A random source for one seed (sfc32 over the seed's hash). */
export function createRandom(seed: string): Random {
  let [a, b, c, d] = hashSeed(seed);
  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> SFC32.right);
    b = (c + (c << SFC32.left)) | 0;
    c = (c << SFC32.rotate) | (c >>> (WORD_BITS - SFC32.rotate));
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Mix the state a few rounds, as sfc32 recommends, so near seeds diverge at once.
  for (let i = 0; i < SFC32.warmup; i++) next();

  const int = (n: number): number => {
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`int(${n}): n must be a positive integer`);
    // Rejection sampling keeps every value equally likely; the bound is an exact integer.
    const limit = TWO_POW_32 - (TWO_POW_32 % n);
    let x = next();
    while (x >= limit) x = next();
    return x % n;
  };
  return {
    int,
    shuffle<T>(list: T[]): T[] {
      for (let i = list.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
      }
      return list;
    },
    pick<T>(list: readonly T[]): T {
      if (list.length === 0) throw new RangeError('pick() from an empty list');
      return list[int(list.length)];
    },
    chance(percent: number): boolean {
      return int(100) < percent;
    },
  };
}

/** A child seed, so one attempt's draws never shift another's. */
export function childSeed(seed: string, part: string | number): string {
  return `${seed}/${part}`;
}

/**
 * A short digest of any JSON-able value (FNV-1a over its JSON text, eight hex digits). Tests pin
 * it per seed, and the tablet compares the same digest to prove it generates the same puzzle.
 */
export function digest(value: unknown): string {
  const text = JSON.stringify(value);
  let h: number = FNV1A.offset;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV1A.prime);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
