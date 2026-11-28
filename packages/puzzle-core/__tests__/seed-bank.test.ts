/** The seed banks of the slow games (#552): each entry is what its generator makes from its seed. */
import { BINAIRO_BANK } from '../src/binairo-bank';
import { BINAIRO_BANDS, BINAIRO_SIDES, binairoFromCode, encodeBinairo, generateBinairo, newBinairo } from '../src/binairo';
import { BRIDGES_BANK } from '../src/bridges-bank';
import { BRIDGES_BANDS, BRIDGES_SIDES, bridgesFromCode, encodeBridges, generateBridges, newBridges } from '../src/bridges';
import { parsePuzzleCode, puzzleCode, type Difficulty, type PuzzleId } from '../src/code';
import { KAKURO_BANK } from '../src/kakuro-bank';
import { encodeHitori, generateHitori, HITORI_BANDS, HITORI_SIDES, hitoriFromCode, newHitori } from '../src/hitori';
import { HITORI_BANK } from '../src/hitori-bank';
import { encodeKakuro, generateKakuro, KAKURO_SIZES, kakuroFromCode, newKakuro } from '../src/kakuro';
import { findInBank, type SeedBank } from '../src/seed-bank';
import { SLITHERLINK_BANK } from '../src/slitherlink-bank';
import { encodeSlitherlink, generateSlitherlink, newSlitherlink, SLITHERLINK_BANDS, SLITHERLINK_SIDES, slitherlinkFromCode } from '../src/slitherlink';
import { STAR_BATTLE_BANK } from '../src/star-battle-bank';
import {
  encodeStarBattle,
  generateStarBattle,
  newStarBattle,
  STAR_BATTLE_MAX_SIDE,
  STAR_BATTLE_MIN_SIDE,
  STAR_BATTLE_TWO_STAR_MIN_SIDE,
  starBattleBands,
  starBattleFromCode,
  type StarBattleSize,
} from '../src/star-battle';

const ENTRIES = 24;

interface Made {
  id: PuzzleId;
}

interface BankedGame {
  bank: SeedBank;
  /** Every size and band the plugin offers, as the bank keys them. */
  offered: string[];
  live: (seed: string, pair: string) => Made;
  fresh: (seed: string, pair: string) => Made;
  fromCode: (code: string) => Made;
  encode: (made: Made) => string;
  /** How many entries of each pair the test makes again, from the first: the slow ones on a sample for time. */
  proved: number;
}

const bandOf = (pair: string): Difficulty => pair.split(':')[1] as Difficulty;
const sideOf = (pair: string): number => Number(pair.split(/[:x]/)[0]);
const square = (pair: string) => ({ width: sideOf(pair), height: sideOf(pair) });
const starSizeOf = (pair: string): StarBattleSize => {
  const [side, stars] = pair.split(':')[0].split('S').map(Number);
  return { side, stars: stars as 1 | 2 };
};
const starPairs = (): string[] => {
  const out: string[] = [];
  for (let side = STAR_BATTLE_MIN_SIDE; side <= STAR_BATTLE_MAX_SIDE; side++) {
    for (const stars of side >= STAR_BATTLE_TWO_STAR_MIN_SIDE ? ([1, 2] as const) : ([1] as const)) {
      for (const band of starBattleBands({ side, stars })) out.push(`${side}S${stars}:${band}`);
    }
  }
  return out;
};
const squarePairs = (sides: readonly number[], bands: readonly Difficulty[]): string[] => sides.flatMap(side => bands.map(band => `${side}x${side}:${band}`));

const GAMES: Record<string, BankedGame> = {
  kakuro: {
    bank: KAKURO_BANK,
    offered: Object.entries(KAKURO_SIZES).flatMap(([size, bands]) => bands.map(band => `${size}:${band}`)),
    live: (seed, pair) => generateKakuro(seed, sideOf(pair), bandOf(pair)),
    fresh: (seed, pair) => newKakuro(seed, sideOf(pair), bandOf(pair)),
    fromCode: kakuroFromCode,
    encode: made => encodeKakuro(made as ReturnType<typeof generateKakuro>),
    proved: ENTRIES,
  },
  slitherlink: {
    bank: SLITHERLINK_BANK,
    offered: squarePairs(SLITHERLINK_SIDES, SLITHERLINK_BANDS),
    live: (seed, pair) => generateSlitherlink(seed, square(pair), bandOf(pair)),
    fresh: (seed, pair) => newSlitherlink(seed, square(pair), bandOf(pair)),
    fromCode: slitherlinkFromCode,
    encode: made => encodeSlitherlink(made as ReturnType<typeof generateSlitherlink>),
    proved: ENTRIES,
  },
  bridges: {
    bank: BRIDGES_BANK,
    offered: squarePairs(BRIDGES_SIDES, BRIDGES_BANDS),
    live: (seed, pair) => generateBridges(seed, square(pair), bandOf(pair)),
    fresh: (seed, pair) => newBridges(seed, square(pair), bandOf(pair)),
    fromCode: bridgesFromCode,
    encode: made => encodeBridges(made as ReturnType<typeof generateBridges>),
    proved: ENTRIES,
  },
  binairo: {
    bank: BINAIRO_BANK,
    offered: BINAIRO_SIDES.flatMap(side => BINAIRO_BANDS.map(band => `${side}:${band}`)),
    live: (seed, pair) => generateBinairo(seed, sideOf(pair), bandOf(pair)),
    fresh: (seed, pair) => newBinairo(seed, sideOf(pair), bandOf(pair)),
    fromCode: binairoFromCode,
    encode: made => encodeBinairo(made as ReturnType<typeof generateBinairo>),
    proved: ENTRIES,
  },
  hitori: {
    bank: HITORI_BANK,
    offered: HITORI_SIDES.flatMap(side => HITORI_BANDS.map(band => `${side}:${band}`)),
    live: (seed, pair) => generateHitori(seed, sideOf(pair), bandOf(pair)),
    fresh: (seed, pair) => newHitori(seed, sideOf(pair), bandOf(pair)),
    fromCode: hitoriFromCode,
    encode: made => encodeHitori(made as ReturnType<typeof generateHitori>),
    proved: ENTRIES,
  },
  // Making the whole star battle bank again takes about 25 s, so a sample of each pair.
  'star-battle': {
    bank: STAR_BATTLE_BANK,
    offered: starPairs(),
    live: (seed, pair) => generateStarBattle(seed, starSizeOf(pair), bandOf(pair)),
    fresh: (seed, pair) => newStarBattle(seed, starSizeOf(pair), bandOf(pair)),
    fromCode: starBattleFromCode,
    encode: made => encodeStarBattle(made as ReturnType<typeof generateStarBattle>),
    proved: 3,
  },
};

const banked = Object.entries(GAMES).flatMap(([game, spec]) => Object.keys(spec.bank).map(pair => [game, pair] as const));
const seedOf = (line: string): string => line.slice(0, line.indexOf('/'));

describe('the seed banks (#552)', () => {
  test('each bank keys only sizes and bands the plugin offers, the slowest ones among them', () => {
    expect(Object.keys(KAKURO_BANK)).toContain('12:hard');
    expect(Object.keys(SLITHERLINK_BANK)).toContain('10x10:hard');
    expect(Object.keys(BRIDGES_BANK)).toContain('13x13:hard');
    expect(Object.keys(BINAIRO_BANK)).toContain('12:hard');
    expect(Object.keys(STAR_BATTLE_BANK)).toContain('10S2:hard');
    for (const [game, pair] of banked) expect(GAMES[game].offered).toContain(pair);
  });

  test.each(banked)('each %s %s entry is the puzzle its generator makes from its seed', (game, pair) => {
    const spec = GAMES[game];
    const lines = spec.bank[pair];
    expect(lines).toHaveLength(ENTRIES);
    expect(new Set(lines.map(seedOf)).size).toBe(ENTRIES);
    for (const line of lines.slice(0, spec.proved)) {
      const made = spec.live(seedOf(line), pair);
      expect(`${made.id.seed}/${spec.encode(made)}`).toBe(line);
      // Its code opens it from the bank as the very puzzle the generator made.
      expect(spec.fromCode(puzzleCode(made.id))).toEqual(made);
    }
  });

  test.each(banked)('a new %s %s page is a bank entry its own code names', (game, pair) => {
    const spec = GAMES[game];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const made = spec.fresh(`S${seed}`, pair);
      expect(findInBank(spec.bank, pair, made.id.seed)).not.toBeNull();
      expect(spec.fresh(`S${seed}`, pair)).toEqual(made);
      expect(spec.fromCode(puzzleCode(made.id))).toEqual(made);
      seen.add(made.id.seed);
    }
    // The seed picks among the entries, so 40 pages are not one puzzle.
    expect(seen.size).toBeGreaterThan(ENTRIES / 2);
  });

  test.each(Object.keys(GAMES))('%s: a size and band outside the bank is made live, and a code made live opens as before', game => {
    const spec = GAMES[game];
    const live = spec.offered.find(pair => !spec.bank[pair]);
    expect(live).toBeDefined();
    expect(spec.fresh('P1', live!)).toEqual(spec.live('P1', live!));
    // A page made before its pair was banked keeps its own puzzle: its seed is not a bank seed.
    const old = spec.live('7K2Q9X', banked.find(([g]) => g === game)![1]);
    expect(parsePuzzleCode(puzzleCode(old.id)).seed).toBe('7K2Q9X');
    expect(spec.fromCode(puzzleCode(old.id))).toEqual(old);
  });

  test('a banked page costs no generation: every banked size and band within a CPU budget', () => {
    // CPU time, not wall time, so a loaded machine adds little: reading an entry takes well under
    // 1 ms, and the live generator of the slowest pairs (12 x 12 hard kakuro, 10 x 10 hard
    // slitherlink, 13 x 13 hard Bridges, 10 x 10 hard star battle) takes 20 ms and more with the JIT,
    // seconds under --jitless, so a page that skipped the bank fails the budget there.
    const BUDGET_MS = 10;
    for (const [game, pair] of banked) {
      const start = process.cpuUsage();
      GAMES[game].fresh('B', pair);
      const used = process.cpuUsage(start);
      // timing-independent: a CPU budget well above an entry's read and below the slowest live pairs, as said above.
      expect([game, pair, (used.user + used.system) / 1000 < BUDGET_MS]).toEqual([game, pair, true]);
    }
  });
});
