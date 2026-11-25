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
  /** What explains the group, right under its last row: one paragraph each. */
  note?: string | readonly string[];
};

/**
 * Rows that belong together, as the native screens group them (owner, #275; #272): the caption at
 * the bottom of its box, then its rows with the light dotted line between two of them, and the
 * solid line after the last, as the native Page menu and Settings › Apps › Plugins draw them. A note
 * sits under the last row, above the solid line, as the native note of «Usage and Diagnostics». The
 * caption's box is the space above a group; its container adds none.
 */
export function RowGroup({caption, children, note}: RowGroupProps): React.JSX.Element {
  const rows = React.Children.toArray(children);
  const notes = note === undefined ? [] : typeof note === 'string' ? [note] : note;
  return (
    <View>
      {caption !== undefined && <SectionCaption>{caption}</SectionCaption>}
      {rows.map((row, index) => (
        <React.Fragment key={React.isValidElement(row) && row.key !== null ? row.key : index}>
          {index > 0 && <LightLine />}
          {row}
        </React.Fragment>
      ))}
      {notes.map(paragraph => (
        <Text key={paragraph} style={[shared.subtitle, styles.note]}>
          {paragraph}
        </Text>
      ))}
      <View testID="group-line" style={styles.separator} />
    </View>
  );
}

/**
 * The light dotted line: the top edge of a dashed box cut to the line's height, since React Native
 * dashes a border only when all four sides are drawn. shortcut: React Native draws 3 on, 3 off at
 * 1 px where the native line is 3 on, 4 off (`lightDash`, `lightGap`); Ink.java draws the native
 * pattern. Upgrade with a drawn line if the owner sees the difference.
 */
function LightLine(): React.JSX.Element {
  return (
    <View testID="row-light-line" style={styles.lightBox}>
      <View style={styles.lightDashes} />
    </View>
  );
}

export type SwitchRowProps = {
  title: string;
  /** A hint or the current state in words, under the title. */
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
  separator: {height: metrics.separator, backgroundColor: metrics.ink},
  lightBox: {height: metrics.lightLine, overflow: 'hidden'},
  lightDashes: {
    height: metrics.lightLine * 4,
    borderWidth: metrics.lightLine,
    borderStyle: 'dashed',
    borderColor: metrics.ink,
  },
  note: {paddingBottom: metrics.rowPadding},
});
