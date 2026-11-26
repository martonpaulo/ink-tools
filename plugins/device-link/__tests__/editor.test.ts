/** The Ink Notebook Editor's tablet helper (#312): each operation's calls in order, each refusal, the pen pause. */
import {ActionRefused, fail, ok} from '@ink-tools/sn-adapter/official';
import {EDITOR_FOLDER, editAction, LIMITS, NOTES_FOLDER, type EditHost} from '../src/editor/operations';
import {PEN_PAUSE, PenGate} from '../src/editor/penGate';
import {CUSTOM_TEMPLATE_FOLDER, templatesAction} from '../src/editor/templates';

const NOTE = `${NOTES_FOLDER}Tests/Editor.note`;
const OTHER = `${NOTES_FOLDER}Tests/Open.note`;
const RECT = {left: 100, top: 200, right: 300, bottom: 400};

function host(open: string | null = OTHER, overrides: Partial<EditHost> = {}) {
  const calls: string[] = [];
  const record =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      calls.push(`${name} ${JSON.stringify(args)}`);
      return ok(value);
    };
  const fake: EditHost = {
    openNote: async () => (open === null ? fail(1, 'no note open') : ok(open)),
    saveOpenNote: record('save', true),
    pageCount: async () => ok(3),
    build: async spec => {
      calls.push(`build ${spec.kind}`);
      return ok({built: spec.kind});
    },
    getElement: record('getElement', {type: 500}),
    place: record('place', {type: 500, placed: true}),
    insertOpen: record('insertOpen', true),
    insertByPath: record('insertByPath', true),
    modifyOpen: record('modifyOpen', [4]),
    modifyByPath: record('modifyByPath', [4]),
    deleteOpen: record('deleteOpen', true),
    deleteByPath: record('deleteByPath', true),
    insertPage: record('insertPage', true),
    removePage: record('removePage', true),
    penIdle: async () => true,
    ...overrides,
  };
  return {fake, calls};
}

async function refusal(run: Promise<unknown>): Promise<ActionRefused> {
  try {
    await run;
  } catch (error) {
    expect(error).toBeInstanceOf(ActionRefused);
    return error as ActionRefused;
  }
  throw new Error('the edit was not refused');
}

const text = {kind: 'text', text: 'Agenda', rect: RECT, fontSize: 40};

describe('operations on a closed note go through the file API by path', () => {
  it('inserts each element built, then inserts them in one call', async () => {
    const {fake, calls} = host();
    const stroke = {kind: 'stroke', points: [[10, 10], [20, 30]], penColor: 0x9d, thickness: 400};
    const answer = await editAction(fake, () => 0)({path: NOTE, ops: [{op: 'insertElements', page: 1, elements: [text, stroke]}]});
    expect(calls).toEqual(['build text', 'build stroke', `insertByPath ${JSON.stringify([NOTE, 1, [{built: 'text'}, {built: 'stroke'}]])}`]);
    expect(answer).toMatchObject({path: NOTE, open: false, openNote: OTHER, results: [{ok: true, op: 'insertElements', inserted: 2}]});
  });

  it('modifies one element: read by its number, placed at the rect, written back', async () => {
    const {fake, calls} = host();
    await editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 4, rect: RECT}]});
    expect(calls).toEqual([
      `getElement ${JSON.stringify([NOTE, 0, 4])}`,
      `place ${JSON.stringify([{type: 500}, 0, RECT])}`,
      `modifyByPath ${JSON.stringify([NOTE, 0, [{type: 500, placed: true}]])}`,
    ]);
  });

  it('moves a picture as the moved picture inserted, then the old one deleted (#312)', async () => {
    const file = `${EDITOR_FOLDER}picture-1.png`;
    const {fake, calls} = host(OTHER, {getElement: async () => ok({type: 200})});
    const answer = await editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 5, rect: RECT, file}]});
    expect(calls).toEqual(['build picture', `insertByPath ${JSON.stringify([NOTE, 0, [{built: 'picture'}]])}`, `deleteByPath ${JSON.stringify([NOTE, 0, [5]])}`]);
    expect(answer).toMatchObject({results: [{ok: true, op: 'modifyElements', num: 5, replaced: true}]});
  });

  it('moves a picture on the open note through the open-note calls (#312)', async () => {
    const {fake, calls} = host(NOTE, {getElement: async () => ok({type: 200})});
    await editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 1, rect: RECT, file: `${EDITOR_FOLDER}p.png`}]});
    expect(calls.map(call => call.split(' ')[0])).toEqual(['save', 'build', 'insertOpen', 'deleteOpen']);
  });

  it('refuses a picture move with no file, and never modifies it in place (#312)', async () => {
    const {fake, calls} = host(OTHER, {getElement: async () => ok({type: 200})});
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 5, rect: RECT}]}));
    expect(refused.detail).toMatchObject({refusal: 'bad-request', step: 1});
    expect(calls).toEqual([]);
  });

  it('refuses a modify file outside the helper folder (#312)', async () => {
    const {fake} = host();
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 5, rect: RECT, file: '/sdcard/x.png'}]}));
    expect(refused.detail).toMatchObject({refusal: 'bad-request'});
  });

  it('deletes, inserts a page and removes a page, in the order sent', async () => {
    const {fake, calls} = host();
    await editAction(fake)({
      path: NOTE,
      ops: [
        {op: 'deleteElements', page: 2, nums: [1, 5]},
        {op: 'insertPage', page: 3, template: 'style_white'},
        {op: 'removePage', page: 0},
      ],
    });
    expect(calls).toEqual([
      `deleteByPath ${JSON.stringify([NOTE, 2, [1, 5]])}`,
      `insertPage ${JSON.stringify([NOTE, 3, 'style_white'])}`,
      `removePage ${JSON.stringify([NOTE, 0])}`,
    ]);
  });

  it('openNote alone reads only, and answers the open note', async () => {
    const {fake, calls} = host();
    expect(await editAction(fake)({path: NOTE, ops: [{op: 'openNote'}]})).toMatchObject({openNote: OTHER});
    expect(calls).toEqual([]);
  });
});

describe('operations on the open note use the open-note calls', () => {
  it('element calls go through the page calls, with no save for an insert or delete', async () => {
    const {fake, calls} = host(NOTE);
    await editAction(fake)({
      path: NOTE,
      ops: [
        {op: 'insertElements', page: 0, elements: [text]},
        {op: 'deleteElements', page: 0, nums: [2]},
      ],
    });
    expect(calls).toEqual(['build text', `insertOpen ${JSON.stringify([0, [{built: 'text'}]])}`, `deleteOpen ${JSON.stringify([0, [2]])}`]);
  });

  it('saves first for a modify or a page change, then runs it', async () => {
    const {fake, calls} = host(NOTE);
    await editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 1, num: 2, rect: RECT}, {op: 'removePage', page: 2}]});
    expect(calls[0]).toBe('save []');
    expect(calls.slice(1).map(call => call.split(' ')[0])).toEqual(['getElement', 'place', 'modifyOpen', 'removePage']);
  });

  it('a failed save is refused save-failed, and nothing runs', async () => {
    const {fake, calls} = host(NOTE, {saveOpenNote: async () => ok(false)});
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'insertPage', page: 1, template: 'style_white'}]}));
    expect(refused.detail).toMatchObject({refusal: 'save-failed', openNote: NOTE, step: 1, results: []});
    expect(calls).toEqual([]);
  });
});

describe('each refusal is named, with the open note', () => {
  it.each([
    ['a path outside Note/', {path: '/storage/emulated/0/Document/a.note', ops: [{op: 'openNote'}]}, 'not-a-note'],
    ['a path with ..', {path: `${NOTES_FOLDER}../a.note`, ops: [{op: 'openNote'}]}, 'not-a-note'],
    ['no operation', {path: NOTE, ops: []}, 'bad-request'],
    ['too many operations', {path: NOTE, ops: Array.from({length: LIMITS.operations + 1}, () => ({op: 'openNote'}))}, 'bad-request'],
    ['an unknown op', {path: NOTE, ops: [{op: 'format'}]}, 'bad-request'],
    ['a colour that is not a pen tone', {path: NOTE, ops: [{op: 'insertElements', page: 0, elements: [{kind: 'stroke', points: [[1, 1], [2, 2]], penColor: 0xff0000, thickness: 400}]}]}, 'bad-request'],
    ['a rect off the page', {path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 1, rect: {left: 0, top: 0, right: 5000, bottom: 10}}]}, 'bad-request'],
    ['a template path outside MyStyle', {path: NOTE, ops: [{op: 'insertPage', page: 0, template: '/storage/emulated/0/Document/grid.png'}]}, 'bad-request'],
    ['a template path that climbs out of MyStyle', {path: NOTE, ops: [{op: 'insertPage', page: 0, template: `${CUSTOM_TEMPLATE_FOLDER}/../Note/grid.png`}]}, 'bad-request'],
    ['a template in a folder of MyStyle', {path: NOTE, ops: [{op: 'insertPage', page: 0, template: `${CUSTOM_TEMPLATE_FOLDER}/fonts/grid.png`}]}, 'bad-request'],
    ['a picture outside the helper folder', {path: NOTE, ops: [{op: 'insertElements', page: 0, elements: [{kind: 'picture', file: '/sdcard/x.png', rect: RECT}]}]}, 'bad-request'],
  ])('%s is refused before any call', async (_name, args, name) => {
    const {fake, calls} = host();
    const refused = await refusal(editAction(fake)(args as Record<string, unknown>));
    expect(refused.code).toBe(2);
    expect(refused.message.startsWith(`${name}: `)).toBe(true);
    expect(refused.detail).toEqual({refusal: name, openNote: OTHER});
    expect(calls).toEqual([]);
  });

  it('a picture in the helper folder is taken', async () => {
    const {fake, calls} = host();
    await editAction(fake)({path: NOTE, ops: [{op: 'insertElements', page: 0, elements: [{kind: 'picture', file: `${EDITOR_FOLDER}p1.png`, rect: RECT}]}]});
    expect(calls[0]).toBe('build picture');
  });

  it('a custom template is taken as the full path of its PNG in MyStyle (#451)', async () => {
    const {fake, calls} = host();
    await editAction(fake)({path: NOTE, ops: [{op: 'insertPage', page: 1, template: `${CUSTOM_TEMPLATE_FOLDER}/Week plan.png`}]});
    expect(calls).toEqual([`insertPage ${JSON.stringify([NOTE, 1, `${CUSTOM_TEMPLATE_FOLDER}/Week plan.png`])}`]);
  });

  it('a page past the note is page-out-of-range; inserting at the end is allowed', async () => {
    const {fake} = host();
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'removePage', page: 3}]}));
    expect(refused.detail).toMatchObject({refusal: 'page-out-of-range', step: 1});
    await editAction(fake)({path: NOTE, ops: [{op: 'insertPage', page: 3, template: 'style_white'}]});
  });

  it('an element the page does not hold is no-element', async () => {
    const {fake} = host(OTHER, {getElement: async () => fail(-1, 'page 0 has no element 9')});
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 9, rect: RECT}]}));
    expect(refused.detail).toMatchObject({refusal: 'no-element'});
  });

  it('an SDK error stops the batch as tablet-refused with code 1; the steps before it stay in the answer', async () => {
    const {fake, calls} = host(OTHER, {insertPage: async () => fail(802, 'bad template')});
    const refused = await refusal(
      editAction(fake, () => 0)({
        path: NOTE,
        ops: [{op: 'deleteElements', page: 0, nums: [1]}, {op: 'insertPage', page: 1, template: 'style_white'}, {op: 'removePage', page: 0}],
      }),
    );
    expect(refused.code).toBe(1);
    expect(refused.message).toBe('tablet-refused: operation 2 (insertPage): insertNotePage: bad template');
    expect(refused.detail).toMatchObject({refusal: 'tablet-refused', step: 2, sdkCode: 802, results: [{ok: true, op: 'deleteElements'}]});
    expect(calls.some(call => call.startsWith('removePage'))).toBe(false);
  });

  it('with no note open, openNote is null', async () => {
    const {fake} = host(null);
    expect(await editAction(fake)({path: NOTE, ops: [{op: 'openNote'}]})).toMatchObject({openNote: null, open: false});
  });

  it('the pen down past the wait is pen-down, and nothing runs', async () => {
    const {fake, calls} = host(OTHER, {penIdle: async () => false});
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'deleteElements', page: 0, nums: [1]}]}));
    expect(refused.detail).toEqual({refusal: 'pen-down', openNote: OTHER});
    expect(calls).toEqual([]);
  });
});

describe('the pen pause', () => {
  function clock() {
    let time = 10_000;
    return {
      now: () => time,
      sleep: jest.fn(async (ms: number) => {
        time += ms;
      }),
      advance: (ms: number) => (time += ms),
    };
  }

  it('waits while the pen is down and applies once it is up and quiet', async () => {
    const time = clock();
    const gate = new PenGate(time);
    gate.motion({action: 0});
    const waiting = gate.idle();
    // The pen lifts during the wait: the gate's own sleep advances the clock.
    time.sleep.mockImplementationOnce(async ms => {
      time.advance(ms);
      gate.motion({action: 1});
    });
    expect(await waiting).toBe(true);
    expect(time.now()).toBeGreaterThanOrEqual(10_000 + PEN_PAUSE.quietMs);
  });

  it('answers false when the pen stays down for PEN_PAUSE.waitMs', async () => {
    const time = clock();
    const gate = new PenGate(time);
    gate.motion({action: 0});
    gate.motion({action: 2});
    expect(await gate.idle()).toBe(false);
    expect(time.now()).toBe(10_000 + PEN_PAUSE.waitMs);
  });

  it('runs at once when the pen has not touched the page', async () => {
    const time = clock();
    expect(await new PenGate(time).idle()).toBe(true);
    expect(time.sleep).not.toHaveBeenCalled();
  });
});

describe('the action templates (#451)', () => {
  const entry = (name: string, folder = false) => ({path: `${CUSTOM_TEMPLATE_FOLDER}/${name}`, folder});

  it('lists the system templates by name and the PNGs straight in MyStyle by path, nothing else', async () => {
    const folders: string[] = [];
    const answer = await templatesAction({
      systemTemplates: async () => ok(['style_white', 'style_8mm_lines']),
      listFolder: async path => {
        folders.push(path);
        return ok([entry('week.png'), entry('Device Link 0.2.0.snplg'), entry('fonts', true), entry('Lookup', true), entry('Grid.PNG'), entry('.hidden.png')]);
      },
    })();
    expect(folders).toEqual([CUSTOM_TEMPLATE_FOLDER]);
    expect(answer).toEqual({
      line: 'DeviceLink: templates: 2 system, 2 custom',
      system: [{name: 'style_white'}, {name: 'style_8mm_lines'}],
      custom: [
        {name: 'Grid', path: `${CUSTOM_TEMPLATE_FOLDER}/Grid.PNG`},
        {name: 'week', path: `${CUSTOM_TEMPLATE_FOLDER}/week.png`},
      ],
    });
  });

  it('an empty MyStyle gives no custom template', async () => {
    const answer = await templatesAction({systemTemplates: async () => ok(['style_white']), listFolder: async () => ok([])})();
    expect(answer).toMatchObject({custom: []});
  });

  it('a failed system list or folder read is a failure, never an empty list', async () => {
    await expect(templatesAction({systemTemplates: async () => fail(-1, 'no list'), listFolder: async () => ok([])})()).rejects.toThrow('getNoteSystemTemplates failed: -1 no list');
    await expect(templatesAction({systemTemplates: async () => ok(['style_white']), listFolder: async () => fail(-1, 'Dir is not exists')})()).rejects.toThrow('Dir is not exists');
  });
});
