/** The Back key of a full view (#204): the newest exit runs, the key never reaches the host. */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {useBackKey} from '../src/backKey';
import {catchBackKey} from '../src/backKeyTest';
import {createWorking} from '../src/working';
import {WorkingStrip} from '../src/WorkingStrip';

function View({onBack, label}: {onBack: () => void; label: string}) {
  useBackKey(onBack);
  return <Text>{label}</Text>;
}

let back: ReturnType<typeof catchBackKey>;
beforeEach(() => {
  back = catchBackKey();
});
afterEach(() => back.restore());

test('Back runs the newest exit the view passed, and takes the key', () => {
  const first = jest.fn();
  const second = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<View onBack={first} label="a" />);
  });
  act(() => tree.update(<View onBack={second} label="b" />));
  expect(back.count()).toBe(1);
  expect(back.press()).toBe(true);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test('a closed view leaves the key to the host', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<View onBack={() => {}} label="a" />);
  });
  act(() => tree.unmount());
  expect(back.count()).toBe(0);
  expect(back.press()).toBe(false);
});

test('the «Loading…» strip takes Back and does nothing', () => {
  const exit = jest.fn();
  act(() => {
    renderer.create(
      <>
        <View onBack={exit} label="a" />
        <WorkingStrip
          working={createWorking({
            show: async () => undefined,
            close: async () => undefined,
            toast: () => undefined,
            log: () => undefined,
            copy: {failed: 'Failed.', timeout: 'Still working.'},
          })}
        />
      </>,
    );
  });
  expect(back.press()).toBe(true);
  expect(exit).not.toHaveBeenCalled();
});
