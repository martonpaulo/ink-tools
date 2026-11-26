import React, {useCallback, useEffect, useState} from 'react';
import {Text, ToastAndroid, View} from 'react-native';
import {closePluginView} from '@ink-tools/sn-adapter/official';
import {
  Button,
  ChoiceList,
  shared,
  TitleBar,
  useBackKey,
  useWorking,
  WorkingStrip,
} from '@ink-tools/ui-kit';
import {copy} from './src/copy';
import {Device} from './src/localsend/protocol';
import {relay, Relay} from './src/native';
import {ALIAS, pickDeps, textDeps} from './src/run';
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
  trusted,
  saveSettings,
  Settings,
} from './src/settings/device';
import {
  onReceiveState,
  receiveState,
  ReceiveState,
} from './src/receive/session';

type Props = {native?: Relay; close?: () => void};

/** One instance, so the view's effects do not run again on every render. */
const defaultRelay = relay();

/** Two receivers with one alias are told apart by their address (Plan › Review focus). */
export function deviceLabel(device: Device, all: Device[]): string {
  const twins = all.filter(other => other.alias === device.alias).length;
  return twins > 1 ? `${device.alias} · ${device.ip}` : device.alias;
}

/** While a receive runs (#49): who the tablet is to the sender, and a way to stop; the × stops it too (#256). */
export function ReceiveView({
  state,
  onStop,
}: {
  state: ReceiveState;
  onStop: () => void;
}) {
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={onStop} />
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
}: Props) {
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
    } else if (receiveState() !== 'idle') {
      native.stopReceive();
    } else {
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
        title={picking.capture === 'page' ? copy.sendPage : copy.sendSelection}
        devices={picking.devices}
        onPick={device => pickDevice(deps, device)}
        onClose={() => cancelPick(deps)}
      />
    );
  }
  if (receiving !== 'idle') {
    return (
      <ReceiveView state={receiving} onStop={() => native.stopReceive()} />
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
    },
    [native],
  );

  useEffect(() => {
    loadSettings(native).then(loaded => {
      setSettings(loaded);
      search(loaded);
    });
  }, [native, search]);

  const choose = (device: Device) => {
    if (settings === null) {
      return;
    }
    const next = trusted(settings, device);
    setSettings(next);
    saveSettings(native, next);
  };

  const chosen = settings?.last ?? null;
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={close} />
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
          onChange={fingerprint => {
            const device = devices.find(
              each => each.fingerprint === fingerprint,
            );
            if (device) {
              choose(device);
            }
          }}
        />
      )}
      {chosen !== null && (
        <Text style={shared.hint}>{copy.chosen(chosen.alias)}</Text>
      )}
      <Button
        label={copy.searchAgain}
        disabled={devices === null || settings === null}
        onPress={() => settings !== null && search(settings)}
      />
    </View>
  );
}
