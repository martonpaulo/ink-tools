import React, {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {copy} from './src/copy';
import {Device} from './src/localsend/protocol';
import {relay, Relay} from './src/native';
import {ALIAS} from './src/run';
import {discoverDevices} from './src/send/sendPng';
import {loadSettings, saveSettings, Settings} from './src/settings/device';

type Props = {native?: Relay};

/** One instance, so the view's effects do not run again on every render. */
const defaultRelay = relay();

/** Two receivers with one alias are told apart by their address (Plan › Review focus). */
export function deviceLabel(device: Device, all: Device[]): string {
  const twins = all.filter(other => other.alias === device.alias).length;
  return twins > 1 ? `${device.alias} · ${device.ip}` : device.alias;
}

/**
 * Relay's Settings view (#98): the LocalSend devices one search finds, and the one every send goes
 * to. Picking one saves it, pinned to its fingerprint; sizes and colours from the shared ui-kit.
 */
export default function App({native = defaultRelay}: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);

  const search = useCallback(
    async (current: Settings) => {
      setDevices(null);
      const found = await discoverDevices(native, {
        alias: ALIAS,
        fingerprint: current.fingerprint,
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
    </View>
  );
}
