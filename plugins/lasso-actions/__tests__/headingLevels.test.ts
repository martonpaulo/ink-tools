/** Headings' pure rules (#252): the level-to-style map and the placement over a fake page. */
import {TITLE_STYLE} from '@ink-tools/sn-adapter/official';
import {
  HEADING_LEVELS,
  HEADING_MARGIN,
  LASSO_SPACE,
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

test('a word in the middle of a line moves to the leading margin at its own size', () => {
  expect(
    placement({left: 600, top: 400, right: 800, bottom: 460}, PAGE),
  ).toEqual({
    left: HEADING_MARGIN,
    top: 400,
    right: HEADING_MARGIN + 200,
    bottom: 460,
  });
});

test('a lasso wider than the writing width starts nearer the edge and never leaves the page', () => {
  expect(
    placement({left: 20, top: 400, right: PAGE.width - 40, bottom: 460}, PAGE),
  ).toEqual({left: 60, top: 400, right: PAGE.width, bottom: 460});
});

test('a lasso of several lines keeps its union height and stays one heading', () => {
  const rect = placement({left: 300, top: 400, right: 900, bottom: 600}, PAGE);
  expect(rect).toEqual({
    left: HEADING_MARGIN,
    top: 400,
    right: HEADING_MARGIN + 600,
    bottom: 600,
  });
});

test('a lasso past the page edge is moved back onto the page', () => {
  expect(
    placement({left: 1300, top: 1840, right: 1500, bottom: 1900}, PAGE),
  ).toEqual({
    left: HEADING_MARGIN,
    top: PAGE.height - 60,
    right: HEADING_MARGIN + 200,
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

test('full width puts the ink, not the lasso\'s space, on both margins, at the lasso\'s own top and height (owner D90, #252)', () => {
  const lasso = {left: 600, top: 400, right: 800, bottom: 460};
  const target = placement(lasso, PAGE, 'full');
  expect(target).toMatchObject({top: 400, bottom: 460});
  // resizeLassoRect scales the lasso rect, its space around the ink with it (device round 12).
  const scale = (target!.right - target!.left) / (lasso.right - lasso.left);
  expect(target!.left + LASSO_SPACE * scale).toBeCloseTo(HEADING_MARGIN, 0);
  expect(target!.right - LASSO_SPACE * scale).toBeCloseTo(PAGE.width - HEADING_MARGIN, 0);
});

test('full width stays inside the page, and a lasso with no room for its space spans the margins', () => {
  const tiny = placement({left: 600, top: 400, right: 620, bottom: 460}, PAGE, 'full');
  expect(tiny).toMatchObject({left: 0, right: PAGE.width});
  const empty = placement({left: 600, top: 400, right: 610, bottom: 460}, PAGE, 'full');
  expect(empty).toMatchObject({left: HEADING_MARGIN, right: PAGE.width - HEADING_MARGIN});
});

test('own size keeps the lasso\'s width at the margin', () => {
  expect(placement({left: 600, top: 400, right: 800, bottom: 460}, PAGE, 'own')?.right).toBe(HEADING_MARGIN + 200);
});
