import {readLassoQuery, type LassoHost} from '../src';

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
    const read = jest.fn(() => ok(ink));
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
  });
});
