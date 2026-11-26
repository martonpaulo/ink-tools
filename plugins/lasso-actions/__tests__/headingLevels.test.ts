/** Headings' pure rules (#252): the level-to-style map and the placement over a fake page. */
import {TITLE_STYLE} from '@ink-tools/sn-adapter/official';
import {
  HEADING_LEVELS,
  HEADING_MARGIN,
  levelStyle,
  placement,
} from '../src/headings/levels';

const PAGE = {width: 1404, height: 1872};

test('each level has its own native style, level 1 the strongest', () => {
  expect(HEADING_LEVELS.map(levelStyle)).toEqual([
    TITLE_STYLE.black,
    TITLE_STYLE.shadow,
    TITLE_STYLE.darkGrey,
    TITLE_STYLE.lightGrey,
  ]);
  expect(new Set(HEADING_LEVELS.map(levelStyle)).size).toBe(4);
  expect(HEADING_LEVELS.map(levelStyle)).not.toContain(TITLE_STYLE.none);
});

test('a word in the middle of a line goes to the leading margin and spans the writing width', () => {
  expect(
    placement({left: 600, top: 400, right: 800, bottom: 460}, PAGE),
  ).toEqual({
    left: HEADING_MARGIN,
    top: 400,
    right: PAGE.width - HEADING_MARGIN,
    bottom: 460,
  });
});

test('a lasso of several lines keeps its union height and stays one heading', () => {
  const rect = placement({left: 300, top: 400, right: 900, bottom: 600}, PAGE);
  expect(rect).toEqual({
    left: HEADING_MARGIN,
    top: 400,
    right: PAGE.width - HEADING_MARGIN,
    bottom: 600,
  });
});

test('a lasso past the page edge is moved back onto the page', () => {
  expect(
    placement({left: 1300, top: 1840, right: 1500, bottom: 1900}, PAGE),
  ).toEqual({
    left: HEADING_MARGIN,
    top: PAGE.height - 60,
    right: PAGE.width - HEADING_MARGIN,
    bottom: PAGE.height,
  });
  expect(
    placement({left: 10, top: -30, right: 200, bottom: 20}, PAGE)?.top,
  ).toBe(0);
});

test('an empty rect or a page narrower than its margins places nothing', () => {
  expect(placement({left: 5, top: 5, right: 5, bottom: 50}, PAGE)).toBeNull();
  expect(placement({left: 5, top: 50, right: 50, bottom: 50}, PAGE)).toBeNull();
  expect(
    placement(
      {left: 5, top: 5, right: 50, bottom: 50},
      {width: 150, height: 300},
    ),
  ).toBeNull();
});
