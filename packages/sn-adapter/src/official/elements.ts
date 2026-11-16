/**
 * The page elements Real-Time Conversion writes (#187, #188): a text box element, a stroke saved and
 * rebuilt, and the one-call delete-and-insert. Kept apart from page.ts and pen.ts, whose every
 * wrapper Ink2Pic calls (its sdk-boundary test), as image.ts and file.ts are.
 */
import {PluginCommAPI} from 'sn-plugin-lib';
import type {TextBoxInput} from './note';
import {createElement} from './page';
import type {PenPoint} from './pen';
import {attempt, fail, ok, Result, THROWN_CODE} from './result';

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
/** More points than this are cut, so one long scribble cannot hold the bridge. */
export const MAX_STROKE_POINTS = 4000;

function thrown(error: unknown): Result<never> {
  return fail(THROWN_CODE, error instanceof Error ? error.message : String(error));
}

/** Every value of a native accessor, at most MAX_STROKE_POINTS, read POINTS_PER_READ at a time. */
export async function readAll<T>(accessor: Accessor<T> | undefined): Promise<Result<T[]>> {
  if (!accessor) {
    return ok([]);
  }
  try {
    const size = Math.min(await accessor.size(), MAX_STROKE_POINTS);
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

/** The SDK's `TextBox` fields for `box`, shared by insertText and a text box element (#187). */
export function textBoxFields(box: TextBoxInput): Record<string, unknown> {
  return {
    fontSize: box.fontSize,
    fontPath: null,
    textContentFull: box.text,
    textRect: box.rect,
    textDigestData: null,
    textAlign: 0,
    textBold: 0,
    textItalics: 0,
    textFrameWidthType: 0,
    textFrameStyle: 0,
    textEditable: 0,
  };
}

/** `Element.TYPE_STROKE` and `Element.TYPE_TEXT` in sn-plugin-lib 0.2.3 (#187). */
export const STROKE_TYPE = 0;
export const TEXT_TYPE = 500;

/**
 * Deletes the elements numbered `deleteNums` on `page`, then inserts `elements`, in one host call
 * (sn-plugin-lib 0.2.3; a picture replaced in place, #130). `layer` null lets the host choose.
 */
export function batchUpdatePageElements(
  deleteNums: number[],
  elements: object[],
  page: number,
  layer: number | null = null,
): Promise<Result<boolean>> {
  return attempt(() =>
    PluginCommAPI.batchUpdatePageElements(deleteNums, elements, page, layer),
  );
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

