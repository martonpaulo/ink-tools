/**
 * The native controls (#273): each renders from the tokens and keeps the size rule, no text under
 * `minFont` and no target under `touchTarget`; the pager never leaves its range.
 */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {
  CheckMark,
  Chevron,
  IconButton,
  ListRow,
  metrics,
  NavList,
  Pager,
  Radio,
  SearchField,
  SectionCaption,
  Switch,
  TitleBar,
} from '../src';
import {screenBreaks} from '../src/screenBreaks';

function render(element: React.JSX.Element) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}
const noop = () => {};
/** The outermost node with that spoken name: the component's own props, `onPress` among them. */
const byLabel = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label)[0];
/** The native view with that spoken name, as the screen reader reads it. */
const hostByLabel = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.accessibilityLabel === label);
const press = (tree: ReactTestRenderer, label: string) =>
  act(() => {
    tree.root
      .findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]
      .props.onPress();
  });
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(n => n.props.children);

const EVERY_CONTROL: [string, React.JSX.Element][] = [
  ['TitleBar', <TitleBar title="Keyboard" paneTitle="Settings" onClose={noop} onBack={noop} />],
  [
    'NavList',
    <NavList
      items={[
        {key: 'wifi', label: 'Wi-Fi'},
        {key: 'display', label: 'Display & Input'},
      ]}
      openKey="wifi"
      onOpen={noop}
    />,
  ],
  ['ListRow', <ListRow title="Keyboard" subtitle="English" trailing={<Chevron />} onPress={noop} />],
  ['Switch', <Switch value accessibilityLabel="Sync to-dos" onChange={noop} />],
  ['Radio', <Radio checked accessibilityLabel="English" onPress={noop} />],
  ['CheckMark', <CheckMark checked />],
  ['Chevron', <Chevron />],
  ['SectionCaption', <SectionCaption>Installed Languages</SectionCaption>],
  ['SearchField', <SearchField value="" placeholder="Search" onChangeText={noop} />],
  ['Pager', <Pager page={2} total={3} onPage={noop} />],
  ['IconButton remove', <IconButton kind="remove" onPress={noop} />],
  ['IconButton delete', <IconButton kind="delete" onPress={noop} />],
  ['IconButton download', <IconButton kind="download" onPress={noop} />],
];

describe('the native controls (#273)', () => {
  it.each(EVERY_CONTROL)('%s keeps the size rule', (_name, element) => {
    expect(screenBreaks(render(element).root)).toEqual([]);
  });

  it('draws the title bar as a black band with × and ‹, the title centred', () => {
    const onClose = jest.fn();
    const onBack = jest.fn();
    const tree = render(<TitleBar title="Keyboard" onClose={onClose} onBack={onBack} />);
    expect(texts(tree)).toEqual(['×', '‹', 'Keyboard']);
    press(tree, 'Close');
    press(tree, 'Back');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    const title = tree.root.findByProps({accessibilityRole: 'header'});
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({
      textAlign: 'center',
      color: metrics.paper,
    });
  });

  it('marks only the open item of the navigation list, and opens the one pressed', () => {
    const onOpen = jest.fn();
    const tree = render(
      <NavList
        items={[
          {key: 'wifi', label: 'Wi-Fi'},
          {key: 'battery', label: 'Battery'},
        ]}
        openKey="wifi"
        onOpen={onOpen}
      />,
    );
    expect(tree.root.findAll(n => n.props.testID === 'open-mark' && typeof n.type === 'string')).toHaveLength(1);
    expect(byLabel(tree, 'Wi-Fi').props.accessibilityState).toEqual({selected: true});
    press(tree, 'Battery');
    expect(onOpen).toHaveBeenCalledWith('battery');
  });

  it('makes a row with onPress one button, and a row without it none', () => {
    const tree = render(<ListRow title="Keyboard" subtitle="English" onPress={noop} />);
    expect(byLabel(tree, 'Keyboard, English').props.accessibilityRole).toBe('button');
    const still = render(<ListRow title="Version" subtitle="1.0" />);
    expect(still.root.findAll(n => n.props.accessibilityRole === 'button')).toEqual([]);
    expect(screenBreaks(still.root)).toEqual([]);
  });

  it.each([
    [true, 'ON', false],
    [false, 'OFF', true],
  ])('shows a switch that is %s as «%s» and turns it to %s', (value, word, next) => {
    const onChange = jest.fn();
    const tree = render(<Switch value={value} accessibilityLabel="Sync" onChange={onChange} />);
    expect(texts(tree)).toEqual([word]);
    expect(hostByLabel(tree, 'Sync').props.accessibilityState).toEqual({checked: value, disabled: false});
    press(tree, 'Sync');
    expect(onChange).toHaveBeenCalledWith(next);
  });

  it('fills the radio only when chosen', () => {
    const dots = (checked: boolean) =>
      render(<Radio checked={checked} accessibilityLabel="English" onPress={noop} />).root.findAll(
        n => n.props.testID === 'radio-dot' && typeof n.type === 'string',
      ).length;
    expect([dots(true), dots(false)]).toEqual([1, 0]);
  });

  it('keeps an unchecked ✓ empty', () => {
    expect(texts(render(<CheckMark checked={false} />))).toEqual(['']);
    expect(texts(render(<CheckMark checked />))).toEqual(['✓']);
  });

  it('names the search field by its placeholder, in the placeholder grey', () => {
    const tree = render(<SearchField value="" placeholder="Search" onChangeText={noop} />);
    expect(byLabel(tree, 'Search').props.placeholderTextColor).toBe(metrics.placeholder);
  });

  it.each([
    [1, 3, ['First page', 'Previous page']],
    [3, 3, ['Next page', 'Last page']],
    [1, 0, ['First page', 'Previous page', 'Next page', 'Last page']],
    [9, 1, ['First page', 'Previous page', 'Next page', 'Last page']],
  ])('disables what leaves the range on page %i of %i', (page, total, disabled) => {
    const tree = render(<Pager page={page} total={total} onPage={noop} />);
    const off = tree.root
      .findAll(n => typeof n.type === 'string' && n.props.accessibilityState?.disabled === true)
      .map(n => n.props.accessibilityLabel);
    expect(off).toEqual(disabled);
  });

  it('shows page/total with the current page underlined, and pages within range', () => {
    const onPage = jest.fn();
    const tree = render(<Pager page={2} total={3} onPage={onPage} />);
    const current = tree.root.find(n => n.props.testID === 'current-page' && typeof n.type === 'string');
    expect(current.props.children).toBe(2);
    expect(StyleSheet.flatten(current.props.style).textDecorationLine).toBe('underline');
    for (const label of ['First page', 'Previous page', 'Next page', 'Last page']) {
      press(tree, label);
    }
    expect(onPage.mock.calls).toEqual([[1], [1], [3], [3]]);
  });

  it.each([
    ['remove', 'Remove'],
    ['delete', 'Delete'],
    ['download', 'Download'],
  ] as const)('names the %s icon button «%s», or by the label given', (kind, label) => {
    expect(byLabel(render(<IconButton kind={kind} onPress={noop} />), label)).toBeTruthy();
    const named = render(<IconButton kind={kind} accessibilityLabel={`${label} English`} onPress={noop} />);
    expect(byLabel(named, `${label} English`)).toBeTruthy();
  });
});
