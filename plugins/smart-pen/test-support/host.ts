/** A fake tablet for the conversion and the undo: a page of synthetic elements and a manual clock. */
import {
  fail,
  offPage,
  type SavedStroke,
  textBoxFields,
  THROWN_CODE,
} from '@ink-tools/sn-adapter/official';
import {
  type ConvertHost,
  type UndoHost,
  type InkStroke,
} from '@ink-tools/ink-core/conversion';
import type {LassoConvertHost} from '../src/modules/text/lasso';

export type FakeElement = {
  uuid: string;
  type: number;
  numInPage?: number;
  points?: {x: number; y: number}[];
  textBox?: {textRect: object; textContentFull: string};
};

/** The tablet's answer when recognition cannot read the ink (device log, #206). */
export const RECOGNITION_FAILED = 'Recognition failed. Please try again!';
/** Its code, as Ink2Pic's lasso-size failure gave it (docs/research/plugin-brief/brief.md). */
export const RECOGNITION_FAILED_CODE = 117;
/** The SDK's code for a parameter its schema refuses (sn-plugin-lib 0.2.3 VerifyUtils, APIError 107). */
export const PARAM_REFUSED_CODE = 107;

const ok = <T>(value: T) => ({ok: true as const, value});

// The SDK's own element rules, as batchUpdatePageElements applies them (sn-plugin-lib 0.2.3, #206).
// Its element model loads the native module, which only the tablet has. Required, not imported,
// so tsc never type-checks the SDK's own source.
jest.mock(
  '../node_modules/sn-plugin-lib/src/module/NativePluginAPI',
  () => ({}),
);
const {ElementSchema, verifyParams} =
  require('../node_modules/sn-plugin-lib/src/sdk/utils/VerifyUtils') as {
    ElementSchema: object;
    verifyParams(schema: object, params: unknown, options: object): void;
  };

export function fakeTablet(answer = 'café') {
  let time = 0;
  let timers: {at: number; run: () => void}[] = [];
  let listener: ((elements: object[]) => void) | null = null;
  const page: FakeElement[] = [];
  const logs: string[] = [];
  const renumber = () =>
    page.forEach((element, index) => (element.numInPage = index));
  /** The lassoed page elements, by their place in `page` (#250); the rect is their bounds. */
  const lasso: {nums: number[]} = {nums: []};
  const lassoed = () =>
    page.filter(element => lasso.nums.includes(element.numInPage as number));
  const host: ConvertHost & UndoHost & LassoConvertHost = {
    getLassoElements: jest.fn(async () =>
      ok(lassoed().map(element => ({...element}))),
    ),
    getLassoRect: jest.fn(async () => {
      const points = lassoed().flatMap(element => element.points ?? []);
      const xs = points.map(point => point.x);
      const ys = points.map(point => point.y);
      return points.length > 0
        ? ok({
            left: Math.min(...xs),
            top: Math.min(...ys),
            right: Math.max(...xs),
            bottom: Math.max(...ys),
          })
        : fail(THROWN_CODE, 'no lasso');
    }),
    onPenUp: jest.fn(next => {
      listener = next;
      return ok(() => {
        listener = null;
      });
    }),
    strokePoints: jest.fn(async element =>
      ok((element as FakeElement).points ?? []),
    ),
    saveStroke: jest.fn(async element =>
      ok<SavedStroke>({
        points: (element as FakeElement).points ?? [],
        pressures: [],
        penType: 10,
        penColor: 0,
        thickness: 400,
      }),
    ),
    recycleElement: jest.fn(async () => ok(true as const)),
    getCurrentFilePath: jest.fn(async () => ok('/Note/test.note')),
    getCurrentPageNum: jest.fn(async () => ok(0)),
    getPageSize: jest.fn(async () => ok({width: 1404, height: 1872})),
    // A stroke off the page asks for it; the EMR tests give the SDK's range for their page.
    readEmrRange: jest.fn(async () =>
      fail(THROWN_CODE, 'the fake tablet has no EMR range'),
    ),
    // As on the tablet (#206): recognition reads each element's points as page pixels at `size`,
    // so ink off the page (a pen-up element's EMR units) fails with the device's own message.
    recognizeElements: jest.fn(
      async (elements: object[], size: {width: number; height: number}) =>
        elements.some(element =>
          offPage((element as FakeElement).points ?? [], size),
        )
          ? fail(RECOGNITION_FAILED_CODE, RECOGNITION_FAILED)
          : ok(answer),
    ),
    getElements: jest.fn(async () => ok(page.map(element => ({...element})))),
    createTextBox: jest.fn(async box =>
      ok({type: 500, textBox: textBoxFields(box)}),
    ),
    rebuildStroke: jest.fn(async saved => ok({type: 0, stroke: {}, saved})),
    batchUpdatePageElements: jest.fn(
      async (nums: number[], elements: object[]) => {
        try {
          verifyParams(
            {elements: {type: 'array', required: true, items: ElementSchema}},
            {elements},
            {
              allowUnknown: true,
              rootName: 'batchUpdatePageElements',
            },
          );
        } catch (error) {
          return fail(PARAM_REFUSED_CODE, (error as Error).message);
        }
        const gone = new Set(nums);
        const kept = page.filter(
          element => !gone.has(element.numInPage as number),
        );
        page.length = 0;
        page.push(...kept);
        elements.forEach((element, index) => {
          const made = element as {
            type: number;
            textBox?: FakeElement['textBox'];
          };
          page.push({
            uuid: `new${index}-${time}`,
            type: made.type,
            ...(made.textBox ? {textBox: {...made.textBox}} : {}),
          });
        });
        renumber();
        return ok(true);
      },
    ),
    now: () => time,
    setTimer: jest.fn((run, ms) => {
      const timer = {at: time + ms, run};
      timers.push(timer);
      return timer;
    }),
    clearTimer: jest.fn(timer => {
      timers = timers.filter(each => each !== timer);
    }),
    log: line => logs.push(line),
  };
  return {
    host,
    page,
    logs,
    /** Writes the strokes on the page in page pixels and lassoes them, as the person's lasso does. */
    lassoStrokes(strokes: InkStroke[]) {
      const first = page.length;
      strokes.forEach(each =>
        page.push({uuid: `page-${each.id}`, type: 0, points: each.points}),
      );
      renumber();
      lasso.nums = strokes.map((_, index) => first + index);
    },
    get listening() {
      return listener !== null;
    },
    /**
     * Writes the synthetic stroke on the page and ends it with a pen-up at `at`. The pen-up element
     * carries `stroke.points` in the pen's unit; the page keeps `pagePoints`, its page pixels, as
     * getElements reads them on the tablet (#206), under a uuid of its own.
     */
    penUp(
      stroke: InkStroke,
      at: number,
      pagePoints: {x: number; y: number}[] = stroke.points,
    ) {
      time = at;
      // As on the tablet (#206): the page read hands out its own uuid, never the pen-up one.
      const element: FakeElement = {
        uuid: `page-${stroke.id}`,
        type: 0,
        points: pagePoints,
      };
      page.push(element);
      renumber();
      listener?.([{uuid: stroke.id, type: 0, points: stroke.points}]);
    },
    /** Moves the clock, running each timer that falls due. */
    async advance(to: number) {
      for (;;) {
        await new Promise(resolve => setImmediate(resolve));
        const due = timers
          .filter(timer => timer.at <= to)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) {
          break;
        }
        time = due.at;
        timers = timers.filter(timer => timer !== due);
        due.run();
      }
      time = to;
    },
  };
}
