/**
 * The editor view (#226): the one «Image Editing» lasso button opens it on the lassoed picture,
 * and every edit is a button there. Each edit keeps its own code: a tap runs the same `pressEdit`
 * a lasso row ran before, with the view's status line in place of the toast and the view's own
 * «Loading…» line in place of the strip. Before each edit the picture is lassoed again by its rect,
 * as src/page.ts does, since an edit replaces the element; the preview is read again after it.
 *
 * Erase and Crop take the pen on the picture in the view: the person draws over the preview, and
 * the marks, mapped to page pixels, run through the same `eraseMarks` and `cropBox` as the marks
 * drawn on the page. sn-plugin-lib 0.2.3 types every motion as finger (1) or EMR pen (2), and a
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
  PenPoint,
  recycleElement,
  Result,
} from '@ink-tools/sn-adapter/official';
import {copy} from './copy';
import {cropBox, GUIDE_OUTSIDE} from './crop';
import {
  DEVICE as EDIT_DEVICE,
  Done,
  onePicture,
  removeFile,
  runEdit,
} from './edit';
import {eraseMarks, MARKS_OUTSIDE} from './erase';
import {currentSettings, EditDefinition, EditId, enabledStyles} from './edits';
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
  toast: (text: string) => void;
  now: () => number;
  log: (line: string) => void;
};

/** What a pen edit drawn in the view runs: the same marks and box the page-drawn path makes. */
export async function runDrawn(
  edit: DrawEdit,
  picture: Rect,
  marks: PenPoint[][],
): Promise<Done> {
  if (edit === 'erase') {
    const found = eraseMarks(picture, marks);
    return found
      ? runEdit('erase', undefined, {...NO_OPTIONS, marks: found})
      : {kind: 'nothing', why: MARKS_OUTSIDE};
  }
  const box = cropBox(picture, marks.flat());
  return box
    ? runEdit('crop', undefined, {...NO_OPTIONS, box})
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

/**
 * The picture the lasso holds, and whether pen marks came with it, or the reason it is not one.
 * shortcut: the tablet's answer to `getLassoElements` with no lasso is not measured, so a failure
 * and an empty list both read as no lasso; split them once the device check of #248 logs it.
 */
async function readLasso(
  deps: EditorDeps,
): Promise<{rect: Rect; guided: boolean} | string> {
  const lassoed = await deps.lassoed();
  if (!lassoed.ok) {
    deps.log(describe('editor: getLassoElements', lassoed));
    return NO_LASSO;
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

/** The «Image Editing» button: reads the lassoed picture and shows it with every edit. */
export async function openEditor(
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  if (state.phase === 'opening' || state.phase === 'ready') {
    return;
  }
  setState({phase: 'opening'});
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
  setState({
    phase: 'ready',
    ...read,
    preview,
    busy: null,
    draw: null,
    marks: [],
    message: null,
  });
}

const ready = (): Ready | null => (state.phase === 'ready' ? state : null);

/** Lassoes the picture again by its rect, so the next edit reads it (an edit replaces it). */
async function relasso(rect: Rect, deps: EditorDeps): Promise<boolean> {
  const lassoed = await deps.lasso(rect);
  if (!lassoed.ok || lassoed.value !== true) {
    deps.log(
      lassoed.ok ? 'editor: lasso: false' : describe('editor: lasso', lassoed),
    );
    return false;
  }
  return true;
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
    setState({...at, draw: edit.id as DrawEdit, marks: [], message: null});
    return;
  }
  await runOnPicture(at, edit, id => runPress(id), closeView, deps);
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
  const {draw, marks, rect} = at;
  await runOnPicture(
    {...at, draw: null, marks: []},
    edit,
    () => deps.drawn(draw, rect, marks),
    closeView,
    deps,
  );
}

async function runOnPicture(
  at: Ready,
  edit: EditDefinition,
  run: (edit: EditId) => Promise<Done>,
  closeView: () => void,
  deps: EditorDeps,
): Promise<void> {
  setState({...at, busy: edit.id, message: null});
  if (!(await relasso(at.rect, deps))) {
    setState({...at, busy: null, message: copy['editor.lost']});
    return;
  }
  if (edit.id === 'styles') {
    // The grid shows over the editor; a picked style comes back through `stylesDone`.
    setState({...at, busy: null});
    await deps.styles();
    return;
  }
  let message: string | null = null;
  const done = await deps.press(edit, run, text => {
    message = text;
  });
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
  if (edited && (await relasso(rect, deps))) {
    const fresh = await readPreview(deps);
    if (fresh !== null) {
      await deps.remove(at.preview);
      preview = fresh;
    }
  }
  // An edit deletes the marks lassoed with the picture, so the next pen edit draws in the view.
  const guided = at.guided && !edited;
  setState({...at, rect, preview, guided, busy: null, message});
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

/** A pen stroke drawn on the picture in the view, already in page pixels. */
export function addMark(points: readonly PenPoint[]): void {
  const at = ready();
  if (!at || at.draw === null || points.length === 0) {
    return;
  }
  setState({...at, marks: [...at.marks, [...points]]});
}

/** «Clear marks». */
export function clearMarks(): void {
  const at = ready();
  if (at && at.draw !== null) {
    setState({...at, marks: []});
  }
}

/** «Cancel» while drawing: back to the edits, the marks gone. */
export function cancelDrawing(): void {
  const at = ready();
  if (at && at.draw !== null && at.busy === null) {
    setState({...at, draw: null, marks: []});
  }
}

/** Back or «Close»: the page keeps every edit; the preview goes. Nothing while an edit runs. */
export async function closeEditor(
  closeView: () => void,
  deps: EditorDeps = EDITOR_DEVICE,
): Promise<void> {
  const at = state;
  if (at.phase === 'opening' || (at.phase === 'ready' && at.busy !== null)) {
    return;
  }
  setState({phase: 'idle'});
  if (at.phase === 'ready') {
    await deps.remove(at.preview);
  }
  closeView();
}

/** The editor's state back to idle, for tests. */
export function resetEditorForTests(): void {
  state = {phase: 'idle'};
  listeners.clear();
}
