/** One Headings press over a fake page (#252): the order of the calls and each failure. */
import {fail, ok, TITLE_STYLE} from '@ink-tools/sn-adapter/official';
import {HEADING_MARGIN} from '../src/headings/levels';
import {applyHeading, HeadingHost} from '../src/headings/run';
import {copy} from '../src/copy';

const PAGE = {width: 1404, height: 1872};
const WORD = {left: 600, top: 400, right: 800, bottom: 460};

function fakeHost(over: Partial<HeadingHost> = {}) {
  const calls: string[] = [];
  const toasts: string[] = [];
  const host: HeadingHost = {
    lassoRect: async () => ok(WORD),
    pageSize: async () => ok(PAGE),
    setTitle: async style => {
      calls.push(`title ${style}`);
      return ok(true);
    },
    resize: async rect => {
      calls.push(
        `resize ${rect.left},${rect.top},${rect.right},${rect.bottom}`,
      );
      return ok(true);
    },
    toast: text => toasts.push(text),
    log: () => {},
    ...over,
  };
  return {host, calls, toasts};
}

test('a lassoed word becomes a level 2 heading at the leading margin, across the page', async () => {
  const {host, calls, toasts} = fakeHost();
  const outcome = await applyHeading(2, host);
  expect(outcome).toEqual({
    ok: true,
    rect: {
      left: HEADING_MARGIN,
      top: 400,
      right: PAGE.width - HEADING_MARGIN,
      bottom: 460,
    },
  });
  expect(calls).toEqual([
    `title ${TITLE_STYLE.shadow}`,
    `resize ${HEADING_MARGIN},400,${PAGE.width - HEADING_MARGIN},460`,
  ]);
  expect(toasts).toEqual([]);
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
  const {host, calls, toasts} = fakeHost({
    lassoRect: async () => fail(904, 'No lasso action has been performed'),
  });
  expect(await applyHeading(1, host)).toEqual({ok: false, why: 'lasso'});
  expect(calls).toEqual([]);
  expect(toasts).toEqual([copy['heading.noLasso']]);
});

test("a pasted selection's local rect places nothing (#165)", async () => {
  const {host, calls, toasts} = fakeHost({
    lassoRect: async () => ok({left: -90, top: -90, right: 90, bottom: 90}),
  });
  expect(await applyHeading(1, host)).toEqual({ok: false, why: 'unplaced'});
  expect(calls).toEqual([]);
  expect(toasts).toEqual([copy['error.unplaced']]);
});

test('an unread page size changes nothing', async () => {
  const {host, calls} = fakeHost({pageSize: async () => fail(-1, 'thrown')});
  expect(await applyHeading(1, host)).toEqual({ok: false, why: 'page'});
  expect(calls).toEqual([]);
});

test('a refused title leaves the lasso untouched', async () => {
  const {host, calls, toasts} = fakeHost({
    setTitle: async () => ok(false),
  });
  expect(await applyHeading(4, host)).toEqual({ok: false, why: 'title'});
  expect(calls).toEqual([]);
  expect(toasts).toEqual([copy['heading.failed']]);
});

test('a failed resize keeps the title and says the heading was not moved', async () => {
  const {host, calls, toasts} = fakeHost({
    resize: async () => fail(-1, 'thrown'),
  });
  expect(await applyHeading(2, host)).toEqual({ok: false, why: 'resize'});
  expect(calls).toEqual([`title ${TITLE_STYLE.shadow}`]);
  expect(toasts).toEqual([copy['heading.notMoved']]);
});
