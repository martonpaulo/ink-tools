/**
 * Every screen the renders show, each driven to its state through the real component with
 * synthetic fixture data (#80): the ui-kit views and each plugin's own (#288). Adding a screen is
 * one line in SCREENS.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import type {WindowName} from './html';
import {View} from 'react-native';
import {
  Button,
  ErrorView,
  LoadingView,
  Needs,
  Pager,
  RowGroup,
  SearchField,
  shared,
  SwitchRow,
  TitleBar,
  WorkingStrip,
} from '@ink-tools/ui-kit';
import type {Working} from '@ink-tools/ui-kit';
import SmartPenSettings from '../../../plugins/smart-pen/App';
import {DEFAULT_PEN_SETTINGS} from '../../../plugins/smart-pen/src/settings';
import LassoActionsSettings from '../../../plugins/lasso-actions/App';
import PluginDiagnostics from '../../../plugins/plugin-diagnostics/App';
import {copy as diagnosticsCopy} from '../../../plugins/plugin-diagnostics/src/copy';
import type {ProbeOutcome} from '../../../plugins/plugin-diagnostics/src/probe';
import {connectProblem as accountSyncConnect, SettingsShell as AccountSyncSettings} from '../../../plugins/account-sync/src/SettingsShell';
import {SettingsForm as AccountSyncForm} from '../../../plugins/account-sync/src/SettingsForm';
import {moduleRows as accountSyncRows} from '../../../plugins/account-sync/App';
import {addIcsFeed, defaultSettings as accountSyncDefaults, setModule as accountSyncModule, setProvider as accountSyncProvider} from '@ink-tools/sync-core/settings';
import {Editor as ImageEditor} from '../../../plugins/image-editing/src/EditorView';
import type {EditorState as ImageEditorState} from '../../../plugins/image-editing/src/editor';
import {defaultSettings as imageEditingSettings} from '../../../plugins/image-editing/src/edits';
import {StylesGrid as ImageStylesGrid} from '../../../plugins/image-editing/src/StylesGrid';
import {PickView as DeviceTransferPick} from '../../../plugins/device-transfer/src/PickDevice';
import {TextView as DeviceTransferText} from '../../../plugins/device-transfer/App';
import type {Device as TransferDevice} from '../../../plugins/device-transfer/src/localsend/protocol';

export type ScreenRender = {
  name: string;
  render: () => Promise<ReactTestRenderer>;
  /** The windows the screen is not checked at, and why; the run prints the reason (#284). */
  skip?: {windows: WindowName[]; reason: string};
  /** Why the screen is no full view, so it needs no title bar; a full view always has one (#311). */
  notFullView?: string;
};

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

/** A run that works and never ends, so the «Loading…» box stays on screen (#287). */
const WORKING: Working = {
  run: () => new Promise(() => {}),
  handOver: () => {},
  isWorking: () => true,
  problem: () => null,
  subscribe: () => () => {},
  dismiss: () => {},
} as unknown as Working;

/** The controls #287 redrew after the vendor library, each in its states, on one screen. */
function ControlsSheet(): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <TitleBar title="Controls" onClose={() => {}} onBack={() => {}} />
      <View style={shared.buttons}>
        <Button label="Plain" onPress={() => {}} />
        <Button label="Primary" primary onPress={() => {}} />
        <Button label="Selected" selected onPress={() => {}} />
        <Button label="Disabled" disabled onPress={() => {}} />
      </View>
      <RowGroup caption="Switches">
        <SwitchRow title="Sample on" value onChange={() => {}} />
        <SwitchRow title="Sample off" value={false} onChange={() => {}} />
      </RowGroup>
      <SearchField value="" placeholder="Search" onChangeText={() => {}} />
      <Pager page={1} total={12} onPage={() => {}} />
      <Pager page={5} total={12} onPage={() => {}} />
    </View>
  );
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
/** Account Sync with Calendar and ICS on and one synthetic feed, scrolled to its ICS feeds (#30). */
const ICS_FEEDS = addIcsFeed(
  accountSyncProvider(accountSyncModule(accountSyncDefaults(), 'calendar', true), 'ics', true),
  'webcal://feeds.example.com/private/sample.ics',
);
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
  // An editor still opening has no stage yet.
  if (stage) {
    await act(async () =>
      stage.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 400, height: STAGE_HEIGHT}}}),
    );
  }
  return tree;
}
/** Plugin Diagnostics after «Run Probe», ended with this outcome (#257). */
async function diagnostics(outcome: ProbeOutcome): Promise<ReactTestRenderer> {
  const tree = await mount(<PluginDiagnostics close={noop} run={async () => outcome} />);
  const run = tree.root.find(node => node.props.accessibilityLabel === diagnosticsCopy.run && typeof node.props.onPress === 'function');
  await act(async () => run.props.onPress());
  return tree;
}
/** A stroke across the picture, in page pixels. */
const STROKE = [
  {x: 300, y: 500},
  {x: 600, y: 650},
  {x: 900, y: 600},
];

/** Account Sync with To-Do and Todoist on, before the first sync, signed in to Todoist (#116, #368). */
const SIGNED_IN = accountSyncProvider(accountSyncModule(accountSyncDefaults(), 'todo', true), 'todoist', true);
/** Device Transfer's receivers (#307): synthetic, two with one alias to show them apart. */
const TRANSFER_DEVICES: TransferDevice[] = [
  {alias: 'Mac', deviceModel: 'MacBook', ip: '10.0.0.2', port: 53317, protocol: 'https', fingerprint: 'aaaaaa111111'},
  {alias: 'iPhone', deviceModel: 'iPhone', ip: '10.0.0.3', port: 53317, protocol: 'https', fingerprint: 'bbbbbb222222'},
  {alias: 'Mac', ip: '10.0.0.4', port: 53317, protocol: 'https', fingerprint: 'cccccc333333'},
];

// One line per screen, so adding one is one line.
// prettier-ignore
export const SCREENS: ScreenRender[] = [
  {name: 'ui-kit-needs', render: () => mount(<Needs problem={{what: 'Sample access is off', reason: 'The sample tool reads the sample folder to show your pictures.', fix: {label: 'Turn it on', run: () => {}}}} onClose={() => {}} />)},
  {name: 'ui-kit-needs-steps', render: () => mount(<Needs problem={{what: 'Sample setting is off', reason: 'Only you can turn it on.', fix: {steps: ['Open Settings on the tablet.', 'Turn on Sample setting.']}}} onClose={() => {}} />)},
  {name: 'ui-kit-error', render: () => mount(<ErrorView problem={{what: 'Device Transfer stopped with an error.', reason: 'The sample device did not answer.'}} onRetry={() => {}} onClose={() => {}} />)},
  {name: 'smart-pen-settings', render: () => mount(<SmartPenSettings close={() => {}} load={async () => DEFAULT_PEN_SETTINGS} save={async () => {}} apply={async () => {}} />)},
  {name: 'lasso-actions-settings', render: () => mount(<LassoActionsSettings close={() => {}} />)},
  {name: 'plugin-diagnostics', render: () => mount(<PluginDiagnostics close={noop} run={async () => ({lines: [], status: 'done'})} />)},
  {name: 'plugin-diagnostics-needs', render: () => diagnostics({lines: [], status: 'needs', need: diagnosticsCopy['needs.native']})},
  {name: 'plugin-diagnostics-failed', render: () => diagnostics({lines: [], status: 'failed', reason: 'digest query DENIED SecurityException'})},
  {name: 'account-sync-settings', render: () => mount(<AccountSyncSettings state={{kind: 'ready', modules: [{id: 'calendar', name: 'Calendar', status: {state: 'off'}}]}} onClose={() => {}} />)},
  {name: 'account-sync-signed-in', render: () => mount(<AccountSyncSettings state={{kind: 'ready', modules: accountSyncRows(SIGNED_IN, {}, {}, {todoist: {state: 'signedIn', tail: '…wxyz'}})}} onClose={noop} />)},
  {name: 'account-sync-connect', render: () => mount(<AccountSyncSettings state={{kind: 'ready', modules: accountSyncRows(accountSyncModule(accountSyncDefaults(), 'calendar', true), {}, {}, {google: {state: 'signedOut'}, icloud: {state: 'signedOut'}})}} onClose={noop} />)},
  {name: 'account-sync-ics-feeds', render: () => mount(<AccountSyncSettings state={{kind: 'ready', modules: []}} form={<AccountSyncForm settings={ICS_FEEDS} onChange={noop} />} onClose={noop} />)},
  {name: 'account-sync-error', render: () => mount(<AccountSyncSettings state={{kind: 'error', reason: 'The plugin folder did not answer.', onRetry: noop}} onClose={noop} />)},
  {name: 'account-sync-needs-connect', render: () => mount(<Needs problem={accountSyncConnect({id: 'icloud', name: 'iCloud', signIn: {state: 'signedOut'}, onSignOut: noop})} onClose={noop} />)},
  {name: 'ui-kit-loading', render: () => mount(<LoadingView title="Account Sync" onClose={() => {}} />)},
  {name: 'ui-kit-working', render: () => mount(<WorkingStrip working={WORKING} />), notFullView: 'the «Loading…» box sits over the note, as the native loading box does'},
  {name: 'ui-kit-controls', render: () => mount(<ControlsSheet />)},
  {name: 'image-editing-editor', render: () => imageEditor()},
  {name: 'image-editing-erase', render: () => imageEditor({draw: 'erase'})},
  {name: 'image-editing-erase-stroked', render: () => imageEditor({draw: 'erase', marks: [STROKE], strokes: ['/w/101-stroke.png']})},
  {name: 'device-transfer-pick', render: () => mount(<DeviceTransferPick title="Send Page" devices={TRANSFER_DEVICES} onPick={noop} onClose={noop} />)},
  {name: 'device-transfer-text', render: () => mount(<DeviceTransferText state={{phase: 'ready', text: 'Buy milk and bread', devices: TRANSFER_DEVICES.slice(0, 2)}} onSend={noop} onCancel={noop} />)},
  {name: 'image-editing-crop', render: () => imageEditor({draw: 'crop', marks: [STROKE]})},
  {name: 'image-editing-opening', render: () => imageEditor({phase: 'opening'})},
  {name: 'image-editing-styles-failed', render: () => mount(<ImageStylesGrid state={{phase: 'failed'}} onPick={noop} onToggle={noop} onClose={noop} />)},
];
