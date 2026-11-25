/**
 * The native controls (#273): each renders from the tokens and keeps the size rule, no text under
 * `minFont` and no target under `touchTarget`; the pager never leaves its range.
 */
import React from 'react';
import {StyleSheet, Text} from 'react-native';
import renderer, {act, ReactTestInstance, ReactTestRenderer} from 'react-test-renderer';
import {
  CheckMark,
  ChoiceList,
  Chevron,
  IconButton,
  ListRow,
  metrics,
  NavList,
  Pager,
  Radio,
  RowGroup,
  SearchField,
  Switch,
  SwitchGroup,
  SwitchRow,
  TitleBar,
} from '../src';
import {SectionCaption} from '../src/marks';
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
  [
    'RowGroup',
    <RowGroup caption="Installed Languages">
      <ListRow title="English" />
      <ListRow title="Portuguese" />
    </RowGroup>,
  ],
  ['SearchField', <SearchField value="" placeholder="Search" onChangeText={noop} />],
  ['Pager', <Pager page={2} total={3} onPage={noop} />],
  ['IconButton remove', <IconButton kind="remove" onPress={noop} />],
  ['IconButton delete', <IconButton kind="delete" onPress={noop} />],
  ['IconButton download', <IconButton kind="download" onPress={noop} />],
  ['SwitchRow', <SwitchRow title="Data saver" subtitle="Fewer pictures" value onChange={noop} />],
  [
    'ChoiceList',
    <ChoiceList
      title="Word spacing"
      choices={[
        {value: 'tight', label: 'Tight'},
        {value: 'wide', label: 'Wide'},
      ]}
      value="tight"
      onChange={noop}
    />,
  ],
];

describe('the native controls (#273)', () => {
  it.each(EVERY_CONTROL)('%s keeps the size rule', (_name, element) => {
    expect(screenBreaks(render(element).root)).toEqual([]);
  });

  it('draws the title bar as a black band with the drawn × and ‹, the title centred', () => {
    const onClose = jest.fn();
    const onBack = jest.fn();
    const tree = render(<TitleBar title="Keyboard" onClose={onClose} onBack={onBack} />);
    // × and ‹ are drawn strokes at the native size, not text glyphs (#272).
    expect(texts(tree)).toEqual(['Keyboard']);
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

  it('draws an on/off setting as one row whose switch speaks its title, and stays still when disabled', () => {
    const onChange = jest.fn();
    const tree = render(<SwitchRow title="Data saver" subtitle="Fewer pictures" value={false} onChange={onChange} />);
    expect(texts(tree)).toEqual(['Data saver', 'Fewer pictures', 'OFF']);
    press(tree, 'Data saver');
    expect(onChange).toHaveBeenCalledWith(true);
    const off = render(<SwitchRow title="Data saver" value={false} disabled onChange={onChange} />);
    expect(hostByLabel(off, 'Data saver').props.accessibilityState).toMatchObject({checked: false, disabled: true});
  });

  it('draws the light line between two rows of a group and the solid line after its last, none under the caption (#272, #275)', () => {
    const find = (tree: ReactTestRenderer, id: string) =>
      tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
    const three = render(
      <RowGroup caption="Floating Button">
        <ListRow title="Always" />
        {false}
        <ListRow title="Only where you write" />
        <ListRow title="Hidden" />
      </RowGroup>,
    );
    expect(texts(three)).toEqual(['Floating Button', 'Always', 'Only where you write', 'Hidden']);
    expect(find(three, 'row-light-line')).toHaveLength(2);
    expect(find(three, 'group-line')).toHaveLength(1);
    expect(StyleSheet.flatten(find(three, 'group-line')[0].props.style)).toEqual({
      height: metrics.separator,
      backgroundColor: metrics.ink,
    });
    expect(StyleSheet.flatten(find(three, 'row-light-line')[0].props.style)).toMatchObject({height: metrics.lightLine});
    expect(metrics.lightLine).toBeLessThan(metrics.separator);
    expect(metrics.separator).toBeLessThan(metrics.border);
    // The solid line closes the group: it is the group's last child.
    const group = three.root.findAll(n => typeof n.type === 'string')[0];
    const last = group.children[group.children.length - 1] as ReactTestInstance;
    expect(last.props.testID).toBe('group-line');
    // An on/off setting with no caption is its own group, closed by the solid line.
    const lone = render(<SwitchGroup title="Data saver" value onChange={noop} />);
    expect(texts(lone)).toEqual(['Data saver', 'ON']);
    expect(find(lone, 'group-line')).toHaveLength(1);
    const alone = render(<RowGroup><ListRow title="Alone" /></RowGroup>);
    expect(find(alone, 'row-light-line')).toEqual([]);
    expect(find(alone, 'group-line')).toHaveLength(1);
    // Each row has the native fixed height and draws no line of its own.
    const rows = three.root.findAll(n => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.minHeight === metrics.rowHeight);
    expect(rows).toHaveLength(3);
    rows.forEach(row => expect(StyleSheet.flatten(row.props.style).borderBottomWidth).toBeUndefined());
    // No padding adds to the native height: a row is 162 px on the Manta, not 162 plus padding.
    rows.forEach(row => expect(StyleSheet.flatten(row.props.style).paddingVertical).toBeUndefined());
  });

  it('centres the title on the full band, whatever sits at its edges, in the native size and weight (#275)', () => {
    const closeOnly = render(<TitleBar title="Keyboard" onClose={noop} />);
    const both = render(<TitleBar title="Keyboard" onClose={noop} onBack={noop} />);
    const titleStyle = (tree: ReactTestRenderer) =>
      StyleSheet.flatten(tree.root.find(n => typeof n.type === 'string' && n.props.accessibilityRole === 'header').props.style);
    expect(titleStyle(closeOnly)).toEqual({fontSize: metrics.fontTitle, color: metrics.paper, flex: 1, textAlign: 'center'});
    // The level's children: the leading slot, the title, and an empty slot as wide as the leading one.
    const slots = (tree: ReactTestRenderer) => {
      const title = tree.root.find(n => typeof n.type === 'string' && n.props.accessibilityRole === 'header');
      let level = title.parent as ReactTestInstance;
      while (typeof level.type !== 'string') {
        level = level.parent as ReactTestInstance;
      }
      const children = level.children.filter((n): n is ReactTestInstance => typeof n !== 'string');
      return [children[0], children[children.length - 1]].map(n => StyleSheet.flatten(n.props.style).width);
    };
    const [lead, trail] = slots(closeOnly);
    expect(lead).toBe(trail);
    expect(lead).toBeGreaterThanOrEqual(metrics.touchTarget);
    const [leadBoth, trailBoth] = slots(both);
    expect(leadBoth).toBe(trailBoth);
    expect(leadBoth).toBeGreaterThan(lead);
    const header = closeOnly.root.find(n => typeof n.type === 'string' && n.props.accessibilityRole === 'header');
    expect(header.props.numberOfLines).toBe(2);
  });

  it('draws the native two levels: × and the pane title over the left pane, ‹ and the page title over the rest (#272)', () => {
    const tree = render(<TitleBar paneTitle="Settings" title="Language & Region" onClose={noop} onBack={noop} />);
    expect(texts(tree)).toEqual(['Settings', 'Language & Region']);
    const pane = tree.root.find(n => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.width === metrics.navPaneWidth);
    expect(pane.findAll(n => n.props.accessibilityLabel === 'Close' && typeof n.type === 'string')).toHaveLength(1);
    expect(pane.findAll(n => n.props.accessibilityLabel === 'Back')).toHaveLength(0);
  });

  it('draws the ×, ‹ and › at the native size (#272)', () => {
    const square = (tree: ReactTestRenderer) =>
      tree.root.findAll(n => typeof n.type === 'string').map(n => StyleSheet.flatten(n.props.style));
    const close = square(render(<TitleBar title="Keyboard" onClose={noop} />)).find(
      style => style?.width === metrics.closeMark && style?.height === metrics.closeMark,
    );
    expect(close).toBeTruthy();
    const [chevronBox] = square(render(<Chevron />));
    expect(chevronBox).toMatchObject({width: metrics.chevronHeight / 2, height: metrics.chevronHeight});
  });

  it('takes the native sizes: the title above the body, the subtitle under it, none under minFont (#275)', () => {
    expect(metrics.fontTitle).toBeGreaterThan(metrics.fontBody);
    expect(metrics.fontSubtitle).toBeLessThan(metrics.fontBody);
    expect(metrics.fontSubtitle).toBeGreaterThanOrEqual(metrics.minFont);
    const subtitle = render(<ListRow title="Keyboard" subtitle="English" />).root.findAllByType(Text)[1];
    expect(StyleSheet.flatten(subtitle.props.style)).toEqual({fontSize: metrics.fontSubtitle, color: metrics.ink});
  });

  it('heads a group with its caption, smaller and grey, at the bottom of the native box, its note under the last row (#272, #275)', () => {
    const tree = render(
      <RowGroup caption="Smallest shape" note="A smaller figure stays handwriting.">
        <ListRow title="8 mm" />
      </RowGroup>,
    );
    expect(texts(tree)).toEqual(['Smallest shape', '8 mm', 'A smaller figure stays handwriting.']);
    const [caption, , note] = tree.root.findAllByType(Text).map(n => StyleSheet.flatten(n.props.style));
    // Smaller than the rows and grey, so a caption never reads as one more row (owner, #275).
    expect(caption).toEqual({fontSize: metrics.fontSubtitle, color: metrics.context});
    expect(note).toMatchObject({fontSize: metrics.fontSubtitle, color: metrics.ink});
    const box = tree.root.find(n => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.minHeight === metrics.captionHeight);
    expect(StyleSheet.flatten(box.props.style).justifyContent).toBe('flex-end');
    // The solid line comes after the note, which belongs to the last row.
    const group = tree.root.findAll(n => typeof n.type === 'string')[0];
    const last = group.children[group.children.length - 1] as ReactTestInstance;
    expect(last.props.testID).toBe('group-line');
  });

  it('draws the native switch: the word beside a pill, filled when on, its knob at the trailing end (#272)', () => {
    const style = (tree: ReactTestRenderer, id: string) =>
      StyleSheet.flatten(tree.root.find(n => n.props.testID === id && typeof n.type === 'string').props.style);
    const on = render(<Switch value accessibilityLabel="Wi-Fi" onChange={noop} />);
    const off = render(<Switch value={false} accessibilityLabel="Wi-Fi" onChange={noop} />);
    expect(texts(on)).toEqual(['ON']);
    expect(texts(off)).toEqual(['OFF']);
    expect(style(on, 'switch-track')).toMatchObject({
      width: metrics.switchWidth,
      height: metrics.switchHeight,
      backgroundColor: metrics.ink,
      alignItems: 'flex-end',
    });
    expect(style(off, 'switch-track')).toMatchObject({backgroundColor: metrics.paper, alignItems: 'flex-start'});
    expect(style(on, 'switch-knob')).toMatchObject({width: metrics.switchKnob, backgroundColor: metrics.paper});
    expect(style(off, 'switch-knob')).toMatchObject({backgroundColor: metrics.ink});
  });

  it('draws one value out of several as a caption over one radio row each, the chosen one checked', () => {
    const onChange = jest.fn();
    const tree = render(
      <ChoiceList
        title="Word spacing"
        choices={[
          {value: 'tight', label: 'Tight'},
          {value: 'wide', label: 'Wide'},
        ]}
        value="wide"
        onChange={onChange}
      />,
    );
    expect(texts(tree)).toEqual(['Word spacing', 'Tight', 'Wide']);
    expect(hostByLabel(tree, 'Word spacing: Wide').props.accessibilityState).toEqual({checked: true});
    expect(hostByLabel(tree, 'Word spacing: Tight').props.accessibilityState).toEqual({checked: false});
    press(tree, 'Word spacing: Tight');
    press(tree, 'Word spacing: Wide');
    expect(onChange.mock.calls).toEqual([['tight'], ['wide']]);
  });
});
