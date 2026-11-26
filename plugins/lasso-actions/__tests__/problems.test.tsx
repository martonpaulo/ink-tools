/** A press's known failure and its permission check, drawn by ui-kit's Error and Needs states (#256). */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {fail, ok} from '@ink-tools/sn-adapter/official';
import {CLOSE_TEXT, WorkingStrip} from '@ink-tools/ui-kit';
import {pressables, quietWorking, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {permissionProblem} from '../src/buttons';
import {copy} from '../src/copy';
import {applyHeading} from '../src/headings/run';

function setup() {
  const working = quietWorking({failed: copy['working.failed'], timeout: copy['working.timeout']});
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<WorkingStrip working={working} />);
  });
  return {working, tree: () => tree};
}

const texts = (tree: ReactTestRenderer) => shownTexts(tree.root);
const pressable = (tree: ReactTestRenderer, label: string) => pressables(tree.root, label);

test('a heading the tablet could not make shows the Error state with its reason and Close', async () => {
  const {working, tree} = setup();
  const lines: string[] = [];
  await act(async () => {
    await working.run(() =>
      applyHeading(2, {
        lassoRect: async () => ok({left: 600, top: 400, right: 800, bottom: 460}),
        pageSize: async () => fail(-1, 'thrown'),
        setTitle: async () => ok(true),
        select: async () => ok(true),
        resize: async () => ok(true),
        toast: () => undefined,
        fail: problem => working.hold(problem),
        log: line => lines.push(line),
      }),
    );
  });
  expect(tree().root.findAllByProps({testID: 'error-view'}).length).toBeGreaterThan(0);
  expect(texts(tree())).toEqual([copy['heading.failed'], copy['heading.failedReason']]);
  expect(lines.join('\n')).toContain('page size failed: -1 thrown');
  expect(pressable(tree(), CLOSE_TEXT).length).toBeGreaterThan(0);
});

test('a missing permission shows the Needs state; «Allow» asks for it, then closes the view', async () => {
  const {working, tree} = setup();
  const asked: string[] = [];
  const need = {permission: 'plugin.permission.FILE:WRITE', reason: copy['permission.write']};
  act(() => {
    working.hold(
      permissionProblem([need], () => working.dismiss(), {
        requestPermission: async permission => {
          asked.push(permission);
          return ok(1);
        },
        log: () => undefined,
      }),
      'needs',
    );
  });
  expect(tree().root.findAllByProps({testID: 'needs'}).length).toBeGreaterThan(0);
  expect(texts(tree())).toEqual(
    expect.arrayContaining([copy['needs.permission'], copy['permission.write']]),
  );
  expect(pressable(tree(), CLOSE_TEXT).length).toBeGreaterThan(0);
  await act(async () => {
    pressable(tree(), copy['needs.allow'])[0].props.onPress();
  });
  expect(asked).toEqual([need.permission]);
  expect(working.problem()).toBeNull();
});
