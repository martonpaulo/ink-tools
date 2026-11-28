/**
 * The paged list (#548) and the media frame (#576): pages hold whole rows and the pager shows only
 * when more pages follow; before any layout every row stays drawn, so a plugin's unit test still
 * finds it; a picture fits its frame at its own proportions.
 */
import React from 'react';
import renderer, {act, ReactTestInstance, ReactTestRenderer} from 'react-test-renderer';
import {Text} from 'react-native';
import {ChoiceList, ListRow, metrics, PagedColumn, PagedList, RowGroup} from '../src';
import {fitSize} from '../src/MediaFrame';
import {paginate, partsOf} from '../src/PagedList';

const noop = () => {};
const NAMES = Array.from({length: 7}, (_, i) => `Sample ${i + 1}`);

const row = (height: number) => ({height});
const inGroup = (height: number) => ({height, group: {key: 'g', chrome: 50, gap: 1}});

describe('paginate', () => {
  it('keeps every part on one page when they fit with no pager', () => {
    expect(paginate([row(80), row(80), row(80)], 300, 60)).toEqual([{from: 0, to: 3}]);
  });

  it('pages whole parts, keeping room for the pager on every page', () => {
    expect(paginate([row(80), row(80), row(80), row(80), row(80)], 250, 60)).toEqual([
      {from: 0, to: 2},
      {from: 2, to: 4},
      {from: 4, to: 5},
    ]);
  });

  it('splits a group taller than a page into rows, its caption and note on each page', () => {
    // Each page holds the group's 50 of caption and note, two rows of 80 and the line between.
    expect(paginate([inGroup(80), inGroup(80), inGroup(80), inGroup(80)], 50 + 161 + 60, 60)).toEqual([
      {from: 0, to: 2},
      {from: 2, to: 4},
    ]);
  });

  it('gives a part taller than a page a page of its own', () => {
    expect(paginate([row(500), row(80)], 300, 60)).toEqual([
      {from: 0, to: 1},
      {from: 1, to: 2},
    ]);
  });
});

describe('partsOf', () => {
  it('opens fragments and groups, and leaves out what draws nothing', () => {
    const parts = partsOf([
      <Text key="a">a</Text>,
      false,
      <React.Fragment key="f">
        <Text key="b">b</Text>
        {null}
        <RowGroup key="g" caption="G">
          <ListRow key="r1" title="1" />
          <ListRow key="r2" title="2" />
        </RowGroup>
      </React.Fragment>,
    ]);
    expect(parts.map(p => [p.key, p.group?.key ?? null])).toEqual([
      ['.$a', null],
      ['.$f/.$b', null],
      ['.$f/.$g/.$r1', '.$f/.$g'],
      ['.$f/.$g/.$r2', '.$f/.$g'],
    ]);
  });
});

/** Gives every view with an onLayout the height `heightOf` names, as the device's layout would. */
async function layOut(tree: ReactTestRenderer, heightOf: (node: ReactTestInstance) => number) {
  for (let round = 0; round < 4; round++) {
    const hosts = tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.onLayout === 'function');
    await act(async () => {
      hosts.forEach(host => host.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 500, height: heightOf(host)}}}));
    });
  }
}

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => node.props.children).filter(child => typeof child === 'string');

describe('PagedList', () => {
  const list = () => (
    <PagedList caption="Samples">
      {NAMES.map(name => (
        <ListRow key={name} title={name} onPress={noop} />
      ))}
    </PagedList>
  );

  it('draws every row before any layout, so a test still finds each', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(list());
    });
    expect(texts(tree)).toEqual(expect.arrayContaining(NAMES));
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Next page')).toHaveLength(0);
  });

  it('shows the rows that fit, whole, and the pager, then the next page', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(list());
    });
    // Each row is 100 high and the caption with its line 50: the box holds three rows and the pager.
    const room = 50 + 3 * 100 + metrics.touchTarget + 5;
    await layOut(tree, node =>
      node.props.testID === 'paged-list' ? room : node.props.children?.type === ListRow ? 100 : 50 + 100 * NAMES.length,
    );
    const shown = texts(tree).filter(text => text.startsWith('Sample '));
    expect(shown).toEqual(['Sample 1', 'Sample 2', 'Sample 3']);
    const next = tree.root.find(node => node.props.accessibilityLabel === 'Next page' && node.props.onPress);
    await act(async () => next.props.onPress());
    expect(texts(tree).filter(text => text.startsWith('Sample '))).toEqual(['Sample 4', 'Sample 5', 'Sample 6']);
  });
});

describe('PagedColumn', () => {
  it('keeps each group whole on its page', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <PagedColumn>
          <RowGroup key="one" caption="One">
            <ListRow title="Row 1" />
          </RowGroup>
          <>
            <RowGroup key="two" caption="Two">
              <ListRow title="Row 2" />
            </RowGroup>
          </>
        </PagedColumn>,
      );
    });
    await layOut(tree, node => (node.props.testID === 'paged-list' ? 300 : 200));
    expect(texts(tree)).toEqual(expect.arrayContaining(['One', 'Row 1']));
    expect(texts(tree)).not.toContain('Row 2');
  });
});

describe('PagedColumn with a ChoiceList after an intro (#594)', () => {
  const VALUES = Array.from({length: 7}, (_, i) => `Value ${i + 1}`);
  const screen = () => (
    <PagedColumn>
      <RowGroup caption="Intro" note="About the page" />
      <ChoiceList title="Size" choices={VALUES.map(value => ({value, label: value}))} value="Value 1" onChange={noop} />
    </PagedColumn>
  );

  it('lets the first values share the page with the intro, not leave the page to the intro alone', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(screen());
    });
    // The intro is 150 high; the list is 50 of caption and line and 100 a row: room for three rows.
    const room = 150 + 50 + 3 * 100 + metrics.touchTarget + 5;
    await layOut(tree, node =>
      node.props.testID === 'paged-list'
        ? room
        : node.props.children?.type === ListRow
          ? 100
          : node.props.children?.type === RowGroup && node.props.children.props.caption === 'Intro'
            ? 150
            : 50 + 100 * VALUES.length,
    );
    expect(texts(tree)).toEqual(expect.arrayContaining(['Intro', 'Size', 'Value 1']));
    const next = tree.root.find(node => node.props.accessibilityLabel === 'Next page' && node.props.onPress);
    await act(async () => next.props.onPress());
    // The caption goes on the next page with the rest of the values.
    expect(texts(tree)).toEqual(expect.arrayContaining(['Size', 'Value 4']));
    expect(texts(tree)).not.toContain('Intro');
  });
});

describe('fitSize', () => {
  it('fits a wide picture to the width and a tall one to the height', () => {
    expect(fitSize({width: 200, height: 100}, {width: 1000, height: 1000})).toEqual({width: 1000, height: 500});
    expect(fitSize({width: 100, height: 200}, {width: 1000, height: 1000})).toEqual({width: 500, height: 1000});
  });

  it('draws nothing for a picture with no size', () => {
    expect(fitSize({width: 0, height: 100}, {width: 1000, height: 1000})).toEqual({width: 0, height: 0});
  });
});
