/**
 * Every screen the renders show, each driven to its state through the real component with
 * synthetic fixture data (#80): the ui-kit views and each plugin's own (#288). Adding a screen is
 * one line in SCREENS.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import type {WindowName} from './html';
import {ErrorView, LoadingView, Needs} from '@ink-tools/ui-kit';
import SmartShapesSettings from '../../../plugins/smart-shapes/App';
import RealTimeConversionSettings from '../../../plugins/real-time-conversion/App';
import WordLookupSettings from '../../../plugins/word-lookup/App';
import {SettingsShell as AccountSyncSettings} from '../../../plugins/account-sync/src/SettingsShell';
import {Editor as ImageEditor} from '../../../plugins/image-editing/src/EditorView';
import type {EditorState as ImageEditorState} from '../../../plugins/image-editing/src/editor';
import {defaultSettings as imageEditingSettings} from '../../../plugins/image-editing/src/edits';

export type ScreenRender = {
  name: string;
  render: () => Promise<ReactTestRenderer>;
  /** The windows the screen is not checked at, and why; the run prints the reason (#284). */
  skip?: {windows: WindowName[]; reason: string};
};

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

/** Nothing outlives a screen: the hook the run calls after each one unmounts. */
export function settle() {}

/** Image Editing's editor on a 960 x 870 picture, every edit on (#279, #278). */
const IMAGE_EDITOR: ImageEditorState = {
  phase: 'ready',
  rect: {left: 100, top: 200, right: 1060, bottom: 1070},
  preview: '/w/editor-1.png',
  guided: false,
  busy: null,
  draw: null,
  marks: [],
  strokes: [],
  message: null,
};
const noop = () => {};
/** The picture's stage height the renders report: under its floor on the Nomad, the smallest window. */
const STAGE_HEIGHT = 280;
/** The editor, laid out: the picture's stage reports a size, as on the device, so the picture shows. */
async function imageEditor(state: Partial<ImageEditorState> = {}) {
  const tree = await mount(
    <ImageEditor
      state={{...IMAGE_EDITOR, ...state} as ImageEditorState}
      settings={imageEditingSettings}
      onEdit={noop}
      onApply={noop}
      onMark={noop}
      onClear={noop}
      onUndoStroke={noop}
      onDone={noop}
      onCancel={noop}
      onClose={noop}
    />,
  );
  const stage = tree.root.findAll(
    node => typeof node.type === 'string' && typeof node.props.onLayout === 'function',
  )[0];
  // The stage's size is known only after a layout pass; this one fits the smallest window's stage.
  await act(async () =>
    stage.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 400, height: STAGE_HEIGHT}}}),
  );
  return tree;
}
/** A stroke across the picture, in page pixels. */
const STROKE = [
  {x: 300, y: 500},
  {x: 600, y: 650},
  {x: 900, y: 600},
];

// One line per screen, so adding one is one line.
// prettier-ignore
export const SCREENS: ScreenRender[] = [
  {name: 'ui-kit-needs', render: () => mount(<Needs problem={{what: 'Sample access is off', reason: 'The sample tool reads the sample folder to show your pictures.', fix: {label: 'Turn it on', run: () => {}}}} onClose={() => {}} />)},
  {name: 'ui-kit-needs-steps', render: () => mount(<Needs problem={{what: 'Sample setting is off', reason: 'Only you can turn it on.', fix: {steps: ['Open Settings on the tablet.', 'Turn on Sample setting.']}}} onClose={() => {}} />)},
  {name: 'ui-kit-error', render: () => mount(<ErrorView problem={{what: 'Device Transfer stopped with an error.', reason: 'The sample device did not answer.'}} onRetry={() => {}} onClose={() => {}} />)},
  {name: 'smart-shapes-settings', render: () => mount(<SmartShapesSettings close={() => {}} />)},
  {name: 'real-time-conversion-settings', render: () => mount(<RealTimeConversionSettings close={() => {}} />)},
  {name: 'word-lookup-settings', render: () => mount(<WordLookupSettings close={() => {}} />)},
  {name: 'account-sync-settings', render: () => mount(<AccountSyncSettings state={{kind: 'ready', modules: [{id: 'calendar', name: 'Calendar', status: {state: 'off'}}]}} onClose={() => {}} />)},
  {name: 'ui-kit-loading', render: () => mount(<LoadingView onClose={() => {}} />)},
  {name: 'image-editing-editor', render: () => imageEditor()},
  {name: 'image-editing-erase', render: () => imageEditor({draw: 'erase'})},
  {name: 'image-editing-erase-stroked', render: () => imageEditor({draw: 'erase', marks: [STROKE], strokes: ['/w/101-stroke.png']})},
  {name: 'image-editing-crop', render: () => imageEditor({draw: 'crop', marks: [STROKE]})},
];
