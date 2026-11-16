/**
 * sn-adapter's occupiedRects (#152), which Lookup's lasso reads use to place a box or a picture in
 * free space: each element's bounds in page pixels, the time budget, and every element recycled.
 */
import {PluginFileAPI} from 'sn-plugin-lib';
import {occupiedRects} from '@supernote-tools/sn-adapter/official';

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
    value: [
      {left: 100, top: 480, right: 400, bottom: 520},
      picture.picture.rect,
      textBox.textBox.textRect,
    ],
  });
  expect(lines).toEqual(['place: page read 3 elements in 0 ms']);
  expect(line.recycle).toHaveBeenCalled();
  expect(picture.recycle).toHaveBeenCalled();
});

test('a read over its budget fails, so the placement stays today\'s, and still recycles', async () => {
  const first = stroke([{x: 1, y: 1}]);
  const second = stroke([{x: 2, y: 2}]);
  getElements.mockResolvedValueOnce({success: true, result: [first, second]});
  let clock = 0;
  const read = await occupiedRects('/n.note', 1, () => {}, 300, () => (clock += 200));
  expect(read.ok).toBe(false);
  expect(!read.ok && read.message).toMatch(/over 300 ms after 1 of 2/);
  expect(second.recycle).toHaveBeenCalled();
});

test('occupiedRects logs the count and the time, or why the placement is today\'s', async () => {
  const lines: string[] = [];
  getElements.mockResolvedValueOnce({success: true, result: [picture]});
  const rects = await occupiedRects('/n.note', 1, line => lines.push(line));
  expect(rects).toEqual({ok: true, value: [picture.picture.rect]});
  expect(lines[0]).toMatch(/^place: page read 1 elements in \d+ ms$/);
  getElements.mockRejectedValueOnce(new Error('no page'));
  const failed = await occupiedRects('/n.note', 1, line => lines.push(line));
  expect(failed.ok).toBe(false);
  expect(lines[1]).toMatch(/today's placement$/);
});
