/**
 * The receivers one send can go to (#307): one row per LocalSend device found, the last pick
 * first, and one tap sends, so a row has no chevron, which opens another view. Two receivers with one alias are told apart by their model and the
 * end of their fingerprint (Plan › Review focus).
 */
import React from 'react';
import {View} from 'react-native';
import {ListRow, RowGroup, shared, TitleBar} from '@ink-tools/ui-kit';
import {copy} from './copy';
import {Device} from './localsend/protocol';

/** How many hex digits of a fingerprint tell two receivers with one alias apart. */
export const FINGERPRINT_TAIL = 6;

/**
 * The row's second line: the model, and for a twin alias the fingerprint's end too; none when the
 * model only repeats the alias.
 */
export function deviceSubtitle(device: Device, all: Device[]): string | undefined {
  const twins = all.filter(other => other.alias === device.alias).length > 1;
  if (!twins) {
    return device.deviceModel === device.alias ? undefined : device.deviceModel;
  }
  return copy.twinDevice(device.deviceModel, device.fingerprint.slice(-FINGERPRINT_TAIL));
}

export function PickDevice({
  devices,
  onPick,
}: {
  devices: Device[];
  /** Absent while a send runs: the rows show, and a tap does nothing. */
  onPick?: (device: Device) => void;
}) {
  return (
    <RowGroup caption={copy.devices}>
      {devices.map(device => (
        <ListRow
          key={device.fingerprint}
          title={device.alias}
          subtitle={deviceSubtitle(device, devices)}
          onPress={onPick ? () => onPick(device) : undefined}
        />
      ))}
    </RowGroup>
  );
}

/** «Send Page» and «Send Selection»'s own screen: the list, and × to close with nothing sent. */
export function PickView({
  title,
  devices,
  onPick,
  onClose,
}: {
  title: string;
  devices: Device[];
  onPick: (device: Device) => void;
  onClose: () => void;
}) {
  return (
    <View style={shared.screen}>
      <TitleBar title={title} onClose={onClose} />
      <PickDevice devices={devices} onPick={onPick} />
    </View>
  );
}
