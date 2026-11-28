/** The Note Editor's tablet helper (#312): each operation's calls in order, each refusal, the pen pause. */
import {ActionRefused, fail, HEADING_LEVELS, headingStyle, ok, TITLE_STYLE} from '@ink-tools/sn-adapter/official';
import {EDITOR_FOLDER, editAction, LIMITS, NO_HEADING, NOTES_FOLDER, type EditHost} from '../src/editor/operations';
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
    retext: (element, text, fontSize) => {
      calls.push(`retext ${JSON.stringify([element, text, fontSize])}`);
      return ok({...element, retexted: text});
    },
    transform: record('transform', {type: 0, transformed: true}),
    insertOpen: record('insertOpen', true),
    insertByPath: record('insertByPath', true),
    modifyOpen: record('modifyOpen', [4]),
    modifyByPath: record('modifyByPath', [4]),
    deleteOpen: record('deleteOpen', true),
    deleteByPath: record('deleteByPath', true),
    insertPage: record('insertPage', true),
    removePage: record('removePage', true),
    insertKeyword: record('insertKeyword', true),
    deleteKeyword: record('deleteKeyword', true),
    currentPage: async () => ok(1),
    bounds: async element => {
      calls.push(`bounds ${JSON.stringify(element)}`);
      return ok(RECT);
    },
    lasso: record('lasso', true),
    setTitle: record('setTitle', true),
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

  it("changes a text box's text and font size with its rect, in one modify (#264)", async () => {
    const {fake, calls} = host();
    const answer = await editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 4, rect: RECT, text: 'New\nline', fontSize: 48}]});
    expect(calls).toEqual([
      `getElement ${JSON.stringify([NOTE, 0, 4])}`,
      `place ${JSON.stringify([{type: 500}, 0, RECT])}`,
      `retext ${JSON.stringify([{type: 500, placed: true}, 'New\nline', 48])}`,
      `modifyByPath ${JSON.stringify([NOTE, 0, [{type: 500, placed: true, retexted: 'New\nline'}]])}`,
    ]);
    expect(answer).toMatchObject({results: [{ok: true, op: 'modifyElements', num: 4, retexted: true}]});
  });

  it('refuses a text for an element that is not a text box, and writes nothing (#264)', async () => {
    const {fake, calls} = host(OTHER, {getElement: async () => ok({type: 0})});
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 2, rect: RECT, text: 'x', fontSize: 40}]}));
    expect(refused.detail).toMatchObject({refusal: 'bad-request', step: 1});
    expect(calls).toEqual([]);
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

  it('transforms each stroke, read by its number, then modifies them in one call (#326)', async () => {
    const {fake, calls} = host(OTHER, {getElement: async (...args) => ok({type: 0, num: args[2]})});
    const matrix = [0, 1, -1, 0, 2000, 0];
    const answer = await editAction(fake)({path: NOTE, ops: [{op: 'transformElements', page: 1, nums: [2, 7], matrix}]});
    expect(calls).toEqual([
      `transform ${JSON.stringify([{type: 0, num: 2}, 1, matrix])}`,
      `transform ${JSON.stringify([{type: 0, num: 7}, 1, matrix])}`,
      `modifyByPath ${JSON.stringify([NOTE, 1, [{type: 0, transformed: true}, {type: 0, transformed: true}]])}`,
    ]);
    expect(answer).toMatchObject({results: [{ok: true, op: 'transformElements', transformed: 2}]});
  });

  it('refuses to transform a picture or a text box, which is sent a rect, and modifies nothing (#326)', async () => {
    const {fake, calls} = host(OTHER, {getElement: async () => ok({type: 200})});
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'transformElements', page: 0, nums: [3], matrix: [-1, 0, 0, 1, 500, 0]}]}));
    expect(refused.detail).toMatchObject({refusal: 'bad-request', step: 1});
    expect(calls).toEqual([]);
  });

  it('transforms on the open note after a save, through the open-note modify (#326)', async () => {
    const {fake, calls} = host(NOTE, {getElement: async () => ok({type: 0})});
    await editAction(fake)({path: NOTE, ops: [{op: 'transformElements', page: 0, nums: [1], matrix: [1, 0, 0, -1, 0, 800]}]});
    expect(calls.map(call => call.split(' ')[0])).toEqual(['save', 'transform', 'modifyOpen']);
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

  it('adds and removes a keyword by the note path, in the order sent (#346)', async () => {
    const {fake, calls} = host();
    const answer = await editAction(fake)({
      path: NOTE,
      ops: [
        {op: 'insertKeyword', page: 1, text: 'plan'},
        {op: 'deleteKeyword', page: 2, index: 0},
      ],
    });
    expect(calls).toEqual([`insertKeyword ${JSON.stringify([NOTE, 1, 'plan'])}`, `deleteKeyword ${JSON.stringify([NOTE, 2, 0])}`]);
    expect(answer).toMatchObject({results: [{ok: true, op: 'insertKeyword', page: 1}, {ok: true, op: 'deleteKeyword', page: 2, index: 0}]});
  });

  it(`takes a keyword of exactly ${LIMITS.keyword} characters (#346)`, async () => {
    const {fake, calls} = host();
    await editAction(fake)({path: NOTE, ops: [{op: 'insertKeyword', page: 0, text: 'k'.repeat(LIMITS.keyword)}]});
    expect(calls).toHaveLength(1);
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

  it('saves first for a keyword, which goes by path on the open note too (#346)', async () => {
    const {fake, calls} = host(NOTE);
    await editAction(fake)({path: NOTE, ops: [{op: 'insertKeyword', page: 0, text: 'idea'}, {op: 'deleteKeyword', page: 0, index: 1}]});
    expect(calls).toEqual(['save []', `insertKeyword ${JSON.stringify([NOTE, 0, 'idea'])}`, `deleteKeyword ${JSON.stringify([NOTE, 0, 1])}`]);
  });

  it('a failed save is refused save-failed, and nothing runs', async () => {
    const {fake, calls} = host(NOTE, {saveOpenNote: async () => ok(false)});
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'insertPage', page: 1, template: 'style_white'}]}));
    expect(refused.detail).toMatchObject({refusal: 'save-failed', openNote: NOTE, step: 1, results: []});
    expect(calls).toEqual([]);
  });
});

describe('a Heading is made from a lasso on the page on screen (#345)', () => {
  it('saves, lassoes the union of the named elements, then sets the level\'s style', async () => {
    const rects = [RECT, {left: 50, top: 250, right: 200, bottom: 450}];
    const {fake, calls} = host(NOTE, {bounds: async () => ok(rects.shift() ?? RECT)});
    const answer = await editAction(fake)({path: NOTE, ops: [{op: 'setHeading', page: 1, nums: [2, 3], level: 2}]});
    const union = {left: 50, top: 200, right: 300, bottom: 450};
    expect(calls).toEqual([
      'save []',
      `getElement ${JSON.stringify([NOTE, 1, 2])}`,
      `getElement ${JSON.stringify([NOTE, 1, 3])}`,
      `lasso ${JSON.stringify([union])}`,
      `setTitle ${JSON.stringify([headingStyle(2)])}`,
    ]);
    expect(answer).toMatchObject({results: [{ok: true, op: 'setHeading', page: 1, nums: [2, 3], level: 2, rect: union}]});
  });

  it('maps each level as the tablet\'s Heading buttons do, and level 0 removes the Heading', async () => {
    for (const level of HEADING_LEVELS) {
      const {fake, calls} = host(NOTE);
      await editAction(fake)({path: NOTE, ops: [{op: 'setHeading', page: 1, nums: [2], level}]});
      expect(calls.at(-1)).toBe(`setTitle ${JSON.stringify([headingStyle(level)])}`);
    }
    const {fake, calls} = host(NOTE);
    await editAction(fake)({path: NOTE, ops: [{op: 'setHeading', page: 1, nums: [2], level: NO_HEADING}]});
    expect(calls.at(-1)).toBe(`setTitle ${JSON.stringify([TITLE_STYLE.none])}`);
  });

  it.each([
    ['a closed note', OTHER, {}, 'not-open'],
    ['a page not on screen', NOTE, {currentPage: async () => ok(0)}, 'page-not-shown'],
    ['an element with no bounds', NOTE, {bounds: async () => ok(null)}, 'bad-request'],
    ['a lasso the tablet refuses', NOTE, {lasso: async () => ok(false)}, 'tablet-refused'],
    ['a title the tablet refuses', NOTE, {setTitle: async () => fail(905, 'no lasso')}, 'tablet-refused'],
  ] as const)('%s is refused, named', async (_name, open, overrides, name) => {
    const {fake, calls} = host(open, overrides as Partial<EditHost>);
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'setHeading', page: 1, nums: [2], level: 1}]}));
    expect(refused.detail).toMatchObject({refusal: name, step: 1, results: []});
    if (name === 'not-open' || name === 'page-not-shown') {
      expect(calls.filter(call => call.startsWith('lasso') || call.startsWith('setTitle'))).toEqual([]);
    }
  });

  it.each([
    ['a level above 4', {level: 5}],
    ['a level that is not a number', {level: 'h1'}],
    ['no element', {nums: []}],
  ])('%s is a bad request', async (_name, change) => {
    const {fake} = host(NOTE);
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'setHeading', page: 1, nums: [2], level: 1, ...change}]}));
    expect(refused.detail).toMatchObject({refusal: 'bad-request'});
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
    ['a matrix of five numbers', {path: NOTE, ops: [{op: 'transformElements', page: 0, nums: [1], matrix: [1, 0, 0, 1, 0]}]}, 'bad-request'],
    ['a matrix that flattens the stroke', {path: NOTE, ops: [{op: 'transformElements', page: 0, nums: [1], matrix: [1, 2, 2, 4, 0, 0]}]}, 'bad-request'],
    ['a matrix with no number', {path: NOTE, ops: [{op: 'transformElements', page: 0, nums: [1], matrix: [1, 0, 0, 1, 0, null]}]}, 'bad-request'],
    ['a transform of no element', {path: NOTE, ops: [{op: 'transformElements', page: 0, nums: [], matrix: [1, 0, 0, 1, 0, 0]}]}, 'bad-request'],
    ['a text with no font size', {path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 1, rect: RECT, text: 'x'}]}, 'bad-request'],
    ['a blank text', {path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 1, rect: RECT, text: '  ', fontSize: 40}]}, 'bad-request'],
    ['a text and a file', {path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 1, rect: RECT, text: 'x', fontSize: 40, file: `${EDITOR_FOLDER}p.png`}]}, 'bad-request'],
    ['a rect off the page', {path: NOTE, ops: [{op: 'modifyElements', page: 0, num: 1, rect: {left: 0, top: 0, right: 5000, bottom: 10}}]}, 'bad-request'],
    ['a template path outside MyStyle', {path: NOTE, ops: [{op: 'insertPage', page: 0, template: '/storage/emulated/0/Document/grid.png'}]}, 'bad-request'],
    ['a template path that climbs out of MyStyle', {path: NOTE, ops: [{op: 'insertPage', page: 0, template: `${CUSTOM_TEMPLATE_FOLDER}/../Note/grid.png`}]}, 'bad-request'],
    ['a template in a folder of MyStyle', {path: NOTE, ops: [{op: 'insertPage', page: 0, template: `${CUSTOM_TEMPLATE_FOLDER}/fonts/grid.png`}]}, 'bad-request'],
    ['an empty keyword', {path: NOTE, ops: [{op: 'insertKeyword', page: 0, text: ''}]}, 'bad-request'],
    ['a blank keyword', {path: NOTE, ops: [{op: 'insertKeyword', page: 0, text: '   '}]}, 'bad-request'],
    ['a keyword one character too long', {path: NOTE, ops: [{op: 'insertKeyword', page: 0, text: 'k'.repeat(LIMITS.keyword + 1)}]}, 'bad-request'],
    ['a keyword with a line break', {path: NOTE, ops: [{op: 'insertKeyword', page: 0, text: 'two\nlines'}]}, 'bad-request'],
    ['a keyword that is not a text', {path: NOTE, ops: [{op: 'insertKeyword', page: 0, text: 7}]}, 'bad-request'],
    ['a keyword index below 0', {path: NOTE, ops: [{op: 'deleteKeyword', page: 0, index: -1}]}, 'bad-request'],
    ['a keyword index that is not whole', {path: NOTE, ops: [{op: 'deleteKeyword', page: 0, index: 0.5}]}, 'bad-request'],
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

  it('a keyword the tablet refuses is tablet-refused, with its SDK code (#346)', async () => {
    const {fake} = host(OTHER, {deleteKeyword: async () => fail(904, 'no keyword 5')});
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'deleteKeyword', page: 0, index: 5}]}));
    expect(refused.message).toBe('tablet-refused: operation 1 (deleteKeyword): deleteKeyWord of keyword 5: no keyword 5');
    expect(refused.detail).toMatchObject({refusal: 'tablet-refused', sdkCode: 904});
  });

  it('a keyword on a page past the note is page-out-of-range (#346)', async () => {
    const {fake, calls} = host();
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'insertKeyword', page: 3, text: 'plan'}]}));
    expect(refused.detail).toMatchObject({refusal: 'page-out-of-range'});
    expect(calls).toEqual([]);
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

describe("shapes go as the tablet's own geometry element (#463)", () => {
  const line = {kind: 'geometry', shape: 'straightLine', points: [[10, 20], [300, 20]], penColor: 0, penWidth: 400};
  const square = [[100, 100], [300, 100], [300, 200], [100, 200], [100, 100]];
  const rectangle = {kind: 'geometry', shape: 'GEO_polygon', points: square, penColor: 0, penWidth: 400};
  const ellipse = {kind: 'geometry', shape: 'GEO_ellipse', center: [600, 800], major: 200, minor: 120, angle: 0, penColor: 0x9d, penWidth: 200};

  it('builds a line, a rectangle and an ellipse, then inserts them in one call', async () => {
    const built: unknown[] = [];
    const {fake, calls} = host(OTHER, {
      build: async spec => {
        built.push(spec);
        return ok({built: spec.kind});
      },
    });
    await editAction(fake, () => 0)({path: NOTE, ops: [{op: 'insertElements', page: 0, elements: [line, rectangle, ellipse]}]});
    expect(built).toEqual([
      {kind: 'geometry', shape: 'straightLine', points: [{x: 10, y: 20}, {x: 300, y: 20}], ellipse: null, penColor: 0, penWidth: 400},
      {kind: 'geometry', shape: 'GEO_polygon', points: square.map(([x, y]) => ({x, y})), ellipse: null, penColor: 0, penWidth: 400},
      {kind: 'geometry', shape: 'GEO_ellipse', points: [], ellipse: {center: {x: 600, y: 800}, major: 200, minor: 120, angle: 0}, penColor: 0x9d, penWidth: 200},
    ]);
    expect(calls).toEqual([`insertByPath ${JSON.stringify([NOTE, 0, [{built: 'geometry'}, {built: 'geometry'}, {built: 'geometry'}]])}`]);
  });

  it.each([
    ['a line of 3 points', {...line, points: [[1, 1], [2, 2], [3, 3]]}],
    ['an open polygon', {...rectangle, points: square.slice(0, 4)}],
    ['a polygon of 65 points', {...rectangle, points: [...Array.from({length: 64}, (_, i) => [10 + i, 10]), [10, 10]]}],
    ['a point off the page', {...line, points: [[10, 20], [2000, 20]]}],
    ['an ellipse past the page edge', {...ellipse, center: [100, 800]}],
    ['a circle with two radii', {...ellipse, shape: 'GEO_circle'}],
    ['a turned ellipse', {...ellipse, angle: 30}],
    ['an ellipse given points', {...ellipse, points: [[1, 1]]}],
    ['a colour outside the pen tones', {...line, penColor: 0x80}],
    ['a pen width outside the range', {...line, penWidth: 50}],
    ['a kind the tablet has but the helper does not send', {...line, shape: 'fiveStarsSignal'}],
  ])('%s is refused before any call', async (_name, element) => {
    const {fake, calls} = host();
    const refused = await refusal(editAction(fake)({path: NOTE, ops: [{op: 'insertElements', page: 0, elements: [element]}]}));
    expect(refused.detail).toEqual({refusal: 'bad-request', openNote: OTHER});
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
