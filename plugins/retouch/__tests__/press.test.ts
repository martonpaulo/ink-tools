/** A press changes the picture or shows why it did not, never nothing (#170). */
import {copy} from '../src/copy';
import {Done, NOT_EDITED, NOT_ONE_PICTURE} from '../src/edit';
import {EDITS} from '../src/edits';
import {pressEdit, PressDeps} from '../src/press';

const ENHANCE = EDITS.find(edit => edit.id === 'enhance')!;

function deps(missing: string[], done: Done) {
  const toasts: string[] = [];
  const d: PressDeps = {
    missing: async () => missing,
    ask: jest.fn(async () => undefined),
    edit: jest.fn(async () => done),
    page: jest.fn(),
    toast: text => toasts.push(text),
    log: () => undefined,
  };
  return {d, toasts};
}

test('a permission revoked since the last press (Allow This Time Only) asks in Settings and says so', async () => {
  const {d, toasts} = deps(['plugin.permission.FILE:READ'], {
    kind: 'edited',
    edit: 'enhance',
    ms: 1,
  });
  expect(await pressEdit(ENHANCE, d)).toBeNull();
  expect(d.edit).not.toHaveBeenCalled();
  expect(d.ask).toHaveBeenCalledTimes(1);
  expect(toasts).toEqual([copy['press.permission']]);
});

test('a call refused for its file permission (1503) shows the permission toast', async () => {
  const {d, toasts} = deps([], {
    kind: 'failed',
    why: 'getPageSize: 1503 File read permission has not been requested',
  });
  await pressEdit(ENHANCE, d);
  expect(toasts).toEqual([copy['press.permission']]);
});

test('every press that changed nothing shows its reason', async () => {
  const cases: [Done, string][] = [
    [{kind: 'nothing', why: NOT_ONE_PICTURE}, copy['press.notPicture']],
    [{kind: 'nothing', why: NOT_EDITED}, copy['press.notEdited']],
    [
      {kind: 'failed', why: 'modifyPageElements: 9 broken'},
      copy['press.failed']('Enhance', 'modifyPageElements: 9 broken'),
    ],
  ];
  for (const [done, toast] of cases) {
    const {d, toasts} = deps([], done);
    expect(await pressEdit(ENHANCE, d)).toEqual(done);
    expect(toasts).toEqual([toast]);
  }
});

test('an edited picture shows no toast', async () => {
  const {d, toasts} = deps([], {kind: 'edited', edit: 'enhance', ms: 500});
  await pressEdit(ENHANCE, d);
  expect(toasts).toEqual([]);
});
