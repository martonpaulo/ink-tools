/**
 * sn-adapter's occupiedRects (#152), which Lookup's lasso reads use to place a box or a picture in
 * free space: each element's bounds in page pixels, read all at once, the time budget with its
 * partial answer, and every element recycled.
 */
import {PluginFileAPI} from 'sn-plugin-lib';
import {occupiedRects} from '@ink-tools/sn-adapter/official';

const getElements = PluginFileAPI.getElements as jest.Mock;

function stroke(points: {x: number; y: number}[]) {
  return {
    type: 0,
    stroke: {
      points: {
        size: async () => points.length,
        getRange: async (start: number, count: number) => points.slice(start, start + count),
      },
    },
    recycle: jest.fn(async () => {}),
  };
}

const picture = {
  type: 200,
  picture: {rect: {left: 10, top: 20, right: 110, bottom: 220}},
  recycle: jest.fn(async () => {}),
};
const textBox = {
  type: 500,
  textBox: {textRect: {left: 0, top: 300, right: 640, bottom: 400}},
  recycle: jest.fn(async () => {}),
};

test('a stroke, a picture and a text box give their rects, and each is recycled', async () => {
  const line = stroke([
    {x: 100, y: 500},
    {x: 400, y: 520},
    {x: 250, y: 480},
  ]);
  getElements.mockResolvedValueOnce({success: true, result: [line, picture, textBox]});
  const lines: string[] = [];
  const read = await occupiedRects('/Note/a.note', 2, entry => lines.push(entry), 300, () => 0);
  expect(getElements).toHaveBeenCalledWith(2, '/Note/a.note');
  expect(read).toEqual({
    ok: true,
    value: {
      rects: [
        picture.picture.rect,
        textBox.textBox.textRect,
        {left: 100, top: 480, right: 400, bottom: 520},
      ],
      complete: true,
    },
  });
  expect(lines).toEqual(['place: page read 3 elements in 0 ms']);
  expect(line.recycle).toHaveBeenCalled();
  expect(picture.recycle).toHaveBeenCalled();
});

test('a read over its budget answers what it read, marked partial, and still recycles', async () => {
  const quick = stroke([{x: 1, y: 1}]);
  const stuck = {
    type: 0,
    stroke: {points: {size: () => new Promise<number>(() => {}), getRange: async () => []}},
    recycle: jest.fn(async () => {}),
  };
  getElements.mockResolvedValueOnce({success: true, result: [quick, stuck]});
  const lines: string[] = [];
  const read = await occupiedRects('/n.note', 1, line => lines.push(line), 20);
  expect(read).toEqual({
    ok: true,
    value: {rects: [{left: 1, top: 1, right: 1, bottom: 1}], complete: false},
  });
  expect(lines[0]).toMatch(/^place: page read 1 of 2 elements in \d+ ms: partial/);
});

test('reads every element at once, not one after the other (#152)', async () => {
  let inFlight = 0;
  let most = 0;
  const slow = () => ({
    type: 0,
    stroke: {
      points: {
        size: async () => {
          inFlight += 1;
          most = Math.max(most, inFlight);
          await new Promise(resolve => setTimeout(resolve, 5));
          inFlight -= 1;
          return 1;
        },
        getRange: async () => [{x: 0, y: 0}],
      },
    },
    recycle: jest.fn(async () => {}),
  });
  getElements.mockResolvedValueOnce({success: true, result: [slow(), slow(), slow(), slow()]});
  const read = await occupiedRects('/n.note', 1);
  expect(read.ok && read.value.complete).toBe(true);
  expect(most).toBe(4);
});

test('an element whose read fails makes the read partial', async () => {
  const broken = {
    type: 0,
    stroke: {points: {size: async () => Promise.reject(new Error('gone')), getRange: async () => []}},
    recycle: jest.fn(async () => {}),
  };
  getElements.mockResolvedValueOnce({success: true, result: [picture, broken]});
  const read = await occupiedRects('/n.note', 1);
  expect(read).toEqual({ok: true, value: {rects: [picture.picture.rect], complete: false}});
});

test('occupiedRects logs the count and the time, or why the placement is today\'s', async () => {
  const lines: string[] = [];
  getElements.mockResolvedValueOnce({success: true, result: [picture]});
  const rects = await occupiedRects('/n.note', 1, line => lines.push(line));
  expect(rects).toEqual({ok: true, value: {rects: [picture.picture.rect], complete: true}});
  expect(lines[0]).toMatch(/^place: page read 1 elements in \d+ ms$/);
  getElements.mockRejectedValueOnce(new Error('no page'));
  const failed = await occupiedRects('/n.note', 1, line => lines.push(line));
  expect(failed.ok).toBe(false);
  expect(lines[1]).toMatch(/today's placement$/);
});
