/** A fake tablet for the conversion and the undo: a page of synthetic elements and a manual clock. */
import {fail, offPage, type SavedStroke, THROWN_CODE} from '@supernote-tools/sn-adapter/official';
import type {ConvertHost} from '../src/convert';
import type {UndoHost} from '../src/undo';
import type {InkStroke} from '../src/words';

export type FakeElement = {
  uuid: string;
  type: number;
  numInPage?: number;
  points?: {x: number; y: number}[];
  textBox?: {textRect: object; textContentFull: string};
};

/** The tablet's answer when recognition cannot read the ink (device log, #206). */
export const RECOGNITION_FAILED = 'Recognition failed. Please try again!';
/** Its code, as Ink2Pic's lasso-size failure gave it (plugins/ink2pic/docs/brief.md). */
export const RECOGNITION_FAILED_CODE = 117;

const ok = <T>(value: T) => ({ok: true as const, value});

export function fakeTablet(answer = 'café') {
  let time = 0;
  let timers: {at: number; run: () => void}[] = [];
  let listener: ((elements: object[]) => void) | null = null;
  const page: FakeElement[] = [];
  const logs: string[] = [];
  const renumber = () => page.forEach((element, index) => (element.numInPage = index));
  const host: ConvertHost & UndoHost = {
    onPenUp: jest.fn(next => {
      listener = next;
      return ok(() => {
        listener = null;
      });
    }),
    strokePoints: jest.fn(async element => ok((element as FakeElement).points ?? [])),
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
    emrRange: jest.fn(() => fail(THROWN_CODE, 'the fake tablet has no EMR range')),
    // As on the tablet (#206): recognition reads each element's points as page pixels at `size`,
    // so ink off the page (a pen-up element's EMR units) fails with the device's own message.
    recognizeElements: jest.fn(async (elements: object[], size: {width: number; height: number}) =>
      elements.some(element => offPage((element as FakeElement).points ?? [], size))
        ? fail(RECOGNITION_FAILED_CODE, RECOGNITION_FAILED)
        : ok(answer),
    ),
    getElements: jest.fn(async () => ok(page.map(element => ({...element})))),
    createTextBox: jest.fn(async box => ok({type: 500, box})),
    rebuildStroke: jest.fn(async saved => ok({type: 0, saved})),
    batchUpdatePageElements: jest.fn(async (nums: number[], elements: object[]) => {
      const gone = new Set(nums);
      const kept = page.filter(element => !gone.has(element.numInPage as number));
      page.length = 0;
      page.push(...kept);
      elements.forEach((element, index) => {
        const made = element as {type: number; box?: {text: string; rect: object}};
        page.push({
          uuid: `new${index}-${time}`,
          type: made.type,
          ...(made.box
            ? {textBox: {textRect: made.box.rect, textContentFull: made.box.text}}
            : {}),
        });
      });
      renumber();
      return ok(true);
    }),
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
    get listening() {
      return listener !== null;
    },
    /**
     * Writes the synthetic stroke on the page and ends it with a pen-up at `at`. The pen-up element
     * carries `stroke.points` in the pen's unit; the page keeps `pagePoints`, its page pixels, as
     * getElements reads them on the tablet (#206), under a uuid of its own.
     */
    penUp(stroke: InkStroke, at: number, pagePoints: {x: number; y: number}[] = stroke.points) {
      time = at;
      // As on the tablet (#206): the page read hands out its own uuid, never the pen-up one.
      const element: FakeElement = {uuid: `page-${stroke.id}`, type: 0, points: pagePoints};
      page.push(element);
      renumber();
      listener?.([{uuid: stroke.id, type: 0, points: stroke.points}]);
    },
    /** Moves the clock, running each timer that falls due. */
    async advance(to: number) {
      for (;;) {
        await new Promise(resolve => setImmediate(resolve));
        const due = timers.filter(timer => timer.at <= to).sort((a, b) => a.at - b.at)[0];
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
