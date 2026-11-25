/**
 * The setting shapes every Settings page repeats, built from the native controls (#274), so a
 * plugin draws none by hand: a group of rows under its caption, an on/off setting as one `ListRow`
 * with a trailing `Switch`, and one value out of several as a group with one `ListRow` per value,
 * each with its `Radio`.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {ListRow} from './ListRow';
import {metrics} from './metrics';
import {shared} from './styles';
import {SectionCaption} from './marks';
import {Radio} from './Radio';
import {Switch} from './Switch';

export type RowGroupProps = {
  /** The group's name, the caption over its rows. */
  caption?: string;
  /** The rows; `false`, `null` and `undefined` are left out, so a row can be conditional. */
  children?: React.ReactNode;
  /** What explains the group, grey, right under its last row: one paragraph each. */
  note?: string | readonly string[];
};

/**
 * Rows that belong together, as the native Settings group them (owner, #275): the group gap above,
 * the caption, then its rows, with a thin line only between two rows of the group, none under the
 * caption and none under the last row, then its note. The group owns the gap above it, so a group
 * with no caption still reads apart from the rows before it; its container adds no gap of its own.
 */
export function RowGroup({caption, children, note}: RowGroupProps): React.JSX.Element {
  const rows = React.Children.toArray(children);
  const notes = note === undefined ? [] : typeof note === 'string' ? [note] : note;
  return (
    <View style={styles.group}>
      {caption !== undefined && <SectionCaption>{caption}</SectionCaption>}
      {rows.map((row, index) => (
        <React.Fragment key={React.isValidElement(row) && row.key !== null ? row.key : index}>
          {index > 0 && <View testID="row-separator" style={styles.separator} />}
          {row}
        </React.Fragment>
      ))}
      {notes.map(paragraph => (
        <Text key={paragraph} style={shared.hint}>
          {paragraph}
        </Text>
      ))}
    </View>
  );
}

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
  /** What explains the choice, under its last value (`RowGroup`'s note). */
  note?: string;
};

/** One value out of several; each radio speaks «<title>: <value>». */
export function ChoiceList<V>({
  title,
  choices,
  value,
  onChange,
  note,
}: ChoiceListProps<V>): React.JSX.Element {
  return (
    <RowGroup caption={title} note={note}>
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
    </RowGroup>
  );
}

const styles = StyleSheet.create({
  group: {paddingTop: metrics.groupGap},
  separator: {height: metrics.separator, backgroundColor: metrics.ink},
});
