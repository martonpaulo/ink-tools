/** Every Puzzles game has its row in `docs/feature-defaults.md`, with the defaults it opens on (#547). */
import {defaultRows, keysWithNoRow} from '@ink-tools/ui-kit/featureDefaultsTest';
import {offered, recalled, type PuzzleGame} from '../src/play/puzzle';
import {GAMES} from '../src/games';

const TOOL = 'Puzzles';

/** Each game of the list, as the shared view shows it. */
const games = (): PuzzleGame[] =>
  require('fs')
    .readdirSync(`${__dirname}/../src/games`)
    .flatMap((file: string) => Object.values(require(`../src/games/${file}`)))
    .flatMap((value: unknown) => (Array.isArray(value) ? value : [value]))
    .filter((value: unknown): value is PuzzleGame => typeof value === 'object' && value !== null && 'create' in value && 'options' in value);

describe('the Puzzles rows of docs/feature-defaults.md (#547)', () => {
  test('every game of the list has a row', () => {
    expect(keysWithNoRow(TOOL, GAMES.map(game => game.id))).toEqual([]);
  });

  test('each row names the choices its game opens on the first time', () => {
    const rows = defaultRows(TOOL);
    for (const game of games()) {
      const row = rows.find(each => each.keys.includes(game.id));
      expect(row).toBeDefined();
      const first = recalled(game.options, null);
      const labels = game.options.map(option => offered(option, first).find(choice => choice.value === first[option.id])!.label);
      expect({game: game.id, value: row!.value}).toEqual({game: game.id, value: labels.length ? labels.join(', ') : 'no choices'});
    }
  });
});
