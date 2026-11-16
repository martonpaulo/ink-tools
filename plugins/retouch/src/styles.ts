/**
 * The Styles grid (#133): the lassoed picture in every style switched on, rendered once into
 * Retouch's working folder (`workDir`, #198) and shown in one refresh. A tap runs that style as an ordinary edit
 * (`runEdit`), so Undo, Restore original and the history keep working. The previews are deleted
 * when the grid closes. The last style chosen, and the two options, are kept in `styles.json`
 * and lead the next grid.
 */
import {
  DEVICE,
  Done,
  EditDeps,
  onePicture,
  removeFile,
  runEdit,
} from './edit';
import {STYLE_ORDER} from './edits';
import {NO_OPTIONS, StyleId, StyleOptions} from './native';

/** The last style and the two options, in the working folder. */
export const stylesPath = (work: string) => `${work}/styles.json`;

/** What `styles.json` keeps: the last style chosen and the two options. */
export type StylesMemory = {last: StyleId | null} & StyleOptions;

export const NO_MEMORY: StylesMemory = {last: null, ...NO_OPTIONS};

/** A missing or bad file is a fresh start, logged by the caller; never a crash. */
export function parseMemory(text: string | null): StylesMemory | null {
  if (text === null) {
    return NO_MEMORY;
  }
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object') {
      return null;
    }
    const last = STYLE_ORDER.includes(value.last)
      ? (value.last as StyleId)
      : null;
    return {
      last,
      transparent: value.transparent === true,
      thick: value.thick === true,
    };
  } catch {
    return null;
  }
}

/** The enabled styles, the last one chosen first when it is still switched on. */
export function orderStyles(
  enabled: readonly StyleId[],
  last: StyleId | null,
): StyleId[] {
  const rest = enabled.filter(id => id !== last);
  return last !== null && enabled.includes(last) ? [last, ...rest] : rest;
}

/** The styles whose picture a changed option alters: Thicker lines touches only Line art. */
export function changedBy(
  option: keyof StyleOptions,
  styles: readonly StyleId[],
): StyleId[] {
  return option === 'thick'
    ? styles.filter(id => id === 'line_art')
    : [...styles];
}

/** One tile: its style and the preview PNG. */
export type Tile = {style: StyleId; path: string};

/** The lassoed picture read once, and what each preview needs. */
export type Source = {
  path: string;
  /** The working folder the previews are written to. */
  work: string;
  width: number;
  height: number;
  pageWidth: number;
};

const describe = (what: string, r: {code: number; message: string}) =>
  `${what}: ${r.code} ${r.message}`;

/** Reads the lassoed picture once into a PNG; null, logged, when the lasso is not one picture. */
export async function readSource(
  deps: EditDeps = DEVICE,
): Promise<Source | null> {
  const lassoed = await deps.lassoElements();
  if (!lassoed.ok) {
    deps.log(describe('styles: getLassoElements', lassoed));
    return null;
  }
  const element = onePicture(lassoed.value);
  if (!element) {
    deps.log('styles: the lasso is not one picture');
    return null;
  }
  const note = await deps.notePath();
  const page = await deps.pageNum();
  if (!note.ok || !page.ok) {
    deps.log('styles: no open note page');
    return null;
  }
  const pageWidth = await deps.pageWidth(note.value, page.value);
  if (!pageWidth.ok) {
    deps.log(describe('styles: getPageSize', pageWidth));
    return null;
  }
  const work = await deps.workDir();
  if (!work.ok) {
    deps.log(describe('styles: getPluginDirPath', work));
    return null;
  }
  const preview = await deps.preview(
    `${work.value}/style-source-${deps.now()}.png`,
  );
  if (!preview.ok) {
    deps.log(describe('styles: generateLassoPreview', preview));
    return null;
  }
  const {rect} = element.picture;
  return {
    path: preview.value,
    work: work.value,
    width: Math.round(rect.right - rect.left),
    height: Math.round(rect.bottom - rect.top),
    pageWidth: pageWidth.value,
  };
}

/** Renders one preview per style; a style that fails leaves its tile out, logged. */
export async function renderTiles(
  source: Source,
  styles: readonly StyleId[],
  options: StyleOptions,
  deps: EditDeps = DEVICE,
): Promise<Tile[]> {
  const stamp = deps.now();
  const tiles: Tile[] = [];
  for (const style of styles) {
    const path = `${source.work}/style-${stamp}-${style}.png`;
    const made = await deps.native.edit(
      style,
      source.path,
      '',
      path,
      source.width,
      source.height,
      source.pageWidth,
      options.transparent,
      options.thick,
    );
    if (made.ok) {
      tiles.push({style, path});
    } else {
      deps.log(describe(`styles: preview ${style}`, made));
    }
  }
  return tiles;
}

/** Deletes the previews and the source once the grid closes. */
export async function removeFiles(
  paths: readonly string[],
  deps: EditDeps = DEVICE,
): Promise<void> {
  for (const path of paths) {
    await removeFile(path, deps);
  }
}

export async function loadMemory(
  deps: EditDeps = DEVICE,
): Promise<StylesMemory> {
  const work = await deps.workDir();
  const read = work.ok
    ? await deps.native.readText(stylesPath(work.value))
    : work;
  const memory = read.ok ? parseMemory(read.value) : null;
  if (memory === null) {
    deps.log('styles: styles.json unreadable, Photo leads');
    return NO_MEMORY;
  }
  return memory;
}

/** A tap: the style runs on the page with its options, then becomes the first tile next time. */
export async function chooseStyle(
  style: StyleId,
  options: StyleOptions,
  deps: EditDeps = DEVICE,
): Promise<Done> {
  const done = await runEdit(style, deps, options);
  if (done.kind === 'edited') {
    const memory: StylesMemory = {last: style, ...options};
    const work = await deps.workDir();
    const saved = work.ok
      ? await deps.native.writeText(stylesPath(work.value), JSON.stringify(memory))
      : work;
    if (!saved.ok) {
      deps.log(describe('styles: save the last style', saved));
    }
  }
  return done;
}

/** The grid's state, as `App.tsx` shows it; idle shows Settings. */
export type GridState =
  | {phase: 'idle'}
  | {phase: 'making'}
  | {phase: 'failed'}
  | {phase: 'ready'; tiles: Tile[]; options: StyleOptions; source: Source};

const IDLE: GridState = {phase: 'idle'};
let grid: GridState = IDLE;
const listeners = new Set<(next: GridState) => void>();

export function gridState(): GridState {
  return grid;
}

function setGrid(next: GridState): void {
  grid = next;
  listeners.forEach(listener => listener(next));
}

/** Calls `listener` on each change; answers the function that stops it. */
export function onGridState(listener: (next: GridState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const filesOf = (state: GridState): string[] =>
  state.phase === 'ready'
    ? [...state.tiles.map(t => t.path), state.source.path]
    : [];

/** The Styles button: reads the lasso once and renders every enabled style, the last one first. */
export async function openStyles(
  enabled: readonly StyleId[],
  deps: EditDeps = DEVICE,
): Promise<void> {
  if (grid.phase !== 'idle') {
    return;
  }
  setGrid({phase: 'making'});
  const memory = await loadMemory(deps);
  const source = await readSource(deps);
  if (source === null) {
    setGrid({phase: 'failed'});
    return;
  }
  const options = {transparent: memory.transparent, thick: memory.thick};
  const tiles = await renderTiles(
    source,
    orderStyles(enabled, memory.last),
    options,
    deps,
  );
  if (tiles.length === 0) {
    await removeFiles([source.path], deps);
    setGrid({phase: 'failed'});
    return;
  }
  setGrid({phase: 'ready', tiles, options, source});
}

/** A toggle: only the tiles the option changes are rendered again, in place. */
export async function toggleOption(
  option: keyof StyleOptions,
  deps: EditDeps = DEVICE,
): Promise<void> {
  const state = grid;
  if (state.phase !== 'ready') {
    return;
  }
  const options = {...state.options, [option]: !state.options[option]};
  const redo = changedBy(
    option,
    state.tiles.map(tile => tile.style),
  );
  const fresh = await renderTiles(state.source, redo, options, deps);
  const replaced = new Map(fresh.map(tile => [tile.style, tile]));
  // A style whose new preview failed keeps no stale tile: it leaves the grid.
  const tiles = state.tiles.flatMap(tile =>
    !redo.includes(tile.style)
      ? [tile]
      : replaced.has(tile.style)
      ? [replaced.get(tile.style)!]
      : [],
  );
  await removeFiles(
    state.tiles
      .filter(tile => redo.includes(tile.style))
      .map(tile => tile.path),
    deps,
  );
  setGrid({...state, tiles, options});
}

/** A tap on a tile: that style runs on the page, then the grid closes and its files go. */
export async function pickStyle(
  style: StyleId,
  closeView: () => void,
  deps: EditDeps = DEVICE,
): Promise<Done | null> {
  const state = grid;
  if (state.phase !== 'ready') {
    return null;
  }
  setGrid({phase: 'making'});
  try {
    return await chooseStyle(style, state.options, deps);
  } finally {
    await removeFiles(filesOf(state), deps);
    setGrid(IDLE);
    closeView();
  }
}

/** «Close»: nothing changes on the page; the previews are deleted. */
export async function closeStyles(
  closeView: () => void,
  deps: EditDeps = DEVICE,
): Promise<void> {
  const state = grid;
  if (state.phase === 'making') {
    return;
  }
  setGrid(IDLE);
  await removeFiles(filesOf(state), deps);
  closeView();
}
