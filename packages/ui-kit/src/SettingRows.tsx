/**
 * The two setting shapes every Settings page repeats, built from the native controls (#274), so a
 * plugin draws neither by hand: an on/off setting is one `ListRow` with a trailing `Switch`, and one
 * value out of several is a `SectionCaption` over one `ListRow` per value, each with its `Radio`.
 */
import React from 'react';
import {View} from 'react-native';
import {ListRow} from './ListRow';
import {SectionCaption} from './marks';
import {Radio} from './Radio';
import {Switch} from './Switch';

export type SwitchRowProps = {
  title: string;
  /** A hint or the current state in words, grey under the title. */
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

/** An on/off setting; its switch speaks the row's title. */
export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: SwitchRowProps): React.JSX.Element {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      trailing={
        <Switch
          value={value}
          accessibilityLabel={title}
          disabled={disabled}
          onChange={onChange}
        />
      }
    />
  );
}

export type Choice<V> = {value: V; label: string};

export type ChoiceListProps<V> = {
  /** The setting's name, the caption over its values. */
  title: string;
  choices: readonly Choice<V>[];
  value: V;
  onChange: (value: V) => void;
};

/** One value out of several; each radio speaks «<title>: <value>». */
export function ChoiceList<V>({
  title,
  choices,
  value,
  onChange,
}: ChoiceListProps<V>): React.JSX.Element {
  return (
    <View>
      <SectionCaption>{title}</SectionCaption>
      {choices.map(choice => (
        <ListRow
          key={choice.label}
          title={choice.label}
          trailing={
            <Radio
              checked={choice.value === value}
              accessibilityLabel={`${title}: ${choice.label}`}
              onPress={() => onChange(choice.value)}
            />
          }
        />
      ))}
    </View>
  );
}
