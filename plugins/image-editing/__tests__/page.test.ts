/** One edit on every picture of the page, and its undo (#140). */
import {fail, ok, PICTURE_TYPE, STROKE_TYPE} from '@ink-tools/sn-adapter/official';
import {copy} from '../src/copy';
import {Done, NOT_ONE_PICTURE} from '../src/edit';
import {EDITS, EditId} from '../src/edits';
import {PageDeps, runPageEdit} from '../src/page';
import {pressEdit, PressDeps} from '../src/press';

const picture = (left: number) => ({
  type: PICTURE_TYPE,
  picture: {rect: {left, top: 100, right: left + 200, bottom: 300}},
});
const STROKE = {type: STROKE_TYPE};

function page(elements: object[], outcomes: Done[]) {
  const lassoed: number[] = [];
  const edits: EditId[] = [];
  const recycled: object[] = [];
  const deps: PageDeps = {
    notePath: async () => ok('/Note/a.note'),
    pageNum: async () => ok(0),
    elements: async () => ok(elements),
    recycle: async element => recycled.push(element),
    lasso: async rect => {
      lassoed.push(rect.left);
      return ok(true);
    },
    edit: async edit => {
      edits.push(edit);
      return outcomes.shift()!;
    },
    log: () => undefined,
  };
  return {deps, lassoed, edits, recycled};
}

const EDITED: Done = {kind: 'edited', edit: 'enhance', ms: 500};

test('lassoes each picture in turn and runs the one-picture edit on it', async () => {
  const elements = [picture(0), STROKE, picture(400)];
  const run = page(elements, [EDITED, EDITED]);
  await expect(runPageEdit('enhance', run.deps)).resolves.toEqual({
    kind: 'done',
    pictures: 2,
    edited: 2,
    skipped: [],
  });
  expect(run.lassoed).toEqual([0, 400]);
  expect(run.edits).toEqual(['enhance', 'enhance']);
  expect(run.recycled).toEqual(elements);
});

test('skips a picture whose lasso also takes ink, and edits the others', async () => {
  const run = page([picture(0), picture(400)], [
    {kind: 'nothing', why: NOT_ONE_PICTURE},
    EDITED,
  ]);
  await expect(runPageEdit('enhance', run.deps)).resolves.toEqual({
    kind: 'done',
    pictures: 2,
    edited: 1,
    skipped: [NOT_ONE_PICTURE],
  });
});

test('a page that cannot be read edits nothing and says why', async () => {
  const run = page([], []);
  run.deps.elements = async () => fail(1503, 'no read');
  await expect(runPageEdit('enhance', run.deps)).resolves.toEqual({
    kind: 'failed',
    why: 'getElements: 1503 no read',
  });
});

test('Enhance All Images and Undo All Images run Enhance and Undo on the page, with a toast', async () => {
  const toasts: string[] = [];
  const pages: EditId[] = [];
  const deps: PressDeps = {
    missing: async () => [],
    ask: async () => undefined,
    edit: jest.fn(),
    page: async edit => {
      pages.push(edit);
      return {kind: 'done', pictures: 3, edited: 2, skipped: ['x']};
    },
    toast: text => toasts.push(text),
    sweep: async () => undefined,
    log: () => undefined,
  };
  for (const id of ['enhance_all', 'undo_all']) {
    await pressEdit(EDITS.find(edit => edit.id === id)!, deps);
  }
  expect(pages).toEqual(['enhance', 'undo']);
  expect(deps.edit).not.toHaveBeenCalled();
  expect(toasts).toEqual([copy['page.done'](2, 3), copy['page.done'](2, 3)]);
});
