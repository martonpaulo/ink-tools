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
  EDITOR_DEVICE,
  EDITOR_GROUPS,
  EditorDeps,
  editorState,
  finishErase,
  NO_LASSO_CODE,
  onEditorState,
  openEditor,
  resetEditorForTests,
  runDrawn,
  runEditorEdit,
  stylesDone,
  undoStroke,
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
  /** Each view erase: its source, destination and marks, in call order (#278). */
  const erased: {src: string; dest: string; marks: edit.Marks}[] = [];
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
    eraseView: jest.fn(async (src, dest, _picture, marks) => {
      erased.push({src, dest, marks});
      return ok(null);
    }),
    styles: jest.fn(async () => undefined),
    toast: text => toasts.push(text),
    now: () => previews,
    log: () => undefined,
  };
  return {deps, lassoes, removed, presses, toasts, erased};
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

test('Crop draws with the pen in the view, then runs with the marks', async () => {
  const f = fakeDeps();
  await openEditor(f.deps);
  await runEditorEdit(editOf('crop'), close, f.deps);
  expect(editorState()).toMatchObject({draw: 'crop', marks: []});
  expect(f.presses).toEqual([]);
  await addMark(
    [
      {x: 120, y: 220},
      {x: 180, y: 260},
    ],
    f.deps,
  );
  await addMark([{x: 150, y: 300}], f.deps);
  // Crop's marks are only shown, never erased in the view.
  expect(f.erased).toEqual([]);
  await applyDrawing(editOf('crop'), close, f.deps);
  expect(f.deps.drawn).toHaveBeenCalledWith('crop', RECT, [
    [
      {x: 120, y: 220},
      {x: 180, y: 260},
    ],
    [{x: 150, y: 300}],
  ]);
  expect(f.presses).toEqual(['crop']);
  expect(editorState()).toMatchObject({draw: null, marks: [], rect: MOVED});
});

/** An editor in Erase mode, its stroke images named by a counter. */
async function erasing() {
  const f = fakeDeps();
  let ms = 100;
  f.deps.now = () => (ms += 1);
  await openEditor(f.deps);
  await runEditorEdit(editOf('erase'), close, f.deps);
  return f;
}
const shownOf = () => {
  const state = editorState();
  return state.phase === 'ready'
    ? state.strokes[state.strokes.length - 1] ?? state.preview
    : null;
};

test('each Erase stroke is erased in the view when the pen lifts, the page untouched (#278)', async () => {
  const f = await erasing();
  const preview = shownOf();
  await addMark([{x: 120, y: 220}], f.deps);
  expect(f.erased).toEqual([
    {
      src: preview,
      dest: '/w/102-stroke.png',
      marks: {points: [20, 20], ends: [1]},
    },
  ]);
  expect(shownOf()).toBe('/w/102-stroke.png');
  await addMark([{x: 150, y: 300}], f.deps);
  // The second stroke erases the picture the first one left.
  expect(f.erased[1].src).toBe('/w/102-stroke.png');
  expect(shownOf()).toBe('/w/103-stroke.png');
  expect(f.presses).toEqual([]);
  expect(f.deps.drawn).not.toHaveBeenCalled();
});

test('strokes lifted while one is erased wait their turn, in order (#278)', async () => {
  const f = await erasing();
  const first = addMark([{x: 120, y: 220}], f.deps);
  await addMark([{x: 150, y: 300}], f.deps);
  await first;
  expect(f.erased.map(e => e.marks.points)).toEqual([
    [20, 20],
    [50, 100],
  ]);
  expect(editorState()).toMatchObject({
    strokes: ['/w/102-stroke.png', '/w/103-stroke.png'],
  });
});

test('Undo shows the picture before the last stroke; Cancel the one before Erase (#278)', async () => {
  const f = await erasing();
  const preview = shownOf();
  await addMark([{x: 120, y: 220}], f.deps);
  await addMark([{x: 150, y: 300}], f.deps);
  await undoStroke(f.deps);
  expect(shownOf()).toBe('/w/102-stroke.png');
  expect(editorState()).toMatchObject({marks: [[{x: 120, y: 220}]]});
  expect(f.removed).toEqual(['/w/103-stroke.png']);
  cancelDrawing(f.deps);
  await Promise.resolve();
  expect(editorState()).toMatchObject({draw: null, marks: [], strokes: []});
  expect(shownOf()).toBe(preview);
  expect(f.removed).toEqual(['/w/103-stroke.png', '/w/102-stroke.png']);
  expect(f.deps.drawn).not.toHaveBeenCalled();
  expect(f.presses).toEqual([]);
});

test('Done runs one page erase with every stroke shown, then removes the stroke images (#278)', async () => {
  const f = await erasing();
  await addMark([{x: 120, y: 220}], f.deps);
  await addMark([{x: 150, y: 300}], f.deps);
  // While the page erase runs, the view keeps the last stroke image, never the old picture.
  const whileBusy: string[][] = [];
  onEditorState(next => {
    if (next.phase === 'ready' && next.busy === 'erase') {
      whileBusy.push(next.strokes);
    }
  });
  await finishErase(close, f.deps);
  expect(whileBusy.length).toBeGreaterThan(0);
  for (const strokes of whileBusy) {
    expect(strokes[strokes.length - 1]).toBe('/w/103-stroke.png');
  }
  expect(f.presses).toEqual(['erase']);
  expect(f.deps.drawn).toHaveBeenCalledTimes(1);
  expect(f.deps.drawn).toHaveBeenCalledWith('erase', RECT, [
    [{x: 120, y: 220}],
    [{x: 150, y: 300}],
  ]);
  expect(editorState()).toMatchObject({draw: null, strokes: [], rect: MOVED});
  expect(f.removed).toEqual(
    expect.arrayContaining(['/w/102-stroke.png', '/w/103-stroke.png']),
  );
});

test('Done with no stroke left, or after Undo took them all, runs no page edit (#278)', async () => {
  const f = await erasing();
  await addMark([{x: 120, y: 220}], f.deps);
  await undoStroke(f.deps);
  await finishErase(close, f.deps);
  expect(editorState()).toMatchObject({draw: null, marks: [], strokes: []});
  expect(f.presses).toEqual([]);
});

test('a stroke off the picture or one that fails to erase drops out and says why (#278)', async () => {
  const f = await erasing();
  await addMark([{x: 10, y: 10}], f.deps);
  expect(editorState()).toMatchObject({
    marks: [],
    strokes: [],
    message: copy['editor.strokeOutside'],
  });
  f.deps.eraseView = async () => fail(1, 'no', 'IO');
  await addMark([{x: 120, y: 220}], f.deps);
  expect(editorState()).toMatchObject({
    marks: [],
    strokes: [],
    message: copy['editor.strokeFailed'],
  });
  expect(f.removed).toEqual(['/w/102-stroke.png']);
});

test('Close keeps the strokes shown erased on the page, as Done does, and leaves no stroke image (#278)', async () => {
  const f = await erasing();
  await addMark([{x: 120, y: 220}], f.deps);
  await addMark([{x: 150, y: 300}], f.deps);
  await closeEditor(close, f.deps);
  expect(f.deps.drawn).toHaveBeenCalledWith('erase', RECT, [
    [{x: 120, y: 220}],
    [{x: 150, y: 300}],
  ]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(editorState()).toEqual({phase: 'idle'});
  expect(f.removed).toEqual(
    expect.arrayContaining(['/w/102-stroke.png', '/w/103-stroke.png']),
  );
});

test('Cancel with a stroke still being erased leaves the page as it was and no stroke image (#278)', async () => {
  const f = await erasing();
  await addMark([{x: 120, y: 220}], f.deps);
  const pending = addMark([{x: 150, y: 300}], f.deps);
  cancelDrawing(f.deps);
  await pending;
  // The second stroke was never erased: Cancel came first.
  expect(f.erased).toHaveLength(1);
  expect(f.removed).toEqual(['/w/102-stroke.png']);
  expect(f.presses).toEqual([]);
});

test('the device erases the view with the page edit\'s own Java erase', async () => {
  const native = jest
    .spyOn(edit.DEVICE.native, 'erase')
    .mockResolvedValue(ok({width: 200, height: 200, left: 0, top: 0, ms: 1}));
  await EDITOR_DEVICE.eraseView('/w/a.png', '/w/b.png', RECT, {
    points: [1, 2],
    ends: [1],
  });
  expect(native).toHaveBeenCalledWith('/w/a.png', '', '/w/b.png', 200, 200, [1, 2], [1]);
});

test('Clear marks empties the drawing, and Cancel goes back to the edits', async () => {
  const f = fakeDeps();
  await openEditor(f.deps);
  await runEditorEdit(editOf('crop'), close, f.deps);
  await addMark([{x: 120, y: 220}], f.deps);
  clearMarks();
  expect(editorState()).toMatchObject({draw: 'crop', marks: []});
  await addMark([{x: 120, y: 220}], f.deps);
  cancelDrawing(f.deps);
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
