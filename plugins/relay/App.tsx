import React, {useCallback, useEffect, useState} from 'react';
import {Text, ToastAndroid, View} from 'react-native';
import {closePluginView} from '@supernote-tools/sn-adapter/official';
import {
  Button,
  shared,
  useBackKey,
  useWorking,
  WorkingStrip,
} from '@supernote-tools/ui-kit';
import {copy} from './src/copy';
import {Device} from './src/localsend/protocol';
import {relay, Relay} from './src/native';
import {ALIAS, textDeps} from './src/run';
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

/** While a receive runs (#49): who the tablet is to the sender, and a way to stop. */
export function ReceiveView({
  state,
  onStop,
}: {
  state: ReceiveState;
  onStop: () => void;
}) {
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <Text accessibilityLiveRegion="polite" style={shared.text}>
        {state === 'ready' ? copy.ready(ALIAS) : copy.starting}
      </Text>
      <Text style={shared.hint}>{copy.readyHint}</Text>
      <Button label={copy.stop} onPress={onStop} />
    </View>
  );
}

/**
 * «Send Text» (#99): the recognised text, read before it is sent, with «Send to <device>» and
 * «Cancel»; an empty recognition shows only «Close».
 */
export function TextView({
  state,
  onSend,
  onCancel,
}: {
  state: TextState;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.sendText}
      </Text>
      {state.phase === 'ready' || state.phase === 'sending' ? (
        <>
          <Text style={shared.text}>{state.text}</Text>
          <Button
            label={copy.sendTo(state.device.alias)}
            disabled={state.phase === 'sending'}
            onPress={onSend}
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
          <Button label={copy.close} onPress={onCancel} />
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
 * Relay's Settings view (#98): the LocalSend devices one search finds, and the one every send goes
 * to. Picking one saves it, pinned to its fingerprint; sizes and colours from the shared ui-kit.
 */
export default function App({
  native = defaultRelay,
  close = () => closePluginView(),
}: Props) {
  const [receiving, setReceiving] = useState<ReceiveState>(receiveState());
  const [texting, setTexting] = useState<TextState>(textState());
  useEffect(() => onReceiveState(setReceiving), []);
  useEffect(() => onTextState(setTexting), []);
  // The Back key does what each screen's own exit button does (#98, #204): PluginHost leaves a
  // plugin's view open on Back otherwise (`docs/supernote.md` › Plugins).
  useBackKey(() => {
    const text = textState().phase;
    if (working.isWorking() || text === 'reading' || text === 'sending') {
      // A send or a read in flight ends by itself, with its toast.
    } else if (text !== 'idle') {
      cancelTextSend(
        textDeps(
          close,
          line => ToastAndroid.show(line, ToastAndroid.SHORT),
          native,
        ),
      );
    } else if (receiveState() !== 'idle') {
      native.stopReceive();
    } else {
      close();
    }
  });
  if (useWorking(working)) {
    return <WorkingStrip />;
  }
  if (texting.phase !== 'idle') {
    const deps = textDeps(
      close,
      line => ToastAndroid.show(line, ToastAndroid.SHORT),
      native,
    );
    return (
      <TextView
        state={texting}
        onSend={() => confirmTextSend(deps)}
        onCancel={() => cancelTextSend(deps)}
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
    const next = {...settings, device};
    setSettings(next);
    saveSettings(native, next);
  };

  const chosen = settings?.device ?? null;
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <Text style={shared.hint}>
        {chosen === null ? copy.devices : copy.chosen(chosen.alias)}
      </Text>
      {devices === null ? (
        <Text style={shared.text}>{copy.searching}</Text>
      ) : devices.length === 0 ? (
        <Text style={shared.text}>{copy.noDevice}</Text>
      ) : (
        devices.map(device => (
          <Button
            key={device.fingerprint}
            label={deviceLabel(device, devices)}
            accessibilityLabel={`${device.alias}, ${device.ip}`}
            selected={chosen?.fingerprint === device.fingerprint}
            onPress={() => choose(device)}
          />
        ))
      )}
      <Button
        label={copy.searchAgain}
        disabled={devices === null || settings === null}
        onPress={() => settings !== null && search(settings)}
      />
      <Button label={copy.close} onPress={close} />
    </View>
  );
}
