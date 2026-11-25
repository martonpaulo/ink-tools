/** The Needs, Error and Close pattern (#255): each part found in the tree, each press reaching its caller. */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {catchBackKey} from '../src/backKeyTest';
import {Button} from '../src/Button';
import {CloseButton, TitleRow} from '../src/CloseButton';
import {CLOSE_TEXT, reasonOf, RETRY_TEXT} from '../src/problem';
import {ErrorView, LoadingView, Needs} from '../src/ProblemView';
import {WORKING_TEXT} from '../src/working';

function render(element: React.JSX.Element) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => String(node.props.children));
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(Button).find(node => node.props.label === label);

describe('CloseButton and TitleRow (#255)', () => {
  it('is one outlined Close that calls its caller', () => {
    const onPress = jest.fn();
    const tree = render(<CloseButton onPress={onPress} />);
    const close = button(tree, CLOSE_TEXT)!;
    expect(close.props.primary).toBeFalsy();
    act(() => close.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('puts the title first and Close at the trailing edge', () => {
    const tree = render(<TitleRow title="Sample title" onClose={jest.fn()} />);
    expect(texts(tree)).toEqual(['Sample title', CLOSE_TEXT]);
  });
});

describe('Needs (#255)', () => {
  it('shows what is missing, why, and the fix as one primary button', () => {
    const run = jest.fn();
    const tree = render(
      <Needs
        problem={{
          what: 'Sample access is off',
          reason: 'The sample tool reads the sample folder.',
          fix: {label: 'Turn it on', run},
        }}
        onClose={jest.fn()}
      />,
    );
    expect(tree.root.findByProps({testID: 'needs'})).toBeTruthy();
    expect(texts(tree)).toEqual([
      'Sample access is off',
      CLOSE_TEXT,
      'The sample tool reads the sample folder.',
      'Turn it on',
    ]);
    const fix = button(tree, 'Turn it on')!;
    expect(fix.props.primary).toBe(true);
    act(() => fix.props.onPress());
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('numbers the steps only the owner can do, with no button for them', () => {
    const tree = render(
      <Needs
        problem={{what: 'Sample setting', fix: {steps: ['Open Sample.', 'Turn on Sample.']}}}
        onClose={jest.fn()}
      />,
    );
    expect(texts(tree)).toEqual(['Sample setting', CLOSE_TEXT, '1. Open Sample.', '2. Turn on Sample.']);
    expect(tree.root.findAllByType(Button)).toHaveLength(1);
    expect(tree.root.findAllByProps({testID: 'problem-reason'})).toHaveLength(0);
  });
});

describe('ErrorView (#255)', () => {
  it('shows what failed and its reason, and Retry only when given', () => {
    const onRetry = jest.fn();
    const onClose = jest.fn();
    const tree = render(
      <ErrorView
        problem={{what: 'Sample action failed', reason: 'sample reason'}}
        onRetry={onRetry}
        onClose={onClose}
      />,
    );
    const roles = tree.root
      .findAllByProps({testID: 'error-view'})
      .map(node => node.props.accessibilityRole);
    expect(roles).toContain('alert');
    expect(texts(tree)).toEqual(['Sample action failed', CLOSE_TEXT, 'sample reason', RETRY_TEXT]);
    act(() => button(tree, RETRY_TEXT)!.props.onPress());
    act(() => button(tree, CLOSE_TEXT)!.props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const bare = render(<ErrorView problem={{what: 'Sample action failed'}} onClose={jest.fn()} />);
    expect(button(bare, RETRY_TEXT)).toBeUndefined();
  });

  it('takes the Back key as Close (#204)', () => {
    const back = catchBackKey();
    const onClose = jest.fn();
    render(<ErrorView problem={{what: 'Sample action failed'}} onClose={onClose} />);
    expect(back.press()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    back.restore();
  });
});

describe('LoadingView (#255)', () => {
  it('reads as the strip does, with Close', () => {
    expect(texts(render(<LoadingView onClose={jest.fn()} />))).toEqual([WORKING_TEXT, CLOSE_TEXT]);
  });
});

describe('reasonOf (#255)', () => {
  it('gives an error message, and nothing for an empty or unknown value', () => {
    expect(reasonOf(new Error('sample reason'))).toBe('sample reason');
    expect(reasonOf('sample text')).toBe('sample text');
    expect(reasonOf(new Error('  '))).toBeUndefined();
    expect(reasonOf({code: 1})).toBeUndefined();
    expect(reasonOf(undefined)).toBeUndefined();
  });
});
