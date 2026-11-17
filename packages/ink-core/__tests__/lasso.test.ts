import {OCCUPIED_AFTER_RECOGNITION_MS, readLassoQuery, type LassoHost} from '../src';

type Failure = {ok: false; code: number; message: string};
const ok = <T>(value: T) => Promise.resolve({ok: true as const, value});

function host(overrides: Partial<LassoHost<Failure>> = {}): LassoHost<Failure> {
  return {
    getLassoElements: () => ok<object[]>([{type: 700}]),
    getLassoRect: () => ok({left: 100, top: 200, right: 300, bottom: 260}),
    getCurrentFilePath: () => ok('/Note/a.note'),
    getCurrentPageNum: () => ok(3),
    getPageSize: () => ok({width: 1920, height: 2560}),
    recognizeElements: () => ok(' soup \n'),
    emptyLasso: message => ({ok: false, code: -4, message}),
    failure: message => ({ok: false, code: -1, message}),
    ...overrides,
  };
}

describe('readLassoQuery (#109)', () => {
  it('recognizes with the page size, trims the text and keeps the place', async () => {
    const recognize = jest.fn(() => ok('soup '));
    expect(await readLassoQuery(host({recognizeElements: recognize}))).toEqual({
      ok: true,
      value: {
        query: 'soup',
        place: {
          rect: {left: 100, top: 200, right: 300, bottom: 260},
          page: 3,
          pageSize: {width: 1920, height: 2560},
        },
      },
    });
    expect(recognize).toHaveBeenCalledWith([{type: 700}], {width: 1920, height: 2560});
  });

  it('keeps the page\'s occupied rects with the place, and only the place when the read fails (#152)', async () => {
    const ink = [{left: 100, top: 300, right: 900, bottom: 360}];
    const read = jest.fn(() => ok({rects: ink, complete: true}));
    const answer = await readLassoQuery(host({getOccupied: read}));
    expect(read).toHaveBeenCalledWith('/Note/a.note', 3);
    expect(answer.ok && answer.value.place?.occupied).toEqual(ink);
    const failed = await readLassoQuery(
      host({getOccupied: async () => ({ok: false, code: -1, message: 'over budget'})}),
    );
    expect(failed.ok && failed.value.place).toEqual({
      rect: {left: 100, top: 200, right: 300, bottom: 260},
      page: 3,
      pageSize: {width: 1920, height: 2560},
    });
  });

  it('drops a partial page read, so the placement is today\'s (#152)', async () => {
    const ink = [{left: 0, top: 300, right: 400, bottom: 340}];
    const answer = await readLassoQuery(
      host({getOccupied: () => ok({rects: ink, complete: false})}),
    );
    expect(answer.ok && answer.value.place).toEqual({
      rect: {left: 100, top: 200, right: 300, bottom: 260},
      page: 3,
      pageSize: {width: 1920, height: 2560},
    });
  });

  it('waits at most OCCUPIED_AFTER_RECOGNITION_MS for the page read after recognition, then places as today (#152)', async () => {
    jest.useFakeTimers();
    try {
      const log = jest.fn();
      let endRead: () => void = () => {};
      const answer = readLassoQuery(
        host({
          log,
          getOccupied: () =>
            new Promise(resolve => {
              endRead = () =>
                resolve({ok: true, value: {rects: [{left: 0, top: 0, right: 9, bottom: 9}], complete: true}});
            }),
        }),
      );
      await jest.advanceTimersByTimeAsync(OCCUPIED_AFTER_RECOGNITION_MS - 1);
      expect(log).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      const done = await answer;
      endRead();
      expect(done.ok && done.value.place?.occupied).toBeUndefined();
      expect(log).toHaveBeenCalledWith(
        `place: page read still running ${OCCUPIED_AFTER_RECOGNITION_MS} ms after recognition: today's placement`,
      );
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reads the page while the word is recognized, not before it (#152)', async () => {
    const events: string[] = [];
    let endRead: () => void = () => {};
    const answer = readLassoQuery(
      host({
        getOccupied: () =>
          new Promise(resolve => {
            events.push('read starts');
            endRead = () => {
              events.push('read ends');
              resolve({ok: true, value: {rects: [], complete: true}});
            };
          }),
        recognizeElements: async () => {
          events.push('recognition ends');
          endRead();
          return {ok: true, value: 'soup'};
        },
      }),
    );
    expect((await answer).ok).toBe(true);
    expect(events).toEqual(['read starts', 'recognition ends', 'read ends']);
  });

  it('keeps the place without the rects when the page read throws', async () => {
    const answer = await readLassoQuery(
      host({getOccupied: () => Promise.reject(new Error('bridge gone'))}),
    );
    expect(answer.ok && answer.value.place?.occupied).toBeUndefined();
  });

  it('uses the known elements and loses only the place without a rect', async () => {
    const read = jest.fn(() => ok<object[]>([]));
    const answer = await readLassoQuery(
      host({
        getLassoElements: read,
        getLassoRect: async () => ({ok: false, code: 1, message: 'gone'}),
      }),
      [{type: 700}],
    );
    expect(read).not.toHaveBeenCalled();
    expect(answer).toEqual({ok: true, value: {query: 'soup', place: null}});
  });

  it('fails on an empty lasso, on empty text and with the failing step', async () => {
    expect(await readLassoQuery(host({getLassoElements: () => ok([])}))).toEqual({
      ok: false,
      code: -4,
      message: 'the lasso holds no handwriting',
    });
    expect((await readLassoQuery(host({recognizeElements: () => ok('  ')}))).ok).toBe(
      false,
    );
    const missing = {ok: false as const, code: 1503, message: 'no FILE:READ'};
    expect(
      await readLassoQuery(host({getPageSize: () => Promise.resolve(missing)})),
    ).toBe(missing);
  });

  it('runs each host call through the host logger', async () => {
    const labels: string[] = [];
    await readLassoQuery(
      host({
        logged: (label, call) => {
          labels.push(label);
          return call();
        },
      }),
    );
    expect(labels).toEqual([
      'getLassoElements',
      'getLassoRect',
      'getCurrentFilePath',
      'getCurrentPageNum',
      'getPageSize',
      'recognizeElements',
    ]);
    labels.length = 0;
    await readLassoQuery(
      host({
        getOccupied: () => ok({rects: [], complete: true}),
        logged: (label, call) => {
          labels.push(label);
          return call();
        },
      }),
    );
    expect(labels.slice(-2)).toEqual(['getOccupied', 'recognizeElements']);
  });
});
