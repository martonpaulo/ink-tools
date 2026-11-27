/**
 * The editor view (#226): the one «Image Editing» lasso button opens it on the lassoed picture,
 * and every edit is a button there. Each edit keeps its own code: a tap runs the same `pressEdit`
 * a lasso row ran before, with the view's status line in place of the toast and the view's own
 * «Loading…» line in place of the strip. Before each edit the picture is lassoed again by its rect,
 * as src/page.ts does, since an edit replaces the element; the preview is read again after it. The
 * edit then takes the picture whose rect matches out of whatever that lasso holds, so ink or another
 * picture in its rect never stops it, and a picture that is gone, or a note or page that changed,
 * says so and changes nothing (#522).
 *
 * Erase and Crop take the pen on the picture in the view: the person draws over the preview, and
 * the marks, mapped to page pixels, run through the same `eraseMarks` and `cropBox` as the marks
 * drawn on the page. Erase shows each stroke erased when the pen lifts (#278): the Java erase runs
 * on the shown image into a stroke image, one refresh per stroke, and the page gets one erase edit
 * with every stroke at «Done»; «Undo» drops the last stroke and «Cancel» drops them all. sn-plugin-lib 0.2.3 types every motion as finger (1) or EMR pen (2), and a
 * plugin view is an ordinary React Native view, so its touch responder gets the pen as a pointer
 * [inference, not measured on the device, #134]. If the view never sees the pen, the lasso-drawn
 * path stays: marks drawn on the page and lassoed with the picture run Erase and Crop at once.
 * Back closes the view and leaves the edited picture on the page (#204).
 */
import type {Rect} from '@ink-tools/ink-core';
import {
  getLassoElements,
  lassoElements,
  lassoImage,
  NO_LASSO_CODE,
  PenPoint,
  recycleElement,
  Result,
} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
import {cropBox, GUIDE_OUTSIDE} from './crop';
import {
  DEVICE as EDIT_DEVICE,
  Done,
  FRAME_TOLERANCE,
  Marks,
  onePicture,
  pictureAt,
  removeFile,
  runEdit,
  sizeOf,
} from './edit';
import {eraseMarks, MARKS_OUTSIDE} from './erase';
import {
  currentSettings,
  EditDefinition,
  EditId,
  editOf,
  enabledStyles,
} from './edits';
import {splitGuides} from './guide';
import {NO_OPTIONS} from './native';
import {PRESS_DEVICE, PressDeps, pressEdit, runPress} from './press';
import {askFilePermissions} from './permissions';
import {PageDone, runPageEdit} from './page';
import {openStyles} from './styles';
import {showToast} from './working';

/** The edits drawn with the pen in the view. */
export type DrawEdit = 'erase' | 'crop';
export const DRAW_EDITS: readonly EditId[] = ['erase', 'crop'];

/** The page-wide edits: they change other pictures, so the view closes after them (#140). */
export const PAGE_WIDE: readonly EditId[] = ['enhance_all', 'undo_all'];

/** The editor's button groups, each under its heading, in the order the view shows them. */
export const EDITOR_GROUPS: readonly {
  heading: 'editor.edits' | 'editor.pen' | 'editor.back' | 'editor.page';
  edits: readonly EditId[];
}[] = [
  {
    heading: 'editor.edits',
    edits: [
      'enhance',
      'lighter',
      'darker',
      'document',
      'background',
      'sticker',
      'styles',
      'rotate',
      'mirror',
      'flip',
      'invert',
      'trim',
    ],
  },
  {heading: 'editor.pen', edits: DRAW_EDITS},
  {heading: 'editor.back', edits: ['undo', 'restore']},
  {heading: 'editor.page', edits: PAGE_WIDE},
];

/** The note and page the editor opened on (#522). */
export type Where = {note: string; page: number};

export type EditorState =
  | {phase: 'idle'}
  | {phase: 'opening'}
  | {phase: 'failed'; message: string}
  /** Nothing is lassoed, as after a toolbar press on a bare page (#248). */
  | {phase: 'needs'}
  | {
      phase: 'ready';
      /** The picture's place on the page now, in page pixels. */
      rect: Rect;
      /** The note and page it is on; null when the host did not answer at the open. */
      opened: Where | null;
      /** The lasso preview shown in the view. */
      preview: string;
      /** The lasso held pen marks with the picture when the view opened. */
      guided: boolean;
      /** The edit running now; the buttons wait. */
      busy: EditId | null;
      /** The pen edit being drawn, or null. */
      draw: DrawEdit | null;
      /** The marks drawn in the view, in page pixels. */
      marks: PenPoint[][];
      /**
       * Erase only (#278): the picture after each stroke already erased in the view, oldest
       * first; the view shows the last one, else `preview`. Nothing is on the page until Done.
       */
      strokes: string[];
      /** The last edit's outcome, when it changed nothing or failed. */
      message: string | null;
    };

type Ready = Extract<EditorState, {phase: 'ready'}>;

export type EditorDeps = {
  missing: () => Promise<string[]>;
  ask: () => Promise<void>;
  lassoed: () => Promise<Result<object[]>>;
  recycle: (element: object) => Promise<unknown>;
  lasso: (rect: Rect) => Promise<Result<boolean>>;
  /** The open note and page now; null when the host does not answer. */
  where: () => Promise<Where | null>;
  workDir: () => Promise<Result<string>>;
  preview: (pngPath: string) => Promise<Result<string>>;
  remove: (path: string) => Promise<void>;
  /** One tap's press, as a lasso row ran it, with `message` in place of the toast. */
  press: (
    edit: EditDefinition,
    run: (edit: EditId) => Promise<Done>,
    message: (text: string) => void,
  ) => Promise<Done | PageDone | null>;
  /** Opens the Styles grid on the lassoed picture (#133). */
  styles: () => Promise<void>;
  /** A pen edit with the marks drawn in the view. */
  drawn: (edit: DrawEdit, picture: Rect, marks: PenPoint[][]) => Promise<Done>;
  /** One edit's run on the editor's picture, found at `target` (#522). */
  run: (edit: EditId, target: Rect) => Promise<Done>;
  /** Erases `marks` from the image at `src` into `dest`, for the view only (#278). */
  eraseView: (
    src: string,
    dest: string,
    picture: Rect,
    marks: Marks,
  ) => Promise<Result<unknown>>;
  toast: (text: string) => void;
  now: () => number;
  log: (line: string) => void;
};

/**
 * What a pen edit drawn in the view runs: the same marks and box the page-drawn path makes, on the
 * picture at `picture` (#522).
 */
export async function runDrawn(
  edit: DrawEdit,
  picture: Rect,
  marks: PenPoint[][],
): Promise<Done> {
  if (edit === 'erase') {
    const found = eraseMarks(picture, marks);
    return found
      ? runEdit('erase', undefined, {...NO_OPTIONS, marks: found, target: picture})
      : {kind: 'nothing', why: MARKS_OUTSIDE};
  }
  const box = cropBox(picture, marks.flat());
  return box
    ? runEdit('crop', undefined, {...NO_OPTIONS, box, target: picture})
    : {kind: 'nothing', why: GUIDE_OUTSIDE};
}

export const EDITOR_DEVICE: EditorDeps = {
  missing: PRESS_DEVICE.missing,
  // The view shows, so the host shows the permission dialog at once.
  ask: () =>
    askFilePermissions().then(
      () => undefined,
      error => console.error(`Retouch: permissions: ${error}`),
    ),
  lassoed: getLassoElements,
  recycle: recycleElement,
  lasso: lassoElements,
  where: async () => {
    const note = await EDIT_DEVICE.notePath();
    const page = await EDIT_DEVICE.pageNum();
    return note.ok && page.ok ? {note: note.value, page: page.value} : null;
  },
  workDir: EDIT_DEVICE.workDir,
  preview: lassoImage,
  remove: path => removeFile(path, EDIT_DEVICE),
  press: (edit, run, message) => {
    const deps: PressDeps = {
      ...PRESS_DEVICE,
      ask: EDITOR_DEVICE.ask,
      edit: run,
      page: each => runPageEdit(each),
      toast: message,
    };
    return pressEdit(edit, deps);
  },
  drawn: runDrawn,
  run: (edit, target) => runPress(edit, target),
  // The page edit's own Java erase, on the shown image, with no original to keep.
  eraseView: (src, dest, picture, marks) => {
    const {width, height} = sizeOf(picture);
    return EDIT_DEVICE.native.erase(
      src,
      '',
      dest,
      width,
      height,
      marks.points,
      marks.ends,
    );
  },
  styles: () => openStyles(enabledStyles(currentSettings())),
  toast: showToast,
  now: Date.now,
  log: line => console.log(`Retouch: ${line}`),
};

let state: EditorState = {phase: 'idle'};
const listeners = new Set<(next: EditorState) => void>();

export function editorState(): EditorState {
  return state;
}

function setState(next: EditorState): void {
  state = next;
  listeners.forEach(listener => listener(next));
}

/** Calls `listener` on each change; answers the function that stops it. */
export function onEditorState(
  listener: (next: EditorState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const describe = (what: string, r: {code: number; message: string}) =>
  `${what}: ${r.code} ${r.message}`;

/** No element is lassoed (#248). */
const NO_LASSO = 'no lasso';

/** The picture the lasso holds, and whether pen marks came with it, or the reason it is not one. */
async function readLasso(
  deps: EditorDeps,
): Promise<{rect: Rect; guided: boolean} | string> {
  const lassoed = await deps.lassoed();
  if (!lassoed.ok) {
    deps.log(describe('editor: getLassoElements', lassoed));
    return lassoed.code === NO_LASSO_CODE
      ? NO_LASSO
      : copy['press.failed'](copy.title, describe('getLassoElements', lassoed));
  }
  if (lassoed.value.length === 0) {
    deps.log('editor: nothing lassoed');
    return NO_LASSO;
  }
  try {
    const alone = onePicture(lassoed.value);
    if (alone) {
      return {rect: {...alone.picture.rect}, guided: false};
    }
    const split = splitGuides(lassoed.value, {none: '', mixed: ''});
    return typeof split === 'string'
      ? copy['press.notPicture']
      : {rect: {...split.picture}, guided: true};
  } finally {
    await Promise.all(lassoed.value.map(element => deps.recycle(element)));
  }
}

/** Writes the lassoed picture's preview into the working folder; null, logged, on a failure. */
async function readPreview(deps: EditorDeps): Promise<string | null> {
  const work = await deps.workDir();
  if (!work.ok) {
    deps.log(describe('editor: getPluginDirPath', work));
    return null;
  }
  const preview = await deps.preview(`${work.value}/editor-${deps.now()}.png`);
  if (!preview.ok) {
    deps.log(describe('editor: generateLassoPreview', preview));
    return null;
  }
  return preview.value;
}

/**
 * The «Image Editing» button: reads the lassoed picture and shows it with every edit. A press
 * while the editor still shows an earlier picture reads the lasso again: the view's × closes it
 * without Close, so the next press showed the old picture, and an edit on it said the picture was
 * no longer on the page (measured on the Manta, 2026-11-27, #132, #522). Its strokes and preview
 * go, as Cancel and Close drop them; nothing while an edit runs.
 */
export async function openEditor(
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  const before = state;
  if (before.phase === 'opening' || (before.phase === 'ready' && before.busy !== null)) {
    return;
  }
  setState({phase: 'opening'});
  if (before.phase === 'ready') {
    deps.log('editor: pressed again: reading the lasso again');
    await deps.remove(before.preview);
    await dropStrokes(before, deps);
  }
  deps.log('editor: open');
  const missing = await deps.missing();
  if (missing.length > 0) {
    deps.log(`editor: missing ${missing.join(', ')}; asking`);
    setState({phase: 'failed', message: copy['press.permission']});
    await deps.ask();
    return;
  }
  const read = await readLasso(deps);
  if (read === NO_LASSO) {
    setState({phase: 'needs'});
    return;
  }
  if (typeof read === 'string') {
    setState({phase: 'failed', message: read});
    return;
  }
  const preview = await readPreview(deps);
  if (preview === null) {
    setState({phase: 'failed', message: copy['editor.noPreview']});
    return;
  }
  const opened = await deps.where();
  if (opened === null) {
    deps.log('editor: the open note or page did not answer');
  }
  setState({
    phase: 'ready',
    ...read,
    opened,
    preview,
    busy: null,
    draw: null,
    marks: [],
    strokes: [],
    message: null,
  });
}

const ready = (): Ready | null => (state.phase === 'ready' ? state : null);

/** The picture found again: its rect now, and whether the lasso holds it alone. */
type Found = {rect: Rect; alone: boolean};

/** `rect` grown by `by` page pixels on every side, never past the page's top left. */
const grown = (rect: Rect, by: number): Rect => ({
  left: Math.max(0, rect.left - by),
  top: Math.max(0, rect.top - by),
  right: rect.right + by,
  bottom: rect.bottom + by,
});

/** The picture at `rect` among what the lasso holds now, or null; the elements are recycled. */
async function matchLassoed(rect: Rect, deps: EditorDeps): Promise<Found | null> {
  const lassoed = await deps.lassoed();
  if (!lassoed.ok) {
    deps.log(describe('editor: getLassoElements', lassoed));
    return null;
  }
  try {
    const picture = pictureAt(lassoed.value, rect);
    return picture
      ? {rect: {...picture.picture.rect}, alone: lassoed.value.length === 1}
      : null;
  } finally {
    await Promise.all(lassoed.value.map(element => deps.recycle(element)));
  }
}

/**
 * Lassoes the picture at `at.rect` again, so the next edit reads it (an edit replaces it), and
 * finds it in that lasso (#522). A picture's reported rect may lie up to {@link FRAME_TOLERANCE}
 * from its drawn frame, so when the rect itself lassoes nothing it is tried grown by that much.
 * The value is the picture found, or the line that says why it is not.
 */
async function relasso(at: Ready, deps: EditorDeps): Promise<Found | string> {
  if (at.opened !== null) {
    const now = await deps.where();
    if (now !== null && (now.note !== at.opened.note || now.page !== at.opened.page)) {
      deps.log(`editor: the note or page changed: ${now.note} page ${now.page}`);
      return copy['editor.changed'];
    }
  }
  for (const rect of [at.rect, grown(at.rect, FRAME_TOLERANCE)]) {
    const lassoed = await deps.lasso(rect);
    if (!lassoed.ok || lassoed.value !== true) {
      deps.log(
        lassoed.ok ? 'editor: lasso: false' : describe('editor: lasso', lassoed),
      );
      continue;
    }
    const found = await matchLassoed(at.rect, deps);
    if (found) {
      return found;
    }
    deps.log('editor: no picture at its rect in the lasso');
  }
  return copy['editor.gone'];
}

/**
 * A tap on an edit. A pen edit with no marks lassoed with the picture starts drawing in the view;
 * a page-wide edit runs on the page and closes the view; every other edit runs on the picture,
 * which is then shown again.
 */
export async function runEditorEdit(
  edit: EditDefinition,
  closeView: () => void,
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  const at = ready();
  if (!at || at.busy !== null) {
    return;
  }
  deps.log(`editor: ${edit.id}`);
  if (DRAW_EDITS.includes(edit.id) && !at.guided) {
    setState({
      ...at,
      draw: edit.id as DrawEdit,
      marks: [],
      strokes: [],
      message: null,
    });
    return;
  }
  await runOnPicture(at, edit, deps.run, closeView, deps);
}

/** «Apply» while drawing: the pen edit runs with the marks drawn in the view. */
export async function applyDrawing(
  edit: EditDefinition,
  closeView: () => void,
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  const at = ready();
  if (!at || at.busy !== null || at.draw === null) {
    return;
  }
  const {draw, marks} = at;
  await runOnPicture(
    // Erase's last stroke image stays on screen while the page edit runs: no flash back (#278).
    {...at, draw: null, marks: []},
    edit,
    (_, target) => deps.drawn(draw, target, marks),
    closeView,
    deps,
  );
}

async function runOnPicture(
  before: Ready,
  edit: EditDefinition,
  run: (edit: EditId, target: Rect) => Promise<Done>,
  closeView: () => void,
  deps: EditorDeps,
): Promise<void> {
  setState({...before, busy: edit.id, message: null});
  const found = await relasso(before, deps);
  if (typeof found === 'string') {
    setState({...before, busy: null, strokes: [], message: found});
    return;
  }
  const at: Ready = {...before, rect: found.rect};
  if (edit.id === 'styles') {
    // The grid renders every style from the lasso preview, which would draw the ink in (#522).
    if (!found.alone) {
      setState({...at, busy: null, message: copy['editor.inkOnPicture']});
      return;
    }
    // The grid shows over the editor; a picked style comes back through `stylesDone`.
    setState({...at, busy: null});
    await deps.styles();
    return;
  }
  let message: string | null = null;
  const done = await deps.press(
    edit,
    id => run(id, found.rect),
    text => {
      message = text;
    },
  );
  if (PAGE_WIDE.includes(edit.id)) {
    setState({phase: 'idle'});
    await deps.remove(at.preview);
    closeView();
    if (message !== null) {
      deps.toast(message);
    }
    return;
  }
  await showAfter({...at, busy: edit.id}, done, message, deps);
}

/** Shows the picture again after an edit: its new place, a fresh preview, the outcome's line. */
async function showAfter(
  at: Ready,
  done: Done | PageDone | null,
  message: string | null,
  deps: EditorDeps,
): Promise<void> {
  const edited = done !== null && done.kind === 'edited' ? done : null;
  const rect = edited?.rect ? {...edited.rect} : at.rect;
  let preview = at.preview;
  if (edited && typeof (await relasso({...at, rect}, deps)) !== 'string') {
    const fresh = await readPreview(deps);
    if (fresh !== null) {
      await deps.remove(at.preview);
      preview = fresh;
    }
  }
  // An edit deletes the marks lassoed with the picture, so the next pen edit draws in the view.
  const guided = at.guided && !edited;
  setState({...at, rect, preview, guided, busy: null, strokes: [], message});
}

/** A style picked in the grid (#133) ran on the picture: show it again. */
export async function stylesDone(
  done: Done | null,
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  const at = ready();
  if (at) {
    await showAfter(at, done, null, deps);
  }
}

/** The Erase strokes' renders, one after another, so a stroke lifted meanwhile waits its turn. */
let renders: Promise<void> = Promise.resolve();

/**
 * A pen stroke drawn on the picture in the view, already in page pixels. In Erase it is erased in
 * the view at once (#278); in Crop its dots show.
 */
export function addMark(
  points: readonly PenPoint[],
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  const at = ready();
  if (!at || at.draw === null || points.length === 0) {
    return renders;
  }
  setState({...at, marks: [...at.marks, [...points]]});
  if (at.draw === 'erase') {
    renders = renders.then(() => renderStroke(deps));
  }
  return renders;
}

/** Erases the first stroke not shown yet into its own image, and shows it. */
async function renderStroke(deps: EditorDeps): Promise<void> {
  const at = ready();
  if (!at || at.draw !== 'erase' || at.strokes.length >= at.marks.length) {
    return;
  }
  const shown = at.strokes.length;
  const mark = at.marks[shown];
  const src = shown === 0 ? at.preview : at.strokes[shown - 1];
  // A stroke that is not shown erased drops out, so Done erases only what the person saw.
  const drop = (message: string) => {
    const now = ready();
    if (now && now.marks.includes(mark)) {
      setState({...now, marks: now.marks.filter(m => m !== mark), message});
    }
  };
  const marks = eraseMarks(at.rect, [mark]);
  if (!marks) {
    drop(copy['editor.strokeOutside']);
    return;
  }
  const work = await deps.workDir();
  if (!work.ok) {
    deps.log(describe('editor: stroke: getPluginDirPath', work));
    drop(copy['editor.strokeFailed']);
    return;
  }
  const dest = `${work.value}/${deps.now()}-stroke.png`;
  const erased = await deps.eraseView(src, dest, at.rect, marks);
  const now = ready();
  // Cancel, Close or Undo took the stroke away while it was erased.
  if (!now || now.draw !== 'erase' || now.marks[shown] !== mark) {
    await deps.remove(dest);
    return;
  }
  if (!erased.ok) {
    deps.log(describe('editor: stroke: erase', erased));
    await deps.remove(dest);
    drop(copy['editor.strokeFailed']);
    return;
  }
  setState({...now, strokes: [...now.strokes, dest], message: null});
}

/** The stroke images of `at`, removed: nothing of them stays in the working folder. */
function dropStrokes(at: Ready, deps: EditorDeps): Promise<unknown> {
  return Promise.all(at.strokes.map(path => deps.remove(path)));
}

/** «Undo» in Erase (#278): the last stroke goes, once every stroke is shown. */
export async function undoStroke(
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  await renders;
  const at = ready();
  if (!at || at.draw !== 'erase' || at.busy !== null || at.marks.length === 0) {
    return;
  }
  const strokes = at.strokes.slice(0, at.marks.length - 1);
  const gone = at.strokes.slice(strokes.length);
  setState({...at, marks: at.marks.slice(0, -1), strokes, message: null});
  await Promise.all(gone.map(path => deps.remove(path)));
}

/** «Done» in Erase (#278): one page erase with every stroke shown, then back to the edits. */
export async function finishErase(
  closeView: () => void,
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  await renders;
  const at = ready();
  if (!at || at.draw !== 'erase' || at.busy !== null) {
    return;
  }
  if (at.marks.length === 0) {
    setState({...at, draw: null, strokes: []});
    return;
  }
  await applyDrawing(editOf('erase'), closeView, deps);
  await dropStrokes(at, deps);
}

/** «Clear marks» in Crop. */
export function clearMarks(): void {
  const at = ready();
  if (at && at.draw !== null) {
    setState({...at, marks: []});
  }
}

/** «Cancel» while drawing: back to the edits, the marks and the erased strokes gone. */
export function cancelDrawing(deps: EditorDeps = EDITOR_DEVICE): void {
  const at = ready();
  if (at && at.draw !== null && at.busy === null) {
    setState({...at, draw: null, marks: [], strokes: []});
    // Removal needs no wait: the view already shows the preview.
    dropStrokes(at, deps);
  }
}

/**
 * «Close», and Back outside a pen mode: the page keeps every edit; the preview goes. Nothing
 * while an edit runs. Erase strokes shown erased are kept on the page first, as «Done» does (#278).
 */
export async function closeEditor(
  closeView: () => void,
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  const before = state;
  if (
    before.phase === 'ready' &&
    before.busy === null &&
    before.draw === 'erase' &&
    before.marks.length > 0
  ) {
    await finishErase(closeView, deps);
  }
  const at = state;
  if (at.phase === 'opening' || (at.phase === 'ready' && at.busy !== null)) {
    return;
  }
  setState({phase: 'idle'});
  if (at.phase === 'ready') {
    await deps.remove(at.preview);
    await dropStrokes(at, deps);
  }
  closeView();
}

/** The editor's state back to idle, for tests. */
export function resetEditorForTests(): void {
  state = {phase: 'idle'};
  renders = Promise.resolve();
  listeners.clear();
}
