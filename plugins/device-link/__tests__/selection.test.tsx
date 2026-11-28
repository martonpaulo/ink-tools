/**
 * «Send Selection» asks text or image (#307): the preselection, the editable preview, the switch
 * to image at any time, and one send of the chosen kind.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {pressables, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {fail, ok, STROKE_TYPE, TEXT_TYPE, THROWN_CODE} from '@ink-tools/sn-adapter/official';
import App from '../App';
import {copy} from '../src/copy';
import {Device} from '../src/localsend/protocol';
import {SelectionView} from '../src/PickDevice';
import {readSelection} from '../src/run';
import {
  cancelPick,
  canSend,
  chooseKind,
  confirmChoice,
  editText,
  pickDevice,
  PickDeps,
  pickState,
  startPick,
} from '../src/send/pickSession';
import {preselect, SelectionRead} from '../src/send/selectionKind';
import {fakeRelay} from '../test-support/fakeRelay';

const mac: Device = {
  alias: 'Mac',
  ip: [192, 168, 1, 20].join('.'),
  port: 53317,
  protocol: 'https',
  fingerprint: 'mac-fp',
};

const stroke = {type: STROKE_TYPE};

let logged: jest.SpyInstance;
beforeEach(() => {
  logged = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
  cancelPick({closeView: () => {}});
});

function deps(read: SelectionRead = {text: 'Buy milk', kind: 'text'}, overrides: Partial<PickDeps> = {}): PickDeps {
  const toast = (text: string) => async () => ({kind: 'toast' as const, text});
  return {
    send: jest.fn(toast('Sent to Mac')),
    read: jest.fn(async () => read),
    sendText: jest.fn(toast('Sent to Mac')),
    run: jest.fn(task => task()),
    toast: jest.fn(),
    fail: jest.fn(),
    log: jest.fn(),
    closeView: jest.fn(),
    ...overrides,
  };
}

describe('the preselection', () => {
  test('plain handwriting is text', () => {
    expect(preselect([stroke, stroke], 'Buy milk and bread')).toBe('text');
    expect(preselect([stroke], 'Café 12')).toBe('text');
  });

  test.each([
    ['an arrow', 'A -> B'],
    ['an arrow mark', 'A → B'],
    ['marks more than letters', '/\\ -- ~ ##'],
    ['nothing recognized', '  '],
  ])('%s is an image', (_what, text) => {
    expect(preselect([stroke], text)).toBe('image');
  });

  test('a shape, a picture or a text box in the lasso is an image', () => {
    expect(preselect([stroke, {type: 700}], 'Buy milk')).toBe('image');
    expect(preselect([stroke, {type: TEXT_TYPE}], 'Buy milk')).toBe('image');
  });
});

describe('the lasso read', () => {
  test('gives the recognized text and its kind, and never logs the text', async () => {
    const read = jest.fn(async () => 'Buy milk');
    await expect(readSelection(async () => ok([stroke]), read)).resolves.toEqual({
      text: 'Buy milk',
      kind: 'text',
    });
    expect(read).toHaveBeenCalledWith([stroke]);
    expect(logged.mock.calls.join('\n')).not.toContain('Buy milk');
  });

  test('nothing recognized, or a failed read, is an image with an empty preview', async () => {
    await expect(readSelection(async () => ok([stroke]), async () => null)).resolves.toEqual({
      text: '',
      kind: 'image',
    });
    await expect(
      readSelection(async () => fail(THROWN_CODE, 'no lasso'), async () => 'x'),
    ).resolves.toEqual({text: '', kind: 'image'});
  });
});

describe('the choice', () => {
  async function choosing(d: PickDeps) {
    startPick('selection', [mac]);
    await pickDevice(d, mac);
  }

  test('a selection is read after the tap and waits for the choice, nothing sent', async () => {
    const d = deps();
    await choosing(d);
    expect(pickState()).toEqual({phase: 'choosing', device: mac, kind: 'text', text: 'Buy milk'});
    expect(d.send).not.toHaveBeenCalled();
    expect(d.sendText).not.toHaveBeenCalled();
  });

  test('the edited text is what is sent, once', async () => {
    const d = deps();
    await choosing(d);
    editText('Buy oat milk');
    await confirmChoice(d);
    await confirmChoice(d);
    expect(d.sendText).toHaveBeenCalledTimes(1);
    expect(d.sendText).toHaveBeenCalledWith(mac, 'Buy oat milk');
    expect(d.toast).toHaveBeenCalledWith('Sent to Mac');
    expect(pickState().phase).toBe('idle');
  });

  test('the switch to image sends the picture, and back to text keeps the edit', async () => {
    const d = deps();
    await choosing(d);
    editText('Buy oat milk');
    chooseKind('image');
    chooseKind('text');
    expect(pickState()).toMatchObject({kind: 'text', text: 'Buy oat milk'});
    chooseKind('image');
    await confirmChoice(d);
    expect(d.send).toHaveBeenCalledWith('selection', mac);
    expect(d.sendText).not.toHaveBeenCalled();
  });

  test('a drawing is preselected as an image; a blank text cannot be sent', async () => {
    const d = deps({text: '', kind: 'image'});
    await choosing(d);
    const shown = pickState();
    expect(shown).toMatchObject({kind: 'image'});
    chooseKind('text');
    const blank = pickState();
    expect(blank.phase === 'choosing' && canSend(blank)).toBe(false);
    await confirmChoice(d);
    expect(d.sendText).not.toHaveBeenCalled();
  });

  test('Back while the lasso is read closes the view, and the read shows nothing after', async () => {
    let finish!: (read: SelectionRead) => void;
    const d = deps(undefined, {read: () => new Promise(resolve => (finish = resolve))});
    startPick('selection', [mac]);
    const tapped = pickDevice(d, mac);
    expect(pickState()).toEqual({phase: 'reading', device: mac});
    cancelPick(d);
    finish({text: 'Buy milk', kind: 'text'});
    await tapped;
    expect(pickState().phase).toBe('idle');
    expect(d.closeView).toHaveBeenCalledTimes(1);
  });

  test('a read that throws is an image choice, logged', async () => {
    const d = deps(undefined, {read: async () => Promise.reject(new Error('lasso gone'))});
    await choosing(d);
    expect(pickState()).toMatchObject({phase: 'choosing', kind: 'image', text: ''});
    expect(d.log).toHaveBeenCalled();
  });
});

describe('the view', () => {
  async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  const handlers = () => ({
    onKind: jest.fn(),
    onText: jest.fn(),
    onSend: jest.fn(),
    onCancel: jest.fn(),
  });

  test('as text: the receiver, the switch off, the editable preview, Send and Cancel', async () => {
    const on = handlers();
    const tree = await mount(<SelectionView device={mac} kind="text" text="Buy milk" {...on} />);
    expect(screenBreaks(tree.root)).toEqual([]);
    expect(shownTexts(tree.root)).toEqual(expect.arrayContaining([copy.sendTo('Mac'), copy.asImage]));
    const field = tree.root.findByType(TextInput);
    expect(field.props.value).toBe('Buy milk');
    expect(field.props.accessibilityLabel).toBe(copy.textPreview);
    act(() => field.props.onChangeText('Buy oat milk'));
    expect(on.onText).toHaveBeenCalledWith('Buy oat milk');
    const toggle = tree.root.findByProps({accessibilityRole: 'switch'});
    expect(toggle.props.accessibilityState).toMatchObject({checked: false});
    act(() => toggle.props.onPress());
    expect(on.onKind).toHaveBeenCalledWith('image');
    const send = pressables(tree.root, copy.send)[0];
    act(() => send.props.onPress());
    expect(on.onSend).toHaveBeenCalledTimes(1);
    act(() => pressables(tree.root, copy.cancel)[0].props.onPress());
    expect(on.onCancel).toHaveBeenCalledTimes(1);
  });

  test('as image: no preview, the switch on, and back to text in one tap', async () => {
    const on = handlers();
    const tree = await mount(<SelectionView device={mac} kind="image" text="" {...on} />);
    expect(screenBreaks(tree.root)).toEqual([]);
    expect(tree.root.findAllByType(TextInput)).toEqual([]);
    const toggle = tree.root.findByProps({accessibilityRole: 'switch'});
    expect(toggle.props.accessibilityState).toMatchObject({checked: true});
    act(() => toggle.props.onPress());
    expect(on.onKind).toHaveBeenCalledWith('text');
    expect(pressables(tree.root, copy.send)[0].props.disabled).toBeFalsy();
  });

  test('a blank text disables Send; while the lasso is read only its line shows', async () => {
    const blank = await mount(<SelectionView device={mac} kind="text" text=" " {...handlers()} />);
    expect(pressables(blank.root, copy.send)[0].props.disabled).toBe(true);
    const reading = await mount(<SelectionView device={mac} kind={null} text="" {...handlers()} />);
    expect(shownTexts(reading.root)).toContain(copy.readingText);
    expect(reading.root.findAllByProps({accessibilityRole: 'switch'})).toEqual([]);
  });
});

test('the app shows the choice once the selection is read, and Cancel closes it (#307)', async () => {
  const close = jest.fn();
  startPick('selection', [mac]);
  await pickDevice(deps(), mac);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App native={fakeRelay().api} close={close} />);
  });
  expect(tree.root.findAllByType(SelectionView)).toHaveLength(1);
  expect(tree.root.findByType(TextInput).props.value).toBe('Buy milk');
  await act(async () => pressables(tree.root, copy.cancel)[0].props.onPress());
  expect(close).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType(SelectionView)).toHaveLength(0);
  tree.unmount();
});
