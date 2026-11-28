import {
  inkUnderRect,
  MIN_PLACE_BAND,
  PAGE_BAR_PX,
  PLACE_GAP,
  placeAtLasso,
  placeRect,
  type PlaceHost,
  type Rect,
} from '../src';
import {mmToPx, PAGE_MM} from '../../puzzle-core/src/page/look';

const page = {width: 1920, height: 2560};
/** The bottom of what a tool may place on: above the note's page bar (#577). */
const floor = 2560 - PAGE_BAR_PX;
const picture = {width: 640, height: 593};

function placed(...args: Parameters<typeof placeRect>): Rect {
  const rect = placeRect(...args);
  if (!rect) {
    throw new Error('no rect');
  }
  return rect;
}

describe('placeRect (#20, #39)', () => {
  it('goes just below the word, left-aligned, never over it', () => {
    const word = {left: 100, top: 200, right: 300, bottom: 260};
    const rect = placed(word, picture, page);
    expect(rect).toEqual({
      left: 100,
      top: 260 + PLACE_GAP,
      right: 740,
      bottom: 260 + PLACE_GAP + 593,
    });
    expect(rect.top).toBeGreaterThan(word.bottom);
  });

  it('goes just above the word when it does not fit below', () => {
    const word = {left: 1800, top: 2300, right: 1900, bottom: 2400};
    expect(placeRect(word, picture, page)).toEqual({
      left: 1280,
      top: 2300 - PLACE_GAP - 593,
      right: 1920,
      bottom: 2300 - PLACE_GAP,
    });
  });

  it('shrinks into the larger band, keeping proportions, rather than cover the word', () => {
    const tall = {width: 640, height: 2000};
    const word = {left: 100, top: 1000, right: 300, bottom: 1100};
    const rect = placed(word, tall, page);
    // Below: 2444 - 1124 = 1320 px of room above the page bar, more than the 976 above.
    expect(rect.top).toBe(1100 + PLACE_GAP);
    expect(rect.bottom).toBe(floor);
    expect(rect.right - rect.left).toBe(Math.round((640 * 1320) / 2000));
  });

  it('shrinks a picture wider than the page without distorting it', () => {
    const wide = {width: 3840, height: 400};
    const rect = placed(
      {left: 0, top: 100, right: 50, bottom: 150},
      wide,
      page,
    );
    expect(rect.right - rect.left).toBe(1920);
    expect(rect.bottom - rect.top).toBe(200);
  });

  it('gives no rect when neither band is high enough to show the picture (#47)', () => {
    const word = {left: 100, top: 40, right: 300, bottom: 2500};
    expect(placeRect(word, picture, page)).toBeNull();
    const edge = {
      left: 100,
      top: 0,
      right: 300,
      bottom: floor - PLACE_GAP - MIN_PLACE_BAND,
    };
    expect(placed(edge, picture, page).bottom).toBe(floor);
  });
});

describe('placeRect above the page bar (#577)', () => {
  it.each(['below', 'beside', 'replace'] as const)('never reaches into the page bar (%s)', placement => {
    const low = {left: 100, top: 2200, right: 300, bottom: 2260};
    const rect = placeRect(low, {width: 640, height: 900}, page, placement);
    expect(rect && rect.bottom).toBeLessThanOrEqual(floor);
  });
});

describe('placeRect in free space (#152)', () => {
  const word = {left: 100, top: 200, right: 300, bottom: 260};
  const box = {width: 640, height: 200};
  const below = 260 + PLACE_GAP;
  // A written line right under the word, and the next one further down.
  const nextLine = {left: 80, top: below + 10, right: 1500, bottom: below + 90};
  const lineAfter = {left: 80, top: below + 400, right: 1500, bottom: below + 480};

  it('is today\'s rect when nothing else is on the page', () => {
    expect(placeRect(word, box, page, 'below', [])).toEqual(placeRect(word, box, page));
  });

  it('goes into the first free band below the ink under the word', () => {
    const rect = placed(word, box, page, 'below', [nextLine, lineAfter]);
    expect(rect.top).toBe(nextLine.bottom + PLACE_GAP);
    expect(rect.bottom).toBeLessThanOrEqual(lineAfter.top);
    expect(rect.left).toBe(word.left);
  });

  it('skips a band too low for the box and goes past the next line', () => {
    const close = {...lineAfter, top: nextLine.bottom + PLACE_GAP + 100, bottom: nextLine.bottom + PLACE_GAP + 180};
    const rect = placed(word, box, page, 'below', [nextLine, close]);
    expect(rect.top).toBe(close.bottom + PLACE_GAP);
  });

  it('goes above the word when the page below is full', () => {
    const word2 = {left: 100, top: 1200, right: 300, bottom: 1260};
    const full = {left: 0, top: 1270, right: 1920, bottom: 2560};
    const rect = placed(word2, box, page, 'below', [full]);
    expect(rect.bottom).toBe(1200 - PLACE_GAP);
    expect(rect.top).toBe(1200 - PLACE_GAP - 200);
  });

  it('keeps today\'s rect when no free place of that size exists', () => {
    const everywhere = [
      {left: 0, top: 0, right: 1920, bottom: 190},
      {left: 0, top: 270, right: 1920, bottom: 2560},
    ];
    expect(placeRect(word, box, page, 'below', everywhere)).toEqual(placeRect(word, box, page));
  });

  it('counts a rect that only touches the band as free', () => {
    const touching = {left: 80, top: below + 200, right: 1500, bottom: below + 300};
    expect(placeRect(word, box, page, 'below', [touching])).toEqual(placeRect(word, box, page));
  });

  it('never counts the word\'s own strokes, inside the lasso rect, as in the way', () => {
    const ownStroke = {left: 120, top: 210, right: 280, bottom: 255};
    expect(placeRect(word, box, page, 'below', [ownStroke])).toEqual(placeRect(word, box, page));
  });

  it('beside: falls back below, into free space, when ink is beside the word', () => {
    const beside = {left: 320, top: 190, right: 1900, bottom: 270};
    const rect = placed(word, box, page, 'beside', [beside, nextLine]);
    expect(rect.top).toBe(nextLine.bottom + PLACE_GAP);
  });
});

describe('the placement setting (#70)', () => {
  const word = {left: 100, top: 200, right: 300, bottom: 260};

  it('goes in place of the word from its top-left corner', () => {
    expect(placeRect(word, picture, page, 'replace')).toEqual({
      left: 100,
      top: 200,
      right: 740,
      bottom: 793,
    });
  });

  it('goes beside the word, to its right, top-aligned', () => {
    expect(placeRect(word, picture, page, 'beside')).toEqual({
      left: 300 + PLACE_GAP,
      top: 200,
      right: 300 + PLACE_GAP + 640,
      bottom: 793,
    });
  });

  it('goes to the left when the right has less room', () => {
    const atRight = {left: 1500, top: 200, right: 1800, bottom: 260};
    const rect = placed(atRight, picture, page, 'beside');
    expect(rect.right).toBe(1500 - PLACE_GAP);
    expect(rect.right - rect.left).toBe(640);
  });

  it('goes below when neither side has room', () => {
    const wide = {left: 50, top: 200, right: 1880, bottom: 260};
    expect(placeRect(wide, picture, page, 'beside')).toEqual(
      placeRect(wide, picture, page, 'below'),
    );
  });

  it('gives no rect in place of a word at the very bottom', () => {
    const low = {
      left: 100,
      top: floor - MIN_PLACE_BAND + 1,
      right: 300,
      bottom: 2559,
    };
    expect(placeRect(low, picture, page, 'replace')).toBeNull();
  });
});

type Failure = {ok: false; code: number; message: string};

function placeHost(inserted: boolean): PlaceHost<Failure> & {
  insertPageElements: jest.Mock;
} {
  return {
    pictureType: 200,
    createElement: jest.fn(async () => ({ok: true, value: {uuid: 'u1'}}) as const),
    insertPageElements: jest.fn(async () => ({ok: true, value: inserted}) as const),
    failure: message => ({ok: false, code: -1, message}),
  };
}

describe('placeAtLasso (#109)', () => {
  const place = {
    rect: {left: 100, top: 200, right: 300, bottom: 260},
    page: 3,
    pageSize: page,
  };

  it('inserts a picture element at the placed rect on the lassoed page', async () => {
    const host = placeHost(true);
    const placed = await placeAtLasso(host, '/p.png', picture, place);
    const rect = placeRect(place.rect, picture, page);
    expect(placed).toEqual({ok: true, value: rect});
    expect(host.insertPageElements).toHaveBeenCalledWith(
      [
        {
          uuid: 'u1',
          type: 200,
          pageNum: 3,
          layerNum: 0,
          picture: {picturePath: '/p.png', rect},
        },
      ],
      3,
      0,
    );
  });

  it('places below the words the search names, not the whole lasso (#18)', async () => {
    const words = {left: 220, top: 200, right: 300, bottom: 260};
    const placed = await placeAtLasso(placeHost(true), '/p.png', picture, {...place, words});
    expect(placed).toEqual({ok: true, value: placeRect(words, picture, page)});
    expect(placed.ok && placed.value.left).toBe(220);
  });

  it('places in free space from the place\'s occupied rects, and logs when there is none (#152)', async () => {
    const ink = {left: 0, top: 290, right: 1920, bottom: 400};
    const host = {...placeHost(true), log: jest.fn()};
    const placed = await placeAtLasso(host, '/p.png', picture, {...place, occupied: [ink]});
    expect(placed.ok && placed.value.top).toBe(400 + PLACE_GAP);
    expect(host.log).not.toHaveBeenCalled();
    const full = {left: 0, top: 0, right: 1920, bottom: 2560};
    await placeAtLasso(host, '/p.png', picture, {...place, occupied: [full]});
    expect(host.log).toHaveBeenCalledWith(expect.stringContaining('no free place'));
  });

  it('fails when the host answers false or no band fits', async () => {
    expect((await placeAtLasso(placeHost(false), '/p.png', picture, place)).ok).toBe(
      false,
    );
    const host = placeHost(true);
    const full = {...place, rect: {left: 100, top: 40, right: 300, bottom: 2500}};
    expect((await placeAtLasso(host, '/p.png', picture, full)).ok).toBe(false);
    expect(host.insertPageElements).not.toHaveBeenCalled();
  });
});

describe('inkUnderRect, the one ink-under rule (#168, #234)', () => {
  const placedRect = {left: 100, top: 100, right: 500, bottom: 400};
  const word = {left: 120, top: 120, right: 300, bottom: 200};
  const stroke = {left: 150, top: 130, right: 250, bottom: 190};
  const far = {left: 900, top: 900, right: 1000, bottom: 1000};

  test('an unknown page refuses the lasso', () => {
    expect(inkUnderRect(placedRect, null)).toBe("the page's ink is not known");
  });

  test('a partial read refuses the lasso, even with nothing read under the rect', () => {
    expect(inkUnderRect(placedRect, {rects: [far], complete: false})).toBe(
      "only part of the page's ink is known",
    );
  });

  test('a complete read lassoes only when nothing else crosses the rect', () => {
    expect(inkUnderRect(placedRect, {rects: [far], complete: true})).toBeNull();
    expect(inkUnderRect(placedRect, {rects: [stroke, far], complete: true})).toBe(
      '1 other elements in the rect',
    );
  });

  test("the deleted word's own strokes do not count, any other ink does", () => {
    const outside = {left: 450, top: 350, right: 600, bottom: 450};
    expect(inkUnderRect(placedRect, {rects: [stroke], complete: true}, word)).toBeNull();
    expect(inkUnderRect(placedRect, {rects: [stroke, outside], complete: true}, word)).toBe(
      '1 other elements in the rect',
    );
  });
});

// One measured page bar (#577): Puzzles' page look keeps it in millimetres, so the two never drift apart.

describe('the page bar of the page look', () => {
  test('is the page area\'s 116 px', () => {
    expect(mmToPx(PAGE_MM.pageBar)).toBe(PAGE_BAR_PX);
  });
});
