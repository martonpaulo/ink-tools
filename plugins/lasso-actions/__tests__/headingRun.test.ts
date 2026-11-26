/** One Headings press over a fake page (#252): the order of the calls and each failure. */
import {fail, ok, TITLE_STYLE} from '@ink-tools/sn-adapter/official';
import {HEADING_MARGIN} from '../src/headings/levels';
import {applyHeading, DEVICE_HOST, HeadingHost} from '../src/headings/run';
import {working} from '../src/working';
import type {Problem} from '@ink-tools/ui-kit';
import {copy} from '../src/copy';
import {UNPLACED} from '../src/textBox';

const PAGE = {width: 1404, height: 1872};
const WORD = {left: 600, top: 400, right: 800, bottom: 460};

function fakeHost(over: Partial<HeadingHost> = {}) {
  const calls: string[] = [];
  const failures: Problem[] = [];
  const host: HeadingHost = {
    lassoRect: async () => ok(WORD),
    size: async () => 'own',
    pageSize: async () => ok(PAGE),
    setTitle: async style => {
      calls.push(`title ${style}`);
      return ok(true);
    },
    select: async rect => {
      calls.push(
        `select ${rect.left},${rect.top},${rect.right},${rect.bottom}`,
      );
      return ok(true);
    },
    resize: async rect => {
      calls.push(
        `resize ${rect.left},${rect.top},${rect.right},${rect.bottom}`,
      );
      return ok(true);
    },
    fail: problem => failures.push(problem),
    log: () => {},
    ...over,
  };
  return {host, calls, failures};
}

test('a lassoed word becomes a level 2 heading at the leading margin, at its own size', async () => {
  const {host, calls, failures} = fakeHost();
  const outcome = await applyHeading(2, host);
  expect(outcome).toEqual({
    ok: true,
    rect: {
      left: HEADING_MARGIN,
      top: 400,
      right: HEADING_MARGIN + 200,
      bottom: 460,
    },
  });
  // The title clears the lasso on the tablet (device round 6), so its strokes are lassoed again.
  // A move sent before the title in the same press was lost (device round 9): the title stays first.
  expect(calls).toEqual([
    `title ${TITLE_STYLE.shadow}`,
    'select 600,400,800,460',
    `resize ${HEADING_MARGIN},400,${HEADING_MARGIN + 200},460`,
  ]);
  expect(failures).toEqual([]);
});

test('a lasso the title cleared and that cannot be made again keeps the title, unmoved, and says so', async () => {
  const {host, calls, failures} = fakeHost({
    select: async () => fail(904, 'No lasso action has been performed'),
  });
  expect(await applyHeading(2, host)).toEqual({ok: false, why: 'relasso'});
  expect(calls).toEqual([`title ${TITLE_STYLE.shadow}`]);
  expect(failures).toEqual([{what: copy['heading.notMoved']}]); // held, not a toast alone (#438)
});

test('a level pressed twice only sets the style again, at the same place', async () => {
  const {host, calls} = fakeHost();
  await applyHeading(1, host);
  await applyHeading(3, host);
  expect(calls.filter(call => call.startsWith('title'))).toEqual([
    `title ${TITLE_STYLE.black}`,
    `title ${TITLE_STYLE.darkGrey}`,
  ]);
  expect(new Set(calls.filter(call => call.startsWith('resize'))).size).toBe(1);
});

test('no lasso changes nothing and says to lasso first', async () => {
  const {host, calls, failures} = fakeHost({
    lassoRect: async () => fail(904, 'No lasso action has been performed'),
  });
  expect(await applyHeading(1, host)).toEqual({ok: false, why: 'lasso'});
  expect(calls).toEqual([]);
  expect(failures).toEqual([{what: copy['heading.noLasso']}]); // held, not a toast alone (#438)
});

test("a pasted selection's local rect places nothing and holds the Error state (#165, #428)", async () => {
  const {host, calls, failures} = fakeHost({
    lassoRect: async () => ok({left: -90, top: -90, right: 90, bottom: 90}),
  });
  expect(await applyHeading(1, host)).toEqual({ok: false, why: 'unplaced'});
  expect(calls).toEqual([]);
  expect(failures).toEqual([UNPLACED]);
});

test('an unread page size changes nothing', async () => {
  const {host, calls} = fakeHost({pageSize: async () => fail(-1, 'thrown')});
  expect(await applyHeading(1, host)).toEqual({ok: false, why: 'page'});
  expect(calls).toEqual([]);
});

test('a refused title leaves the lasso untouched', async () => {
  const {host, calls, failures} = fakeHost({
    setTitle: async () => ok(false),
  });
  expect(await applyHeading(4, host)).toEqual({ok: false, why: 'title'});
  expect(calls).toEqual([]);
  expect(failures.map(failure => failure.what)).toEqual([copy['heading.failed']]);
});

test('a failed resize keeps the title and says the heading was not moved', async () => {
  const {host, calls, failures} = fakeHost({
    resize: async () => fail(-1, 'thrown'),
  });
  expect(await applyHeading(2, host)).toEqual({ok: false, why: 'resize'});
  expect(calls).toEqual([`title ${TITLE_STYLE.shadow}`, 'select 600,400,800,460']);
  expect(failures).toEqual([{what: copy['heading.notMoved']}]); // held, not a toast alone (#438)
});

/**
 * The Manta's page as device round 7 recorded it (#252): «save», 280 x 75 px of strokes, lassoed
 * as a 290 x 180 box on a 1920 x 2560 page. `resizeLassoRect` maps the strokes from the lasso box
 * onto the new rect, scaling them (a 1,728 px target gave a 1,666 px title, TITLERECT
 * 130,841,1666,75), and the title's box is the strokes' box.
 */
function mantaPage() {
  const page = {width: 1920, height: 2560};
  let lasso = {left: 465, top: 789, right: 755, bottom: 969};
  let strokes = {left: 470, top: 841, right: 750, bottom: 916};
  const map = (value: number, from0: number, from1: number, to0: number, to1: number) =>
    to0 + ((value - from0) * (to1 - to0)) / (from1 - from0);
  const {host} = fakeHost({
    lassoRect: async () => ok(lasso),
    pageSize: async () => ok(page),
    resize: async rect => {
      strokes = {
        left: map(strokes.left, lasso.left, lasso.right, rect.left, rect.right),
        right: map(strokes.right, lasso.left, lasso.right, rect.left, rect.right),
        top: map(strokes.top, lasso.top, lasso.bottom, rect.top, rect.bottom),
        bottom: map(strokes.bottom, lasso.top, lasso.bottom, rect.top, rect.bottom),
      };
      lasso = rect;
      return ok(true);
    },
  });
  return {host, title: () => strokes};
}

test('on the Manta a heading keeps the handwriting at its size and moves it to the margin (#252)', async () => {
  const manta = mantaPage();
  const outcome = await applyHeading(2, manta.host);
  expect(outcome.ok).toBe(true);
  const title = manta.title();
  expect(title.right - title.left).toBeCloseTo(280);
  expect(title.bottom - title.top).toBeCloseTo(75);
  expect(title.left).toBeCloseTo(HEADING_MARGIN + 5);
});

test('the press asks for the lasso and the page size together, before the title', async () => {
  const order: string[] = [];
  const {host} = fakeHost({
    lassoRect: async () => {
      order.push('lasso asked');
      await Promise.resolve();
      order.push('lasso answered');
      return ok(WORD);
    },
    pageSize: async () => {
      order.push('page asked');
      return ok(PAGE);
    },
  });
  await applyHeading(1, host);
  expect(order.slice(0, 2)).toEqual(['lasso asked', 'page asked']);
});

test('each press uses Settings › Heading Size: own size keeps the width, full width spans the page (owner D90)', async () => {
  const own = fakeHost();
  expect(await applyHeading(2, own.host)).toMatchObject({ok: true, rect: {left: HEADING_MARGIN, right: HEADING_MARGIN + 200}});
  const full = fakeHost({size: async () => 'full'});
  expect(await applyHeading(2, full.host)).toMatchObject({
    ok: true,
    rect: {left: HEADING_MARGIN, top: 400, right: PAGE.width - HEADING_MARGIN, bottom: 460},
  });
  expect(full.calls.at(-1)).toBe(`resize ${HEADING_MARGIN},400,${PAGE.width - HEADING_MARGIN},460`);
});

test("on the tablet a pasted selection holds ui-kit's Error state with its reason (#428)", async () => {
  const host: HeadingHost = {
    ...DEVICE_HOST,
    lassoRect: async () => ok({left: -90, top: -90, right: 90, bottom: 90}),
    size: async () => 'own',
    pageSize: async () => ok(PAGE),
    log: () => {},
  };
  expect(await applyHeading(1, host)).toEqual({ok: false, why: 'unplaced'});
  expect(working.heldState()).toBe('error');
  expect(working.problem()).toEqual({
    what: copy['error.unplacedWhat'],
    reason: copy['error.unplaced'],
  });
  await working.dismiss();
});
