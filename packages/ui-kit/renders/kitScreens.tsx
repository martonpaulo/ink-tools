/**
 * The ui-kit screens of the screen-layout pieces (owner, 2026-11-28): a long list that pages
 * (#548), a long choice list that pages with its radios at the native end (#546), a fixed part
 * under a paged list (#578) and images centred in their frame (#576). Synthetic data only.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {StyleSheet, View} from 'react-native';
import {Button, ChoiceList, ListRow, MediaFrame, PagedList, RowGroup, shared, TitleBar} from '@ink-tools/ui-kit';
import type {ScreenRender} from './screens';
import {EditsForm as ImageEditsForm} from '../../../plugins/image-editing/src/EditsForm';
import {defaultSettings as imageEditingDefaults} from '../../../plugins/image-editing/src/edits';
import {copy as imageEditingCopy} from '../../../plugins/image-editing/src/copy';

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

const noop = () => {};
const SAMPLES = Array.from({length: 23}, (_, i) => `Sample item ${i + 1}`);
const SIZES = Array.from({length: 16}, (_, i) => `${i + 4} x ${i + 4}`);

/** An image of `width` x `height` units: a framed grey block, so its edges read in the render. */
const picture = (width: number, height: number) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='${width}' height='${height}' fill='white' stroke='black' stroke-width='8'/><rect x='20%' y='20%' width='60%' height='60%' fill='grey'/></svg>`;

function LongList(): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <TitleBar title="Sample list" onClose={noop} />
      <PagedList caption="Items">
        {SAMPLES.map(item => (
          <ListRow key={item} title={item} subtitle="A sample subtitle" onPress={noop} />
        ))}
      </PagedList>
    </View>
  );
}

function LongChoices(): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <TitleBar title="Sample choice" onClose={noop} onBack={noop} />
      <ChoiceList
        paged
        title="Size"
        choices={SIZES.map(label => ({value: label, label}))}
        value={SIZES[1]}
        onChange={noop}
        note="A sample note under the list."
      />
      {/* The fixed part: its own room under the list, never over a row (#578). */}
      <View style={shared.buttons}>
        <Button kind="primary" label="Add Page" onPress={noop} />
      </View>
      <RowGroup caption="This page" note="A sample note about this page." />
    </View>
  );
}

function Picture({width, height}: {width: number; height: number}): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <TitleBar title="Sample image" onClose={noop} onBack={noop} />
      <RowGroup note="A sample note over the image." />
      <MediaFrame uri={picture(width, height)} width={width} height={height} accessibilityLabel="A sample image" />
    </View>
  );
}

/** Image Editing's Settings: one group of every edit, taller than a page, then two more (#548). */
function ImageEditingSettings(): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <TitleBar title={imageEditingCopy.title} onClose={noop} />
      <View style={styles.fill}>
        <ImageEditsForm settings={imageEditingDefaults} onChange={noop} />
      </View>
    </View>
  );
}

export const KIT_SCREENS: ScreenRender[] = [
  {name: 'image-editing-settings', render: () => mount(<ImageEditingSettings />)},
  {name: 'ui-kit-paged-list', render: () => mount(<LongList />)},
  {name: 'ui-kit-paged-choices', render: () => mount(<LongChoices />)},
  {name: 'ui-kit-media-wide', render: () => mount(<Picture width={1600} height={600} />)},
  {name: 'ui-kit-media-tall', render: () => mount(<Picture width={1920} height={2560} />)},
];

const styles = StyleSheet.create({fill: {flex: 1}});
