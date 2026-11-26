import {createCommandRunner, LISTEN_MS, LISTEN_POLL_MS, pressCommand} from '../src/command';
import {
  ANSWER_CHUNK,
  PROBE_FOLDER,
  RENDER_PATH,
  answerLines,
  COMMAND_PATH,
  HelperError,
  LASSO_MARGIN,
  NOTES_FOLDER,
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
    jumpToPage: jest.fn().mockResolvedValue(undefined),
    renderPage: jest.fn().mockResolvedValue({pictures: 1}),
    insertPicture: jest.fn().mockResolvedValue(undefined),
    insertTextBox: jest.fn().mockResolvedValue(undefined),
    insertPage: jest.fn().mockResolvedValue(undefined),
    saveSticker: jest.fn().mockResolvedValue(undefined),
    insertSticker: jest.fn().mockResolvedValue(undefined),
    lassoBox: jest.fn().mockResolvedValue({left: 10, top: 20, right: 110, bottom: 220}),
    resizeLasso: jest.fn().mockResolvedValue(undefined),
    pluginFolder: jest.fn().mockResolvedValue('/data/plugins/x'),
    makeDir: jest.fn().mockResolvedValue(undefined),
    listFiles: jest.fn().mockResolvedValue(['1.sticker']),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    notePageCount: jest.fn().mockResolvedValue(4),
    notePageTemplate: jest.fn().mockResolvedValue('style_5mm_grid_a5x2'),
    notePageElements: jest.fn().mockResolvedValue([{type: 0}, {type: 500}]),
    insertNotePage: jest.fn().mockResolvedValue(undefined),
    insertNoteElements: jest.fn().mockResolvedValue(undefined),
    removeNotePage: jest.fn().mockResolvedValue(undefined),
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

test('jumpToPage jumps, then answers the page the note shows', async () => {
  const note = api({pageNumber: jest.fn().mockResolvedValue(4)});
  const {answer} = await runCommand(command({op: 'jumpToPage', page: 5}), note);
  expect(note.jumpToPage).toHaveBeenCalledWith(5);
  expect(answer).toMatchObject({ok: true, op: 'jumpToPage', page: 4});
});

test.each([
  ['a text that is not JSON', 'not json', 'the command is not JSON'],
  ['a command with no id', JSON.stringify({op: 'lassoLast'}), 'no hex id'],
  ['an unknown op', command({op: 'drawEverywhere'}), 'unknown op'],
  ['a point off the page', command({op: 'insertStrokes', strokes: [[[0, 0], [1921, 10]]]}), 'not [x, y] on the page'],
  ['a stroke of one point', command({op: 'insertStrokes', strokes: [[[0, 0]]]}), 'two points or more'],
  ['a rect with no width', command({op: 'lassoRect', rect: {left: 10, top: 10, right: 10, bottom: 50}})],
  ['a page that is not an index from 0', command({op: 'jumpToPage', page: -1}), 'page index from 0'],
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

test('renderPage writes the page to RENDER_PATH and answers the path (#261)', async () => {
  const note = api();
  const {answer} = await runCommand(command({op: 'renderPage', page: 3}), note);
  expect(note.renderPage).toHaveBeenCalledWith(3, RENDER_PATH);
  expect(answer).toMatchObject({ok: true, op: 'renderPage', page: 3, path: RENDER_PATH, pictures: 1});
});

test('insertPicture places a picture from the Probe folder only (#261)', async () => {
  const note = api({pageNumber: jest.fn().mockResolvedValue(1)});
  const path = `${PROBE_FOLDER}square.png`;
  const {answer} = await runCommand(command({op: 'insertPicture', path}), note);
  expect(note.insertPicture).toHaveBeenCalledWith(path);
  expect(answer).toMatchObject({ok: true, page: 1, path});
  for (const bad of ['/sdcard/Note/a.png', `${PROBE_FOLDER}../a.png`, `${PROBE_FOLDER}sub/a.png`, `${PROBE_FOLDER}a.gif`, `${PROBE_FOLDER}.png`]) {
    const refused = await runCommand(command({op: 'insertPicture', path: bad}), note);
    expect(refused.answer).toMatchObject({ok: false, code: 2});
  }
  expect(note.insertPicture).toHaveBeenCalledTimes(1);
});

test('insertTextBox checks the text, the rect and the font size before the note call (#261)', async () => {
  const note = api();
  const rect = {left: 100, top: 200, right: 900, bottom: 320};
  const {answer} = await runCommand(command({op: 'insertTextBox', text: 'Test box', rect, fontSize: 40}), note);
  expect(note.insertTextBox).toHaveBeenCalledWith('Test box', rect, 40);
  expect(answer).toMatchObject({ok: true, rect});
  for (const body of [
    {text: ' ', rect, fontSize: 40},
    {text: 'x'.repeat(501), rect, fontSize: 40},
    {text: 'ok', rect, fontSize: 7},
    {text: 'ok', rect, fontSize: 40.5},
    {text: 'ok', rect: {left: 10, top: 10, right: 5, bottom: 20}, fontSize: 40},
  ]) {
    const refused = await runCommand(command({op: 'insertTextBox', ...body}), note);
    expect(refused.answer).toMatchObject({ok: false, code: 2});
  }
  expect(note.insertTextBox).toHaveBeenCalledTimes(1);
});

test('insertPage inserts a page with a system template name only (#261)', async () => {
  const note = api();
  const {answer} = await runCommand(command({op: 'insertPage', page: 1, template: 'style_white'}), note);
  expect(note.insertPage).toHaveBeenCalledWith(1, 'style_white');
  expect(answer).toMatchObject({ok: true, page: 1, template: 'style_white'});
  const refused = await runCommand(command({op: 'insertPage', page: 1, template: '/sdcard/a.png'}), note);
  expect(refused.answer).toMatchObject({ok: false, code: 2});
});

const NOTE = `${NOTES_FOLDER}Tests/Move.note`;

/** The file API calls of one move, in the order the helper made them (#263). */
function moveCalls(note: Record<string, jest.Mock>): string[] {
  const names = ['notePageElements', 'insertNotePage', 'insertNoteElements', 'removeNotePage'];
  return names
    .flatMap(name => note[name].mock.calls.map((args, index) => ({name, args, order: note[name].mock.invocationCallOrder[index]})))
    .sort((left, right) => left.order - right.order)
    .map(call => `${call.name}(${call.args.slice(1).map((arg: unknown) => JSON.stringify(arg)).join(', ')})`);
}

test('movePage down copies the page after the target, then removes the old page (#263)', async () => {
  const note = api();
  const {answer} = await runCommand(command({op: 'movePage', path: NOTE, from: 0, to: 2}), note);
  expect(moveCalls(note)).toEqual([
    'notePageElements(0)',
    'insertNotePage(3, "style_5mm_grid")',
    'insertNoteElements(3, [{"type":0},{"type":500}])',
    'removeNotePage(0)',
  ]);
  expect(note.insertNotePage).toHaveBeenCalledWith(NOTE, 3, 'style_5mm_grid');
  expect(answer).toMatchObject({ok: true, op: 'movePage', from: 0, to: 2, template: 'style_5mm_grid', storedTemplate: 'style_5mm_grid_a5x2', elements: 2});
});

test('movePage up inserts at the target and removes the old page, now one further down (#263)', async () => {
  const note = api();
  await runCommand(command({op: 'movePage', path: NOTE, from: 3, to: 0, template: 'style_white'}), note);
  expect(moveCalls(note)).toEqual([
    'notePageElements(3)',
    'insertNotePage(0, "style_white")',
    'insertNoteElements(0, [{"type":0},{"type":500}])',
    'removeNotePage(4)',
  ]);
});

test('movePage of a blank page inserts no elements (#263)', async () => {
  const note = api({notePageElements: jest.fn().mockResolvedValue([])});
  await runCommand(command({op: 'movePage', path: NOTE, from: 1, to: 3}), note);
  expect(moveCalls(note)).toEqual(['notePageElements(1)', 'insertNotePage(4, "style_5mm_grid")', 'removeNotePage(1)']);
});

test('movePage refuses a one-page note, a page outside the note and a bad command before any change (#263)', async () => {
  const one = api({notePageCount: jest.fn().mockResolvedValue(1)});
  expect((await runCommand(command({op: 'movePage', path: NOTE, from: 0, to: 1}), one)).answer).toMatchObject({ok: false, code: 2});
  const note = api();
  for (const body of [
    {path: NOTE, from: 0, to: 4},
    {path: NOTE, from: 1, to: 1},
    {path: NOTE, from: -1, to: 1},
    {path: `${NOTES_FOLDER}Tests/../Move.note`, from: 0, to: 1},
    {path: '/storage/emulated/0/MyStyle/Move.note', from: 0, to: 1},
    {path: `${NOTES_FOLDER}Tests/Move.pdf`, from: 0, to: 1},
    {path: NOTE, from: 0, to: 1, template: '../x'},
  ]) {
    expect((await runCommand(command({op: 'movePage', ...body}), note)).answer).toMatchObject({ok: false, code: 2});
  }
  for (const changes of [one, note]) {
    expect(changes.insertNotePage).not.toHaveBeenCalled();
    expect(changes.removeNotePage).not.toHaveBeenCalled();
  }
});

test('movePage keeps the old page when the copy fails (#263)', async () => {
  const note = api({insertNoteElements: jest.fn().mockRejectedValue(new HelperError(1501, 'insertElements: no permission'))});
  const {answer} = await runCommand(command({op: 'movePage', path: NOTE, from: 0, to: 2}), note);
  expect(answer).toEqual({ok: false, code: 1501, message: 'insertElements: no permission'});
  expect(note.removeNotePage).not.toHaveBeenCalled();
});

test('a note call that fails in renderPage is an answer with its code (#261)', async () => {
  const note = api({renderPage: jest.fn().mockRejectedValue(new HelperError(802, 'generateNotePng: no note'))});
  const {answer} = await runCommand(command({op: 'renderPage', page: 0}), note);
  expect(answer).toEqual({ok: false, code: 802, message: 'generateNotePng: no note'});
});


describe('sticker and file probes for Collection (#249)', () => {
  test('saveSticker saves the lasso in the plugin folder, made first, and answers the path', async () => {
    const note = api();
    const {answer} = await runCommand(command({op: 'saveSticker', where: 'plugin', name: '1_10_20.sticker'}), note);
    expect(note.makeDir).toHaveBeenCalledWith('/data/plugins/x/collection/');
    expect(note.saveSticker).toHaveBeenCalledWith('/data/plugins/x/collection/1_10_20.sticker');
    expect(answer).toMatchObject({ok: true, path: '/data/plugins/x/collection/1_10_20.sticker'});
  });

  test('insertSticker from the Probe folder answers the page and the new lasso rect', async () => {
    const note = api({pageNumber: jest.fn().mockResolvedValue(3)});
    const {answer} = await runCommand(command({op: 'insertSticker', where: 'probe', name: 'a.sticker'}), note);
    expect(note.insertSticker).toHaveBeenCalledWith(`${PROBE_FOLDER}a.sticker`);
    expect(note.makeDir).not.toHaveBeenCalled();
    expect(answer).toMatchObject({ok: true, page: 3, rect: {left: 10, top: 20, right: 110, bottom: 220}});
  });

  test('saveSticker with a rect lassoes it in the same press, then saves', async () => {
    const note = api();
    const rect = {left: 100, top: 200, right: 900, bottom: 800};
    const {answer} = await runCommand(command({op: 'saveSticker', where: 'probe', name: 'a.sticker', rect}), note);
    expect(note.lasso).toHaveBeenCalledWith(rect);
    const order = (mock: unknown) => (mock as jest.Mock).mock.invocationCallOrder[0];
    expect(order(note.lasso)).toBeLessThan(order(note.saveSticker));
    expect(answer).toMatchObject({ok: true, counts: {trailNum: 1}});
  });

  test('insertSticker with moveTo moves the pasted piece in the same press', async () => {
    const note = api();
    const moveTo = {left: 300, top: 1500, right: 400, bottom: 1700};
    const {answer} = await runCommand(command({op: 'insertSticker', where: 'plugin', name: 'a.sticker', moveTo}), note);
    expect(note.resizeLasso).toHaveBeenCalledWith(moveTo);
    expect(answer).toMatchObject({ok: true, rect: {left: 10}, moved: {left: 10}});
  });

  test('resizeLasso moves the lasso and answers the rect read back', async () => {
    const note = api();
    const rect = {left: 500, top: 600, right: 600, bottom: 800};
    const {answer} = await runCommand(command({op: 'resizeLasso', rect}), note);
    expect(note.resizeLasso).toHaveBeenCalledWith(rect);
    expect(answer).toMatchObject({ok: true, op: 'resizeLasso'});
  });

  test('listFiles and deleteFile work in the named folder only', async () => {
    const note = api();
    expect((await runCommand(command({op: 'listFiles', where: 'plugin'}), note)).answer).toMatchObject({files: ['1.sticker']});
    await runCommand(command({op: 'deleteFile', where: 'plugin', name: '1.sticker'}), note);
    expect(note.deleteFile).toHaveBeenCalledWith('/data/plugins/x/collection/1.sticker');
  });

  test.each([['../x.sticker'], ['a/b'], [''], ['..']])('refuses the name %p before any note call', async name => {
    const note = api();
    const {answer} = await runCommand(command({op: 'deleteFile', where: 'plugin', name}), note);
    expect(answer).toMatchObject({ok: false, code: 2});
    expect(note.deleteFile).not.toHaveBeenCalled();
  });

  test('refuses a folder other than probe or plugin', async () => {
    const {answer} = await runCommand(command({op: 'listFiles', where: 'notes'}), api());
    expect(answer).toMatchObject({ok: false, code: 2, message: 'where must be probe or plugin'});
  });
});

describe('batch: many steps in one press (#286)', () => {
  const strokes = [[[100, 200], [120, 240]]];

  test('runs each step in order and answers each step with its own result', async () => {
    const note = api();
    const {id, answer} = await runCommand(
      command({op: 'batch', steps: [{op: 'insertStrokes', strokes}, {op: 'lassoLast'}, {op: 'insertStrokes', strokes}]}),
      note,
    );
    expect(id).toBe(ID);
    expect(answer).toMatchObject({ok: true, op: 'batch'});
    const steps = (answer as unknown as {steps: Array<Record<string, unknown>>}).steps;
    expect(steps.map(step => [step.ok, step.op])).toEqual([
      [true, 'insertStrokes'],
      [true, 'lassoLast'],
      [true, 'insertStrokes'],
    ]);
    expect(steps[0]).toMatchObject({page: 0, strokes: 1, rect: {left: 100, top: 200, right: 120, bottom: 240}});
    expect(note.insertStrokes).toHaveBeenCalledTimes(2);
  });

  test('stops at the first failure, keeping the answers of the steps before it', async () => {
    const insertStrokes = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new HelperError(1501, 'insertPageElements: no permission'));
    const note = api({insertStrokes});
    const steps = [1, 2, 3, 4].map(() => ({op: 'insertStrokes', strokes}));
    const {answer} = await runCommand(command({op: 'batch', steps}), note);
    expect(answer).toMatchObject({ok: false, code: 1501, step: 3, message: 'step 3 (insertStrokes): insertPageElements: no permission'});
    const answered = (answer as unknown as {steps: Array<Record<string, unknown>>}).steps;
    expect(answered.map(step => step.ok)).toEqual([true, true, false]);
    expect(insertStrokes).toHaveBeenCalledTimes(3);
  });

  test.each([
    ['no steps', {op: 'batch', steps: []}, 'steps must be a list of 1 to 64'],
    ['too many steps', {op: 'batch', steps: Array.from({length: 65}, () => ({op: 'lassoLast'}))}, '1 to 64'],
    ['a batch inside a batch', {op: 'batch', steps: [{op: 'batch', steps: [{op: 'lassoLast'}]}]}, 'step 1 must be one command'],
    ['a bad step', {op: 'batch', steps: [{op: 'lassoLast'}, {op: 'jumpToPage', page: -1}]}, 'step 2: page must be a page index'],
  ])('refuses %s before any note call', async (_name, body, message) => {
    const note = api();
    const {id, answer} = await runCommand(command(body), note);
    expect(id).toBe(ID);
    expect(answer).toMatchObject({ok: false, code: 2});
    expect(String((answer as {message: string}).message)).toContain(message);
    Object.values(note).forEach(call => expect(call).not.toHaveBeenCalled());
  });
});

describe('the listener between presses (#286)', () => {
  function fakeTimers() {
    let tick: (() => void) | null = null;
    return {
      timers: {
        setInterval: jest.fn((fn: () => void) => {
          tick = fn;
          return 1;
        }),
        clearInterval: jest.fn(() => {
          tick = null;
        }),
      },
      fire: () => tick?.(),
      running: () => tick !== null,
    };
  }

  function setup(first: string) {
    let file = first;
    let clock = 1000;
    const readCommand = jest.fn(async () => file);
    const lines: string[] = [];
    const fake = fakeTimers();
    const note = api();
    const runner = createCommandRunner(note, {ProbeProviders: {readCommand}}, line => lines.push(line), () => clock, fake.timers);
    return {
      runner,
      note,
      lines,
      fake,
      write: (text: string) => {
        file = text;
      },
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  const other = 'ffee0011';
  const second = JSON.stringify({id: other, op: 'lassoLast'});

  test('after a press, a new command in the file runs with no press', async () => {
    const run = setup(command({op: 'lassoLast'}));
    await run.runner.press();
    expect(run.fake.running()).toBe(true);
    run.write(second);
    await run.runner.listen();
    expect(run.lines.map(line => line.split(' ')[2])).toEqual([ID, other]);
    expect(run.note.lasso).toHaveBeenCalledTimes(2);
  });

  test('a command already run is never run again: a listener read skips it, a press logs its answer again', async () => {
    const run = setup(command({op: 'lassoLast'}));
    await run.runner.press();
    await run.runner.listen();
    await run.runner.press();
    expect(run.note.lasso).toHaveBeenCalledTimes(1);
    expect(run.lines).toHaveLength(2);
    expect(run.lines[1]).toBe(run.lines[0]);
  });

  test('a press while the listener runs the same command runs it once', async () => {
    const run = setup(command({op: 'lassoLast'}));
    await run.runner.press();
    run.write(second);
    let release: () => void = () => undefined;
    (run.note.lasso as jest.Mock).mockImplementationOnce(() => new Promise(resolve => (release = () => resolve({trailNum: 1}))));
    const listening = run.runner.listen();
    await new Promise(resolve => setImmediate(resolve));
    const pressing = run.runner.press();
    release();
    await Promise.all([listening, pressing]);
    expect(run.note.lasso).toHaveBeenCalledTimes(2);
    expect(run.lines.filter(line => line.includes(` ${other} `))).toHaveLength(1);
  });

  test('a listener read of a half-written file with no readable id logs nothing', async () => {
    const run = setup(command({op: 'lassoLast'}));
    await run.runner.press();
    run.write('{"op": "lassoLast"');
    await run.runner.listen();
    expect(run.lines).toHaveLength(1);
  });

  test('the listener stops LISTEN_MS after the last command', async () => {
    const run = setup(command({op: 'lassoLast'}));
    await run.runner.press();
    run.advance(LISTEN_MS + 1);
    run.fake.fire();
    expect(run.fake.running()).toBe(false);
    expect(run.fake.timers.setInterval).toHaveBeenCalledWith(expect.any(Function), LISTEN_POLL_MS);
  });
});
