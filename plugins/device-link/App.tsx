import React, {useCallback, useEffect, useState} from 'react';
import {Text, ToastAndroid, View} from 'react-native';
import {armBackKey as armModule, closePluginView} from '@ink-tools/sn-adapter/official';
import {
  Button,
  ChoiceList,
  shared,
  RowGroup,
  SwitchRow,
  TitleBar,
  useArmOnRoot,
  useBackKey,
  useWorking,
  WorkingStrip,
} from '@ink-tools/ui-kit';
import {copy} from './src/copy';
import {Device} from './src/localsend/protocol';
import {relay, Relay} from './src/native';
import {ALIAS, noteHost, pickDeps, textDeps} from './src/run';
import {onBackgroundSwitch, setBackground} from './src/receive/background';
import {PickDevice, PickView} from './src/PickDevice';
import {
  cancelPick,
  onPickState,
  pickDevice,
  pickState,
  PickState,
} from './src/send/pickSession';
import {
  cancelTextSend,
  confirmTextSend,
  onTextState,
  TextState,
  textState,
} from './src/send/textSession';
import {discoverDevices} from './src/send/sendPng';
import {working} from './src/working';
import {
  ownFingerprint,
  loadSettings,
  renamed,
  trusted,
  saveSettings,
  Settings,
} from './src/settings/device';
import {
  onReceiveState,
  receiveState,
  ReceiveState,
  stopReceiving,
} from './src/receive/session';

/** The pick view's title for each send (#307, #504). */
const PICK_TITLES = {page: copy.sendPage, selection: copy.sendSelection, note: copy.sendNote};
/** sn-adapter's Back key module, as `RelayPackage.java` registers it (#300). */
export const BACK_MODULE = 'DeviceLinkBack';

type Props = {
  native?: Relay;
  close?: () => void;
  /** Routes the device Back key to this view's root (#300); tests pass a fake. */
  armBackKey?: (rootTag: number) => void;
};

const armDeviceBackKey = (rootTag: number) => armModule(BACK_MODULE, rootTag);

/** One instance, so the view's effects do not run again on every render. */
const defaultRelay = relay();

/** Two receivers with one alias are told apart by their address (Plan › Review focus). */
export function deviceLabel(device: Device, all: Device[]): string {
  const twins = all.filter(other => other.alias === device.alias).length;
  return twins > 1 ? `${device.alias} · ${device.ip}` : device.alias;
}

/**
 * While a receive runs (#49): who the tablet is to the sender, and «Stop». The title bar's × and
 * Back only close the view: the receiver goes on with the view closed and places what arrives in
 * the open note (#289); a tap on «Receive» shows this view again.
 */
export function ReceiveView({
  state,
  onStop,
  onClose,
}: {
  state: ReceiveState;
  onStop: () => void;
  onClose: () => void;
}) {
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={onClose} />
      <Text accessibilityLiveRegion="polite" style={shared.text}>
        {state === 'ready' ? copy.ready(ALIAS) : copy.starting}
      </Text>
      <Text style={shared.hint}>{copy.readyHint}</Text>
      <Button label={copy.stop} onPress={onStop} />
    </View>
  );
}

/**
 * «Send Text» (#99): the recognised text, read before it is sent, with the receivers found, one
 * tap each to send (#307), and «Cancel»; an empty recognition shows only its line. The title bar's ×
 * cancels too, except while the text is read or sent, which ends by itself (#256).
 */
export function TextView({
  state,
  onSend,
  onCancel,
}: {
  state: TextState;
  onSend: (device: Device) => void;
  onCancel: () => void;
}) {
  return (
    <View style={shared.screen}>
      <TitleBar
        title={copy.sendText}
        onClose={state.phase === 'ready' || state.phase === 'empty' ? onCancel : undefined}
      />
      {state.phase === 'ready' || state.phase === 'sending' ? (
        <>
          <Text style={shared.text}>{state.text}</Text>
          {state.phase === 'sending' && (
            <Text accessibilityLiveRegion="polite" style={shared.hint}>
              {copy.sending(state.to.alias)}
            </Text>
          )}
          <PickDevice
            devices={state.devices}
            onPick={state.phase === 'ready' ? onSend : undefined}
          />
          <Button
            label={copy.cancel}
            disabled={state.phase === 'sending'}
            onPress={onCancel}
          />
        </>
      ) : state.phase === 'empty' ? (
        <>
          <Text accessibilityLiveRegion="polite" style={shared.text}>
            {copy.noText}
          </Text>
        </>
      ) : (
        <Text accessibilityLiveRegion="polite" style={shared.text}>
          {copy.readingText}
        </Text>
      )}
    </View>
  );
}

/**
 * Relay's views: the «Loading…» strip, «Send Text», the pick of «Send Page» and «Send Selection»
 * (#307), «Receive», else Settings (#98): the LocalSend devices one search finds, one radio each
 * (#274), the one picked listed first on each send; the title bar's × closes the view.
 */
export default function App({
  native = defaultRelay,
  close = () => closePluginView(),
  armBackKey = armDeviceBackKey,
}: Props) {
  // Back went past the view and closed the note behind it (device round 9, #300): the native
  // module keeps the key in the view, once per root view, as every plugin view does.
  useArmOnRoot(armBackKey);
  const [receiving, setReceiving] = useState<ReceiveState>(receiveState());
  const [texting, setTexting] = useState<TextState>(textState());
  const [picking, setPicking] = useState<PickState>(pickState());
  useEffect(() => onReceiveState(setReceiving), []);
  useEffect(() => onTextState(setTexting), []);
  useEffect(() => onPickState(setPicking), []);
  const toast = (line: string) => ToastAndroid.show(line, ToastAndroid.SHORT);
  // The Back key does what each screen's own exit button does (#98, #204): PluginHost leaves a
  // plugin's view open on Back otherwise (`docs/supernote.md` › Plugins).
  useBackKey(() => {
    const text = textState().phase;
    if (working.isWorking() || text === 'reading' || text === 'sending') {
      // A send or a read in flight ends by itself, with its toast.
    } else if (text !== 'idle') {
      cancelTextSend(textDeps(close, toast, native));
    } else if (pickState().phase !== 'idle') {
      cancelPick({closeView: close});
    } else {
      // A running receive goes on with its view closed (#289).
      close();
    }
  });
  if (useWorking(working)) {
    return <WorkingStrip working={working} />;
  }
  if (texting.phase !== 'idle') {
    const deps = textDeps(close, toast, native);
    return (
      <TextView
        state={texting}
        onSend={device => confirmTextSend(deps, device)}
        onCancel={() => cancelTextSend(deps)}
      />
    );
  }
  if (picking.phase === 'picking') {
    const deps = pickDeps(close, toast, native);
    return (
      <PickView
        title={PICK_TITLES[picking.capture]}
        devices={picking.devices}
        onPick={device => pickDevice(deps, device)}
        onClose={() => cancelPick(deps)}
      />
    );
  }
  if (receiving !== 'idle') {
    return (
      <ReceiveView
        state={receiving}
        onStop={() => stopReceiving(native)}
        onClose={close}
      />
    );
  }
  return <SettingsView native={native} close={close} />;
}

function SettingsView({native, close}: {native: Relay; close: () => void}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);

  const search = useCallback(
    async (current: Settings) => {
      setDevices(null);
      const found = await discoverDevices(native, {
        alias: ALIAS,
        fingerprint: await ownFingerprint(native, current),
      });
      setDevices(found.ok ? found.value : []);
      // The chosen receiver, renamed since, is named as it is now (#98); read again first, so a
      // switch turned meanwhile is kept.
      const fresh = found.ok ? renamed(await loadSettings(native), found.value) : null;
      if (fresh !== null) {
        setSettings(shown => (shown === null ? shown : {...shown, pins: fresh.pins, last: fresh.last}));
        saveSettings(native, fresh);
      }
    },
    [native],
  );

  useEffect(() => {
    loadSettings(native).then(loaded => {
      setSettings(loaded);
      search(loaded);
    });
  }, [native, search]);

  // A background receive that ended («Stop», or a receiver that could not start) reads off here too.
  useEffect(
    () =>
      onBackgroundSwitch(on =>
        setSettings(current => (current === null ? current : {...current, background: on})),
      ),
    [],
  );

  const choose = (device: Device) => {
    if (settings === null) {
      return;
    }
    const next = trusted(settings, device);
    setSettings(next);
    saveSettings(native, next);
  };

  // «Receive in the background» (#289): saved, then the receiver starts or stops at once.
  const switchBackground = (on: boolean) => {
    if (settings === null) {
      return;
    }
    setSettings({...settings, background: on});
    const onItem = (line: string) => ToastAndroid.show(line, ToastAndroid.SHORT);
    setBackground({native, host: noteHost, alias: ALIAS, onItem}, on).then(saved => {
      if (!saved) {
        // Not saved: the switch shows what is saved.
        setSettings(current => (current === null ? current : {...current, background: !on}));
      }
    });
  };

  return (
    <SettingsForm
      settings={settings}
      devices={devices}
      onChoose={choose}
      onSearch={() => settings !== null && search(settings)}
      onBackground={switchBackground}
      onClose={close}
    />
  );
}

/**
 * Settings (#307, #289): «Receive in the background» first, in its own group with its note, so it
 * stays in place while the search below fills in; then the receivers found, the one listed first on
 * the next send chosen, named as its row is, and «Search Again». Nothing shows under the title bar
 * until the saved values are read (`settings` null), never a default off first on e-ink; `devices`
 * is null while the search runs.
 */
export function SettingsForm({
  settings,
  devices,
  onChoose,
  onSearch,
  onBackground,
  onClose,
}: {
  settings: Settings | null;
  devices: Device[] | null;
  onChoose: (device: Device) => void;
  onSearch: () => void;
  onBackground: (on: boolean) => void;
  onClose: () => void;
}) {
  if (settings === null) {
    // Nothing under the bar until the saved values are read: no default drawn first, no row moving.
    return (
      <View style={shared.screen}>
        <TitleBar title={copy.title} onClose={onClose} />
      </View>
    );
  }
  const chosen = settings.last;
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={onClose} />
      <RowGroup note={copy.receiveInBackgroundNote}>
        <SwitchRow
          title={copy.receiveInBackground}
          subtitle={copy.receiveInBackgroundHint}
          value={settings.background}
          onChange={onBackground}
        />
      </RowGroup>
      {devices === null ? (
        <Text style={shared.text}>{copy.searching}</Text>
      ) : devices.length === 0 ? (
        <Text style={shared.text}>{copy.noDevice}</Text>
      ) : (
        <ChoiceList
          title={copy.listedFirst}
          choices={devices.map(device => ({
            value: device.fingerprint,
            label: deviceLabel(device, devices),
          }))}
          value={chosen?.fingerprint ?? null}
          note={chosen === null ? undefined : copy.chosen(deviceLabel(chosen, devices))}
          onChange={fingerprint => {
            const device = devices.find(
              each => each.fingerprint === fingerprint,
            );
            if (device) {
              onChoose(device);
            }
          }}
        />
      )}
      <Button
        label={copy.searchAgain}
        disabled={devices === null}
        onPress={onSearch}
      />
    </View>
  );
}
