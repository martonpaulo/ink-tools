import {pressCommand} from '../src/command';
import {
  ANSWER_CHUNK,
  answerLines,
  COMMAND_PATH,
  HelperError,
  LASSO_MARGIN,
  parseCommand,
  runCommand,
  type HelperApi,
} from '../src/helper';

const ID = 'a1b2c3d4';

function api(overrides: Partial<HelperApi> = {}): HelperApi & Record<string, jest.Mock> {
  return {
    pageNumber: jest.fn().mockResolvedValue(0),
    insertStrokes: jest.fn().mockResolvedValue(undefined),
    lasso: jest.fn().mockResolvedValue({trailNum: 1}),
    lastElementRect: jest.fn().mockResolvedValue({left: 100, top: 200, right: 300, bottom: 260}),
    lassoStrokes: jest.fn().mockResolvedValue([[{x: 1, y: 2}, {x: 3, y: 4}]]),
    ...overrides,
  } as HelperApi & Record<string, jest.Mock>;
}

const command = (body: object) => JSON.stringify({id: ID, ...body});

test('insertStrokes puts the strokes on the current page and answers their rect', async () => {
  const note = api({pageNumber: jest.fn().mockResolvedValue(2)});
  const {id, answer} = await runCommand(command({op: 'insertStrokes', strokes: [[[10, 20], [30, 40]], [[5, 50], [6, 60]]]}), note);
  expect(id).toBe(ID);
  expect(note.insertStrokes).toHaveBeenCalledWith(
    [
      [{x: 10, y: 20}, {x: 30, y: 40}],
      [{x: 5, y: 50}, {x: 6, y: 60}],
    ],
    2,
  );
  expect(answer).toMatchObject({ok: true, op: 'insertStrokes', page: 2, strokes: 2, rect: {left: 5, top: 20, right: 30, bottom: 60}});
});

test('lassoRect lassoes the given rect and answers the counts', async () => {
  const note = api();
  const rect = {left: 10, top: 10, right: 400, bottom: 300};
  const {answer} = await runCommand(command({op: 'lassoRect', rect}), note);
  expect(note.lasso).toHaveBeenCalledWith(rect);
  expect(answer).toMatchObject({ok: true, counts: {trailNum: 1}});
});

test('lassoLast lassoes the last element with a margin on each side', async () => {
  const note = api();
  await runCommand(command({op: 'lassoLast'}), note);
  expect(note.lasso).toHaveBeenCalledWith({
    left: 100 - LASSO_MARGIN,
    top: 200 - LASSO_MARGIN,
    right: 300 + LASSO_MARGIN,
    bottom: 260 + LASSO_MARGIN,
  });
});

test('readLasso answers each lassoed stroke as [x, y] pairs', async () => {
  const {answer} = await runCommand(command({op: 'readLasso'}), api());
  expect(answer).toMatchObject({ok: true, strokes: [[[1, 2], [3, 4]]]});
});

test.each([
  ['a text that is not JSON', 'not json', 'the command is not JSON'],
  ['a command with no id', JSON.stringify({op: 'lassoLast'}), 'no hex id'],
  ['an unknown op', command({op: 'drawEverywhere'}), 'unknown op'],
  ['a point off the page', command({op: 'insertStrokes', strokes: [[[0, 0], [1921, 10]]]}), 'not [x, y] on the page'],
  ['a stroke of one point', command({op: 'insertStrokes', strokes: [[[0, 0]]]}), 'two points or more'],
  ['a rect with no width', command({op: 'lassoRect', rect: {left: 10, top: 10, right: 10, bottom: 50}})],
])('%s is refused before any note call', async (_name, text, message = '') => {
  const note = api();
  const {answer} = await runCommand(text, note);
  expect(answer).toMatchObject({ok: false, code: 2});
  expect(String((answer as {message: string}).message)).toContain(message);
  Object.values(note).forEach(call => expect(call).not.toHaveBeenCalled());
});

test('a refused command keeps its id, so inkctl reads its answer', async () => {
  const {id} = await runCommand(command({op: 'drawEverywhere'}), api());
  expect(id).toBe(ID);
  expect(parseCommand(command({op: 'lassoLast'})).id).toBe(ID);
});

test('a note call that fails is an answer with the SDK code, never a throw', async () => {
  const note = api({lasso: jest.fn().mockRejectedValue(new HelperError(1501, 'lassoElements: no permission'))});
  const {answer} = await runCommand(command({op: 'lassoLast'}), note);
  expect(answer).toEqual({ok: false, code: 1501, message: 'lassoElements: no permission'});
});

test('a long answer is split in numbered chunks that join back to the JSON', () => {
  const answer = {ok: true, strokes: 'x'.repeat(ANSWER_CHUNK * 2)};
  const lines = answerLines(ID, answer);
  expect(lines).toHaveLength(3);
  expect(lines[0].startsWith(`SNPROBE answer ${ID} 1/3 `)).toBe(true);
  const joined = lines.map(line => line.replace(/^SNPROBE answer \S+ \d+\/\d+ /, '')).join('');
  expect(JSON.parse(joined)).toEqual(answer);
});

test('a press reads the command file and logs the answer', async () => {
  const readCommand = jest.fn().mockResolvedValue(command({op: 'lassoLast'}));
  const lines: string[] = [];
  await pressCommand(api(), {ProbeProviders: {readCommand}}, line => lines.push(line));
  expect(readCommand).toHaveBeenCalledWith(COMMAND_PATH);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(new RegExp(`^SNPROBE answer ${ID} 1/1 \\{"ok":true,"op":"lassoLast"`));
});

test('a press with no readable file answers once, as unknown', async () => {
  const readCommand = jest.fn().mockRejectedValue(new Error('not in /storage/emulated/0/MyStyle/Probe'));
  const lines: string[] = [];
  await pressCommand(api(), {ProbeProviders: {readCommand}}, line => lines.push(line));
  expect(lines).toEqual([expect.stringMatching(/^SNPROBE answer unknown 1\/1 \{"ok":false,"code":1,"message":"command file: not in /)]);
});
