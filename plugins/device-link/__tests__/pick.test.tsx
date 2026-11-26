/**
 * Ask which receiver gets each send (#307): the pins by alias, the list with the last pick first,
 * the pick and Back, with a fake discovery and a fake network.
 */
import React from 'react';
import renderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {screenBreaks} from '@ink-tools/ui-kit/screenBreaks';
import {catchBackKey} from '@ink-tools/ui-kit/backKeyTest';
import {ListRow, WorkingStrip} from '@ink-tools/ui-kit';
import {pressables, quietWorking, shownTexts} from '@ink-tools/ui-kit/problemTest';
import {copy} from '../src/copy';
import {ok} from '@ink-tools/sn-adapter/official';
import App, {TextView} from '../App';
import {Device} from '../src/localsend/protocol';
import {deviceSubtitle, PickView} from '../src/PickDevice';
import {findForSend, pinnedSend, sendFailedProblem} from '../src/run';
import {
  cancelPick,
  pickDevice,
  PickDeps,
  pickState,
  startPick,
} from '../src/send/pickSession';
import {sendText} from '../src/send/sendText';
import {
  afterSent,
  checkPin,
  lastFirst,
  loadSettings,
  Settings,
  trusted,
} from '../src/settings/device';
import {fakeRelay} from '../test-support/fakeRelay';

const lan = (...parts: number[]) => parts.join('.');
const pluginDir = async () => ok('/plugin');

const mac: Device = {
  alias: 'Mac',
  ip: lan(192, 168, 1, 20),
  port: 53317,
  protocol: 'https',
  fingerprint: 'mac-fp',
};
const iphone: Device = {
  alias: 'iPhone',
  ip: lan(192, 168, 1, 21),
  port: 53317,
  protocol: 'https',
  fingerprint: 'iphone-fp',
};

const fresh: Settings = {fingerprint: 'self', pins: {}, last: null};

/** One receiver's answer to the announce. */
const register = (device: Device) => ({
  ip: device.ip,
  text: JSON.stringify({
    alias: device.alias,
    fingerprint: device.fingerprint,
    port: device.port,
    protocol: device.protocol,
  }),
});

/** A fake Relay whose settings file keeps what was written, and whose discovery finds `found`. */
function network(found: Device[], saved: Settings | null = null) {
  let file: string | null = saved === null ? null : JSON.stringify(saved);
  const fake = fakeRelay({
    discover: jest.fn(async () => found.map(register)),
    readText: jest.fn(async () => file),
    writeText: jest.fn(async (_path: string, text: string) => {
      file = text;
      return null;
    }),
  });
  return {...fake, file: () => (file === null ? null : JSON.parse(file))};
}

let logged: jest.SpyInstance;
beforeEach(() => {
  logged = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
  cancelPick({closeView: () => {}});
});

describe('pins by alias', () => {
  test('a new alias is pinned on its first send, and the same fingerprint stays pinned', () => {
    expect(checkPin(fresh, mac)).toBe('new');
    const once = afterSent(fresh, mac);
    expect(once.pins).toEqual({Mac: 'mac-fp'});
    expect(once.last).toEqual(mac);
    expect(checkPin(once, mac)).toBe('same');
    expect(afterSent(once, mac).pins).toEqual({Mac: 'mac-fp'});
  });

  test('a changed fingerprint is `changed`, and a send never pins it again', () => {
    const pinned = afterSent(fresh, mac);
    const other = {...mac, fingerprint: 'new-fp'};
    expect(checkPin(pinned, other)).toBe('changed');
    expect(afterSent(pinned, other).pins).toEqual({Mac: 'mac-fp'});
  });

  test('a pick in Settings trusts a changed fingerprint again (#307)', () => {
    const other = {...mac, fingerprint: 'new-fp'};
    const again = trusted(afterSent(fresh, mac), other);
    expect(checkPin(again, other)).toBe('same');
    expect(again.last).toEqual(other);
  });

  test('an alias such as «constructor» is new, not an inherited value', () => {
    expect(checkPin(fresh, {...mac, alias: 'constructor'})).toBe('new');
  });

  test('a file from before #307 keeps its one device as the last pick and its pin', async () => {
    const {api} = fakeRelay({
      readText: jest.fn(async () => JSON.stringify({fingerprint: 'f', device: mac})),
    });
    await expect(loadSettings(api, pluginDir)).resolves.toEqual({
      fingerprint: 'f',
      pins: {Mac: 'mac-fp'},
      last: mac,
    });
  });

  test('a pin that is not a string is dropped', async () => {
    const text = JSON.stringify({fingerprint: 'f', pins: {Mac: 3, iPhone: 'i'}, last: null});
    const {api} = fakeRelay({readText: jest.fn(async () => text)});
    expect((await loadSettings(api, pluginDir)).pins).toEqual({iPhone: 'i'});
  });
});

describe('the list', () => {
  test('the last pick is listed first, the rest in answer order', () => {
    expect(lastFirst([mac, iphone], iphone)).toEqual([iphone, mac]);
    expect(lastFirst([mac, iphone], null)).toEqual([mac, iphone]);
    expect(lastFirst([mac], iphone)).toEqual([mac]);
  });

  test('no receiver found is `none`, never a list', async () => {
    const {api} = network([]);
    await expect(findForSend(api, async () => null, pluginDir)).resolves.toEqual({
      kind: 'none',
    });
  });

  test('one receiver is a list of one', async () => {
    const {api} = network([mac]);
    await expect(findForSend(api, async () => null, pluginDir)).resolves.toEqual({
      kind: 'pick',
      devices: [mac],
    });
  });

  test('two receivers are both listed, the last pick first', async () => {
    const {api} = network([mac, iphone], {...fresh, last: iphone});
    await expect(findForSend(api, async () => null, pluginDir)).resolves.toEqual({
      kind: 'pick',
      devices: [iphone, mac],
    });
  });

  test('two receivers with one alias are told apart by model and fingerprint end', () => {
    const one = {...mac, deviceModel: 'MacBook', fingerprint: 'aaaaaa111111'};
    const two = {...mac, ip: lan(192, 168, 1, 30), fingerprint: 'bbbbbb222222'};
    expect(deviceSubtitle(one, [one, two])).toBe('MacBook · ends 111111');
    expect(deviceSubtitle(two, [one, two])).toBe('ends 222222');
    expect(deviceSubtitle(one, [one])).toBe('MacBook');
    expect(deviceSubtitle(iphone, [iphone])).toBeUndefined();
    // A model that only repeats the alias is not shown again (#307).
    expect(deviceSubtitle({...iphone, deviceModel: 'iPhone'}, [iphone])).toBeUndefined();
  });
});

describe('the pinned send', () => {
  const sent = {status: 204, body: ''};

  test('a new receiver is sent to, then pinned and listed first', async () => {
    const {api, native, file} = network([mac, iphone]);
    (native.post as jest.Mock).mockResolvedValueOnce(sent);
    const line = await pinnedSend(
      api,
      iphone,
      (self, delivered) => sendText(api, self, iphone, 'Buy milk', undefined, delivered),
      pluginDir,
    );
    expect(line).toBe('Sent to iPhone');
    expect(file().pins).toEqual({iPhone: 'iphone-fp'});
    expect(file().last).toMatchObject({alias: 'iPhone', fingerprint: 'iphone-fp'});
  });

  test('a receiver whose fingerprint changed is refused, with no offer, and its pin kept', async () => {
    const pinned = afterSent(fresh, mac);
    const {api, native, file} = network([mac], pinned);
    const changed = {...mac, fingerprint: 'new-fp'};
    const line = await pinnedSend(
      api,
      changed,
      (self, delivered) => sendText(api, self, changed, 'x', undefined, delivered),
      pluginDir,
    );
    expect(line).toBe('Mac identity changed, not sent. Pick it in Device Link Settings to trust it again.');
    expect(native.post).not.toHaveBeenCalled();
    expect(file().pins).toEqual({Mac: 'mac-fp'});
  });

  test('a send that fails pins nothing', async () => {
    const {api, native, file} = network([mac]);
    (native.post as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('IO'), {code: 'IO'}),
    );
    const line = await pinnedSend(
      api,
      mac,
      (self, delivered) => sendText(api, self, mac, 'x', undefined, delivered),
      pluginDir,
    );
    expect(line).toBe('Mac not reachable');
    expect(file()).toBeNull();
  });

  test('a declined offer pins nothing', async () => {
    const {api, native, file} = network([mac]);
    (native.post as jest.Mock).mockResolvedValueOnce({status: 403, body: ''});
    await pinnedSend(
      api,
      mac,
      (self, delivered) => sendText(api, self, mac, 'x', undefined, delivered),
      pluginDir,
    );
    expect(file()).toBeNull();
  });
});

function pickDeps(overrides: Partial<PickDeps> = {}): PickDeps {
  return {
    send: jest.fn(async (_capture, device: Device) => ({
      kind: 'toast' as const,
      text: `Sent to ${device.alias}`,
    })),
    run: jest.fn(task => task()),
    toast: jest.fn(),
    fail: jest.fn(),
    log: jest.fn(),
    closeView: jest.fn(),
    ...overrides,
  };
}

describe('the pick', () => {
  test('a tap sends once to the tapped receiver, under the strip, with its toast', async () => {
    const d = pickDeps();
    startPick('page', [mac, iphone]);
    await pickDevice(d, iphone);
    await pickDevice(d, mac);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenCalledWith('page', iphone);
    expect(d.run).toHaveBeenCalledTimes(1);
    expect(d.toast).toHaveBeenCalledWith('Sent to iPhone');
    expect(pickState().phase).toBe('idle');
  });

  test('Back closes the list and sends nothing', async () => {
    const d = pickDeps();
    startPick('selection', [mac]);
    cancelPick(d);
    await pickDevice(d, mac);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.closeView).toHaveBeenCalledTimes(1);
  });

  test('a picture that could not be made shows the Error state with its reason and Close (#256)', async () => {
    const working = quietWorking({failed: copy.workingFailed, timeout: copy.workingTimeout});
    const d = pickDeps({
      send: jest.fn(async () => ({kind: 'failed' as const, text: copy.noImage})),
      run: task => working.run(task),
      fail: line => working.hold(sendFailedProblem(line)),
    });
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<WorkingStrip working={working} />);
    });
    startPick('page', [mac]);
    await act(async () => {
      await pickDevice(d, mac);
    });
    expect(d.toast).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({testID: 'error-view'}).length).toBeGreaterThan(0);
    const shown = shownTexts(tree.root);
    expect(shown).toEqual(expect.arrayContaining([copy.noImage, copy.sendFailedReason]));
    expect(
      pressables(tree.root).length,
    ).toBeGreaterThan(0);
  });

  test('a send that throws leaves the failure to the strip, with no toast', async () => {
    const d = pickDeps({run: jest.fn(async () => Promise.reject(new Error('boom')))});
    startPick('page', [mac]);
    await pickDevice(d, mac);
    expect(d.toast).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
  });
});

/** The receiver rows, one per ListRow, as `title, subtitle` the way the row reads it out. */
const rows = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(ListRow).map(node => ({
    props: {
      accessibilityLabel:
        node.props.subtitle === undefined
          ? node.props.title
          : `${node.props.title}, ${node.props.subtitle}`,
      onPress: node.props.onPress,
    },
  }));

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

describe('the view', () => {
  test('lists one row per receiver, keeps the size rules, and a tap picks that one', async () => {
    const onPick = jest.fn();
    const tree = await mount(
      <PickView
        title="Send Page"
        devices={[iphone, {...mac, deviceModel: 'MacBook'}]}
        onPick={onPick}
        onClose={() => {}}
      />,
    );
    expect(screenBreaks(tree.root)).toEqual([]);
    expect(rows(tree).map(node => node.props.accessibilityLabel)).toEqual([
      'iPhone',
      'Mac, MacBook',
    ]);
    await act(async () => {
      rows(tree)[1].props.onPress();
    });
    expect(onPick).toHaveBeenCalledWith({...mac, deviceModel: 'MacBook'});
  });

  test('the app shows the list while a pick is open, and Back closes it with nothing sent', async () => {
    const back = catchBackKey();
    const close = jest.fn();
    const {api, native} = network([]);
    startPick('page', [mac, iphone]);
    const tree = await mount(<App native={api} close={close} />);
    expect(
      tree.root.findAllByProps({accessibilityRole: 'header'})[0].props.children,
    ).toBe('Send Page');
    expect(rows(tree).map(node => node.props.accessibilityLabel)).toEqual(['Mac', 'iPhone']);
    await act(async () => {
      expect(back.press()).toBe(true);
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(pickState().phase).toBe('idle');
    expect(native.post).not.toHaveBeenCalled();
    back.restore();
  });
});

test('Send Text says where it sends while the send runs (#307)', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <TextView
        state={{phase: 'sending', text: 'Buy milk', devices: [mac], to: mac}}
        onSend={() => {}}
        onCancel={() => {}}
      />,
    );
  });
  expect(tree.root.findAllByProps({children: 'Sending to Mac…'}).length).toBeGreaterThan(0);
});
