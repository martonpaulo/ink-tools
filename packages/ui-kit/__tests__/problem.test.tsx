/** The Needs, Error and Close pattern (#255): each part found in the tree, each press reaching its caller. */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {catchBackKey} from '../src/backKeyTest';
import {Button} from '../src/Button';
import {CLOSE_TEXT, reasonOf, RETRY_TEXT} from '../src/problem';
import {ErrorView, LoadingView, Needs} from '../src/ProblemView';
import {TitleBar} from '../src/TitleBar';
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
/** The outermost node with that label or spoken name that acts: a Button, or the title bar's ×. */
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    node => (node.props.accessibilityLabel ?? node.props.label) === label && typeof node.props.onPress === 'function',
  )[0];

describe('the title bar of every problem view (#274)', () => {
  it('opens with the TitleBar: × first, then the title, as the header', () => {
    const tree = render(<LoadingView title="Sample" onClose={jest.fn()} />);
    expect(tree.root.findAllByType(TitleBar)).toHaveLength(1);
    expect(tree.root.findByProps({accessibilityRole: 'header'}).props.children).toBe('Sample');
    expect(tree.root.findAllByType(Button)).toHaveLength(0);
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
      'The sample tool reads the sample folder.',
      'Turn it on',
    ]);
    const fix = button(tree, 'Turn it on')!;
    expect(fix.props.kind).toBe('primary');
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
    expect(texts(tree)).toEqual(['Sample setting', '1. Open Sample.', '2. Turn on Sample.']);
    expect(tree.root.findAllByType(Button)).toHaveLength(0);
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
    expect(texts(tree)).toEqual(['Sample action failed', 'sample reason', RETRY_TEXT]);
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
  it('shows the static loading mark and the strip\'s words under its title, as the native list loads (#287)', () => {
    const tree = render(<LoadingView title="Sample" onClose={jest.fn()} />);
    expect(texts(tree)).toEqual(['Sample', WORKING_TEXT]);
    expect(tree.root.findAll(n => n.props.testID === 'loading-mark' && typeof n.type === 'string')).toHaveLength(1);
    expect(tree.root.findByProps({accessibilityRole: 'progressbar'}).props.accessibilityLabel).toBe(WORKING_TEXT);
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
