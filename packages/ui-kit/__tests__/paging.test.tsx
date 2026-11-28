/**
 * The paged list (#548) and the media frame (#576): pages hold whole rows and the pager shows only
 * when more pages follow; before any layout every row stays drawn, so a plugin's unit test still
 * finds it; a picture fits its frame at its own proportions.
 */
import React from 'react';
import renderer, {act, ReactTestInstance, ReactTestRenderer} from 'react-test-renderer';
import {Text} from 'react-native';
import {ListRow, metrics, PagedColumn, PagedList, RowGroup} from '../src';
import {fitSize} from '../src/MediaFrame';
import {paginate, partsOf} from '../src/PagedList';

const noop = () => {};
const NAMES = Array.from({length: 7}, (_, i) => `Sample ${i + 1}`);

describe('paginate', () => {
  it('keeps every part on one page when they fit with no pager', () => {
    expect(paginate([80, 80, 80], 300, 50, 1, 60)).toEqual([{from: 0, to: 3}]);
  });

  it('pages whole parts, keeping room for the pager on every page', () => {
    expect(paginate([80, 80, 80, 80, 80], 300, 50, 0, 60)).toEqual([
      {from: 0, to: 2},
      {from: 2, to: 4},
      {from: 4, to: 5},
    ]);
  });

  it('gives a part taller than a page a page of its own', () => {
    expect(paginate([500, 80], 300, 0, 0, 60)).toEqual([
      {from: 0, to: 1},
      {from: 1, to: 2},
    ]);
  });
});

describe('partsOf', () => {
  it('opens fragments and leaves out what draws nothing', () => {
    const parts = partsOf([
      <Text key="a">a</Text>,
      false,
      <React.Fragment key="f">
        <Text key="b">b</Text>
        {null}
        <Text key="c">c</Text>
      </React.Fragment>,
    ]);
    expect(parts.map(p => p.key)).toEqual(['.$a', '.$f/.$b', '.$f/.$c']);
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

describe('fitSize', () => {
  it('fits a wide picture to the width and a tall one to the height', () => {
    expect(fitSize({width: 200, height: 100}, {width: 1000, height: 1000})).toEqual({width: 1000, height: 500});
    expect(fitSize({width: 100, height: 200}, {width: 1000, height: 1000})).toEqual({width: 500, height: 1000});
  });

  it('draws nothing for a picture with no size', () => {
    expect(fitSize({width: 0, height: 100}, {width: 1000, height: 1000})).toEqual({width: 0, height: 0});
  });
});
