/** A press changes the picture or shows why it did not, never nothing (#170). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {WorkingStrip} from '@ink-tools/ui-kit';
import {pressables, quietWorking, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {copy} from '../src/copy';
import {GUIDE_OUTSIDE, NO_GUIDE, NOT_PICTURE_AND_GUIDE} from '../src/crop';
import {Done, NOT_EDITED, NOT_ONE_PICTURE} from '../src/edit';
import {MARKS_OUTSIDE, NO_MARKS, NOT_PICTURE_AND_MARKS} from '../src/erase';
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
    fail: jest.fn(),
    sweep: jest.fn(async () => undefined),
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
    [{kind: 'nothing', why: NO_GUIDE}, copy['press.cropNoGuide']],
    [{kind: 'nothing', why: NOT_PICTURE_AND_GUIDE}, copy['press.cropNotPicture']],
    [{kind: 'nothing', why: GUIDE_OUTSIDE}, copy['press.cropOutside']],
    [{kind: 'nothing', why: NO_MARKS}, copy['press.eraseNoMarks']],
    [{kind: 'nothing', why: NOT_PICTURE_AND_MARKS}, copy['press.eraseNotPicture']],
    [{kind: 'nothing', why: MARKS_OUTSIDE}, copy['press.eraseOutside']],
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

test('the orphan sweep runs after the edit, and not when a permission is missing (#182)', async () => {
  const edited = deps([], {kind: 'edited', edit: 'enhance', ms: 500});
  await pressEdit(ENHANCE, edited.d);
  expect(edited.d.sweep).toHaveBeenCalledTimes(1);
  const missing = deps(['plugin.permission.FILE:READ'], {kind: 'edited', edit: 'enhance', ms: 1});
  await pressEdit(ENHANCE, missing.d);
  expect(missing.d.sweep).not.toHaveBeenCalled();
});

test('a press that failed on the tablet shows the Error state with its reason and Close, the details only in the log (#256)', async () => {
  const working = quietWorking({failed: copy['working.failed'], timeout: copy['working.timeout']});
  const lines: string[] = [];
  const {d, toasts} = deps([], {kind: 'failed', why: 'modifyPageElements: 9 broken'});
  d.fail = problem => working.hold(problem);
  d.log = line => lines.push(line);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<WorkingStrip working={working} />);
  });
  await act(async () => {
    await pressEdit(ENHANCE, d);
  });
  expect(toasts).toEqual([]);
  expect(tree.root.findAllByProps({testID: 'error-view'}).length).toBeGreaterThan(0);
  const shown = shownTexts(tree.root);
  expect(shown).toEqual([copy['press.failedTitle']('Enhance'), copy['press.failedReason']]);
  expect(lines.join('\n')).toContain('modifyPageElements: 9 broken');
  expect(
    pressables(tree.root).length,
  ).toBeGreaterThan(0);
});
