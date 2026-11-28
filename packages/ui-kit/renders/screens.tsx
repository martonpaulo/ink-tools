/**
 * Every screen the renders show, each driven to its state through the real component with
 * synthetic fixture data (#80): the ui-kit views and each plugin's own (#288). Adding a screen is
 * one line in SCREENS.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import type {WindowName} from './html';
import {View} from 'react-native';
import {
  ActionRow,
  Button,
  ErrorView,
  LoadingView,
  Needs,
  Pager,
  RowGroup,
  SearchField,
  shared,
  SwitchRow,
  TitleBar,
  WorkingStrip,
} from '@ink-tools/ui-kit';
import type {Working} from '@ink-tools/ui-kit';
import SmartPenSettings from '../../../plugins/smart-pen/App';
import {DEFAULT_PEN_SETTINGS} from '../../../plugins/smart-pen/src/settings';
import LassoActionsSettings from '../../../plugins/lasso-actions/App';
import {CollectionScreen as LassoCollection} from '../../../plugins/lasso-actions/src/ui/CollectionScreen';
import type {CollectionHost} from '../../../plugins/lasso-actions/src/collection/run';
import PluginDiagnostics from '../../../plugins/ink-tools-probe/App';
import {copy as diagnosticsCopy} from '../../../plugins/ink-tools-probe/src/copy';
import type {ProbeOutcome} from '../../../plugins/ink-tools-probe/src/probe';
import {connectProblem as accountSyncConnect, SettingsShell as AccountSyncSettings} from '../../../plugins/account-sync/src/SettingsShell';
import {SettingsForm as AccountSyncForm} from '../../../plugins/account-sync/src/SettingsForm';
import {moduleRows as accountSyncRows} from '../../../plugins/account-sync/App';
import type {BridgeSettings as AccountSyncSettingsValue} from '@ink-tools/sync-core/settings';
import {accountName, addIcsFeed, defaultSettings as accountSyncDefaults, setIcsNames, setModule as accountSyncModule, setProvider as accountSyncProvider} from '@ink-tools/sync-core/settings';
import {Editor as ImageEditor} from '../../../plugins/image-editing/src/EditorView';
import type {EditorState as ImageEditorState} from '../../../plugins/image-editing/src/editor';
import {defaultSettings as imageEditingSettings} from '../../../plugins/image-editing/src/edits';
import {StylesGrid as ImageStylesGrid} from '../../../plugins/image-editing/src/StylesGrid';
import {PickView as DeviceLinkPick} from '../../../plugins/device-link/src/PickDevice';
import {ReceiveView as DeviceLinkReceive, SettingsForm as DeviceLinkSettings, TextView as DeviceLinkText} from '../../../plugins/device-link/App';
import type {Device as TransferDevice} from '../../../plugins/device-link/src/localsend/protocol';
import {refusedProblem as deviceLinkRefused} from '../../../plugins/device-link/src/permissions';
import {sendFailedProblem as deviceLinkSendFailed} from '../../../plugins/device-link/src/run';
import {copy as deviceLinkCopy} from '../../../plugins/device-link/src/copy';
import {permissionProblem as lassoActionsPermission, FILE_WRITE as LASSO_FILE_WRITE} from '../../../plugins/lasso-actions/src/buttons';
import {copy as imageEditingCopy} from '../../../plugins/image-editing/src/copy';
import {copy as smartPenTextCopy} from '../../../plugins/smart-pen/src/modules/text/copy';
import {starBattleCopy} from '../../../plugins/puzzles/src/games/starBattle';
import {playCopy} from '../../../plugins/puzzles/src/play/copy';
import {PuzzlesView} from '../../../plugins/puzzles/src/PuzzlesView';
import type {Game as PuzzlesGame} from '../../../plugins/puzzles/src/games';
import type {RequirementPorts as PuzzlesPorts} from '../../../plugins/puzzles/src/requirements';
import {MAZE} from '../../../plugins/puzzles/src/games/maze';
import {JIGSAW} from '../../../plugins/puzzles/src/games/jigsaw';
import {FUTOSHIKI} from '../../../plugins/puzzles/src/games/futoshiki';
import {SUDOKU} from '../../../plugins/puzzles/src/games/sudoku';
import {KILLER} from '../../../plugins/puzzles/src/games/killer';
import {CALCUDOKU} from '../../../plugins/puzzles/src/games/calcudoku';
import {KAKURO} from '../../../plugins/puzzles/src/games/kakuro';
import {SLITHERLINK} from '../../../plugins/puzzles/src/games/slitherlink';
import {BRIDGES} from '../../../plugins/puzzles/src/games/bridges';
import {NONOGRAM} from '../../../plugins/puzzles/src/games/nonogram';
import {STAR_BATTLE} from '../../../plugins/puzzles/src/games/starBattle';
import {BINAIRO} from '../../../plugins/puzzles/src/games/binairo';
import {HITORI} from '../../../plugins/puzzles/src/games/hitori';
import {LIGHT_UP} from '../../../plugins/puzzles/src/games/lightUp';
import {BOARDS} from '../../../plugins/puzzles/src/games/boards';
import {GAMES as PUZZLES_LIST} from '../../../plugins/puzzles/src/games';
import type {PuzzleGame} from '../../../plugins/puzzles/src/play/puzzle';
import {GameView as PuzzlesGameView} from '../../../plugins/puzzles/src/play/GameView';
import type {PagePorts as PuzzlesPages} from '../../../plugins/puzzles/src/play/pages';
import {calcudokuFromCode, cellCenter, drawCalcudokuPage, drawFutoshikiPage, drawKakuroPage, drawKillerPage, futoshikiFromCode, kakuroAnswers, kakuroFromCode, edgeEnds, slitherlinkEdgeKeys, slitherlinkFromCode, slitherlinkLoop, drawSlitherlinkPage, bridgesAnswers, bridgesFromCode, drawBridgesPage, linkLine, VIEW_LINK_GAP, layoutNonogramPage, nonogramFromCode, layoutStarBattle, starBattleFromCode, BINAIRO_OPEN, binairoFromCode, layoutBinairoPage, hitoriFromCode, hitoriLayout, drawLightUpPage, lightUpFromCode, placedPageCode, jigsawExpected, jigsawFromCode, jigsawLayout, killerFromCode, mazeCellCentre, mazeFromCode, mazeLayout, sudokuExpected, sudokuFromCode, sudokuLayout, type Grid, type InkStroke} from '@ink-tools/puzzle-core';

export type ScreenRender = {
  name: string;
  render: () => Promise<ReactTestRenderer>;
  /** The windows the screen is not checked at, and why; the run prints the reason (#284). */
  skip?: {windows: WindowName[]; reason: string};
  /** Why the screen is no full view, so it needs no title bar; a full view always has one (#311). */
  notFullView?: string;
  /** The raw lines (code, JSON, a log) the screen is fed: each must show in ui-kit's CodeBlock (#405). */
  raw?: readonly string[];
};

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

/** A run that works and never ends, so the «Loading…» box stays on screen (#287). */
const WORKING: Working = {
  run: () => new Promise(() => {}),
  handOver: () => {},
  isWorking: () => true,
  problem: () => null,
  heldState: () => null,
  hold: () => {},
  subscribe: () => () => {},
  dismiss: () => {},
} as unknown as Working;

/** The controls #287 redrew after the vendor library, each in its states, on one screen. */
function ControlsSheet(): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <TitleBar title="Controls" onClose={() => {}} onBack={() => {}} />
      <View style={shared.buttons}>
        <Button label="Plain" onPress={() => {}} />
        <Button label="Primary" kind="primary" onPress={() => {}} />
        <Button label="Selected" selected onPress={() => {}} />
        <Button label="Disabled" disabled onPress={() => {}} />
      </View>
      <Button label="Destructive" kind="destructive" onPress={() => {}} />
      <RowGroup caption="Row actions">
        <ActionRow title="Sample account" subtitle="Connected as tester@example.com" action={{label: 'Sign out', onPress: () => {}}} />
        <ActionRow title="Sample confirm" subtitle="Remove the sample?" secondAction={{label: 'Cancel', onPress: () => {}}} action={{label: 'Remove', onPress: () => {}}} />
      </RowGroup>
      <RowGroup caption="Switches">
        <SwitchRow title="Sample on" value onChange={() => {}} />
        <SwitchRow title="Sample off" value={false} onChange={() => {}} />
      </RowGroup>
      <SearchField value="" placeholder="Search" onChangeText={() => {}} />
      <Pager page={1} total={12} onPage={() => {}} />
      <Pager page={5} total={12} onPage={() => {}} />
    </View>
  );
}

/** Nothing outlives a screen: the hook the run calls after each one unmounts. */
export function settle() {}

/** Image Editing's editor on a 960 x 870 picture, every edit on (#279, #278). */
const IMAGE_EDITOR: ImageEditorState = {
  phase: 'ready',
  rect: {left: 100, top: 200, right: 1060, bottom: 1070},
  opened: null,
  preview: '/w/editor-1.png',
  previewKept: false,
  guided: false,
  busy: null,
  draw: null,
  marks: [],
  strokes: [],
  message: null,
};
const noop = () => {};
/** Account Sync with Calendar and ICS on and one synthetic feed, scrolled to its ICS feeds (#30). */
const ICS_FEEDS = setIcsNames(
  addIcsFeed(
    addIcsFeed(
      accountSyncProvider(accountSyncModule(accountSyncDefaults(), 'calendar', true), 'ics', true),
      'webcal://feeds.example.com/private/sample.ics',
    ),
    'https://other.example.org/calendar.ics',
  ),
  // The first feed gave its calendar name at the last pass (#433); the second shows its host.
  {'webcal://feeds.example.com/private/sample.ics': 'Sample holidays'},
);
/** The picture's stage height the renders report: under its floor on the Nomad, the smallest window. */
const STAGE_HEIGHT = 280;
/** The editor, laid out: the picture's stage reports a size, as on the device, so the picture shows. */
async function imageEditor(state: Partial<ImageEditorState> = {}) {
  const tree = await mount(
    <ImageEditor
      state={{...IMAGE_EDITOR, ...state} as ImageEditorState}
      settings={imageEditingSettings}
      onEdit={noop}
      onApply={noop}
      onMark={noop}
      onClear={noop}
      onUndoStroke={noop}
      onDone={noop}
      onCancel={noop}
      onClose={noop}
    />,
  );
  const stage = tree.root.findAll(
    node => typeof node.type === 'string' && typeof node.props.onLayout === 'function',
  )[0];
  // The stage's size is known only after a layout pass; this one fits the smallest window's stage.
  // An editor still opening has no stage yet.
  if (stage) {
    await act(async () =>
      stage.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 400, height: STAGE_HEIGHT}}}),
    );
  }
  return tree;
}
/** Ink Tools Probe after «Run Probe», ended with this outcome (#257). */
async function diagnostics(outcome: ProbeOutcome): Promise<ReactTestRenderer> {
  const tree = await mount(<PluginDiagnostics close={noop} run={async () => outcome} />);
  const run = tree.root.find(node => node.props.accessibilityLabel === diagnosticsCopy.run && typeof node.props.onPress === 'function');
  await act(async () => run.props.onPress());
  return tree;
}
/** A probe's output for the code block (#405): one line far wider than the screen, then many short ones. */
const PROBE_LINES = [
  `runtime keys: ${Array.from({length: 40}, (_, i) => `sampleKey${i}`).join(',')}`,
  ...Array.from({length: 58}, (_, i) => `native probe step ${i + 1}: {"provider":"sample","rows":${i},"ok":true}`),
  'probe done',
];
/** A stroke across the picture, in page pixels. */
const STROKE = [
  {x: 300, y: 500},
  {x: 600, y: 650},
  {x: 900, y: 600},
];

/** Account Sync with To-Do and Todoist on, before the first sync, signed in to Todoist (#116, #368). */
const SIGNED_IN = accountSyncProvider(accountSyncModule(accountSyncDefaults(), 'todo', true), 'todoist', true);
/** Device Link's receivers (#307): synthetic, two with one alias to show them apart. */
const TRANSFER_DEVICES: TransferDevice[] = [
  {alias: 'Mac', deviceModel: 'MacBook', ip: '10.0.0.2', port: 53317, protocol: 'https', fingerprint: 'aaaaaa111111'},
  {alias: 'iPhone', deviceModel: 'iPhone', ip: '10.0.0.3', port: 53317, protocol: 'https', fingerprint: 'bbbbbb222222'},
  {alias: 'Mac', ip: '10.0.0.4', port: 53317, protocol: 'https', fingerprint: 'cccccc333333'},
];

/** A collection of three pieces for Lasso Actions' Collection view (#249). */
const answer = async <T,>(value: T) => ({ok: true as const, value});
const COLLECTION_HOST: CollectionHost = {
  folder: () => answer('/plugin'),
  list: () => answer(['collection-1_0_0_5_5.sticker', 'collection-2_0_0_5_5.sticker', 'collection-3_0_0_5_5.sticker']),
  remove: () => answer(true),
  lassoRect: () => answer({left: 0, top: 0, right: 5, bottom: 5}),
  pageSize: () => answer({width: 1404, height: 1872}),
  saveSticker: () => answer(true),
  deleteLasso: () => answer(true),
  insertSticker: () => answer(true),
  closeView: () => answer(true),
  resize: () => answer(true),
  saveNote: () => answer(true),
  now: (() => {
    let clock = 0;
    return () => (clock += 7);
  })(),
  select: () => answer(true),
  ask: () => answer(true),
  toast: noop,
  fail: noop,
  log: noop,
};

/** The owner's tablet state of 2026-11-26 (#411): To-Do, Calendar and their accounts on, Digest off, after a sync. */
const OWNER_AT = new Date(2026, 10, 26, 3, 49).getTime();
const OWNER = accountSyncProvider(accountSyncProvider(accountSyncProvider(accountSyncProvider(accountSyncModule(accountSyncModule(accountSyncDefaults(), 'todo', true), 'calendar', true), 'todoist', true), 'google', true), 'icloud', true), 'ics', true);
const OWNER_RUNS = {
  todo: {module: 'todo' as const, at: OWNER_AT, counts: {added: 0, changed: 0, removed: 0}, errors: [], warnings: [], keptLocal: 233},
  calendar: {module: 'calendar' as const, at: OWNER_AT, counts: {added: 0, changed: 0, removed: 1}, errors: [], warnings: [], keptLocal: 0},
};
const OWNER_SIGN_INS = {todoist: {state: 'signedIn' as const, account: 'Test User (tester@example.com)'}, google: {state: 'signedIn' as const, account: 'tester@example.com'}, icloud: {state: 'signedIn' as const, account: 'tester@example.org'}};
/** Puzzles' host: every permission granted, none, none and Allow refused, or no answer (#453). */
type PuzzlesHost = 'granted' | 'refused' | 'denied' | 'failing';
const puzzlesPorts = (host: PuzzlesHost): PuzzlesPorts => ({
  has: async () => (host === 'failing' ? {ok: false, code: 118, message: 'no note open'} : {ok: true, value: host === 'granted'}),
  request: async () => ({ok: true, value: host === 'denied' ? 0 : 1}),
  log: noop,
});
/** Two synthetic games, so the list shows rows as a game issue adds them. */
const PUZZLES_GAMES: PuzzlesGame[] = [
  {id: 'sample-grid', title: 'Sample grid', subtitle: 'Fill every row and column once', View: () => <View />},
  {id: 'sample-words', title: 'Sample words', subtitle: 'Find the hidden words', View: () => <View />},
];
/** Presses the control named `label`, as the person would. */
const pressIn = (tree: ReactTestRenderer, label: string) =>
  act(async () => tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').props.onPress());
/** The Puzzles view on this host; `steps` presses the first game, then each label after it. */
const puzzles = async (host: PuzzlesHost, games: PuzzlesGame[] = [], steps: string[] = []) => {
  const tree = await mount(<PuzzlesView close={noop} ports={puzzlesPorts(host)} games={games} />);
  for (const label of steps) {
    await pressIn(tree, label);
  }
  return tree;
};
const OPEN_GAME = 'Sample grid, Fill every row and column once';
/** A maze page of the player's, with a path that goes one cell off the route (#386). */
const MAZE_CODE = 'MZ-10X13-E-7K2Q9X';
const mazeInk = () => {
  const maze = mazeFromCode(MAZE_CODE);
  const on = new Set(maze.solution);
  const k = maze.walls.findIndex(([a, b], i) => maze.open[i] && on.has(a) !== on.has(b));
  const [from, off] = on.has(maze.walls[k][0]) ? maze.walls[k] : [maze.walls[k][1], maze.walls[k][0]];
  const {grid} = mazeLayout(maze, 'portrait', 'right');
  const cells = [...maze.solution.slice(0, maze.solution.indexOf(from) + 1), off];
  return [{points: cells.map(cell => ({x: mazeCellCentre(maze, grid, cell)[0], y: mazeCellCentre(maze, grid, cell)[1]})), element: {}}];
};
/**
 * A cell game's page of the player's, partly filled: the first `count` open cells hold their digit,
 * but the eighth holds the next one and the thirteenth a mark the tablet cannot read (#397, #390).
 */
const cellInk = (grid: Grid, open: readonly (readonly [number, string])[], count: number, largest: number): InkStroke<object>[] =>
  open.slice(0, count).map(([cell, digit], i) => {
    const [x, y] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    const written = i === 7 ? String((Number(digit) % largest) + 1) : i === 12 ? 'x' : digit;
    return {points: [{x, y: y - grid.cell / 4}, {x, y: y + grid.cell / 4}], element: {digit: written}};
  });
const JIGSAW_CODE = 'JS-9-E-1';
const jigsawInk = () => cellInk(jigsawLayout().grid, [...jigsawExpected(jigsawFromCode(JIGSAW_CODE))], 30, 9);
const FUTOSHIKI_CODE = 'FU-6-M-1';
const futoshikiInk = () => {
  const puzzle = futoshikiFromCode(FUTOSHIKI_CODE);
  const open = puzzle.givens.flatMap((given, cell) => (given === 0 ? [[cell, String(puzzle.solution[cell])] as const] : []));
  return cellInk(drawFutoshikiPage(puzzle, {orientation: 'portrait', hand: 'right'}).layout.grid, open, 16, puzzle.size);
};
const SUDOKU_CODE = 'SU-9-M-1';
/** The largest grid, whose answers are numbers of two digits (#383). */
const SUDOKU_16_CODE = 'SU-16-E-1';
const sudokuInk = (code: string) => () => {
  const puzzle = sudokuFromCode(code);
  return cellInk(sudokuLayout(puzzle, 'portrait', 'right').grid, [...sudokuExpected(puzzle)], 30, Math.min(puzzle.shape.size, 9));
};
const KILLER_CODE = 'KS-9-M-1';
const killerInk = () => {
  const puzzle = killerFromCode(KILLER_CODE);
  const open = puzzle.givens.flatMap((given, cell) => (given === 0 ? [[cell, String(puzzle.solution[cell])] as const] : []));
  return cellInk(drawKillerPage(puzzle, {orientation: 'portrait', hand: 'right'}).layout.grid, open, 30, 9);
};
const CALCUDOKU_CODE = 'CD-6-M-1';
const calcudokuInk = () => {
  const puzzle = calcudokuFromCode(CALCUDOKU_CODE);
  const all = puzzle.solution.map((value, cell) => [cell, String(value)] as const);
  return cellInk(drawCalcudokuPage(puzzle, {orientation: 'portrait', hand: 'right'}).layout.grid, all, 20, puzzle.size);
};
/** The largest kakuro, whose page takes the 10 mm cells (#389). */
const KAKURO_CODE = 'KK-12-M-1';
const kakuroInk = () => {
  const puzzle = kakuroFromCode(KAKURO_CODE);
  return cellInk(drawKakuroPage(puzzle, {orientation: 'portrait', hand: 'right'}).layout.grid, [...kakuroAnswers(puzzle)], 40, 9);
};
/** The largest slitherlink, its loop drawn but for two edges, and one edge drawn off it (#391). */
const SLITHERLINK_CODE = 'SL-10X10-M-1';
const slitherlinkInk = () => {
  const puzzle = slitherlinkFromCode(SLITHERLINK_CODE);
  const text = {game: 'Slitherlink', difficulty: 'Medium', rule: ''};
  const {grid} = drawSlitherlinkPage(puzzle, {orientation: 'portrait', hand: 'right', text}).layout;
  const loop = slitherlinkLoop(puzzle);
  const off = slitherlinkEdgeKeys(puzzle.width, puzzle.height).find(key => !loop.includes(key)) as string;
  return [...loop.slice(2), off].map(key => {
    const [[x0, y0], [x1, y1]] = edgeEnds(grid, key);
    return {points: [{x: x0 + (x1 - x0) / 10, y: y0 + (y1 - y0) / 10}, {x: x1 - (x1 - x0) / 10, y: y1 - (y1 - y0) / 10}], element: {}};
  });
};
/** A Bridges page of 10 x 10, its bridges drawn but one, and one link drawn with a bridge too many (#396). */
const BRIDGES_CODE = 'BR-10X10-M-1';
const bridgesInk = () => {
  const puzzle = bridgesFromCode(BRIDGES_CODE);
  const {grid} = drawBridgesPage(puzzle, 'portrait', 'right').layout;
  const counts = puzzle.solution.slice();
  counts[counts.findIndex(count => count === 2)] = 0;
  counts[counts.findIndex(count => count === 1)] = 2;
  return bridgesAnswers(puzzle).flatMap(({from, to}, e) =>
    Array.from({length: counts[e]}, (_, i) => {
      const [[x0, y0], [x1, y1]] = linkLine(grid, from, to, (i - (counts[e] - 1) / 2) * grid.cell * VIEW_LINK_GAP);
      return {points: [{x: x0, y: y0}, {x: x1, y: y1}], element: {}};
    }),
  );
};
/** The largest nonogram, its picture shaded but for its last two cells, and one cell shaded off it (#384). */
const NONOGRAM_CODE = 'NO-15X15-M-1';
const nonogramInk = () => {
  const puzzle = nonogramFromCode(NONOGRAM_CODE);
  const {grid} = layoutNonogramPage(puzzle, {orientation: 'portrait', hand: 'right'});
  const filled = puzzle.solution.flatMap((on, cell) => (on ? [cell] : []));
  const off = puzzle.solution.findIndex(on => !on);
  return [...filled.slice(0, -2), off].map(cell => {
    const [x, y] = [grid.x + (cell % grid.columns) * grid.cell, grid.y + Math.floor(cell / grid.columns) * grid.cell];
    const rows = Array.from({length: 8}, (_, i) => y + grid.cell * (0.12 + i * 0.11));
    return {points: rows.flatMap(row => [{x: x + grid.cell * 0.12, y: row}, {x: x + grid.cell * 0.88, y: row}]), element: {}};
  });
};
/** The largest star battle with two stars a line, its stars drawn but for its last two, and one star off the answer (#392). */
const STAR_BATTLE_CODE = 'SB-10S2-H-1';
const starBattleInk = () => {
  const puzzle = starBattleFromCode(STAR_BATTLE_CODE);
  const {grid} = layoutStarBattle(puzzle, {orientation: 'portrait', hand: 'right'});
  const stars = puzzle.solution.flatMap((on, cell) => (on ? [cell] : []));
  const off = puzzle.solution.findIndex(on => !on);
  return [...stars.slice(0, -2), off].map(cell => {
    const [cx, cy] = cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
    const points = Array.from({length: 6}, (_, i) => {
      const angle = -Math.PI / 2 + (((2 * i) % 5) * 2 * Math.PI) / 5;
      return {x: cx + 0.35 * grid.cell * Math.cos(angle), y: cy + 0.35 * grid.cell * Math.sin(angle)};
    });
    return {points, element: {}};
  });
};
/**
 * The largest binairo, its open cells shaded for black and dotted for white but for the last two,
 * and one marked the other way (#393); with `unread`, the first cell that should be black dotted
 * instead and one cell holding a slash Check cannot read.
 */
const BINAIRO_CODE = 'BI-12-H-1';
const binairoInk = (unread = false) => () => {
  const puzzle = binairoFromCode(BINAIRO_CODE);
  const {grid} = layoutBinairoPage(puzzle, {orientation: 'portrait', hand: 'right'});
  const open = puzzle.givens.flatMap((given, cell) => (given === BINAIRO_OPEN ? [cell] : []));
  const marked = open.slice(0, -2);
  const wrong = unread ? marked.find(cell => puzzle.solution[cell] === 1)! : marked[0];
  const slashed = unread ? marked.find(cell => cell !== wrong)! : -1;
  const at = (cell: number) => [grid.x + (cell % grid.columns) * grid.cell, grid.y + Math.floor(cell / grid.columns) * grid.cell] as const;
  return marked.map(cell => {
    const [x, y] = at(cell);
    if (cell === slashed) {
      return {points: [{x: x + grid.cell * 0.2, y: y + grid.cell * 0.8}, {x: x + grid.cell * 0.8, y: y + grid.cell * 0.2}], element: {}};
    }
    const value = cell === wrong ? 1 - puzzle.solution[cell] : puzzle.solution[cell];
    if (value === 0) {
      return {points: [{x: x + grid.cell * 0.45, y: y + grid.cell * 0.45}, {x: x + grid.cell * 0.55, y: y + grid.cell * 0.55}], element: {}};
    }
    const rows = Array.from({length: 8}, (_, i) => y + grid.cell * (0.12 + i * 0.11));
    return {points: rows.flatMap(row => [{x: x + grid.cell * 0.12, y: row}, {x: x + grid.cell * 0.88, y: row}]), element: {}};
  });
};
/** A game's pages: the current page holds `code` and `ink`, which the tablet reads back, or the host cannot read it. */
const gamePages = (code: string | null, ink: () => InkStroke<object>[], failing = false): PuzzlesPages => ({
  here: async () => (failing ? {ok: false, code: 118, message: 'no note open'} : {ok: true, value: {notePath: '/Note/Puzzles.note', page: 0, size: {width: 1920, height: 2560}, orientation: 'portrait'}}),
  // A page made now: its background's name carries the current page layout (#553).
  codeOf: async () => ({ok: true, value: code === null ? null : placedPageCode(code)}),
  insert: async () => ({ok: true, value: true}),
  ink: async () => ({ok: true, value: ink()}),
  read: async (_here, elements) => ({ok: true, text: elements.map(element => (element as {digit?: string}).digit ?? '').join(' ').trim() || null}),
  clear: async () => ({ok: true, value: 0}),
  hide: async () => {},
  show: async () => {},
  log: noop,
});
/** A game's view on these pages; `steps` presses each label in turn. */
const puzzlesGame = async (game: PuzzleGame, ink: () => InkStroke<object>[], code: string | null, steps: string[] = [], failing = false) => {
  const tree = await mount(<PuzzlesGameView game={game} pages={gamePages(code, ink, failing)} seed={() => '7K2Q9X'} onBack={noop} onClose={noop} />);
  for (const label of steps) {
    await act(async () => {
      tree.root.find(node => (node.props.accessibilityLabel === label || node.props.children === label) && typeof node.props.onPress === 'function').props.onPress();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
  return tree;
};
const puzzlesMaze = (code: string | null, steps: string[] = [], failing = false) => puzzlesGame(MAZE, mazeInk, code, steps, failing);
const puzzlesJigsaw = (code: string | null, steps: string[] = []) => puzzlesGame(JIGSAW, jigsawInk, code, steps);
const puzzlesFutoshiki = (code: string | null, steps: string[] = []) => puzzlesGame(FUTOSHIKI, futoshikiInk, code, steps);
const puzzlesSudoku = (code: string | null, steps: string[] = []) => puzzlesGame(SUDOKU, sudokuInk(code ?? SUDOKU_CODE), code, steps);
const puzzlesKiller = (code: string | null, steps: string[] = []) => puzzlesGame(KILLER, killerInk, code, steps);
const puzzlesCalcudoku = (code: string | null, steps: string[] = []) => puzzlesGame(CALCUDOKU, calcudokuInk, code, steps);
const puzzlesKakuro = (code: string | null, steps: string[] = []) => puzzlesGame(KAKURO, kakuroInk, code, steps);
const puzzlesSlitherlink = (code: string | null, steps: string[] = []) => puzzlesGame(SLITHERLINK, slitherlinkInk, code, steps);
const puzzlesBridges = (code: string | null, steps: string[] = []) => puzzlesGame(BRIDGES, bridgesInk, code, steps);
const puzzlesNonogram = (code: string | null, steps: string[] = []) => puzzlesGame(NONOGRAM, nonogramInk, code, steps);
const puzzlesStarBattle = (code: string | null, steps: string[] = []) => puzzlesGame(STAR_BATTLE, starBattleInk, code, steps);
const puzzlesBinairo = (code: string | null, steps: string[] = [], unread = false) => puzzlesGame(BINAIRO, binairoInk(unread), code, steps);
/**
 * The largest hitori, a banked one (#394): every cell to shade hatched but the last, one white cell
 * hatched by mistake, and a circle round the first white cell, as a player keeps it white.
 */
const HITORI_CODE = 'HI-12-H-B0';
const hitoriInk = () => {
  const puzzle = hitoriFromCode(HITORI_CODE);
  const {grid} = hitoriLayout(puzzle, {orientation: 'portrait', hand: 'right'});
  const shaded = puzzle.solution.flatMap((black, cell) => (black ? [cell] : []));
  const white = puzzle.solution.flatMap((black, cell) => (black ? [] : [cell]));
  const at = (cell: number) => [grid.x + (cell % grid.columns) * grid.cell, grid.y + Math.floor(cell / grid.columns) * grid.cell] as const;
  const hatch = (cell: number) => {
    const [x, y] = at(cell);
    const rows = Array.from({length: 8}, (_, i) => y + grid.cell * (0.12 + i * 0.11));
    return {points: rows.flatMap(row => [{x: x + grid.cell * 0.12, y: row}, {x: x + grid.cell * 0.88, y: row}]), element: {}};
  };
  const [cx, cy] = cellCenter(grid, white[0] % grid.columns, Math.floor(white[0] / grid.columns));
  const ring = {points: Array.from({length: 33}, (_, i) => ({x: cx + grid.cell * 0.38 * Math.cos((i / 32) * 2 * Math.PI), y: cy + grid.cell * 0.38 * Math.sin((i / 32) * 2 * Math.PI)})), element: {}};
  return [...shaded.slice(0, -1), white[1]].map(hatch).concat([ring]);
};
const puzzlesHitori = (code: string | null, steps: string[] = []) => puzzlesGame(HITORI, hitoriInk, code, steps);
/**
 * The largest Light Up, a banked one (#395): a circle in every bulb cell but the last, one circle in
 * a cell with no bulb, and a dot in the first cell left without one, as a player marks it.
 */
const LIGHT_UP_CODE = 'LU-12X12-H-B0';
const lightUpInk = () => {
  const puzzle = lightUpFromCode(LIGHT_UP_CODE);
  const {grid} = drawLightUpPage(puzzle, {orientation: 'portrait', hand: 'right'}).layout;
  const bulbs = puzzle.solution.flatMap((bulb, cell) => (bulb ? [cell] : []));
  const empty = puzzle.walls.flatMap((wall, cell) => (wall || puzzle.solution[cell] ? [] : [cell]));
  const centre = (cell: number) => cellCenter(grid, cell % grid.columns, Math.floor(cell / grid.columns));
  const ring = (cell: number) => {
    const [cx, cy] = centre(cell);
    return {points: Array.from({length: 25}, (_, i) => ({x: cx + grid.cell * 0.3 * Math.cos((i / 24) * 2 * Math.PI), y: cy + grid.cell * 0.3 * Math.sin((i / 24) * 2 * Math.PI)})), element: {}};
  };
  const [dx, dy] = centre(empty[1]);
  return [...bulbs.slice(0, -1), empty[0]].map(ring).concat([{points: [{x: dx, y: dy}, {x: dx + 3, y: dy + 2}], element: {}}]);
};
const puzzlesLightUp = (code: string | null, steps: string[] = []) => puzzlesGame(LIGHT_UP, lightUpInk, code, steps);

const SYNC = {running: false, onSyncNow: noop};
/** Account Sync's Settings with these settings, runs and sign-ins, as App draws it (#411). */
const accountSync = (settings: AccountSyncSettingsValue, runs = {}, signIns = {}) =>
  mount(<AccountSyncSettings state={{kind: 'ready', sync: SYNC}} renderForm={onConnect => <AccountSyncForm settings={settings} onChange={noop} modules={accountSyncRows(settings, {todo: [], calendar: []}, runs, signIns, noop, noop)} onConnect={onConnect} now={OWNER_AT} />} onClose={noop} />);

// One line per screen, so adding one is one line.
// prettier-ignore
export const SCREENS: ScreenRender[] = [
  {name: 'ui-kit-needs', render: () => mount(<Needs problem={{what: 'Sample access is off', reason: 'The sample tool reads the sample folder to show your pictures.', fix: {label: 'Turn it on', run: () => {}}}} onClose={() => {}} />)},
  {name: 'ui-kit-needs-steps', render: () => mount(<Needs problem={{what: 'Sample setting is off', reason: 'Only you can turn it on.', fix: {steps: ['Open Settings on the tablet.', 'Turn on Sample setting.']}}} onClose={() => {}} />)},
  {name: 'ui-kit-error', render: () => mount(<ErrorView problem={{what: 'Device Link stopped with an error.', reason: 'The sample device did not answer.'}} onRetry={() => {}} onClose={() => {}} />)},
  {name: 'puzzles', render: () => puzzles('granted')},
  {name: 'puzzles-games', render: () => puzzles('granted', PUZZLES_GAMES)},
  {name: 'puzzles-needs', render: () => puzzles('refused', PUZZLES_GAMES, [OPEN_GAME])},
  {name: 'puzzles-needs-steps', render: () => puzzles('denied', PUZZLES_GAMES, [OPEN_GAME, 'Allow'])},
  {name: 'puzzles-error', render: () => puzzles('failing', PUZZLES_GAMES, [OPEN_GAME])},
  {name: 'puzzles-maze', render: () => puzzlesMaze(null)},
  {name: 'puzzles-maze-page', render: () => puzzlesMaze(MAZE_CODE)},
  {name: 'puzzles-maze-check', render: () => puzzlesMaze(MAZE_CODE, ['Check'])},
  {name: 'puzzles-maze-solution', render: () => puzzlesMaze(MAZE_CODE, ['Show Solution'])},
  {name: 'puzzles-maze-error', render: () => puzzlesMaze(null, [], true)},
  {name: 'puzzles-list', render: () => puzzles('granted', [...PUZZLES_LIST])},
  {name: 'puzzles-jigsaw', render: () => puzzlesJigsaw(null)},
  {name: 'puzzles-jigsaw-page', render: () => puzzlesJigsaw(JIGSAW_CODE)},
  {name: 'puzzles-jigsaw-check', render: () => puzzlesJigsaw(JIGSAW_CODE, ['Check'])},
  {name: 'puzzles-jigsaw-solution', render: () => puzzlesJigsaw(JIGSAW_CODE, ['Show Solution'])},
  {name: 'puzzles-sudoku', render: () => puzzlesSudoku(null)},
  {name: 'puzzles-sudoku-page', render: () => puzzlesSudoku(SUDOKU_CODE)},
  {name: 'puzzles-sudoku-check', render: () => puzzlesSudoku(SUDOKU_CODE, ['Check'])},
  {name: 'puzzles-sudoku-solution', render: () => puzzlesSudoku(SUDOKU_CODE, ['Show Solution'])},
  {name: 'puzzles-sudoku-16-solution', render: () => puzzlesSudoku(SUDOKU_16_CODE, ['Show Solution'])},
  {name: 'puzzles-killer', render: () => puzzlesKiller(null)},
  {name: 'puzzles-killer-page', render: () => puzzlesKiller(KILLER_CODE)},
  {name: 'puzzles-killer-check', render: () => puzzlesKiller(KILLER_CODE, ['Check'])},
  {name: 'puzzles-killer-solution', render: () => puzzlesKiller(KILLER_CODE, ['Show Solution'])},
  {name: 'puzzles-calcudoku', render: () => puzzlesCalcudoku(null)},
  {name: 'puzzles-calcudoku-page', render: () => puzzlesCalcudoku(CALCUDOKU_CODE)},
  {name: 'puzzles-calcudoku-check', render: () => puzzlesCalcudoku(CALCUDOKU_CODE, ['Check'])},
  {name: 'puzzles-calcudoku-solution', render: () => puzzlesCalcudoku(CALCUDOKU_CODE, ['Show Solution'])},
  {name: 'puzzles-futoshiki', render: () => puzzlesFutoshiki(null)},
  {name: 'puzzles-futoshiki-page', render: () => puzzlesFutoshiki(FUTOSHIKI_CODE)},
  {name: 'puzzles-futoshiki-check', render: () => puzzlesFutoshiki(FUTOSHIKI_CODE, ['Check'])},
  {name: 'puzzles-futoshiki-solution', render: () => puzzlesFutoshiki(FUTOSHIKI_CODE, ['Show Solution'])},
  {name: 'puzzles-kakuro', render: () => puzzlesKakuro(null)},
  {name: 'puzzles-kakuro-page', render: () => puzzlesKakuro(KAKURO_CODE)},
  {name: 'puzzles-kakuro-check', render: () => puzzlesKakuro(KAKURO_CODE, ['Check'])},
  {name: 'puzzles-kakuro-solution', render: () => puzzlesKakuro(KAKURO_CODE, ['Show Solution'])},
  {name: 'puzzles-slitherlink', render: () => puzzlesSlitherlink(null)},
  {name: 'puzzles-slitherlink-page', render: () => puzzlesSlitherlink(SLITHERLINK_CODE)},
  {name: 'puzzles-slitherlink-check', render: () => puzzlesSlitherlink(SLITHERLINK_CODE, ['Check'])},
  {name: 'puzzles-slitherlink-solution', render: () => puzzlesSlitherlink(SLITHERLINK_CODE, ['Show Solution'])},
  {name: 'puzzles-bridges', render: () => puzzlesBridges(null)},
  {name: 'puzzles-bridges-page', render: () => puzzlesBridges(BRIDGES_CODE)},
  {name: 'puzzles-bridges-check', render: () => puzzlesBridges(BRIDGES_CODE, ['Check'])},
  {name: 'puzzles-bridges-solution', render: () => puzzlesBridges(BRIDGES_CODE, ['Show Solution'])},
  {name: 'puzzles-nonogram', render: () => puzzlesNonogram(null)},
  {name: 'puzzles-nonogram-page', render: () => puzzlesNonogram(NONOGRAM_CODE)},
  {name: 'puzzles-nonogram-check', render: () => puzzlesNonogram(NONOGRAM_CODE, ['Check'])},
  {name: 'puzzles-nonogram-solution', render: () => puzzlesNonogram(NONOGRAM_CODE, ['Show Solution'])},
  {name: 'puzzles-star-battle', render: () => puzzlesStarBattle(null)},
  {name: 'puzzles-star-battle-page', render: () => puzzlesStarBattle(STAR_BATTLE_CODE)},
  {name: 'puzzles-star-battle-two', render: () => puzzlesStarBattle(null, [`${playCopy.size}: 10 x 10`, `${starBattleCopy.stars}: 2 stars`])},
  {name: 'puzzles-star-battle-check', render: () => puzzlesStarBattle(STAR_BATTLE_CODE, ['Check'])},
  {name: 'puzzles-star-battle-solution', render: () => puzzlesStarBattle(STAR_BATTLE_CODE, ['Show Solution'])},
  {name: 'puzzles-binairo', render: () => puzzlesBinairo(null)},
  {name: 'puzzles-binairo-page', render: () => puzzlesBinairo(BINAIRO_CODE)},
  {name: 'puzzles-binairo-check', render: () => puzzlesBinairo(BINAIRO_CODE, ['Check'])},
  {name: 'puzzles-binairo-check-unread', render: () => puzzlesBinairo(BINAIRO_CODE, ['Check'], true)},
  {name: 'puzzles-binairo-solution', render: () => puzzlesBinairo(BINAIRO_CODE, ['Show Solution'])},
  {name: 'puzzles-hitori', render: () => puzzlesHitori(null)},
  {name: 'puzzles-hitori-page', render: () => puzzlesHitori(HITORI_CODE)},
  {name: 'puzzles-hitori-check', render: () => puzzlesHitori(HITORI_CODE, ['Check'])},
  {name: 'puzzles-hitori-solution', render: () => puzzlesHitori(HITORI_CODE, ['Show Solution'])},
  {name: 'puzzles-light-up', render: () => puzzlesLightUp(null)},
  {name: 'puzzles-light-up-page', render: () => puzzlesLightUp(LIGHT_UP_CODE)},
  {name: 'puzzles-light-up-check', render: () => puzzlesLightUp(LIGHT_UP_CODE, ['Check'])},
  {name: 'puzzles-light-up-solution', render: () => puzzlesLightUp(LIGHT_UP_CODE, ['Show Solution'])},
  {name: 'puzzles-board', render: () => puzzlesGame(BOARDS[1], () => [], null)},
  {name: 'smart-pen-settings', render: () => mount(<SmartPenSettings close={() => {}} load={async () => DEFAULT_PEN_SETTINGS} save={async () => {}} apply={async () => {}} />)},
  {name: 'smart-pen-error', render: () => mount(<ErrorView problem={{what: smartPenTextCopy['toast.convertFailed'], reason: smartPenTextCopy['error.again']}} onClose={noop} />)},
  {name: 'lasso-actions-settings', render: () => mount(<LassoActionsSettings close={() => {}} />)},
  {name: 'lasso-actions-collection', render: () => mount(<LassoCollection close={noop} host={COLLECTION_HOST} />)},
  {name: 'ink-tools-probe', render: () => mount(<PluginDiagnostics close={noop} run={async () => ({lines: [], status: 'done'})} />)},
  {name: 'ink-tools-probe-done', render: () => diagnostics({lines: PROBE_LINES, status: 'done'}), raw: PROBE_LINES},
  {name: 'ink-tools-probe-needs', render: () => diagnostics({lines: [], status: 'needs', need: diagnosticsCopy['needs.native']}), raw: [diagnosticsCopy['needs.native'].command]},
  {name: 'ink-tools-probe-failed', render: () => diagnostics({lines: [], status: 'failed', reason: 'digest query DENIED SecurityException'})},
  {name: 'account-sync-owner', render: () => accountSync(OWNER, OWNER_RUNS, OWNER_SIGN_INS)},
  {name: 'account-sync-settings', render: () => accountSync(accountSyncDefaults())},
  {name: 'account-sync-signed-in', render: () => accountSync(SIGNED_IN, {}, {todoist: {state: 'signedIn', account: 'tester@example.com'}})},
  {name: 'account-sync-signed-in-long', render: () => accountSync(OWNER, {}, {todoist: {state: 'signedIn', account: accountName(`Sample Tester With A Very Long Given Name (${'sample.tester.with.a.long.address'.repeat(2)}@example.com)`)}, google: {state: 'signedIn'}, icloud: {state: 'signedIn', account: 'tester@example.org'}})},
  {name: 'account-sync-connect', render: () => accountSync(accountSyncModule(accountSyncDefaults(), 'calendar', true), {}, {google: {state: 'signedOut'}, icloud: {state: 'signedOut'}})},
  {name: 'account-sync-ics-feeds', render: () => accountSync(ICS_FEEDS)},
  {name: 'account-sync-error', render: () => mount(<AccountSyncSettings state={{kind: 'error', reason: 'The plugin folder did not answer.', onRetry: noop}} onClose={noop} />)},
  {name: 'account-sync-needs-connect', render: () => mount(<Needs problem={accountSyncConnect({id: 'icloud', name: 'iCloud', signIn: {state: 'signedOut'}, onSignOut: noop})} onClose={noop} />)},
  {name: 'ui-kit-loading', render: () => mount(<LoadingView title="Account Sync" onClose={() => {}} />)},
  {name: 'ui-kit-working', render: () => mount(<WorkingStrip working={WORKING} />), notFullView: 'the «Loading…» box sits over the note, as the native loading box does'},
  {name: 'ui-kit-controls', render: () => mount(<ControlsSheet />)},
  {name: 'image-editing-editor', render: () => imageEditor()},
  {name: 'image-editing-erase', render: () => imageEditor({draw: 'erase'})},
  {name: 'image-editing-erase-stroked', render: () => imageEditor({draw: 'erase', marks: [STROKE], strokes: ['/w/101-stroke.png']})},
  {name: 'device-link-pick', render: () => mount(<DeviceLinkPick title="Send Page" devices={TRANSFER_DEVICES} onPick={noop} onClose={noop} />)},
  {name: 'device-link-text', render: () => mount(<DeviceLinkText state={{phase: 'ready', text: 'Buy milk and bread', devices: TRANSFER_DEVICES.slice(0, 2)}} onSend={noop} onCancel={noop} />)},
  {name: 'device-link-receive', render: () => mount(<DeviceLinkReceive state="ready" onStop={noop} onClose={noop} />)},
  {name: 'device-link-settings', render: () => mount(<DeviceLinkSettings settings={{fingerprint: 'self', pins: {}, last: TRANSFER_DEVICES[0], background: true, deleteRefused: false}} devices={TRANSFER_DEVICES} onChoose={noop} onSearch={noop} onBackground={noop} onClose={noop} />)},
  {name: 'device-link-settings-searching', render: () => mount(<DeviceLinkSettings settings={{fingerprint: 'self', pins: {}, last: null, background: false, deleteRefused: false}} devices={null} onChoose={noop} onSearch={noop} onBackground={noop} onClose={noop} />)},
  {name: 'device-link-needs-permission', render: () => mount(<Needs problem={deviceLinkRefused('plugin.permission.FILE:READ')} onClose={noop} />)},
  {name: 'device-link-error', render: () => mount(<ErrorView problem={deviceLinkSendFailed(deviceLinkCopy.noImage)} onClose={noop} />)},
  {name: 'lasso-actions-needs-permission', render: () => mount(<Needs problem={lassoActionsPermission([LASSO_FILE_WRITE], noop)} onClose={noop} />)},
  {name: 'image-editing-error', render: () => mount(<ErrorView problem={{what: imageEditingCopy['press.failedTitle']('Enhance'), reason: imageEditingCopy['press.failedReason']}} onClose={noop} />)},
  {name: 'image-editing-crop', render: () => imageEditor({draw: 'crop', marks: [STROKE]})},
  {name: 'image-editing-opening', render: () => imageEditor({phase: 'opening'})},
  {name: 'image-editing-styles-failed', render: () => mount(<ImageStylesGrid state={{phase: 'failed', reason: 'render', enabled: ['photo']}} onPick={noop} onToggle={noop} onRetry={noop} onClose={noop} />)},
];
