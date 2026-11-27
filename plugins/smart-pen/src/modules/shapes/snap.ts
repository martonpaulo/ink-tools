/**
 * Smart Shapes' stroke handling (#253): a stroke held still at its end, big enough and recognized,
 * is replaced by a clean shape. Written against a host, so the tests run on a fake page.
 *
 * Removal keeps the note's undo history when it can: the stroke is lassoed by its rect and deleted
 * through the lasso, which Snap measured keeps the history; when the lasso also takes other
 * elements (a circle drawn around words), the stroke is deleted by its number, which clears the
 * history [community, Snap v0.9.0]. The page is never changed while the pen writes the next stroke.
 */
import type {Rect, Size} from '@ink-tools/ink-core';
import type {
  EmrRange,
  PenInfo,
  PenPoint,
  Result,
  SavedStroke,
} from '@ink-tools/sn-adapter/official';
import {isInk} from './guard';
import {geometryFor, type Pen} from './geometry';
import {recognize, type Shape} from './recognize';
import {
  getSettings,
  HOLD_MS,
  minSizePx,
  SNAP_DEGREES,
  TOLERANCE,
} from './settings';

export type SnapHost = {
  strokePoints(element: object): Promise<Result<PenPoint[]>>;
  saveStroke(element: object): Promise<Result<SavedStroke>>;
  restoreStroke(saved: SavedStroke, page: number): Promise<Result<boolean>>;
  getCurrentFilePath(): Promise<Result<string>>;
  getCurrentPageNum(): Promise<Result<number>>;
  getPageSize(path: string, page: number): Promise<Result<Size>>;
  offPage(points: readonly PenPoint[], size: Size): boolean;
  /** The EMR range of the screen, read through its display size (#269). */
  readEmrRange(): Promise<Result<EmrRange>>;
  emrToPage(
    points: readonly PenPoint[],
    size: Size,
    range: EmrRange,
  ): PenPoint[];
  getPenInfo(): Promise<Result<PenInfo>>;
  getLassoRect(): Promise<Result<Rect>>;
  lassoElements(rect: Rect): Promise<Result<boolean>>;
  getLassoElements(): Promise<Result<object[]>>;
  deleteLassoElements(): Promise<Result<boolean>>;
  clearLasso(): Promise<Result<boolean>>;
  getLastElement(): Promise<Result<object | null>>;
  deletePageElements(nums: number[], page: number): Promise<Result<boolean>>;
  insertGeometry(geometry: object): Promise<Result<boolean>>;
  /** Asks for file read and write once; false when the person refused. */
  ensureAccess(): Promise<boolean>;
  recycleElement(element: object): Promise<Result<true>>;
  log(line: string): void;
};

/** What the pen did around the stroke, from the motion listener. */
export type PenState = {
  /** How long the pen stayed still before lifting, null when no pen motion was seen. */
  stillMs: number | null;
  /** Resolves once the pen is up (at once when it is). */
  whenUp(): Promise<void>;
};

type StrokeFields = {
  stroke?: {penType?: number} | null;
  numInPage?: number;
  layerNum?: number;
};

/** Pixels added around the stroke's rect, so the lasso takes all of it. */
const LASSO_MARGIN = 2;

export type Outcome =
  | 'not ink'
  | 'no hold'
  | 'lasso active'
  | 'no shape'
  | 'failed'
  | `${Shape['kind']} (${'lasso' | 'number'})`;

/** True when the outcome replaced the stroke with a shape, so no other module may use it (#305). */
export function replaced(outcome: Outcome): boolean {
  return / \((lasso|number)\)$/.test(outcome);
}

function bounds(points: readonly PenPoint[]): Rect {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    left: Math.floor(Math.min(...xs)) - LASSO_MARGIN,
    top: Math.floor(Math.min(...ys)) - LASSO_MARGIN,
    right: Math.ceil(Math.max(...xs)) + LASSO_MARGIN,
    bottom: Math.ceil(Math.max(...ys)) + LASSO_MARGIN,
  };
}

const same = (a: PenPoint, b: PenPoint) =>
  Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

/** True when `element` is an ink stroke with the same first and last point as `raw`. */
async function isTheStroke(
  host: SnapHost,
  element: object,
  raw: readonly PenPoint[],
): Promise<boolean> {
  if (!isInk((element as StrokeFields).stroke?.penType)) {
    return false;
  }
  const points = await host.strokePoints(element);
  return (
    points.ok &&
    points.value.length === raw.length &&
    same(points.value[0], raw[0]) &&
    same(points.value[points.value.length - 1], raw[raw.length - 1])
  );
}

/** Deletes the stroke through the lasso, which keeps the undo history; false when it cannot. */
async function removeByLasso(
  host: SnapHost,
  raw: readonly PenPoint[],
  pagePoints: PenPoint[],
): Promise<boolean> {
  const lassoed = await host.lassoElements(bounds(pagePoints));
  if (!lassoed.ok || !lassoed.value) {
    return false;
  }
  const inside = await host.getLassoElements();
  const alone =
    inside.ok &&
    inside.value.length === 1 &&
    (await isTheStroke(host, inside.value[0], raw));
  if (inside.ok) {
    await Promise.all(
      inside.value.map(element => host.recycleElement(element)),
    );
  }
  if (alone) {
    const deleted = await host.deleteLassoElements();
    if (deleted.ok && deleted.value) {
      return true;
    }
  }
  await host.clearLasso();
  return false;
}

/** What a delete by number did: deleted the stroke, found another last element, could not read it, or was refused. */
type ByNumber = 'deleted' | 'absent' | 'unread' | 'refused';

/** Deletes the stroke by its number, found as the page's last element; this clears the undo history. */
async function removeByNumber(
  host: SnapHost,
  raw: readonly PenPoint[],
  page: number,
): Promise<ByNumber> {
  const last = await host.getLastElement();
  if (!last.ok) {
    return 'unread';
  }
  if (!last.value) {
    return 'absent';
  }
  try {
    const num = (last.value as StrokeFields).numInPage ?? 0;
    if (num < 1 || !(await isTheStroke(host, last.value, raw))) {
      return 'absent';
    }
    const deleted = await host.deletePageElements([num], page);
    return deleted.ok && deleted.value ? 'deleted' : 'refused';
  } finally {
    await host.recycleElement(last.value);
  }
}

/**
 * Removes the stroke, through the lasso first. `deleteLassoElements` answered true and left a stroke
 * a plugin had inserted, a replayed one, which stayed the page's last element; its number then
 * deleted it (measured, Manta, 2026-11-27, #477). So a lasso delete counts once the last element is
 * no longer the stroke; null when the stroke is still on the page.
 */
async function removeStroke(
  host: SnapHost,
  raw: readonly PenPoint[],
  pagePoints: PenPoint[],
  page: number,
): Promise<'lasso' | 'number' | null> {
  const lassoed = await removeByLasso(host, raw, pagePoints);
  const byNumber = await removeByNumber(host, raw, page);
  if (byNumber === 'deleted') {
    if (lassoed) {
      host.log('the lasso delete left the stroke: deleted by its number');
    }
    return 'number';
  }
  if (!lassoed || byNumber === 'refused') {
    return null;
  }
  if (byNumber === 'unread') {
    host.log('after the lasso delete, the last element did not read');
  }
  return 'lasso';
}

export async function handleStroke(
  host: SnapHost,
  element: object,
  pen: PenState,
): Promise<Outcome> {
  const settings = getSettings();
  if (!isInk((element as StrokeFields).stroke?.penType)) {
    return 'not ink';
  }
  if (pen.stillMs === null || pen.stillMs < HOLD_MS) {
    return 'no hold';
  }
  const raw = await host.strokePoints(element);
  const path = await host.getCurrentFilePath();
  const page = await host.getCurrentPageNum();
  if (!raw.ok || !path.ok || !page.ok) {
    host.log(
      `read failed: ${[raw, path, page]
        .map(r => (r.ok ? 'ok' : r.message))
        .join(', ')}`,
    );
    return 'failed';
  }
  const size = await host.getPageSize(path.value, page.value);
  if (!size.ok) {
    host.log(`page size: ${size.message}`);
    return 'failed';
  }
  let points = raw.value;
  if (host.offPage(points, size.value)) {
    const range = await host.readEmrRange();
    if (!range.ok) {
      host.log(`EMR range: ${range.message}`);
      return 'failed';
    }
    points = host.emrToPage(points, size.value, range.value);
  }
  const found = recognize(points, {
    tolerance: TOLERANCE,
    minSize: minSizePx(settings),
    shapes: settings.shapes,
    arrowSnapDegrees: SNAP_DEGREES,
    rectSnapDegrees: SNAP_DEGREES,
  });
  if (!found.shape) {
    host.log(`kept as ink: ${found.reason}`);
    return 'no shape';
  }
  // A lasso selection right after the pen lifts means the person was selecting (Snap's guard).
  if ((await host.getLassoRect()).ok) {
    return 'lasso active';
  }
  await pen.whenUp();
  if (!(await host.ensureAccess())) {
    host.log('kept as ink: file access refused');
    return 'failed';
  }
  const saved = await host.saveStroke(element);
  if (!saved.ok) {
    host.log(`save: ${saved.message}`);
    return 'failed';
  }
  const how = await removeStroke(host, raw.value, points, page.value);
  if (!how) {
    host.log('kept as ink: the stroke was not found on the page');
    return 'failed';
  }
  const info = await host.getPenInfo();
  const sdkStroke = (
    element as {stroke?: {penType?: number; penColor?: number}}
  ).stroke;
  const style: Pen = info.ok
    ? info.value
    : {
        type: sdkStroke?.penType ?? 0,
        color: sdkStroke?.penColor ?? 0,
        width: 0,
      };
  const inserted = await host.insertGeometry(
    geometryFor(found.shape, style, false),
  );
  if (!inserted.ok || !inserted.value) {
    const restored = await host.restoreStroke(
      {...saved.value, points},
      page.value,
    );
    host.log(
      `insert failed, stroke ${
        restored.ok ? 'restored' : `lost: ${restored.message}`
      }`,
    );
    return 'failed';
  }
  host.log(`${found.shape.kind} by ${how}`);
  return `${found.shape.kind} (${how})`;
}
