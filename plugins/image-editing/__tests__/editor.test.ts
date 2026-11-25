/** The editor view's actions (#226): open on the lassoed picture, run each edit, draw, close. */
import {
  fail,
  ok,
  PICTURE_TYPE,
  STROKE_TYPE,
} from '@ink-tools/sn-adapter/official';
import type {Rect} from '@ink-tools/ink-core';
import {copy} from '../src/copy';
import {Done} from '../src/edit';
import {
  addMark,
  applyDrawing,
  cancelDrawing,
  clearMarks,
  closeEditor,
  DRAW_EDITS,
  EDITOR_GROUPS,
  EditorDeps,
  editorState,
  NO_LASSO_CODE,
  openEditor,
  resetEditorForTests,
  runDrawn,
  runEditorEdit,
  stylesDone,
} from '../src/editor';
import {EDITS, editOf, EditId} from '../src/edits';
import * as edit from '../src/edit';

const RECT: Rect = {left: 100, top: 200, right: 300, bottom: 400};
const MOVED: Rect = {left: 100, top: 200, right: 280, bottom: 380};
const picture = (rect: Rect = RECT) => ({type: PICTURE_TYPE, picture: {rect}});
const stroke = {type: STROKE_TYPE, numInPage: 3};

function fakeDeps(
  lassoed: object[] = [picture()],
  done: Done = {kind: 'edited', edit: 'enhance', ms: 5, rect: MOVED},
) {
  let previews = 0;
  const lassoes: Rect[] = [];
  const removed: string[] = [];
  const presses: EditId[] = [];
  const toasts: string[] = [];
  const deps: EditorDeps = {
    missing: jest.fn(async () => []),
    ask: jest.fn(async () => undefined),
    lassoed: jest.fn(async () => ok(lassoed)),
    recycle: jest.fn(async () => undefined),
    lasso: jest.fn(async rect => {
      lassoes.push(rect);
      return ok(true);
    }),
    workDir: async () => ok('/w'),
    preview: jest.fn(async path => {
      previews += 1;
      return ok(path);
    }),
    remove: jest.fn(async path => {
      removed.push(path);
    }),
    press: jest.fn(async (pressed, run, message) => {
      presses.push(pressed.id);
      // Each edit's own code has its own tests; only the pen edits' runs are checked here.
      const result = DRAW_EDITS.includes(pressed.id)
        ? await run(pressed.id)
        : done;
      if (result.kind !== 'edited') {
        message(`reason: ${result.kind}`);
      }
      return result;
    }),
    drawn: jest.fn(async () => done),
    styles: jest.fn(async () => undefined),
    toast: text => toasts.push(text),
    now: () => previews,
    log: () => undefined,
  };
  return {deps, lassoes, removed, presses, toasts};
}

const close = jest.fn();

beforeEach(() => {
  resetEditorForTests();
  close.mockClear();
  jest.restoreAllMocks();
});

/** Stands in for every edit's own code, which its own tests cover. */
function stubPress(done: Done) {
  return jest.spyOn(edit, 'runEdit').mockResolvedValue(done);
}

test('every edit is a button of exactly one group of the editor', () => {
  const grouped = EDITOR_GROUPS.flatMap(group => group.edits);
  expect([...grouped].sort()).toEqual(EDITS.map(e => e.id).sort());
  expect(new Set(grouped).size).toBe(grouped.length);
});

test('the editor opens on the lassoed picture with its preview', async () => {
  const {deps} = fakeDeps();
  await openEditor(deps);
  const state = editorState();
  expect(state).toMatchObject({
    phase: 'ready',
    rect: RECT,
    guided: false,
    busy: null,
    draw: null,
  });
  expect(state.phase === 'ready' && state.preview).toBe('/w/editor-0.png');
  expect(deps.recycle).toHaveBeenCalledTimes(1);
});

test('a lasso that is not one picture says so, and a missing permission asks', async () => {
  const two = fakeDeps([picture(), picture(MOVED)]);
  await openEditor(two.deps);
  expect(editorState()).toEqual({
    phase: 'failed',
    message: copy['press.notPicture'],
  });
  resetEditorForTests();
  const missing = fakeDeps();
  missing.deps.missing = async () => ['plugin.permission.FILE:READ'];
  await openEditor(missing.deps);
  expect(editorState()).toEqual({
    phase: 'failed',
    message: copy['press.permission'],
  });
  expect(missing.deps.ask).toHaveBeenCalledTimes(1);
  expect(missing.deps.lassoed).not.toHaveBeenCalled();
});

describe('a press with nothing lassoed, as from the toolbar button (#248)', () => {
  test('an empty lasso shows what the editor needs, not a failure', async () => {
    const {deps} = fakeDeps([]);
    await openEditor(deps);
    expect(editorState()).toEqual({phase: 'needs'});
  });

  test("the host's no-lasso code 904 shows the same Needs state", async () => {
    const {deps} = fakeDeps();
    deps.lassoed = jest.fn(async () =>
      fail(NO_LASSO_CODE, 'No lasso action has been performed. Cannot call the API!'),
    );
    await openEditor(deps);
    expect(editorState()).toEqual({phase: 'needs'});
  });

  test('any other refused lasso read is a failure that names it', async () => {
    const {deps} = fakeDeps();
    deps.lassoed = jest.fn(async () => fail(7, 'host busy'));
    await openEditor(deps);
    expect(editorState()).toEqual({
      phase: 'failed',
      message: copy['press.failed'](copy.title, 'getLassoElements: 7 host busy'),
    });
  });

  test('after Close, a press with a lassoed picture opens the editor clean', async () => {
    const empty = fakeDeps([]);
    await openEditor(empty.deps);
    await closeEditor(close, empty.deps);
    expect(editorState()).toEqual({phase: 'idle'});
    const {deps} = fakeDeps();
    await openEditor(deps);
    expect(editorState()).toMatchObject({phase: 'ready', rect: RECT, message: null});
  });

  test('a second press on the Needs state reads the lasso again', async () => {
    const empty = fakeDeps([]);
    await openEditor(empty.deps);
    const {deps} = fakeDeps();
    await openEditor(deps);
    expect(editorState()).toMatchObject({phase: 'ready'});
  });
});

test('a picture lassoed with pen marks opens guided', async () => {
  const {deps} = fakeDeps([picture(), stroke]);
  await openEditor(deps);
  expect(editorState()).toMatchObject({phase: 'ready', guided: true});
});

test('each edit lassoes the picture again, runs, and shows the picture at its new place', async () => {
  for (const id of [
    'enhance',
    'lighter',
    'darker',
    'document',
    'background',
    'undo',
    'restore',
  ] as EditId[]) {
    resetEditorForTests();
    const f = fakeDeps();
    await openEditor(f.deps);
    await runEditorEdit(editOf(id), close, f.deps);
    expect(f.presses).toEqual([id]);
    expect(f.lassoes).toEqual([RECT, MOVED]);
    expect(f.removed).toEqual(['/w/editor-0.png']);
    expect(editorState()).toMatchObject({
      phase: 'ready',
      rect: MOVED,
      preview: '/w/editor-1.png',
      busy: null,
      message: null,
    });
    expect(close).not.toHaveBeenCalled();
  }
});

test('an edit that changes nothing keeps the picture and shows its reason in the view', async () => {
  const f = fakeDeps();
  f.deps.press = jest.fn(async (_edit, _run, message) => {
    message(copy['press.notEdited']);
    return {kind: 'nothing' as const, why: edit.NOT_EDITED};
  });
  await openEditor(f.deps);
  await runEditorEdit(editOf('undo'), close, f.deps);
  expect(editorState()).toMatchObject({
    rect: RECT,
    preview: '/w/editor-0.png',
    message: copy['press.notEdited'],
  });
});

test('a picture no longer on the page says so and runs nothing', async () => {
  const f = fakeDeps();
  await openEditor(f.deps);
  f.deps.lasso = async () => ok(false);
  await runEditorEdit(editOf('enhance'), close, f.deps);
  expect(f.presses).toEqual([]);
  expect(editorState()).toMatchObject({
    busy: null,
    message: copy['editor.lost'],
  });
});

test('the page-wide edits run on the page, then close the view with the count', async () => {
  for (const id of ['enhance_all', 'undo_all'] as EditId[]) {
    resetEditorForTests();
    close.mockClear();
    const f = fakeDeps();
    f.deps.press = jest.fn(async (_edit, _run, message) => {
      message('2 of 3 pictures changed.');
      return {kind: 'done' as const, pictures: 3, edited: 2, skipped: []};
    });
    await openEditor(f.deps);
    await runEditorEdit(editOf(id), close, f.deps);
    expect(editorState()).toEqual({phase: 'idle'});
    expect(close).toHaveBeenCalledTimes(1);
    expect(f.toasts).toEqual(['2 of 3 pictures changed.']);
    expect(f.removed).toEqual(['/w/editor-0.png']);
  }
});

test('Styles opens the grid on the picture, and a picked style shows the picture again', async () => {
  const f = fakeDeps();
  await openEditor(f.deps);
  await runEditorEdit(editOf('styles'), close, f.deps);
  expect(f.deps.styles).toHaveBeenCalledTimes(1);
  expect(f.lassoes).toEqual([RECT]);
  expect(f.presses).toEqual([]);
  await stylesDone(
    {kind: 'edited', edit: 'dither', ms: 3, rect: MOVED},
    f.deps,
  );
  expect(editorState()).toMatchObject({
    rect: MOVED,
    preview: '/w/editor-1.png',
  });
});

test('Erase and Crop draw with the pen in the view, then run with the marks', async () => {
  for (const id of DRAW_EDITS) {
    resetEditorForTests();
    const f = fakeDeps();
    await openEditor(f.deps);
    await runEditorEdit(editOf(id), close, f.deps);
    expect(editorState()).toMatchObject({draw: id, marks: []});
    expect(f.presses).toEqual([]);
    addMark([
      {x: 120, y: 220},
      {x: 180, y: 260},
    ]);
    addMark([{x: 150, y: 300}]);
    await applyDrawing(editOf(id), close, f.deps);
    expect(f.deps.drawn).toHaveBeenCalledWith(id, RECT, [
      [
        {x: 120, y: 220},
        {x: 180, y: 260},
      ],
      [{x: 150, y: 300}],
    ]);
    expect(f.presses).toEqual([id]);
    expect(editorState()).toMatchObject({draw: null, marks: [], rect: MOVED});
  }
});

test('Clear marks empties the drawing, and Cancel goes back to the edits', async () => {
  const f = fakeDeps();
  await openEditor(f.deps);
  await runEditorEdit(editOf('erase'), close, f.deps);
  addMark([{x: 120, y: 220}]);
  clearMarks();
  expect(editorState()).toMatchObject({draw: 'erase', marks: []});
  addMark([{x: 120, y: 220}]);
  cancelDrawing();
  expect(editorState()).toMatchObject({draw: null, marks: []});
  expect(f.deps.drawn).not.toHaveBeenCalled();
});

test('with pen marks lassoed with the picture, Erase runs at once through the lasso', async () => {
  const f = fakeDeps([picture(), stroke]);
  await openEditor(f.deps);
  const runErase = jest
    .spyOn(require('../src/erase'), 'runErase')
    .mockResolvedValue({
      kind: 'edited',
      edit: 'erase',
      ms: 4,
      rect: MOVED,
    });
  await runEditorEdit(editOf('erase'), close, f.deps);
  expect(runErase).toHaveBeenCalledTimes(1);
  expect(f.presses).toEqual(['erase']);
  // The marks were deleted with the edit, so the next Erase draws in the view.
  expect(editorState()).toMatchObject({guided: false, draw: null});
});

test('drawn marks run through the same marks and box as the page-drawn path', async () => {
  const run = stubPress({kind: 'edited', edit: 'erase', ms: 1});
  await runDrawn('erase', RECT, [
    [
      {x: 110, y: 210},
      {x: 120, y: 230},
    ],
  ]);
  expect(run).toHaveBeenCalledWith(
    'erase',
    undefined,
    expect.objectContaining({
      marks: {points: [10, 10, 20, 30], ends: [2]},
    }),
  );
  await runDrawn('crop', RECT, [
    [
      {x: 120, y: 220},
      {x: 180, y: 290},
    ],
  ]);
  expect(run).toHaveBeenLastCalledWith(
    'crop',
    undefined,
    expect.objectContaining({
      box: {left: 20, top: 20, width: 60, height: 70},
    }),
  );
  run.mockClear();
  expect(await runDrawn('erase', RECT, [[{x: 10, y: 10}]])).toEqual({
    kind: 'nothing',
    why: 'the pen marks are not on the picture',
  });
  expect(run).not.toHaveBeenCalled();
});

test('Close and Back keep the edited picture on the page and remove the preview; never mid-edit', async () => {
  const f = fakeDeps();
  await openEditor(f.deps);
  let release!: () => void;
  f.deps.press = jest.fn(
    () =>
      new Promise(resolve => {
        release = () =>
          resolve({kind: 'edited', edit: 'enhance', ms: 1, rect: MOVED});
      }),
  );
  const running = runEditorEdit(editOf('enhance'), close, f.deps);
  await Promise.resolve();
  await Promise.resolve();
  await closeEditor(close, f.deps);
  expect(close).not.toHaveBeenCalled();
  release();
  await running;
  await closeEditor(close, f.deps);
  expect(close).toHaveBeenCalledTimes(1);
  expect(editorState()).toEqual({phase: 'idle'});
  expect(f.removed).toEqual(['/w/editor-0.png', '/w/editor-1.png']);
});

test('a failed preview read is said in the view', async () => {
  const f = fakeDeps();
  f.deps.preview = async () => fail(9, 'no preview');
  await openEditor(f.deps);
  expect(editorState()).toEqual({
    phase: 'failed',
    message: copy['editor.noPreview'],
  });
});
