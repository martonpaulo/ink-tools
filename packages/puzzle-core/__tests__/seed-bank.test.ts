/** The seed banks of the slow games (#552): each entry is what its generator makes from its seed. */
import { BRIDGES_BANK } from '../src/bridges-bank';
import { BRIDGES_BANDS, BRIDGES_SIDES, bridgesFromCode, encodeBridges, generateBridges, newBridges } from '../src/bridges';
import { parsePuzzleCode, puzzleCode, type Difficulty, type PuzzleId } from '../src/code';
import { KAKURO_BANK } from '../src/kakuro-bank';
import { encodeKakuro, generateKakuro, KAKURO_SIZES, kakuroFromCode, newKakuro } from '../src/kakuro';
import { findInBank, type SeedBank } from '../src/seed-bank';
import { SLITHERLINK_BANK } from '../src/slitherlink-bank';
import { encodeSlitherlink, generateSlitherlink, newSlitherlink, SLITHERLINK_BANDS, SLITHERLINK_SIDES, slitherlinkFromCode } from '../src/slitherlink';

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
}

const bandOf = (pair: string): Difficulty => pair.split(':')[1] as Difficulty;
const sideOf = (pair: string): number => Number(pair.split(/[:x]/)[0]);
const square = (pair: string) => ({ width: sideOf(pair), height: sideOf(pair) });
const squarePairs = (sides: readonly number[], bands: readonly Difficulty[]): string[] => sides.flatMap(side => bands.map(band => `${side}x${side}:${band}`));

const GAMES: Record<string, BankedGame> = {
  kakuro: {
    bank: KAKURO_BANK,
    offered: Object.entries(KAKURO_SIZES).flatMap(([size, bands]) => bands.map(band => `${size}:${band}`)),
    live: (seed, pair) => generateKakuro(seed, sideOf(pair), bandOf(pair)),
    fresh: (seed, pair) => newKakuro(seed, sideOf(pair), bandOf(pair)),
    fromCode: kakuroFromCode,
    encode: made => encodeKakuro(made as ReturnType<typeof generateKakuro>),
  },
  slitherlink: {
    bank: SLITHERLINK_BANK,
    offered: squarePairs(SLITHERLINK_SIDES, SLITHERLINK_BANDS),
    live: (seed, pair) => generateSlitherlink(seed, square(pair), bandOf(pair)),
    fresh: (seed, pair) => newSlitherlink(seed, square(pair), bandOf(pair)),
    fromCode: slitherlinkFromCode,
    encode: made => encodeSlitherlink(made as ReturnType<typeof generateSlitherlink>),
  },
  bridges: {
    bank: BRIDGES_BANK,
    offered: squarePairs(BRIDGES_SIDES, BRIDGES_BANDS),
    live: (seed, pair) => generateBridges(seed, square(pair), bandOf(pair)),
    fresh: (seed, pair) => newBridges(seed, square(pair), bandOf(pair)),
    fromCode: bridgesFromCode,
    encode: made => encodeBridges(made as ReturnType<typeof generateBridges>),
  },
};

const ENTRIES = 24;
const banked = Object.entries(GAMES).flatMap(([game, spec]) => Object.keys(spec.bank).map(pair => [game, pair] as const));
const seedOf = (line: string): string => line.slice(0, line.indexOf('/'));

describe('the seed banks (#552)', () => {
  test('each bank keys only sizes and bands the plugin offers, the slowest ones among them', () => {
    expect(Object.keys(KAKURO_BANK)).toContain('12:hard');
    expect(Object.keys(SLITHERLINK_BANK)).toContain('10x10:hard');
    expect(Object.keys(BRIDGES_BANK)).toContain('13x13:hard');
    for (const [game, pair] of banked) expect(GAMES[game].offered).toContain(pair);
  });

  test.each(banked)('every %s %s entry is the puzzle its generator makes from its seed', (game, pair) => {
    const spec = GAMES[game];
    const lines = spec.bank[pair];
    expect(lines).toHaveLength(ENTRIES);
    expect(new Set(lines.map(seedOf)).size).toBe(ENTRIES);
    for (const line of lines) {
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
    // 1 ms, where the live generator takes 20 to 240 ms with the JIT at these pairs (and 0.1 to
    // 4.5 s under --jitless), so the budget sits ten times away from both.
    const BUDGET_MS = 10;
    for (const [game, pair] of banked) {
      const start = process.cpuUsage();
      GAMES[game].fresh('B', pair);
      const used = process.cpuUsage(start);
      // timing-independent: a CPU budget ten times away from both paths, as said above.
      expect([game, pair, (used.user + used.system) / 1000 < BUDGET_MS]).toEqual([game, pair, true]);
    }
  });
});
