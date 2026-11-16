/** A fake tablet for the conversion and the undo: a page of synthetic elements and a manual clock. */
import type {SavedStroke} from '@supernote-tools/sn-adapter/official';
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
    recognizeElements: jest.fn(async () => ok(answer)),
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
    /** Writes the synthetic stroke on the page and ends it with a pen-up at `at`. */
    penUp(stroke: InkStroke, at: number) {
      time = at;
      const element: FakeElement = {uuid: stroke.id, type: 0, points: stroke.points};
      page.push(element);
      renumber();
      listener?.([{...element}]);
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
