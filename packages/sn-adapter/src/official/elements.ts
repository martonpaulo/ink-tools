/**
 * The page elements Smart Pen's Real-Time Text reads and writes (#187, #188, #206): pen-up points turned
 * from EMR into page pixels, a text box element, a stroke saved and
 * rebuilt, and the one-call delete-and-insert. Kept apart from page.ts and pen.ts, whose every
 * wrapper Ink2Pic calls (its sdk-boundary test), as image.ts and file.ts are.
 */
import {PluginCommAPI, PointUtils} from 'sn-plugin-lib';
import {TEXT_ALIGNS, type TextBoxInput, type TextStyle} from './note';
import {createElement, type Size} from './page';
import type {PenPoint} from './pen';
import {REGISTRY} from '../registry.generated';
import {onSavedPage} from './openPage';
import {attempt, fail, fromResponse, ok, Result, THROWN_CODE} from './result';

/** A native accessor of an element's per-point data (sn-plugin-lib 0.2.3, ElementDataAccessor). */
type Accessor<T> = {
  size(): Promise<number>;
  getRange(start: number, count: number): Promise<T[]>;
  add?(index: number, value: T): Promise<boolean>;
};
type StrokeElement = {
  stroke?: {
    points?: Accessor<PenPoint>;
    pressures?: Accessor<number>;
    flagDraw?: Accessor<boolean>;
    penType?: number;
    penColor?: number;
  } | null;
  thickness?: number;
};

/** Sample points read per bridge call: a word's stroke has a few hundred. */
const POINTS_PER_READ = 500;
/**
 * More points than this are not read, so one long scribble cannot hold the bridge; such a stroke is
 * a failure, never a cut one reported whole, which an Undo Conversion would rebuild shorter (#229).
 */
export const MAX_STROKE_POINTS = 4000;

function thrown(error: unknown): Result<never> {
  return fail(THROWN_CODE, error instanceof Error ? error.message : String(error));
}

/**
 * Every value of a native accessor, read POINTS_PER_READ at a time; a failure when it holds more than
 * MAX_STROKE_POINTS (#229).
 */
export async function readAll<T>(accessor: Accessor<T> | undefined): Promise<Result<T[]>> {
  if (!accessor) {
    return ok([]);
  }
  try {
    const size = await accessor.size();
    if (size > MAX_STROKE_POINTS) {
      return fail(
        THROWN_CODE,
        `the stroke has ${size} points, more than the ${MAX_STROKE_POINTS} a read takes`,
      );
    }
    const values: T[] = [];
    for (let start = 0; start < size; start += POINTS_PER_READ) {
      const count = Math.min(POINTS_PER_READ, size - start);
      values.push(...(await accessor.getRange(start, count)));
    }
    return ok(values);
  } catch (error) {
    return thrown(error);
  }
}

/**
 * `rect` in whole page pixels: sn-plugin-lib 0.2.3's `RectSchema` takes integers only, and a rect
 * built from converted EMR points is fractional («textBox.textRect.right must be an integer», #206).
 */
export function integerRect(rect: TextBoxInput['rect']): TextBoxInput['rect'] {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
  };
}

/** The SDK's style fields for `style` (#404): each left out is the host's default. */
export function textStyleFields(style: TextStyle = {}): {fontPath: string | null; textAlign: number; textBold: number; textItalics: number} {
  return {
    fontPath: style.fontPath ?? null,
    textAlign: TEXT_ALIGNS.indexOf(style.align ?? 'left'),
    textBold: style.bold ? 1 : 0,
    textItalics: style.italic ? 1 : 0,
  };
}

/** The SDK's `TextBox` fields for `box`, shared by insertText and a text box element (#187). */
export function textBoxFields(box: TextBoxInput): Record<string, unknown> {
  const style = textStyleFields(box.style);
  return {
    fontSize: box.fontSize,
    fontPath: style.fontPath,
    textContentFull: box.text,
    textRect: integerRect(box.rect),
    textDigestData: null,
    textAlign: style.textAlign,
    textBold: style.textBold,
    textItalics: style.textItalics,
    textFrameWidthType: 0,
    textFrameStyle: 0,
    textEditable: 0,
  };
}

/**
 * `elements` set to go to `layer` (0 the main layer, 1 to 3 the custom ones) by a file API call,
 * which takes no layer argument: each element's `layerNum` names it (#334). Without a layer, the
 * elements as they are.
 * shortcut: whether insertElements and modifyElements by path follow `layerNum` is not measured;
 * the device round of #334 settles it.
 */
export function onLayer(elements: object[], layer?: number): object[] {
  return layer === undefined ? elements : elements.map(element => Object.assign(element, {layerNum: layer}));
}

/** `Element.TYPE_STROKE` and `Element.TYPE_TEXT` in sn-plugin-lib 0.2.3 (#187). */
export const STROKE_TYPE = 0;
export const TEXT_TYPE = 500;

/**
 * Deletes the elements numbered `deleteNums` on `page`, then inserts `elements`, in one host call
 * (sn-plugin-lib 0.2.3; a picture replaced in place, #130). `layer` null lets the host choose.
 * It runs once the note saved (`onSavedPage`, #524).
 */
export function batchUpdatePageElements(
  deleteNums: number[],
  elements: object[],
  page: number,
  layer: number | null = null,
): Promise<Result<boolean>> {
  return onSavedPage(() =>
    attempt(() =>
      PluginCommAPI.batchUpdatePageElements(deleteNums, elements, page, layer),
    ),
  );
}

/**
 * Whether the host drew the page after a `batchUpdatePageElements` that answered `answer` (#296):
 * only its redraw code does (registry `plugin-api.batch-no-redraw`). sn-plugin-lib 0.2.3 hands the
 * plugin a boolean in that code's place, and its `true` came with no redraw [measured, #206], so
 * today every written batch needs a `reloadFile` to show.
 */
export function batchRedrawn(answer: unknown): boolean {
  return answer === REGISTRY.pluginApiBatchNoRedraw.redrawCode;
}

/**
 * A new text box element holding `box`, for batchUpdatePageElements (#187): createElement(500)
 * with the `TextBox` fields insertText writes. Whether the host takes it in a batch is TO TEST.
 */
export async function createTextBox(
  box: TextBoxInput,
): Promise<Result<Record<string, unknown>>> {
  const made = await createElement(TEXT_TYPE);
  if (!made.ok) {
    return made;
  }
  made.value.textBox = textBoxFields(box);
  return made;
}

/** A stroke as a plugin keeps it to write it again (#188): its points, pressures and pen. */
export type SavedStroke = {
  points: PenPoint[];
  pressures: number[];
  penType: number;
  penColor: number;
  thickness: number;
};

/** The pressure #148 wrote for a stroke whose pressures could not be read. */
export const DEFAULT_PRESSURE = 2000;

/** Reads what saveStroke keeps; a failed read of the points is a failure, never an empty stroke. */
export async function saveStroke(element: object): Promise<Result<SavedStroke>> {
  const sdk = element as StrokeElement;
  if (!sdk.stroke) {
    return fail(THROWN_CODE, 'the element is not a stroke');
  }
  const points = await readAll(sdk.stroke.points);
  if (!points.ok) {
    return points;
  }
  const pressures = await readAll(sdk.stroke.pressures);
  return ok({
    points: points.value,
    pressures: pressures.ok ? pressures.value : [],
    penType: sdk.stroke.penType ?? 0,
    penColor: sdk.stroke.penColor ?? 0,
    thickness: sdk.thickness ?? 0,
  });
}

/**
 * A new stroke element holding `saved`, ready for an insert: createElement(0), then each point,
 * pressure and draw flag added in page pixels, as #148 measured (151 points in 718 ms).
 */
export async function rebuildStroke(
  saved: SavedStroke,
  create: (type: number) => Promise<Result<Record<string, unknown>>>,
): Promise<Result<object>> {
  const made = await create(0);
  if (!made.ok) {
    return made;
  }
  const element = made.value as StrokeElement;
  const stroke = element.stroke;
  if (!stroke?.points?.add || !stroke.pressures?.add || !stroke.flagDraw?.add) {
    return fail(THROWN_CODE, 'the new stroke has no point accessors');
  }
  try {
    stroke.penType = saved.penType;
    stroke.penColor = saved.penColor;
    element.thickness = saved.thickness;
    for (let i = 0; i < saved.points.length; i += 1) {
      await stroke.points.add(i, saved.points[i]);
      await stroke.pressures.add(i, saved.pressures[i] ?? DEFAULT_PRESSURE);
      await stroke.flagDraw.add(i, true);
    }
    return ok(made.value);
  } catch (error) {
    return thrown(error);
  }
}

/**
 * The screen's size in pixels (#269): `PluginCommAPI.getPageDisplaySize`, which sn-plugin-lib 0.2.3
 * marks deprecated for getPageSize. The two differ on a page made for another Supernote model: the
 * host scales such a page to fill the screen, and the pen's EMR points follow the screen, so they
 * convert with this size (Snap 0.9.4's measured fact; the device round confirms the call).
 * An answer that is not a size in whole pixels is a failure, never a default size.
 */
export function getDisplaySize(): Promise<Result<Size>> {
  return attempt(() => PluginCommAPI.getPageDisplaySize(), toSize);
}

function toSize(raw: unknown): Result<Size> {
  const answer = fromResponse<unknown>(raw);
  if (!answer.ok) {
    return answer;
  }
  const size = answer.value as Partial<Size> | null;
  const whole = (side: unknown) => Number.isInteger(side) && (side as number) > 0;
  return size !== null && typeof size === 'object' && whole(size.width) && whole(size.height)
    ? ok({width: size.width as number, height: size.height as number})
    : fail(THROWN_CODE, `expected a size in pixels, got ${JSON.stringify(answer.value)}`);
}

/**
 * The EMR digitizer's largest x and y (sn-plugin-lib 0.2.3, PointUtils), and the screen size they
 * span: the pen follows the screen, whatever the page (#269).
 */
export type EmrRange = {maxX: number; maxY: number; display: Size};

/**
 * The SDK's own EMR range for the screen's size (#206, #269), from getDisplaySize:
 * `PointUtils.getRealMaxX` and `getRealMaxY`, which answer 21632 x 16224 for the Manta's
 * 1920 x 2560 screen and throw for a size they do not know.
 */
export function emrRange(display: Size): Result<EmrRange> {
  try {
    return ok({
      maxX: PointUtils.getRealMaxX(display),
      maxY: PointUtils.getRealMaxY(display),
      display: {width: display.width, height: display.height},
    });
  } catch (error) {
    return thrown(error);
  }
}

/** The EMR range of the screen the pen writes on (#269): getDisplaySize, then emrRange. */
export async function readEmrRange(): Promise<Result<EmrRange>> {
  const display = await getDisplaySize();
  return display.ok ? emrRange(display.value) : display;
}

/**
 * True when a point lies off the page: page pixels never do, so the points are in EMR units (#206).
 * shortcut: a stroke whose EMR points all fall inside the page's pixel box (only near the page's
 * top-right corner on the Manta) is not caught; the caller remembers a proof for the next strokes.
 */
export function offPage(points: readonly PenPoint[], size: Size): boolean {
  return points.some(
    ({x, y}) => x < 0 || y < 0 || x > size.width - 1 || y > size.height - 1,
  );
}

/**
 * EMR points as page pixels (#206, #269). First screen pixels: the formula of
 * `PointUtils.emrPoint2Android` in sn-plugin-lib 0.2.3 over the range's screen size, run here over a
 * whole stroke so its argument check does not run per point. The EMR axes are turned against the
 * screen: EMR x runs down and EMR y runs from the right edge to the left, each scaled by the range
 * over the screen side minus one. Then page pixels: a page made for another Supernote model fills
 * the screen, so each side scales by the page side over the screen side; a page of the screen's own
 * size gives the screen pixels unchanged.
 */
export function emrToPage(
  points: readonly PenPoint[],
  size: Size,
  range: EmrRange,
): PenPoint[] {
  const {display} = range;
  const perPxDown = range.maxX / (display.height - 1);
  const perPxAcross = range.maxY / (display.width - 1);
  const across = size.width / display.width;
  const down = size.height / display.height;
  return points.map(({x, y}) => ({
    x: (display.width - 1 - y / perPxAcross) * across,
    y: (x / perPxDown) * down,
  }));
}
